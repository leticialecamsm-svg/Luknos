'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { centsToDb, dbValueToCents, MAX_DEAL_CENTS } from '@/lib/crm-money'
import { MAX_STAGES, isValidInstanceName, samePhoneDigits, sameStageName, validateStageInput, type CrmStage } from '@/lib/crm-stages'

// ───────────────────────────────────────────────────────────────────────────
// Server Actions do CRM / Chat multiatendente WhatsApp.
// Separado do Robô de Orçamentos (bot-actions.ts): aqui é chat livre entre
// vendedor e cliente, em cima de várias instâncias Evolution (crm_instances).
// Convite de leitura: qualquer "staff" ativo (ensureStaff). Escrita de
// instâncias (números): só admin. Enviar mensagem / reatribuir / vincular
// contato: qualquer staff (reaproveita RLS wa_is_staff() do banco).
// ───────────────────────────────────────────────────────────────────────────

function hasCrmPage(pages: string[] | null | undefined) {
  return (pages ?? []).some((p) => p === '/crm' || '/crm'.startsWith(p + '/'))
}

// Staff do CRM = usuário ativo que é admin OU tem a página /crm liberada (pelo
// papel ou individualmente em /admin/users). Antes bastava estar ativo.
async function ensureStaff() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const }
  const { data: profile } = await supabase.from('users').select('role, active, name, extra_pages').eq('id', user.id).single()
  if (!profile || profile.active === false) return { error: 'Sem permissão' as const }
  const isAdmin = profile.role === 'admin'
  if (!isAdmin) {
    const { data: role } = await createAdminClient().from('roles').select('allowed_pages').eq('name', profile.role).maybeSingle()
    if (!hasCrmPage(role?.allowed_pages) && !hasCrmPage(profile.extra_pages as string[] | null)) {
      return { error: 'Sem permissão' as const }
    }
  }
  return { userId: user.id, name: profile.name as string, isAdmin }
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
  const admin = createAdminClient()
  const [{ data }, { data: members }] = await Promise.all([
    admin
      .from('crm_instances')
      .select('id, instance_name, phone_e164, label, default_user_id, is_active, is_private, users:default_user_id(name)')
      .order('label'),
    admin.from('crm_instance_members').select('instance_id, user_id'),
  ])
  return (data ?? []).map((i: any) => ({
    ...i,
    member_ids: (members ?? []).filter((m) => m.instance_id === i.id).map((m) => m.user_id as string),
  }))
}

// Privacidade do número: privado = só dono, membros, atendente da conversa e
// quem receber uma conversa liberada. Quem está em memberIds vê TODAS as
// conversas desse número. Admin não ganha acesso automático.
export async function setCrmInstanceAccess(id: string, isPrivate: boolean, memberIds: string[]) {
  const auth = await ensureAdmin()
  if ('error' in auth) return { error: auth.error }
  const admin = createAdminClient()
  const ids = Array.from(new Set(memberIds))
  if (ids.length) {
    const users = await allActiveUsers()
    const chosen = ids.map((id) => users.find((u) => u.id === id))
    if (chosen.some((u) => !u)) return { error: 'Usuário inválido ou inativo' }
    for (const u of chosen as CrmUser[]) {
      const err = await grantCrmAccessIfNeeded(auth.isAdmin, u)
      if (err) return { error: err }
    }
  }
  const { error } = await admin.from('crm_instances').update({ is_private: isPrivate }).eq('id', id)
  if (error) return { error: error.message }
  await admin.from('crm_instance_members').delete().eq('instance_id', id)
  if (ids.length) {
    const { error: e2 } = await admin.from('crm_instance_members').insert(ids.map((user_id) => ({ instance_id: id, user_id })))
    if (e2) return { error: e2.message }
  }
  revalidatePath('/crm-instances'); revalidatePath('/crm')
  return { ok: true }
}

export interface CrmInstanceInput {
  instance_name: string
  phone_e164: string
  label: string
  default_user_id: string | null
}

// Devolve o nome de outra instância que já usa esse telefone (ou null).
async function findInstanceWithPhone(phone: string | null | undefined, exceptId: string | null) {
  if (!phone) return null
  const { data } = await createAdminClient().from('crm_instances').select('id, label, phone_e164')
  const hit = (data ?? []).find((r) => r.id !== exceptId && samePhoneDigits(r.phone_e164, phone))
  return hit?.label ?? null
}

