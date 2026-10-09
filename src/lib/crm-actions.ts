'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_COMMISSION_BY_TYPE, isOpenQuote, extractLinks, formatPhoneForContact, isContactType, onlyDigits, phoneVariants, samePhone } from '@/lib/crm-panel'
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

const ACT_AS_COOKIE = 'crm_act_as'

// Staff do CRM = usuário ativo que é admin OU tem a página /crm liberada (pelo
// papel ou individualmente em /admin/users).
//
// "Atuar como": um ADMINISTRADOR pode escolher agir em nome de outro atendente
// (cookie crm_act_as, validado a cada chamada). Nesse caso userId/name passam a
// ser os do atendente — as conversas, permissões e a assinatura das mensagens são
// as dele — e actedBy guarda o administrador real, para o registro e o aviso.
// isAdmin continua sendo o do usuário REAL (gerenciar colunas/números segue valendo);
// viewAsAdmin é o papel de quem está sendo representado.
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

  const actAs = isAdmin ? cookies().get(ACT_AS_COOKIE)?.value : undefined
  if (actAs && actAs !== user.id) {
    const { data: t } = await createAdminClient().from('users').select('id, name, role, active').eq('id', actAs).maybeSingle()
    if (t && t.active !== false) {
      return {
        userId: t.id as string,
        name: t.name as string,
        isAdmin,
        viewAsAdmin: t.role === 'admin',
        actedBy: { id: user.id, name: profile.name as string },
      }
    }
  }
  return { userId: user.id, name: profile.name as string, isAdmin, viewAsAdmin: isAdmin, actedBy: null as { id: string; name: string } | null }
}

// "Letícia" ou, quando um admin age em nome de alguém, "Jennifer (por Letícia)".
function whoLabel(auth: { name: string; actedBy: { name: string } | null }) {
  return auth.actedBy ? `${auth.name} (por ${auth.actedBy.name})` : auth.name
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

// Números privados em que o administrador NÃO tem acesso próprio (dono/membro).
// Ao atuar como outra pessoa eles ficam fora: "atuar como" não é uma porta dos fundos.
async function blockedInstanceIds(admin: Admin, adminUserId: string): Promise<string[]> {
  const [{ data: priv }, { data: mem }] = await Promise.all([
    admin.from('crm_instances').select('id, default_user_id').eq('is_private', true),
    admin.from('crm_instance_members').select('instance_id').eq('user_id', adminUserId),
  ])
  const member = new Set((mem ?? []).map((m) => m.instance_id as string))
  return (priv ?? []).filter((i) => i.default_user_id !== adminUserId && !member.has(i.id as string)).map((i) => i.id as string)
}

async function convAccess(admin: Admin, auth: { userId: string; actedBy: { id: string } | null }, conversationId: string) {
  const acc = await conversationAccess(admin, auth.userId, conversationId)
  if (!acc.ok || !auth.actedBy || !acc.isPrivate) return acc
  const blocked = await blockedInstanceIds(admin, auth.actedBy.id)
  if (blocked.includes(acc.instanceId)) {
    return { ok: false as const, error: 'Este WhatsApp é privado e você não tem acesso próprio a ele' }
  }
  return acc
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
  const blockedOpts = auth.actedBy ? await blockedInstanceIds(admin, auth.actedBy.id) : []
  return scope.instances
    .filter((i) => !blockedOpts.includes(i.id))
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
  const acc = await convAccess(admin, auth, conversationId)
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
  const acc = await convAccess(admin, auth, conversationId)
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
  await systemNote(admin, conversationId, `Conversa liberada para ${target.name} por ${whoLabel(auth)}.`)
  revalidatePath('/crm')
  return { ok: true }
}

export async function unshareConversation(conversationId: string, userId: string) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error }
  const admin = createAdminClient()
  const acc = await convAccess(admin, auth, conversationId)
  if (!acc.ok) return { error: acc.error }
  if (!acc.canManage) return { error: 'Só quem atende esta conversa pode retirar a liberação' }
  const { data: u } = await admin.from('users').select('name').eq('id', userId).maybeSingle()
  const { error } = await admin.from('crm_conversation_access').delete().eq('conversation_id', conversationId).eq('user_id', userId)
  if (error) return { error: error.message }
  await systemNote(admin, conversationId, `Liberação de ${u?.name ?? 'usuário'} retirada por ${whoLabel(auth)}.`)
  revalidatePath('/crm')
  return { ok: true }
}

