'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ───────────────────────────────────────────────────────────────────────────
// Server Actions do módulo Robô de Orçamentos WhatsApp.
// Escrita em wa_bot_config / wa_collaborators é só do admin (RLS wa_is_admin()).
// Aqui reforçamos no app com ensureBotAdmin() antes de usar o admin client,
// mesmo padrão das actions de finance/hr do Luknos.
// ───────────────────────────────────────────────────────────────────────────

async function ensureBotAdmin() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const }
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') return { error: 'Sem permissão' as const }
  return { userId: user.id }
}

// Leitura do monitor: qualquer usuário interno ativo (equipe) — igual ao RLS
// wa_is_staff(). Ações de escrita continuam em ensureBotAdmin().
async function ensureBotStaff() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const }
  const { data: profile } = await supabase
    .from('users')
    .select('role, active')
    .eq('id', user.id)
    .single()
  if (!profile || profile.active === false) return { error: 'Sem permissão' as const }
  return { userId: user.id, isAdmin: profile.role === 'admin' }
}

const E164 = /^\+[1-9]\d{6,14}$/

// ─── monitor de conversas ────────────────────────────────────────────────

export async function getBotConversations(status?: string) {
  const auth = await ensureBotStaff()
  if ('error' in auth) return { rows: [], counts: {} as Record<string, number> }
  const db = createAdminClient()

  let q = db
    .from('wa_conversations')
    .select('id, status, current_field, system_quote_id, last_message_at, created_at, collaborator_id')
    .order('last_message_at', { ascending: false })
    .limit(200)
  if (status && status !== 'all') q = q.eq('status', status)

  const [{ data: rows }, { data: collabs }, { data: allForCounts }] = await Promise.all([
    q,
    db.from('wa_collaborators').select('id, display_name, phone_e164'),
    db.from('wa_conversations').select('status'),
  ])

  const nameById = new Map((collabs ?? []).map((c) => [c.id, c]))
  const counts: Record<string, number> = {}
  for (const r of allForCounts ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1

  return {
    rows: (rows ?? []).map((r) => ({
      ...r,
      collaborator: nameById.get(r.collaborator_id) ?? null,
    })),
    counts,
  }
}

export async function getBotConversationDetail(id: string) {
  const auth = await ensureBotStaff()
  if ('error' in auth) return null
  const db = createAdminClient()

  const { data: conversation } = await db
    .from('wa_conversations')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!conversation) return null

  const [{ data: messages }, { data: attachments }, { data: collaborator }, { data: submissionLog }] =
    await Promise.all([
      db
        .from('wa_messages')
        .select('id, direction, message_type, body, created_at, provider_message_id')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true }),
      db
        .from('wa_attachments')
        .select('id, file_name, mime_type, detected_kind, size_bytes, system_quote_id, created_at')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true }),
      db.from('wa_collaborators').select('*').eq('id', conversation.collaborator_id).maybeSingle(),
      auth.isAdmin
        ? db
            .from('wa_submission_log')
            .select('id, response_status, success, error_message, attempt_number, created_at')
            .eq('conversation_id', id)
            .order('attempt_number', { ascending: true })
        : Promise.resolve({ data: [] }),
    ])

  return {
    conversation,
    messages: messages ?? [],
    attachments: attachments ?? [],
    collaborator: collaborator ?? null,
    submissionLog: submissionLog ?? [],
    isAdmin: auth.isAdmin,
  }
}