export async function createCrmInstance(input: CrmInstanceInput) {
  const auth = await ensureAdmin()
  if ('error' in auth) return { error: auth.error }
  if (!input.instance_name.trim()) return { error: 'Nome da instância é obrigatório' }
  if (!isValidInstanceName(input.instance_name)) return { error: 'Nome da instância: não use / ? # % no nome' }
  if (!input.label.trim()) return { error: 'Nome de exibição é obrigatório' }
  if (input.phone_e164 && !E164.test(input.phone_e164)) return { error: 'Telefone precisa estar em formato +55...' }
  const dup = await findInstanceWithPhone(input.phone_e164, null)
  if (dup) return { error: `Esse telefone já está cadastrado em "${dup}"` }

  if (input.default_user_id) {
    const u = (await allActiveUsers()).find((x) => x.id === input.default_user_id)
    if (!u) return { error: 'Atendente padrão inválido ou inativo' }
    const gErr = await grantCrmAccessIfNeeded(true, u)
    if (gErr) return { error: gErr }
  }
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
  if (!input.label.trim()) return { error: 'Nome de exibição é obrigatório' }
  if (input.phone_e164 && !E164.test(input.phone_e164)) return { error: 'Telefone precisa estar em formato +55...' }
  const dup = await findInstanceWithPhone(input.phone_e164, id)
  if (dup) return { error: `Esse telefone já está cadastrado em "${dup}"` }
  if (input.default_user_id) {
    const u = (await allActiveUsers()).find((x) => x.id === input.default_user_id)
    if (!u) return { error: 'Atendente padrão inválido ou inativo' }
    const gErr = await grantCrmAccessIfNeeded(true, u)
    if (gErr) return { error: gErr }
  }

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

export interface CrmUser {
  id: string
  name: string
  role: string
  role_label: string
  has_crm: boolean // já tem a página /crm (admin, papel ou liberação individual)
}

// TODOS os usuários ativos do sistema (vendedores etc.), marcando quem já tem
// acesso ao CRM. Quem for escolhido (atendente padrão, membro, transferência ou
// liberação) e ainda não tiver acesso ganha a página /crm automaticamente — só
// administradores podem disparar isso (ver grantCrmAccessIfNeeded).
async function allActiveUsers(): Promise<CrmUser[]> {
  const admin = createAdminClient()
  const [{ data: users }, { data: roles }] = await Promise.all([
    admin.from('users').select('id, name, role, extra_pages').eq('active', true).order('name'),
    admin.from('roles').select('name, label, allowed_pages'),
  ])
  const roleMap = new Map((roles ?? []).map((r) => [r.name as string, r]))
  return (users ?? []).map((u) => {
    const r = roleMap.get(u.role as string)
    return {
      id: u.id as string,
      name: u.name as string,
      role: u.role as string,
      role_label: (r?.label as string) ?? (u.role as string),
      has_crm: u.role === 'admin' || hasCrmPage(r?.allowed_pages as string[] | null) || hasCrmPage(u.extra_pages as string[] | null),
    }
  })
}

// Garante que o usuário escolhido consiga abrir o CRM. Não-admin não pode liberar
// a página para terceiros (evitaria ganhar acesso aos números abertos à equipe).
async function grantCrmAccessIfNeeded(actorIsAdmin: boolean, target: CrmUser): Promise<string | null> {
  if (target.has_crm) return null
  if (!actorIsAdmin) return `${target.name} ainda não tem acesso ao CRM. Peça a um administrador para liberar.`
  const admin = createAdminClient()
  const { data } = await admin.from('users').select('extra_pages').eq('id', target.id).single()
  const pages = Array.from(new Set([...((data?.extra_pages as string[] | null) ?? []), '/crm']))
  const { error } = await admin.from('users').update({ extra_pages: pages }).eq('id', target.id)
  return error ? error.message : null
}

export async function getSystemUsersForCrm() {
  const auth = await ensureStaff()
  if ('error' in auth) return [] as CrmUser[]
  return allActiveUsers()
}

// ─── Acesso (número privado / conversa liberada) ────────────────────────────

type Admin = ReturnType<typeof createAdminClient>

interface Scope {
  // instâncias que o usuário enxerga por inteiro (públicas, ou privadas onde é dono/membro)
  instanceIds: string[]
  // conversas avulsas liberadas para ele
  sharedConvIds: string[]
  instances: { id: string; label: string; is_private: boolean; is_active: boolean; default_user_id: string | null; created_at: string }[]
  memberOf: Set<string>
}

async function loadScope(admin: Admin, userId: string): Promise<Scope> {
  const [{ data: instances }, { data: mem }, { data: shared }] = await Promise.all([
    admin.from('crm_instances').select('id, label, is_private, is_active, default_user_id, created_at'),
    admin.from('crm_instance_members').select('instance_id').eq('user_id', userId),
    admin.from('crm_conversation_access').select('conversation_id').eq('user_id', userId),
  ])
  const memberOf = new Set((mem ?? []).map((m) => m.instance_id as string))
  const list = (instances ?? []) as Scope['instances']
  return {
    instances: list,
    memberOf,
    sharedConvIds: (shared ?? []).map((s) => s.conversation_id as string),
    instanceIds: list.filter((i) => !i.is_private || i.default_user_id === userId || memberOf.has(i.id)).map((i) => i.id),
  }
}

// Mesma regra do banco (crm_can_see_conversation). canManage = pode transferir,
// liberar e tirar a liberação: dono/membro do número ou atendente atual.
async function conversationAccess(admin: Admin, userId: string, conversationId: string) {
  const { data: c } = await admin
    .from('crm_conversations')
    .select('id, instance_id, assigned_user_id')
    .eq('id', conversationId)
    .maybeSingle()
  if (!c) return { ok: false as const, error: 'Conversa não encontrada' }
  const { data: inst } = await admin.from('crm_instances').select('is_private, default_user_id').eq('id', c.instance_id).single()
  const isPrivate = !!inst?.is_private
  const [{ data: member }, { data: shared }] = await Promise.all([
    admin.from('crm_instance_members').select('user_id').eq('instance_id', c.instance_id).eq('user_id', userId).maybeSingle(),
    admin.from('crm_conversation_access').select('user_id').eq('conversation_id', conversationId).eq('user_id', userId).maybeSingle(),
  ])
  const isOwnerOrMember = inst?.default_user_id === userId || !!member
  const isAssigned = c.assigned_user_id === userId
  const canSee = !isPrivate || isOwnerOrMember || isAssigned || !!shared
  if (!canSee) return { ok: false as const, error: 'Você não tem acesso a esta conversa' }
  return {
    ok: true as const,
    isPrivate,
    assignedUserId: c.assigned_user_id as string | null,
    instanceId: c.instance_id as string,
    // em número aberto qualquer atendente pode transferir; em privado só quem "manda" nele
    canManage: !isPrivate || isOwnerOrMember || isAssigned,
  }
}

// WhatsApps que o usuário enxerga (para o seletor do Quadro e das Conversas).
export async function getCrmInstanceOptions() {
  const auth = await ensureStaff()
  if ('error' in auth) return [] as { id: string; label: string; is_private: boolean; color_index: number }[]
  const admin = createAdminClient()
  const scope = await loadScope(admin, auth.userId)
  // número privado em que só tem conversas avulsas também aparece
  const extra = new Set<string>()
  if (scope.sharedConvIds.length) {
    const { data } = await admin.from('crm_conversations').select('instance_id').in('id', scope.sharedConvIds)
    for (const r of data ?? []) extra.add(r.instance_id as string)
  }
  const { data: assignedRows } = await admin
    .from('crm_conversations').select('instance_id').eq('assigned_user_id', auth.userId)
  for (const r of assignedRows ?? []) extra.add(r.instance_id as string)
  // cor estável: posição do número na ordem de criação, entre todos (não só os visíveis)
  const colorIndex = new Map(
    [...scope.instances].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((i, n) => [i.id, n]),
  )
  return scope.instances
    .filter((i) => scope.instanceIds.includes(i.id) || extra.has(i.id))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
    .map((i) => ({ id: i.id, label: i.label, is_private: i.is_private, color_index: colorIndex.get(i.id) ?? 0 }))
}

export interface ConversationAccessInfo {
  can_manage: boolean
  instance_private: boolean
  assigned_user_id: string | null
  shared: { user_id: string; name: string }[]
}

export async function getConversationAccessInfo(conversationId: string): Promise<ConversationAccessInfo | { error: string }> {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error ?? 'Sem permissão' }
  const admin = createAdminClient()
  const acc = await conversationAccess(admin, auth.userId, conversationId)
  if (!acc.ok) return { error: acc.error }
  const { data } = await admin
    .from('crm_conversation_access')
    .select('user_id, users:user_id(name)')
    .eq('conversation_id', conversationId)
  return {
    can_manage: acc.canManage,
    instance_private: acc.isPrivate,
    assigned_user_id: acc.assignedUserId,
    shared: (data ?? []).map((r: any) => ({ user_id: r.user_id, name: r.users?.name ?? '—' })),
  }
}