// Valor em negociação desta conversa (centavos; null = sem valor).
export async function setConversationValue(conversationId: string, cents: number | null) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error }
  if (cents !== null && (!Number.isInteger(cents) || cents < 0 || cents > MAX_DEAL_CENTS)) return { error: 'Valor inválido' }
  const admin = createAdminClient()
  const acc = await convAccess(admin, auth, conversationId)
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
  if (auth.actedBy) {
    const blocked = await blockedInstanceIds(admin, auth.actedBy.id)
    if (blocked.length) q = q.not('instance_id', 'in', inList(blocked))
  }

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

// Quantas conversas há em cada aba (Minhas / Pendentes / Todas), com a mesma regra
// de visibilidade da lista. Serve para avisar de conversas novas sem responsável.
export async function getCrmScopeCounts(instanceIds?: string[]) {
  const auth = await ensureStaff()
  if ('error' in auth) return { mine: 0, unassigned: 0, all: 0 }
  const admin = createAdminClient()
  const vis = await loadScope(admin, auth.userId)
  const inList = (xs: string[]) => `(${xs.join(',')})`
  const sharedClause = vis.sharedConvIds.length ? [`id.in.${inList(vis.sharedConvIds)}`] : []
  const visible = [
    ...(vis.instanceIds.length ? [`instance_id.in.${inList(vis.instanceIds)}`] : []),
    `assigned_user_id.eq.${auth.userId}`,
    ...sharedClause,
  ].join(',')
  const mine = [`assigned_user_id.eq.${auth.userId}`, ...sharedClause].join(',')

  const blocked = auth.actedBy ? await blockedInstanceIds(admin, auth.actedBy.id) : []
  const base = () => {
    let q = admin.from('crm_conversations').select('id', { count: 'exact', head: true }).eq('status', 'open')
    if (instanceIds && instanceIds.length) q = q.in('instance_id', instanceIds)
    if (blocked.length) q = q.not('instance_id', 'in', inList(blocked))
    return q
  }
  const [m, u, a] = await Promise.all([
    base().or(mine),
    base().or(visible).is('assigned_user_id', null),
    base().or(visible),
  ])
  return { mine: m.count ?? 0, unassigned: u.count ?? 0, all: a.count ?? 0 }
}

export async function getCrmMessages(conversationId: string) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error, items: [] }
  const admin = createAdminClient()
  const acc = await convAccess(admin, auth, conversationId)
  if (!acc.ok) return { error: acc.error, items: [] }
  const { data, error } = await admin
    .from('crm_messages')
    .select('id, direction, sender_user_id, message_type, body, storage_path, file_name, mime_type, is_system, created_at, sender:users!crm_messages_sender_user_id_fkey(name, avatar_url, avatar_color), acted:users!crm_messages_acted_by_user_id_fkey(name, avatar_url, avatar_color)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) return { error: error.message, items: [] }
  return {
    items: (data ?? []).map((m: any) => ({
      ...m,
      sender_name: m.sender?.name ?? null,
      sender_avatar_url: m.sender?.avatar_url ?? null,
      sender_avatar_color: m.sender?.avatar_color ?? null,
      acted_by_name: m.acted?.name ?? null,
      acted_by_avatar_url: m.acted?.avatar_url ?? null,
      acted_by_avatar_color: m.acted?.avatar_color ?? null,
    })),
  }
}

