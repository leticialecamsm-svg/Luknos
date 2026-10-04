'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ───────────────────────────────────────────────────────────────────────────
// Server Actions do CRM / Chat multiatendente WhatsApp.
// Separado do Robô de Orçamentos (bot-actions.ts): aqui é chat livre entre
// vendedor e cliente, em cima de várias instâncias Evolution (crm_instances).
// Convite de leitura: qualquer "staff" ativo (ensureStaff). Escrita de
// instâncias (números): só admin. Enviar mensagem / reatribuir / vincular
// contato: qualquer staff (reaproveita RLS wa_is_staff() do banco).
// ───────────────────────────────────────────────────────────────────────────

async function ensureStaff() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const }
  const { data: profile } = await supabase.from('users').select('role, active, name').eq('id', user.id).single()
  if (!profile || profile.active === false) return { error: 'Sem permissão' as const }
  return { userId: user.id, name: profile.name as string, isAdmin: profile.role === 'admin' }
}

async function ensureAdmin() {
  const auth = await ensureStaff()
  if ('error' in auth) return auth
  if (!auth.isAdmin) return { error: 'Sem permissão' as const }
  return auth
}

const E164 = /^\+[1-9]\d{6,14}$/

// ─── crm_instances (números) — admin ───────────────────────────────────────

export async function getCrmInstances() {
  const auth = await ensureAdmin()
  if ('error' in auth) return []
  const { data } = await createAdminClient()
    .from('crm_instances')
    .select('id, instance_name, phone_e164, label, default_user_id, is_active, users:default_user_id(name)')
    .order('label')
  return data ?? []
}

export interface CrmInstanceInput {
  instance_name: string
  phone_e164: string
  label: string
  default_user_id: string | null
}

export async function createCrmInstance(input: CrmInstanceInput) {
  const auth = await ensureAdmin()
  if ('error' in auth) return { error: auth.error }
  if (!input.instance_name.trim()) return { error: 'Nome da instância é obrigatório' }
  if (!input.label.trim()) return { error: 'Nome de exibição é obrigatório' }
  if (input.phone_e164 && !E164.test(input.phone_e164)) return { error: 'Telefone precisa estar em formato +55...' }

  const { error } = await createAdminClient().from('crm_instances').insert({
    instance_name: input.instance_name.trim(),
    phone_e164: input.phone_e164 || null,
    label: input.label.trim(),
    default_user_id: input.default_user_id || null,
  })
  if (error) return { error: error.message.includes('duplicate') ? 'Já existe uma instância com esse nome' : error.message }
  revalidatePath('/crm-instances')
  return { ok: true }
}

export async function updateCrmInstance(id: string, input: CrmInstanceInput) {
  const auth = await ensureAdmin()
  if ('error' in auth) return { error: auth.error }
  if (input.phone_e164 && !E164.test(input.phone_e164)) return { error: 'Telefone precisa estar em formato +55...' }

  const { error } = await createAdminClient()
    .from('crm_instances')
    .update({
      label: input.label.trim(),
      phone_e164: input.phone_e164 || null,
      default_user_id: input.default_user_id || null,
    })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/crm-instances')
  return { ok: true }
}