async function systemNote(admin: Admin, conversationId: string, body: string) {
  await admin.from('crm_messages').insert({
    conversation_id: conversationId, direction: 'outbound', is_system: true, message_type: 'text', body,
  })
}

// Libera UMA conversa para outra pessoa responder, sem transferir nem abrir o número todo.
export async function shareConversation(conversationId: string, userId: string) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error }
  const admin = createAdminClient()
  const acc = await conversationAccess(admin, auth.userId, conversationId)
  if (!acc.ok) return { error: acc.error }
  if (!acc.canManage) return { error: 'Só quem atende esta conversa pode liberá-la' }
  if (userId === auth.userId) return { error: 'Você já tem acesso a esta conversa' }
  const target = (await allActiveUsers()).find((u) => u.id === userId)
  if (!target) return { error: 'Usuário inválido ou inativo' }
  const grantErr = await grantCrmAccessIfNeeded(auth.isAdmin, target)
  if (grantErr) return { error: grantErr }
  if (acc.assignedUserId === userId) return { error: 'Essa pessoa já atende esta conversa' }
  const { error } = await admin
    .from('crm_conversation_access')
    .upsert({ conversation_id: conversationId, user_id: userId, granted_by: auth.userId }, { onConflict: 'conversation_id,user_id' })
  if (error) return { error: error.message }
  await systemNote(admin, conversationId, `Conversa liberada para ${target.name} por ${auth.name}.`)
  revalidatePath('/crm')
  return { ok: true }
}