// Transferir o atendimento. Em número privado só quem atende/administra o número
// pode transferir, e o destino precisa ter acesso ao CRM.
export async function reassignConversation(conversationId: string, newUserId: string | null) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error }
  const admin = createAdminClient()
  const acc = await convAccess(admin, auth, conversationId)
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
    newUserId ? `Conversa transferida para ${newName} por ${whoLabel(auth)}.` : `Conversa deixada sem responsável por ${whoLabel(auth)}.`)

  revalidatePath('/crm')
  return { ok: true }
}

export async function linkConversationContact(conversationId: string, contactId: string | null) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error }
  const admin = createAdminClient()
  const acc = await convAccess(admin, auth, conversationId)
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
  const acc = await convAccess(admin, auth, conversationId)
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
  const acc = await convAccess(createAdminClient(), auth, input.conversationId)
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
  const acc = await convAccess(createAdminClient(), auth, input.conversationId)
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
        acted_by_user_id: auth.actedBy?.id ?? null,
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
  const acc = await convAccess(createAdminClient(), auth, convId)
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
  const acc = await convAccess(admin, auth, conversationId)
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


// ─── Painel "Dados do contato" ──────────────────────────────────────────────

export interface PanelMedia {
  id: string
  path: string
  file_name: string | null
  mime_type: string | null
  created_at: string
  direction: 'inbound' | 'outbound'
  url?: string | null // só para imagens (miniatura)
}

export interface ContactPanelData {
  phone_digits: string
  display_name: string
  instance_label: string
  created_at: string
  stage: { name: string; color: string } | null
  deal_cents: number | null
  assigned: CrmPerson | null
  stats: { inbound: number; outbound: number; last_inbound_at: string | null; last_outbound_at: string | null }
  contact: { id: string; name: string; type: string; company: string | null; email: string | null; phone: string | null; notes: string | null; linked: boolean } | null
  quotes: {
    id: string; number: number | null; date: string | null; category: string | null; status: string; value: number | null
    role: 'cliente' | 'arquiteto'
    is_open: boolean
    party: { name: string; role: 'cliente' | 'especificador' } | null // o outro lado do orçamento
    negotiation: { temperature: string; final_value: number | null; loss_reason: string | null } | null
  }[]
  quotes_restricted: boolean // vendedor só vê os orçamentos em que atua
  other_conversations: { id: string; instance_label: string; created_at: string; last_message_at: string; stage_name: string | null }[]
  media: { images: PanelMedia[]; documents: PanelMedia[]; audios: PanelMedia[]; videos: PanelMedia[]; total: number }
  links: { url: string; at: string }[]
}

const PANEL_LIST_LIMIT = 60