export async function setCrmInstanceActive(id: string, is_active: boolean) {
  const auth = await ensureAdmin()
  if ('error' in auth) return { error: auth.error }
  const { error } = await createAdminClient().from('crm_instances').update({ is_active }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/crm-instances')
  return { ok: true }
}

// Fala com a Evolution (via crm-evolution-setup, service role) pra criar a
// instância, apontar o webhook e devolver o QR Code — a chave da Evolution
// nunca sai do servidor.
async function callEvolutionSetup(body: Record<string, unknown>) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/crm-evolution-setup`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'x-internal-call': '1',
    },
    body: JSON.stringify(body),
  })
  return res.json().catch(() => ({}))
}

export async function connectCrmInstance(instanceName: string) {
  const auth = await ensureAdmin()
  if ('error' in auth) return { error: auth.error }
  const r = await callEvolutionSetup({ action: 'connect', instance_name: instanceName })
  if (r.error) return { error: r.error }
  if (r.already_connected) return { alreadyConnected: true }
  return { qrcodeBase64: r.qrcode_base64 as string | undefined, pairingCode: r.pairing_code as string | null }
}

export async function getCrmInstanceConnectionState(instanceName: string) {
  const auth = await ensureAdmin()
  if ('error' in auth) return { state: 'unknown' }
  const r = await callEvolutionSetup({ action: 'status', instance_name: instanceName })
  return { state: (r.state as string) ?? 'unknown' }
}

export async function getSystemUsersForCrm() {
  const auth = await ensureStaff()
  if ('error' in auth) return []
  const { data } = await createAdminClient()
    .from('users')
    .select('id, name, role')
    .eq('active', true)
    .order('name')
  return data ?? []
}

// ─── Inbox ──────────────────────────────────────────────────────────────────

export interface ConversationRow {
  id: string
  remote_jid: string
  contact_id: string | null
  contact_name_cache: string | null
  contact_photo_url: string | null
  assigned_user_id: string | null
  assigned_user_name: string | null
  status: string
  last_message_at: string
  instance_label: string
  contact_name: string | null
  last_body: string | null
}

// scope: 'mine' (atendente logado), 'unassigned', 'all'
export async function getCrmConversations(scope: 'mine' | 'unassigned' | 'all' = 'mine') {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error, items: [] as ConversationRow[] }

  const admin = createAdminClient()
  let q = admin
    .from('crm_conversations')
    .select(`
      id, remote_jid, contact_id, contact_name_cache, contact_photo_url, assigned_user_id, status, last_message_at,
      crm_instances(label), contacts(name),
      assigned:users!crm_conversations_assigned_user_id_fkey(name)
    `)
    .eq('status', 'open')
    .order('last_message_at', { ascending: false })
    .limit(200)

  if (scope === 'mine') q = q.eq('assigned_user_id', auth.userId)
  if (scope === 'unassigned') q = q.is('assigned_user_id', null)

  const { data, error } = await q
  if (error) return { error: error.message, items: [] as ConversationRow[] }

  const ids = (data ?? []).map((c: any) => c.id)
  const lastByConv = new Map<string, string | null>()
  if (ids.length) {
    const { data: lastMsgs } = await admin
      .from('crm_messages')
      .select('conversation_id, body, message_type, created_at')
      .in('conversation_id', ids)
      .order('created_at', { ascending: false })
    for (const m of lastMsgs ?? []) {
      if (!lastByConv.has(m.conversation_id)) {
        lastByConv.set(m.conversation_id, m.body || (m.message_type !== 'text' ? '📎 arquivo' : null))
      }
    }
  }

  const items: ConversationRow[] = (data ?? []).map((c: any) => ({
    id: c.id,
    remote_jid: c.remote_jid,
    contact_id: c.contact_id,
    contact_name_cache: c.contact_name_cache,
    contact_photo_url: c.contact_photo_url ?? null,
    assigned_user_id: c.assigned_user_id,
    assigned_user_name: c.assigned?.name ?? null,
    status: c.status,
    last_message_at: c.last_message_at,
    instance_label: c.crm_instances?.label ?? '—',
    contact_name: c.contacts?.name ?? c.contact_name_cache ?? null,
    last_body: lastByConv.get(c.id) ?? null,
  }))

  return { items }
}

export async function getCrmMessages(conversationId: string) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error, items: [] }
  const { data, error } = await createAdminClient()
    .from('crm_messages')
    .select('id, direction, sender_user_id, message_type, body, storage_path, file_name, mime_type, is_system, created_at, sender:users!crm_messages_sender_user_id_fkey(name)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) return { error: error.message, items: [] }
  return {
    items: (data ?? []).map((m: any) => ({
      ...m,
      sender_name: m.sender?.name ?? null,
    })),
  }
}

export async function reassignConversation(conversationId: string, newUserId: string | null) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error }
  const admin = createAdminClient()

  const { data: newUser } = newUserId ? await admin.from('users').select('name').eq('id', newUserId).maybeSingle() : { data: null }
  const { error } = await admin
    .from('crm_conversations')
    .update({ assigned_user_id: newUserId })
    .eq('id', conversationId)
  if (error) return { error: error.message }

  await admin.from('crm_messages').insert({
    conversation_id: conversationId,
    direction: 'outbound',
    is_system: true,
    message_type: 'text',
    body: `Conversa transferida para ${newUser?.name ?? 'outro atendente'} por ${auth.name}.`,
  })

  revalidatePath('/crm')
  return { ok: true }
}

export async function linkConversationContact(conversationId: string, contactId: string | null) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error }
  const { error } = await createAdminClient()
    .from('crm_conversations')
    // vincular a um contato de verdade limpa o apelido manual (contact_id
    // manda no nome exibido, via join em getCrmConversations).
    .update({ contact_id: contactId, contact_name_cache: null })
    .eq('id', conversationId)
  if (error) return { error: error.message }
  revalidatePath('/crm')
  return { ok: true }
}

// Dar um nome pra conversa sem vincular a um contato formal do sistema —
// pra quando quem manda mensagem não é (e não precisa virar) um cadastro.
export async function setConversationDisplayName(conversationId: string, name: string) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error }
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Nome vazio' }
  const { error } = await createAdminClient()
    .from('crm_conversations')
    .update({ contact_id: null, contact_name_cache: trimmed })
    .eq('id', conversationId)
  if (error) return { error: error.message }
  revalidatePath('/crm')
  return { ok: true }
}

export async function searchContactsForCrm(query: string) {
  const auth = await ensureStaff()
  if ('error' in auth) return []
  if (!query.trim()) return []
  const { data } = await createAdminClient()
    .from('contacts')
    .select('id, name, phone, type')
    .ilike('name', `%${query.trim()}%`)
    .limit(10)
  return data ?? []
}

// ─── Envio de mensagem (upload direto do browser + chamada da Edge Function) ─

const CRM_ATTACH_MAX_BYTES = 16 * 1024 * 1024 // limite da Evolution pra mídia é mais apertado que 25 MB

export async function createCrmAttachmentUpload(input: { conversationId: string; fileName: string; sizeBytes: number }) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error }
  if (input.sizeBytes > CRM_ATTACH_MAX_BYTES) return { error: 'Arquivo acima de 16 MB' }

  const safe = input.fileName.replace(/[^\w.\- ]+/g, '_').trim().slice(-120) || `arquivo-${Date.now()}`
  const storagePath = `${input.conversationId}/${Date.now()}_${safe}`
  const { data, error } = await createAdminClient().storage
    .from('crm-attachments')
    .createSignedUploadUrl(storagePath)
  if (error || !data) return { error: error?.message ?? 'Não foi possível preparar o envio' }
  return { path: data.path, token: data.token }
}

export async function sendCrmMessage(input: {
  conversationId: string
  text?: string
  storagePath?: string
  fileName?: string
  mimeType?: string
  isVoiceNote?: boolean
}) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error }
  if (!input.text?.trim() && !input.storagePath) return { error: 'Mensagem vazia' }

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/crm-send-message`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'x-internal-call': '1',
      },
      body: JSON.stringify({
        conversation_id: input.conversationId,
        sender_user_id: auth.userId,
        text: input.text ?? null,
        storage_path: input.storagePath ?? null,
        file_name: input.fileName ?? null,
        mime_type: input.mimeType ?? null,
        is_voice_note: input.isVoiceNote ?? false,
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok || !body?.sent) return { error: body?.error ?? 'Falha ao enviar' }
    return { ok: true }
  } catch (e: any) {
    return { error: e?.message ?? 'Falha ao enviar' }
  }
}