export async function unshareConversation(conversationId: string, userId: string) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error }
  const admin = createAdminClient()
  const acc = await conversationAccess(admin, auth.userId, conversationId)
  if (!acc.ok) return { error: acc.error }
  if (!acc.canManage) return { error: 'Só quem atende esta conversa pode retirar a liberação' }
  const { data: u } = await admin.from('users').select('name').eq('id', userId).maybeSingle()
  const { error } = await admin.from('crm_conversation_access').delete().eq('conversation_id', conversationId).eq('user_id', userId)
  if (error) return { error: error.message }
  await systemNote(admin, conversationId, `Liberação de ${u?.name ?? 'usuário'} retirada por ${auth.name}.`)
  revalidatePath('/crm')
  return { ok: true }
}

// Valor em negociação desta conversa (centavos; null = sem valor).
export async function setConversationValue(conversationId: string, cents: number | null) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error }
  if (cents !== null && (!Number.isInteger(cents) || cents < 0 || cents > MAX_DEAL_CENTS)) return { error: 'Valor inválido' }
  const admin = createAdminClient()
  const acc = await conversationAccess(admin, auth.userId, conversationId)
  if (!acc.ok) return { error: acc.error }
  const { error } = await admin.from('crm_conversations').update({ deal_value: centsToDb(cents) }).eq('id', conversationId)
  if (error) return { error: error.message }
  revalidatePath('/crm')
  return { ok: true }
}

// ─── Inbox ──────────────────────────────────────────────────────────────────

export interface CrmPerson {
  id: string
  name: string
  avatar_url: string | null
  avatar_color: string | null
}