export async function getContactPanel(conversationId: string): Promise<ContactPanelData | { error: string }> {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error ?? 'Sem permissão' }
  const admin = createAdminClient()
  const acc = await convAccess(admin, auth, conversationId)
  if (!acc.ok) return { error: acc.error }

  const { data: c } = await admin
    .from('crm_conversations')
    .select(`id, instance_id, remote_jid, contact_id, contact_name_cache, assigned_user_id, stage_id, deal_value, created_at,
      crm_instances(label), contacts(id, name, type, company, email, phone, notes),
      assigned:users!crm_conversations_assigned_user_id_fkey(name, avatar_url, avatar_color)`)
    .eq('id', conversationId)
    .single()
  if (!c) return { error: 'Conversa não encontrada' }
  const conv: any = c
  const digits = onlyDigits(conv.remote_jid.split('@')[0])

  // contato do sistema: o vinculado, ou — se não houver — um com o mesmo telefone (sugestão)
  let contact: ContactPanelData['contact'] = null
  if (conv.contacts) {
    contact = { ...conv.contacts, linked: true }
  } else {
    const { data: all } = await admin.from('contacts').select('id, name, type, company, email, phone, notes').not('phone', 'is', null)
    const hit = (all ?? []).find((x) => samePhone(x.phone, digits))
    if (hit) contact = { ...(hit as any), linked: false }
  }

  // orçamentos do contato (como cliente ou arquiteto). Vendedor só vê os dele.
  let quotes: ContactPanelData['quotes'] = []
  if (contact) {
    const { data: qs } = await admin
      .from('quotes')
      .select('id, number, client_id, architect_id, category, status, quoted_value, quote_date, created_at')
      .or(`client_id.eq.${contact.id},architect_id.eq.${contact.id}`)
      .order('created_at', { ascending: false })
      .limit(50)
    let rows = qs ?? []
    if (!auth.viewAsAdmin && rows.length) {
      const { data: owners } = await admin.from('quote_owners').select('quote_id').eq('user_id', auth.userId).in('quote_id', rows.map((r) => r.id))
      const mine = new Set((owners ?? []).map((o) => o.quote_id))
      rows = rows.filter((r) => mine.has(r.id))
    }
    const { data: negs } = rows.length
      ? await admin.from('negotiations').select('quote_id, temperature, final_value, loss_reason').in('quote_id', rows.map((r) => r.id))
      : { data: [] as any[] }
    const negBy = new Map((negs ?? []).map((n) => [n.quote_id, n]))
    // nome do outro lado (se ele é o especificador, mostra o cliente; e vice-versa)
    const otherIds = Array.from(new Set(rows.map((r) => (r.client_id === contact!.id ? r.architect_id : r.client_id)).filter(Boolean))) as string[]
    const { data: others } = otherIds.length ? await admin.from('contacts').select('id, name').in('id', otherIds) : { data: [] as any[] }
    const nameBy = new Map((others ?? []).map((o) => [o.id, o.name as string]))
    quotes = rows.map((r) => {
      const n: any = negBy.get(r.id)
      const otherId = r.client_id === contact!.id ? r.architect_id : r.client_id
      return {
        id: r.id,
        number: r.number ?? null,
        date: (r.quote_date as string | null) ?? (r.created_at as string),
        category: (r.category as string | null) ?? null,
        status: String(r.status),
        value: r.quoted_value === null || r.quoted_value === undefined ? null : Number(r.quoted_value),
        role: r.client_id === contact!.id ? 'cliente' : 'arquiteto',
        is_open: isOpenQuote(n ? { temperature: String(n.temperature) } : null),
        party: otherId && nameBy.get(otherId) ? { name: nameBy.get(otherId)!, role: r.client_id === contact!.id ? 'especificador' : 'cliente' } : null,
        negotiation: n ? { temperature: String(n.temperature), final_value: n.final_value === null ? null : Number(n.final_value), loss_reason: n.loss_reason ?? null } : null,
      }
    })
  }

  // mesmo telefone em outros WhatsApps (só os que o usuário pode ver)
  const vis = await loadScope(admin, auth.userId)
  const jids = phoneVariants(digits).map((d) => `${d}@s.whatsapp.net`)
  const { data: others } = await admin
    .from('crm_conversations')
    .select('id, instance_id, assigned_user_id, created_at, last_message_at, stage_id, crm_instances(label)')
    .in('remote_jid', jids)
    .neq('id', conversationId)
  const stageRows = await getCrmStages()
  const stageName = new Map(stageRows.map((st) => [st.id, st.name]))
  const blockedPanel = auth.actedBy ? await blockedInstanceIds(admin, auth.actedBy.id) : []
  const otherConversations = (others ?? [])
    .filter((o: any) => !blockedPanel.includes(o.instance_id))
    .filter((o: any) => vis.instanceIds.includes(o.instance_id) || o.assigned_user_id === auth.userId || vis.sharedConvIds.includes(o.id))
    .map((o: any) => ({ id: o.id, instance_label: o.crm_instances?.label ?? '—', created_at: o.created_at, last_message_at: o.last_message_at, stage_name: o.stage_id ? stageName.get(o.stage_id) ?? null : null }))

  // mensagens: contagem + mídias + links
  const count = (dir: 'inbound' | 'outbound') =>
    admin.from('crm_messages').select('id', { count: 'exact', head: true }).eq('conversation_id', conversationId).eq('direction', dir).eq('is_system', false)
  const [inC, outC, lastIn, lastOut, mediaRows, bodyRows] = await Promise.all([
    count('inbound'),
    count('outbound'),
    admin.from('crm_messages').select('created_at').eq('conversation_id', conversationId).eq('direction', 'inbound').eq('is_system', false).order('created_at', { ascending: false }).limit(1),
    admin.from('crm_messages').select('created_at').eq('conversation_id', conversationId).eq('direction', 'outbound').eq('is_system', false).order('created_at', { ascending: false }).limit(1),
    admin.from('crm_messages').select('id, storage_path, file_name, mime_type, created_at, direction').eq('conversation_id', conversationId).not('storage_path', 'is', null).order('created_at', { ascending: false }).limit(400),
    admin.from('crm_messages').select('body, created_at').eq('conversation_id', conversationId).eq('is_system', false).ilike('body', '%http%').order('created_at', { ascending: false }).limit(200),
  ])

  const media: ContactPanelData['media'] = { images: [], documents: [], audios: [], videos: [], total: 0 }
  for (const m of mediaRows.data ?? []) {
    const item: PanelMedia = { id: m.id, path: m.storage_path as string, file_name: m.file_name, mime_type: m.mime_type, created_at: m.created_at, direction: m.direction as 'inbound' | 'outbound' }
    const mt = (m.mime_type ?? '').toLowerCase()
    const bucket = mt.startsWith('image/') ? media.images : mt.startsWith('audio/') ? media.audios : mt.startsWith('video/') ? media.videos : media.documents
    bucket.push(item)
    media.total++
  }
  // miniaturas das imagens mais recentes
  const thumbs = media.images.slice(0, 24)
  if (thumbs.length) {
    const { data: signed } = await admin.storage.from('crm-attachments').createSignedUrls(thumbs.map((t) => t.path), 600)
    const byPath = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]))
    for (const t of thumbs) t.url = byPath.get(t.path) ?? null
  }
  media.images = media.images.slice(0, PANEL_LIST_LIMIT)
  media.documents = media.documents.slice(0, PANEL_LIST_LIMIT)
  media.audios = media.audios.slice(0, PANEL_LIST_LIMIT)
  media.videos = media.videos.slice(0, PANEL_LIST_LIMIT)

  const seen = new Set<string>()
  const links: ContactPanelData['links'] = []
  for (const r of bodyRows.data ?? []) {
    for (const url of extractLinks(r.body)) {
      if (seen.has(url)) continue
      seen.add(url)
      links.push({ url, at: r.created_at })
      if (links.length >= PANEL_LIST_LIMIT) break
    }
    if (links.length >= PANEL_LIST_LIMIT) break
  }

  const st = conv.stage_id ? stageRows.find((x) => x.id === conv.stage_id) : stageRows[0]
  return {
    phone_digits: digits,
    display_name: conv.contacts?.name ?? conv.contact_name_cache ?? digits,
    instance_label: conv.crm_instances?.label ?? '—',
    created_at: conv.created_at,
    stage: st ? { name: st.name, color: st.color } : null,
    deal_cents: dbValueToCents(conv.deal_value),
    assigned: conv.assigned_user_id && conv.assigned ? { id: conv.assigned_user_id, name: conv.assigned.name, avatar_url: conv.assigned.avatar_url ?? null, avatar_color: conv.assigned.avatar_color ?? null } : null,
    stats: { inbound: inC.count ?? 0, outbound: outC.count ?? 0, last_inbound_at: lastIn.data?.[0]?.created_at ?? null, last_outbound_at: lastOut.data?.[0]?.created_at ?? null },
    contact,
    quotes,
    quotes_restricted: !auth.viewAsAdmin,
    other_conversations: otherConversations,
    media,
    links,
  }
}