export async function getCrmAttachmentUrl(storagePath: string) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error }
  const { data, error } = await createAdminClient().storage
    .from('crm-attachments')
    .createSignedUrl(storagePath, 300)
  if (error) return { error: error.message }
  return { url: data.signedUrl }
}

// Sincroniza nome (do contato salvo no celular) e foto de perfil para todas as
// conversas abertas, chamando a Evolution API para cada instância CRM.
export async function syncCrmContactInfo() {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error }

  const admin = createAdminClient()

  // Busca todas as conversas abertas com suas instâncias
  const { data: convs, error: convErr } = await admin
    .from('crm_conversations')
    .select('id, remote_jid, contact_id, contact_name_cache, crm_instances(instance_name, is_active)')
    .eq('status', 'open')
    .limit(300)

  if (convErr) return { error: convErr.message }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

  let updated = 0
  const errors: string[] = []

  for (const conv of convs ?? []) {
    const instance = (conv as any).crm_instances
    if (!instance?.is_active || !instance?.instance_name) continue

    try {
      // Chama a Evolution via crm-evolution-setup (proxy seguro — chave nunca exposta)
      const res = await fetch(`${SUPABASE_URL}/functions/v1/crm-evolution-setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_KEY}`,
          'x-internal-call': '1',
        },
        body: JSON.stringify({
          action: 'contact_info',
          instance_name: instance.instance_name,
          remote_jid: conv.remote_jid,
        }),
      })
      const r = await res.json().catch(() => ({}))
      if (r.error) { errors.push(r.error); continue }

      const updates: Record<string, string | null> = {}
      const resolvedName = r.name ?? r.pushName ?? null
      if (resolvedName && resolvedName !== conv.contact_name_cache && !conv.contact_id) {
        updates.contact_name_cache = resolvedName
      }
      if (r.photo_url) updates.contact_photo_url = r.photo_url

      if (Object.keys(updates).length > 0) {
        await admin.from('crm_conversations').update(updates).eq('id', conv.id)
        updated++
      }
    } catch (e: any) {
      errors.push(e?.message ?? 'erro')
    }
  }

  return { ok: true, updated, errors: errors.length ? errors : undefined }
}