export interface ConversationRow {
  id: string
  instance_id: string
  remote_jid: string
  contact_id: string | null
  contact_name_cache: string | null
  contact_photo_url: string | null
  assigned_user_id: string | null
  assigned_user_name: string | null
  assigned_user_avatar: CrmPerson | null
  // quem respondeu por último (humano, pelo sistema ou pelo celular do número); null se ninguém ainda
  last_reply_user: CrmPerson | null
  stage_id: string | null
  deal_cents: number | null
  status: string
  last_message_at: string
  instance_label: string
  contact_name: string | null
  last_body: string | null
}

// scope: 'mine' (atendente logado, inclui as liberadas para ele), 'unassigned', 'all'
// instanceIds: filtra por WhatsApp (vazio/undefined = todos os que ele enxerga)
export async function getCrmConversations(
  scope: 'mine' | 'unassigned' | 'all' = 'mine',
  limit = 200,
  instanceIds?: string[],
) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error, items: [] as ConversationRow[] }

  const admin = createAdminClient()
  const vis = await loadScope(admin, auth.userId)
  const inList = (xs: string[]) => `(${xs.join(',')})`

  let q = admin
    .from('crm_conversations')
    .select(`
      id, instance_id, remote_jid, contact_id, contact_name_cache, contact_photo_url, assigned_user_id, stage_id, deal_value, status, last_message_at,
      crm_instances(label), contacts(name),
      assigned:users!crm_conversations_assigned_user_id_fkey(name, avatar_url, avatar_color)
    `)
    .eq('status', 'open')
    .order('last_message_at', { ascending: false })
    .limit(limit)

  // 1) o que ele pode ver (número aberto/dele, atribuída a ele, ou liberada)
  const visible = [
    ...(vis.instanceIds.length ? [`instance_id.in.${inList(vis.instanceIds)}`] : []),
    `assigned_user_id.eq.${auth.userId}`,
    ...(vis.sharedConvIds.length ? [`id.in.${inList(vis.sharedConvIds)}`] : []),
  ].join(',')

  if (scope === 'mine') {
    const mine = [
      `assigned_user_id.eq.${auth.userId}`,
      ...(vis.sharedConvIds.length ? [`id.in.${inList(vis.sharedConvIds)}`] : []),
    ].join(',')
    q = q.or(mine)
  } else {
    q = q.or(visible)
    if (scope === 'unassigned') q = q.is('assigned_user_id', null)
  }

  if (instanceIds && instanceIds.length) q = q.in('instance_id', instanceIds)

  const { data, error } = await q
  if (error) return { error: error.message, items: [] as ConversationRow[] }

  const ids = (data ?? []).map((c: any) => c.id)
  const lastByConv = new Map<string, string | null>()
  const lastReplyByConv = new Map<string, string>()
  if (ids.length) {
    const { data: lastMsgs } = await admin
      .from('crm_messages')
      .select('conversation_id, body, message_type, created_at, direction, sender_user_id, is_system')
      .in('conversation_id', ids)
      .order('created_at', { ascending: false })
    for (const m of lastMsgs ?? []) {
      if (!lastByConv.has(m.conversation_id) && !m.is_system) {
        lastByConv.set(m.conversation_id, m.body || (m.message_type !== 'text' ? '📎 arquivo' : null))
      }
      if (!lastReplyByConv.has(m.conversation_id) && m.direction === 'outbound' && !m.is_system && m.sender_user_id) {
        lastReplyByConv.set(m.conversation_id, m.sender_user_id)
      }
    }
  }
  const replyIds = Array.from(new Set(lastReplyByConv.values()))
  const people = new Map<string, CrmPerson>()
  if (replyIds.length) {
    const { data: us } = await admin.from('users').select('id, name, avatar_url, avatar_color').in('id', replyIds)
    for (const u of us ?? []) people.set(u.id, { id: u.id, name: u.name, avatar_url: u.avatar_url ?? null, avatar_color: u.avatar_color ?? null })
  }

  const items: ConversationRow[] = (data ?? []).map((c: any) => ({
    id: c.id,
    instance_id: c.instance_id,
    remote_jid: c.remote_jid,
    contact_id: c.contact_id,
    contact_name_cache: c.contact_name_cache,
    contact_photo_url: c.contact_photo_url ?? null,
    assigned_user_id: c.assigned_user_id,
    assigned_user_name: c.assigned?.name ?? null,
    assigned_user_avatar: c.assigned_user_id && c.assigned
      ? { id: c.assigned_user_id, name: c.assigned.name, avatar_url: c.assigned.avatar_url ?? null, avatar_color: c.assigned.avatar_color ?? null }
      : null,
    last_reply_user: people.get(lastReplyByConv.get(c.id) ?? '') ?? null,
    stage_id: c.stage_id ?? null,
    deal_cents: dbValueToCents(c.deal_value),
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
  const admin = createAdminClient()
  const acc = await conversationAccess(admin, auth.userId, conversationId)
  if (!acc.ok) return { error: acc.error, items: [] }
  const { data, error } = await admin
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

// Transferir o atendimento. Em número privado só quem atende/administra o número
// pode transferir, e o destino precisa ter acesso ao CRM.
export async function reassignConversation(conversationId: string, newUserId: string | null) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error }
  const admin = createAdminClient()
  const acc = await conversationAccess(admin, auth.userId, conversationId)
  if (!acc.ok) return { error: acc.error }
  if (!acc.canManage) return { error: 'Só quem atende esta conversa pode transferi-la' }

  let newName: string | null = null
  if (newUserId) {
    const target = (await allActiveUsers()).find((u) => u.id === newUserId)
    if (!target) return { error: 'Usuário inválido ou inativo' }
    const grantErr = await grantCrmAccessIfNeeded(auth.isAdmin, target)
    if (grantErr) return { error: grantErr }
    newName = target.name
  }
  const { error } = await admin.from('crm_conversations').update({ assigned_user_id: newUserId }).eq('id', conversationId)
  if (error) return { error: error.message }
  // quem recebeu o atendimento não precisa mais da liberação avulsa
  if (newUserId) await admin.from('crm_conversation_access').delete().eq('conversation_id', conversationId).eq('user_id', newUserId)

  await systemNote(admin, conversationId,
    newUserId ? `Conversa transferida para ${newName} por ${auth.name}.` : `Conversa deixada sem responsável por ${auth.name}.`)

  revalidatePath('/crm')
  return { ok: true }
}

export async function linkConversationContact(conversationId: string, contactId: string | null) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error }
  const admin = createAdminClient()
  const acc = await conversationAccess(admin, auth.userId, conversationId)
  if (!acc.ok) return { error: acc.error }
  const { error } = await admin
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
  const admin = createAdminClient()
  const acc = await conversationAccess(admin, auth.userId, conversationId)
  if (!acc.ok) return { error: acc.error }
  const { error } = await admin
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
  const acc = await conversationAccess(createAdminClient(), auth.userId, input.conversationId)
  if (!acc.ok) return { error: acc.error }

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
  const acc = await conversationAccess(createAdminClient(), auth.userId, input.conversationId)
  if (!acc.ok) return { error: acc.error }

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
  // o caminho começa com o id da conversa: confere o acesso a ela
  const convId = storagePath.split('/')[0]
  const acc = await conversationAccess(createAdminClient(), auth.userId, convId)
  if (!acc.ok) return { error: acc.error }
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