// ─── Contato a partir da conversa (painel "Dados do contato") ───────────────

// O contato precisa ser o vinculado à conversa ou o que tem o mesmo telefone.
async function contactBelongsToConversation(admin: Admin, conversationId: string, contactId: string) {
  const { data: c } = await admin.from('crm_conversations').select('contact_id, remote_jid').eq('id', conversationId).single()
  if (!c) return false
  if (c.contact_id === contactId) return true
  const { data: k } = await admin.from('contacts').select('phone').eq('id', contactId).maybeSingle()
  return !!k && samePhone(k.phone, c.remote_jid.split('@')[0])
}

export async function createContactFromConversation(
  conversationId: string,
  input: { name: string; type: string; company?: string; email?: string },
) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error }
  const admin = createAdminClient()
  const acc = await convAccess(admin, auth, conversationId)
  if (!acc.ok) return { error: acc.error }

  const name = input.name.replace(/\s+/g, ' ').trim()
  if (!name) return { error: 'Informe o nome do contato' }
  if (name.length > 120) return { error: 'Nome muito longo (máximo 120 caracteres)' }
  if (!isContactType(input.type)) return { error: 'Escolha a categoria do contato' }
  const email = input.email?.trim() || null
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'E-mail inválido' }

  const { data: conv } = await admin.from('crm_conversations').select('remote_jid').eq('id', conversationId).single()
  const digits = onlyDigits(conv?.remote_jid.split('@')[0])

  // não duplica: se já existe contato com esse telefone, é para vincular
  const { data: withPhone } = await admin.from('contacts').select('id, name, phone').not('phone', 'is', null)
  const dup = (withPhone ?? []).find((k) => samePhone(k.phone, digits))
  if (dup) return { error: `Já existe o contato "${dup.name}" com este telefone. Vincule-o em vez de criar outro.` }

  const { data: created, error } = await admin
    .from('contacts')
    .insert({
      name,
      phone: formatPhoneForContact(digits),
      email,
      type: input.type,
      company: input.company?.trim() || null,
      created_by: auth.userId,
      assigned_to: auth.userId,
      commission_rate: input.type === 'client' ? null : DEFAULT_COMMISSION_BY_TYPE[input.type] ?? null,
    })
    .select('id')
    .single()
  if (error || !created) return { error: error?.message ?? 'Não foi possível cadastrar' }

  const { error: linkErr } = await admin.from('crm_conversations').update({ contact_id: created.id, contact_name_cache: null }).eq('id', conversationId)
  if (linkErr) return { error: linkErr.message }
  revalidatePath('/crm'); revalidatePath('/partners')
  return { ok: true, contactId: created.id as string }
}