export async function retryBotSubmission(conversationId: string) {
  const auth = await ensureBotAdmin()
  if ('error' in auth) return { error: auth.error }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return { error: 'Supabase não configurado' }

  try {
    const res = await fetch(`${url}/functions/v1/retry-failed-submissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
        'x-internal-call': '1',
      },
      body: JSON.stringify({ conversation_id: conversationId }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) return { error: `Falha ao reprocessar (${res.status})` }
    revalidatePath(`/bot-conversations/${conversationId}`)
    revalidatePath('/bot-conversations')
    return { ok: true, ...(body ?? {}) }
  } catch (e) {
    return { error: String((e as Error)?.message ?? e) }
  }
}

export async function getBotAttachmentSignedUrl(attachmentId: string) {
  const auth = await ensureBotStaff()
  if ('error' in auth) return { error: auth.error }
  const db = createAdminClient()
  const { data: att } = await db
    .from('wa_attachments')
    .select('storage_path, file_name')
    .eq('id', attachmentId)
    .maybeSingle()
  if (!att) return { error: 'Anexo não encontrado' }
  const { data, error } = await db.storage
    .from('wa-attachments')
    .createSignedUrl(att.storage_path, 300, { download: att.file_name })
  if (error || !data?.signedUrl) return { error: 'Não foi possível gerar o link' }
  return { url: data.signedUrl, file_name: att.file_name }
}

// ─── wa_bot_config ────────────────────────────────────────────────────────

export async function getBotConfig() {
  const auth = await ensureBotAdmin()
  if ('error' in auth) return null
  const { data } = await createAdminClient()
    .from('wa_bot_config')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data
}

export interface BotConfigInput {
  evolution_instance_name: string
  system_api_base_url: string
  system_api_key_secret_ref: string
  default_priority: string
  allowed_origins: string[]
  allowed_categories: string[]
}

const PRIORITIES = ['Baixa', 'Média', 'Alta', 'Urgente']

export async function saveBotConfig(input: BotConfigInput) {
  const auth = await ensureBotAdmin()
  if ('error' in auth) return { error: auth.error }

  const evolution_instance_name = input.evolution_instance_name?.trim()
  const system_api_base_url = input.system_api_base_url?.trim()
  const system_api_key_secret_ref = input.system_api_key_secret_ref?.trim()

  if (!evolution_instance_name) return { error: 'Informe o nome da instância Evolution.' }
  if (!system_api_base_url) return { error: 'Informe a base URL do sistema.' }
  try {
    new URL(system_api_base_url)
  } catch {
    return { error: 'Base URL inválida (ex.: https://app.luknos.com.br).' }
  }
  if (!system_api_key_secret_ref) return { error: 'Informe a referência do segredo da API key.' }
  if (!PRIORITIES.includes(input.default_priority)) return { error: 'Prioridade padrão inválida.' }

  const origins = dedupeTags(input.allowed_origins)
  const categories = dedupeTags(input.allowed_categories)
  if (origins.length === 0) return { error: 'Cadastre ao menos uma origem.' }
  if (categories.length === 0) return { error: 'Cadastre ao menos uma categoria.' }

  const admin = createAdminClient()
  const row = {
    evolution_instance_name,
    system_api_base_url,
    system_api_key_secret_ref,
    default_priority: input.default_priority,
    allowed_origins: origins,
    allowed_categories: categories,
  }

  const { data: existing } = await admin
    .from('wa_bot_config')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { error } = existing
    ? await admin.from('wa_bot_config').update(row).eq('id', existing.id)
    : await admin.from('wa_bot_config').insert(row)

  if (error) return { error: error.message }
  revalidatePath('/bot-config')
  return { ok: true }
}

// ─── wa_collaborators (whitelist) ─────────────────────────────────────────

export async function getBotCollaborators() {
  const auth = await ensureBotAdmin()
  if ('error' in auth) return []
  const { data } = await createAdminClient()
    .from('wa_collaborators')
    .select('*')
    .order('created_at', { ascending: false })
  return data ?? []
}

// Vendedores do sistema, para mapear phone_e164 -> system_user_id.
export async function getSystemUsersForBot() {
  const auth = await ensureBotAdmin()
  if ('error' in auth) return []
  const { data } = await createAdminClient()
    .from('users')
    .select('id, name, role, active')
    .eq('active', true)
    .order('name')
  return data ?? []
}

export interface CollaboratorInput {
  phone_e164: string
  display_name: string
  system_user_id: string | null
  is_active: boolean
  receives_agenda?: boolean
}

function validateCollaborator(input: CollaboratorInput) {
  const phone_e164 = input.phone_e164?.trim()
  const display_name = input.display_name?.trim()
  if (!phone_e164 || !E164.test(phone_e164))
    return { error: 'Telefone precisa estar em formato E.164 (ex.: +5541999998888).' }
  if (!display_name) return { error: 'Informe o nome de exibição.' }
  return {
    value: {
      phone_e164,
      display_name,
      system_user_id: input.system_user_id || null,
      is_active: !!input.is_active,
      receives_agenda: input.receives_agenda ?? true,
    },
  }
}

export async function setBotCollaboratorAgenda(id: string, receives_agenda: boolean) {
  const auth = await ensureBotAdmin()
  if ('error' in auth) return { error: auth.error }
  const { error } = await createAdminClient()
    .from('wa_collaborators')
    .update({ receives_agenda })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/bot-collaborators')
  return { ok: true }
}

export async function createBotCollaborator(input: CollaboratorInput) {
  const auth = await ensureBotAdmin()
  if ('error' in auth) return { error: auth.error }
  const v = validateCollaborator(input)
  if ('error' in v) return { error: v.error }

  const { error } = await createAdminClient().from('wa_collaborators').insert(v.value)
  if (error) {
    if (error.code === '23505') return { error: 'Já existe um colaborador com esse telefone.' }
    return { error: error.message }
  }
  revalidatePath('/bot-collaborators')
  return { ok: true }
}

export async function updateBotCollaborator(id: string, input: CollaboratorInput) {
  const auth = await ensureBotAdmin()
  if ('error' in auth) return { error: auth.error }
  const v = validateCollaborator(input)
  if ('error' in v) return { error: v.error }

  const { error } = await createAdminClient()
    .from('wa_collaborators')
    .update(v.value)
    .eq('id', id)
  if (error) {
    if (error.code === '23505') return { error: 'Já existe um colaborador com esse telefone.' }
    return { error: error.message }
  }
  revalidatePath('/bot-collaborators')
  return { ok: true }
}

export async function setBotCollaboratorActive(id: string, is_active: boolean) {
  const auth = await ensureBotAdmin()
  if ('error' in auth) return { error: auth.error }
  const { error } = await createAdminClient()
    .from('wa_collaborators')
    .update({ is_active })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/bot-collaborators')
  return { ok: true }
}

export async function deleteBotCollaborator(id: string) {
  const auth = await ensureBotAdmin()
  if ('error' in auth) return { error: auth.error }
  const { error } = await createAdminClient().from('wa_collaborators').delete().eq('id', id)
  if (error) {
    if (error.code === '23503')
      return { error: 'Este colaborador já tem conversas registradas. Desative em vez de excluir.' }
    return { error: error.message }
  }
  revalidatePath('/bot-collaborators')
  return { ok: true }
}

// ─── dashboard ───────────────────────────────────────────────────────────

export async function getBotStats(range: string) {
  const auth = await ensureBotStaff()
  if ('error' in auth) return null
  const supabase = createClient()
  const { data, error } = await supabase.rpc('fn_get_bot_stats', { p_range: range })
  if (error || !data) return null
  return { ...(data as Record<string, unknown>), isAdmin: auth.isAdmin }
}

// ─── notificações ────────────────────────────────────────────────────────

export async function getBotNotifications(status?: string) {
  const auth = await ensureBotStaff()
  if ('error' in auth) return { rows: [], counts: {} as Record<string, number>, isAdmin: false }
  const db = createAdminClient()

  let q = db
    .from('wa_notifications')
    .select('id, conversation_id, target_phone_e164, system_quote_id, channel, status, sent_at, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (status && status !== 'all') q = q.eq('status', status)

  const [{ data: rows }, { data: all }] = await Promise.all([
    q,
    db.from('wa_notifications').select('status'),
  ])
  const counts: Record<string, number> = {}
  for (const r of all ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1

  return { rows: rows ?? [], counts, isAdmin: auth.isAdmin }
}

export async function resendBotNotification(id: string) {
  const auth = await ensureBotAdmin()
  if ('error' in auth) return { error: auth.error }
  const db = createAdminClient()

  const { error: upErr } = await db
    .from('wa_notifications')
    .update({ status: 'pending', sent_at: null })
    .eq('id', id)
  if (upErr) return { error: upErr.message }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (url && key) {
    try {
      await fetch(`${url}/functions/v1/notification-worker`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'x-internal-call': '1',
        },
        body: JSON.stringify({ notification_id: id }),
      })
    } catch {
      // o cron de 1 min pega na próxima passada
    }
  }
  revalidatePath('/bot-notifications')
  return { ok: true }
}

// ─── util ────────────────────────────────────────────────────────────────

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags ?? []) {
    const t = (raw ?? '').trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}