// ─── Kanban (etapas de venda) ───────────────────────────────────────────────
// Ler/mover cartões: qualquer staff. Criar/editar/excluir/reordenar colunas: admin.

export async function getCrmStages(): Promise<CrmStage[]> {
  const auth = await ensureStaff()
  if ('error' in auth) return []
  const { data } = await createAdminClient()
    .from('crm_stages')
    .select('id, name, color, position, restart_on_inbound')
    .order('position')
    .order('created_at')
  return (data ?? []) as CrmStage[]
}

export async function createCrmStage(input: { name: string; color: string; restart_on_inbound?: boolean }) {
  const auth = await ensureAdmin()
  if ('error' in auth) return { error: auth.error }
  const v = validateStageInput(input)
  if ('error' in v) return { error: v.error }

  const admin = createAdminClient()
  const { data: existing } = await admin.from('crm_stages').select('name, position')
  const rows = existing ?? []
  if (rows.length >= MAX_STAGES) return { error: `Limite de ${MAX_STAGES} colunas atingido` }
  if (rows.some((r) => sameStageName(r.name, v.name))) return { error: 'Já existe uma coluna com esse nome' }

  const position = rows.reduce((m, r) => Math.max(m, r.position), -1) + 1
  const { data, error } = await admin
    .from('crm_stages')
    .insert({ name: v.name, color: v.color, position, restart_on_inbound: v.restart_on_inbound })
    .select('id, name, color, position, restart_on_inbound')
    .single()
  if (error) return { error: error.code === '23505' ? 'Já existe uma coluna com esse nome' : error.message }
  revalidatePath('/crm')
  return { ok: true, stage: data as CrmStage }
}