export async function setContactCategory(conversationId: string, contactId: string, type: string) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error }
  if (!isContactType(type)) return { error: 'Categoria inválida' }
  const admin = createAdminClient()
  const acc = await convAccess(admin, auth, conversationId)
  if (!acc.ok) return { error: acc.error }
  if (!(await contactBelongsToConversation(admin, conversationId, contactId))) return { error: 'Este contato não pertence a esta conversa' }

  const { data: cur } = await admin.from('contacts').select('commission_rate').eq('id', contactId).single()
  const updates: Record<string, unknown> = { type }
  // parceiro sem taxa definida ganha a taxa padrão da categoria (igual ao cadastro)
  if (type !== 'client' && (cur?.commission_rate === null || cur?.commission_rate === undefined)) {
    updates.commission_rate = DEFAULT_COMMISSION_BY_TYPE[type] ?? null
  }
  const { error } = await admin.from('contacts').update(updates).eq('id', contactId)
  if (error) return { error: error.message }
  revalidatePath('/crm'); revalidatePath('/partners')
  return { ok: true }
}

export async function setContactNotes(conversationId: string, contactId: string, notes: string) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error }
  if (notes.length > 2000) return { error: 'Observações muito longas (máximo 2000 caracteres)' }
  const admin = createAdminClient()
  const acc = await convAccess(admin, auth, conversationId)
  if (!acc.ok) return { error: acc.error }
  if (!(await contactBelongsToConversation(admin, conversationId, contactId))) return { error: 'Este contato não pertence a esta conversa' }
  const { error } = await admin.from('contacts').update({ notes: notes.trim() || null }).eq('id', contactId)
  if (error) return { error: error.message }
  return { ok: true }
}


// ─── "Atuar como" (só administrador) ────────────────────────────────────────

export interface ActingContext {
  can_act: boolean // quem está logado é admin
  acting: { id: string; name: string; avatar_url: string | null; avatar_color: string | null } | null
  users: { id: string; name: string; role_label: string; avatar_url: string | null; avatar_color: string | null }[]
}

export async function getActingContext(): Promise<ActingContext> {
  const auth = await ensureStaff()
  if ('error' in auth || !auth.isAdmin) return { can_act: false, acting: null, users: [] }
  const admin = createAdminClient()
  const realId = auth.actedBy?.id ?? auth.userId
  const [{ data: users }, { data: roles }] = await Promise.all([
    admin.from('users').select('id, name, role, avatar_url, avatar_color').eq('active', true).order('name'),
    admin.from('roles').select('name, label'),
  ])
  const label = new Map((roles ?? []).map((r) => [r.name as string, r.label as string]))
  const all = (users ?? []).map((u) => ({
    id: u.id as string, name: u.name as string, role_label: label.get(u.role as string) ?? (u.role as string),
    avatar_url: (u.avatar_url as string | null) ?? null, avatar_color: (u.avatar_color as string | null) ?? null,
  }))
  const acting = auth.actedBy ? all.find((u) => u.id === auth.userId) ?? null : null
  return {
    can_act: true,
    acting: acting ? { id: acting.id, name: acting.name, avatar_url: acting.avatar_url, avatar_color: acting.avatar_color } : null,
    users: all.filter((u) => u.id !== realId),
  }
}

// userId = null volta a ser você. Expira sozinho em 8 horas.
export async function setActingAs(userId: string | null) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error }
  if (!auth.isAdmin) return { error: 'Só administradores podem atuar como outro usuário' }
  const realId = auth.actedBy?.id ?? auth.userId
  const jar = cookies()
  if (!userId || userId === realId) {
    jar.delete(ACT_AS_COOKIE)
    return { ok: true }
  }
  const { data: t } = await createAdminClient().from('users').select('id, active').eq('id', userId).maybeSingle()
  if (!t || t.active === false) return { error: 'Usuário inválido ou inativo' }
  jar.set(ACT_AS_COOKIE, userId, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 8 })
  revalidatePath('/crm')
  return { ok: true }
}

// ─── URLs das mídias de uma conversa (miniaturas, vídeos, áudios), em lote ──

export async function getConversationAttachmentUrls(conversationId: string, paths: string[]) {
  const auth = await ensureStaff()
  if ('error' in auth) return { error: auth.error, urls: {} as Record<string, string> }
  const admin = createAdminClient()
  const acc = await convAccess(admin, auth, conversationId)
  if (!acc.ok) return { error: acc.error, urls: {} as Record<string, string> }
  // só caminhos que pertencem a esta conversa
  const own = Array.from(new Set(paths)).filter((p) => p.startsWith(conversationId + '/')).slice(0, 200)
  if (!own.length) return { urls: {} as Record<string, string> }
  const { data } = await admin.storage.from('crm-attachments').createSignedUrls(own, 3600)
  const urls: Record<string, string> = {}
  for (const x of data ?? []) if (x.signedUrl && x.path) urls[x.path] = x.signedUrl
  return { urls }
}