export async function updateCrmStage(id: string, input: { name: string; color: string; restart_on_inbound?: boolean }) {
  const auth = await ensureAdmin()
  if ('error' in auth) return { error: auth.error }
  const v = validateStageInput(input)
  if ('error' in v) return { error: v.error }

  const admin = createAdminClient()
  const { data: others } = await admin.from('crm_stages').select('id, name').neq('id', id)
  if ((others ?? []).some((r) => sameStageName(r.name, v.name))) return { error: 'Já existe uma coluna com esse nome' }

  const { data, error } = await admin
    .from('crm_stages')
    .update({ name: v.name, color: v.color, restart_on_inbound: v.restart_on_inbound })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.code === '23505' ? 'Já existe uma coluna com esse nome' : error.message }
  if (!data?.length) return { error: 'Coluna não existe mais (outra pessoa pode ter excluído). Atualize a página.' }
  revalidatePath('/crm')
  return { ok: true }
}

// Excluir uma coluna NÃO apaga conversas: elas voltam para a primeira coluna.
// Não deixa excluir a última (o quadro ficaria sem onde mostrar as conversas).
export async function deleteCrmStage(id: string) {
  const auth = await ensureAdmin()
  if ('error' in auth) return { error: auth.error }
  const admin = createAdminClient()
  const { count } = await admin.from('crm_stages').select('id', { count: 'exact', head: true })
  if ((count ?? 0) <= 1) return { error: 'O quadro precisa ter ao menos uma coluna' }
  const { error } = await admin.from('crm_stages').delete().eq('id', id)
  if (error) return { error: error.message }
  // renumera as restantes (0..n-1) para não ficar buraco na ordem
  const { data: rest } = await admin.from('crm_stages').select('id').order('position').order('created_at')
  for (let i = 0; i < (rest ?? []).length; i++) {
    await admin.from('crm_stages').update({ position: i }).eq('id', rest![i].id)
  }
  revalidatePath('/crm')
  return { ok: true }
}

// Recebe a lista COMPLETA de ids na nova ordem.
export async function reorderCrmStages(orderedIds: string[]) {
  const auth = await ensureAdmin()
  if ('error' in auth) return { error: auth.error }
  if (new Set(orderedIds).size !== orderedIds.length) return { error: 'Ordem inválida' }
  const admin = createAdminClient()
  const { data: current } = await admin.from('crm_stages').select('id')
  const known = new Set((current ?? []).map((r) => r.id))
  if (orderedIds.length !== known.size || orderedIds.some((i) => !known.has(i))) {
    return { error: 'As colunas mudaram enquanto você editava. Atualize a página.' }
  }
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin.from('crm_stages').update({ position: i }).eq('id', orderedIds[i])
    if (error) return { error: error.message }
  }
  revalidatePath('/crm')
  return { ok: true }
}

export async function moveConversationToStage(conversationId: string, stageId: string | null) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error }
  const admin = createAdminClient()
  const acc = await conversationAccess(admin, auth.userId, conversationId)
  if (!acc.ok) return { error: acc.error }
  if (stageId) {
    const { data: st } = await admin.from('crm_stages').select('id').eq('id', stageId).maybeSingle()
    if (!st) return { error: 'Essa coluna não existe mais. Atualize a página.' }
  }
  const { data, error } = await admin
    .from('crm_conversations')
    .update({ stage_id: stageId })
    .eq('id', conversationId)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Conversa não encontrada' }
  revalidatePath('/crm')
  return { ok: true }
}
