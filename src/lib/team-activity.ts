import { createAdminClient } from '@/lib/supabase/admin'

// Atividade da equipe (só admin): tudo o que cada pessoa fez num dia, minuto a minuto.
// Fontes: mensagens enviadas no CRM, aberturas de conversa, audit_log (edições no sistema todo),
// eventos das solicitações e o histórico dos orçamentos.

export const TZ_OFFSET = '-03:00'

export type ActivityKind = 'message' | 'open' | 'edit' | 'event'

export interface ActivityItem {
  at: string
  end?: string
  kind: ActivityKind
  title: string
  detail?: string
  href?: string
  count?: number
  changes?: { field: string; from?: string; to?: string }[]
}

export interface PersonDay {
  id: string
  name: string
  avatar_url: string | null
  avatar_color: string | null
  messages: number
  conversations: number
  opens: number
  edits: number
  first: string | null
  last: string | null
}

export interface Wait {
  conversation_id: string
  name: string
  from: string
  until: string | null
  replied_by: string | null
  minutes: number
}

type Admin = ReturnType<typeof createAdminClient>

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < 20000; from += 1000) {
    const { data } = await build(from, from + 999)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

export function dayRange(day: string) {
  const start = new Date(`${day}T00:00:00${TZ_OFFSET}`)
  const end = new Date(start.getTime() + 24 * 3600_000)
  return { start: start.toISOString(), end: end.toISOString() }
}

const TABLE_LABEL: Record<string, string> = {
  contacts: 'contato', users: 'usuário', roles: 'papel',
  crm_conversations: 'conversa do CRM', crm_conversation_labels: 'etiqueta da conversa', crm_labels: 'etiqueta',
  crm_stages: 'coluna do CRM', crm_quick_replies: 'resposta rápida', crm_solicitation_links: 'mensagens → solicitação',
  crm_instances: 'número do CRM', crm_instance_members: 'acesso a número', crm_conversation_access: 'acesso à conversa',
  solicitations: 'solicitação', solicitation_stage_links: 'link da etapa', solicitation_stage_responsibles: 'responsável da etapa',
  quotes: 'orçamento', quote_owners: 'responsável do orçamento', quote_proposals: 'proposta', quote_attachments: 'anexo do orçamento',
  quote_partners: 'parceiro do orçamento', negotiations: 'negociação', commissions: 'comissão',
  tasks: 'tarefa', subtasks: 'subtarefa', schedules: 'agenda', visits: 'visita', shipments: 'expedição',
  installation_trackings: 'instalação', post_sale_followups: 'pós-venda', purchase_invoices: 'nota de entrada',
  purchase_checklist_items: 'item do checklist de compra', finance_accounts: 'conta financeira', finance_categories: 'categoria financeira',
  finance_entries: 'lançamento financeiro', finance_suppliers: 'fornecedor (financeiro)', bank_accounts: 'conta bancária',
  transactions: 'transação', transaction_installments: 'parcela', payroll_data: 'folha', payment_method_rates: 'taxa de pagamento',
  monthly_goals: 'meta', fiscal_documents: 'nota fiscal', pricing_quotes: 'cotação', pricing_suppliers: 'fornecedor (cotação)',
  pricing_product_types: 'tipo de produto', product_proposals: 'orçamento de produtos', design_projects: 'projeto',
  project_plans: 'planta', marketing_posts: 'post de marketing', metropolitano_launches: 'lançamento Metropolitano',
  site_brands: 'marca do site', site_leads: 'contato do site', policy_documents: 'política', policy_assignments: 'atribuição de política',
  training_tracks: 'trilha de treinamento', training_modules: 'módulo de treinamento', training_lessons: 'aula', wa_bot_config: 'robô WhatsApp',
}

const FIELD_LABEL: Record<string, string> = {
  status: 'status', stage_id: 'coluna', assigned_user_id: 'responsável', user_id: 'pessoa', contact_id: 'contato',
  deal_value: 'valor', title: 'título', name: 'nome', description: 'descrição', notes: 'observações', due_date: 'prazo',
  priority: 'prioridade', completed_at: 'concluída em', quoted_value: 'valor orçado', temperature: 'temperatura',
  final_value: 'valor final', phone: 'telefone', email: 'e-mail', checklist: 'checklist', hide_signature: 'assinatura oculta',
  is_restricted: 'restrita', pinned_to_today: 'fixada em hoje', deadline: 'prazo', amount: 'valor', value: 'valor',
}

const TABLE_HREF: Record<string, (id: string) => string> = {
  crm_conversations: (id) => `/crm/conversas?c=${id}`,
  solicitations: (id) => `/solicitacoes/${id}`,
}

function fmtValue(v: unknown, people: Map<string, string>): string {
  if (v == null) return '—'
  if (typeof v === 'string') return people.get(v) ?? (v.length > 120 ? `${v.slice(0, 120)}…` : v)
  if (typeof v === 'boolean') return v ? 'sim' : 'não'
  if (typeof v === 'number') return String(v)
  const s = JSON.stringify(v)
  return s.length > 120 ? `${s.slice(0, 120)}…` : s
}

function convName(c: { remote_jid: string; contact_name_cache: string | null; contacts: { name: string } | null } | undefined) {
  if (!c) return 'conversa'
  if (c.contacts?.name) return c.contacts.name
  if (c.contact_name_cache) return c.contact_name_cache
  const num = c.remote_jid.split('@')[0]
  return c.remote_jid.endsWith('@g.us') ? 'grupo' : `+${num}`
}

type ConvRow = { id: string; remote_jid: string; contact_name_cache: string | null; assigned_user_id: string | null; contacts: { name: string } | null }

async function loadConvs(admin: Admin, ids: string[]) {
  const map = new Map<string, ConvRow>()
  const uniq = Array.from(new Set(ids))
  for (let i = 0; i < uniq.length; i += 150) {
    const { data } = await admin.from('crm_conversations')
      .select('id, remote_jid, contact_name_cache, assigned_user_id, contacts(name)')
      .in('id', uniq.slice(i, i + 150))
    for (const c of (data ?? []) as unknown as ConvRow[]) map.set(c.id, c)
  }
  return map
}

type MsgRow = { conversation_id: string; created_at: string; direction: string; sender_user_id: string | null; acted_by_user_id: string | null; deleted_at: string | null }

export async function loadTeamActivity(day: string, userId: string | null) {
  const admin = createAdminClient()
  const { start, end } = dayRange(day)

  const [{ data: users }, msgs, opens, edits] = await Promise.all([
    admin.from('users').select('id, name, avatar_url, avatar_color, active').order('name'),
    fetchAll<MsgRow>((a, b) => admin.from('crm_messages')
      .select('conversation_id, created_at, direction, sender_user_id, acted_by_user_id, deleted_at')
      .gte('created_at', start).lt('created_at', end).not('is_system', 'is', true)
      .order('created_at').range(a, b)),
    fetchAll<{ conversation_id: string; user_id: string; at: string }>((a, b) => admin.from('crm_conversation_opens')
      .select('conversation_id, user_id, at').gte('at', start).lt('at', end).order('at').range(a, b)),
    fetchAll<{ actor_id: string; at: string; table_name: string; op: string; row_id: string | null; label: string | null; changes: Record<string, unknown> | null }>(
      (a, b) => admin.from('audit_log').select('actor_id, at, table_name, op, row_id, label, changes')
        .gte('at', start).lt('at', end).order('at').range(a, b)),
  ])

  const people = new Map<string, string>((users ?? []).map((u) => [u.id, u.name]))
  const who = (m: MsgRow) => m.acted_by_user_id ?? m.sender_user_id

  // ── resumo de todos no dia ──
  const summary = new Map<string, PersonDay>()
  for (const u of users ?? []) {
    summary.set(u.id, { id: u.id, name: u.name, avatar_url: u.avatar_url, avatar_color: u.avatar_color, messages: 0, conversations: 0, opens: 0, edits: 0, first: null, last: null })
  }
  const convsBy = new Map<string, Set<string>>()
  const touch = (id: string | null, at: string) => {
    const p = id ? summary.get(id) : undefined
    if (!p) return undefined
    if (!p.first || at < p.first) p.first = at
    if (!p.last || at > p.last) p.last = at
    return p
  }
  for (const m of msgs) {
    if (m.direction !== 'outbound') continue
    const p = touch(who(m), m.created_at)
    if (!p) continue
    p.messages++
    if (!convsBy.has(p.id)) convsBy.set(p.id, new Set())
    convsBy.get(p.id)!.add(m.conversation_id)
  }
  convsBy.forEach((s, id) => { summary.get(id)!.conversations = s.size })
  for (const o of opens) { const p = touch(o.user_id, o.at); if (p) p.opens++ }
  for (const e of edits) { const p = touch(e.actor_id, e.at); if (p) p.edits++ }
  const team = Array.from(summary.values())
    .filter((p) => p.first || (users ?? []).find((u) => u.id === p.id)?.active)
    .sort((a, b) => (b.messages + b.edits + b.opens) - (a.messages + a.edits + a.opens))

  // sem pessoa escolhida (ou inválida): a mais ativa do dia
  const sel = userId && team.some((p) => p.id === userId) ? userId : team.find((p) => p.first)?.id ?? null
  if (!sel) return { team, userId: null, items: [] as ActivityItem[], waits: [] as Wait[] }

  // ── linha do tempo da pessoa ──
  const [solEvents, quoteActs, { data: mine }] = await Promise.all([
    admin.from('solicitation_events').select('created_at, description, kind, solicitation_id')
      .eq('created_by', sel).gte('created_at', start).lt('created_at', end).then((r) => r.data ?? []),
    admin.from('activities').select('created_at, description, type, quote_id')
      .eq('user_id', sel).gte('created_at', start).lt('created_at', end).then((r) => r.data ?? []),
    admin.from('crm_conversations').select('id').eq('assigned_user_id', sel),
  ])

  const myMsgs = msgs.filter((m) => m.direction === 'outbound' && who(m) === sel)
  const myOpens = opens.filter((o) => o.user_id === sel)
  const assigned = new Set((mine ?? []).map((c) => c.id))
  const waitMsgs = msgs.filter((m) => assigned.has(m.conversation_id))
  const convs = await loadConvs(admin, [...myMsgs, ...myOpens, ...waitMsgs].map((m) => m.conversation_id))

  const items: ActivityItem[] = []

  // mensagens seguidas na mesma conversa (até 10 min entre uma e outra) viram um item só
  for (const m of myMsgs) {
    const last = items[items.length - 1]
    if (last && last.kind === 'message' && last.href === `/crm/conversas?c=${m.conversation_id}`
      && new Date(m.created_at).getTime() - new Date(last.end ?? last.at).getTime() < 10 * 60_000) {
      last.end = m.created_at
      last.count = (last.count ?? 1) + 1
      continue
    }
    items.push({
      at: m.created_at, kind: 'message', count: 1,
      title: convName(convs.get(m.conversation_id)),
      detail: m.deleted_at ? 'apagou mensagem' : undefined,
      href: `/crm/conversas?c=${m.conversation_id}`,
    })
  }
  for (const o of myOpens) {
    items.push({ at: o.at, kind: 'open', title: convName(convs.get(o.conversation_id)), href: `/crm/conversas?c=${o.conversation_id}` })
  }
  for (const e of edits.filter((x) => x.actor_id === sel)) {
    const verb = e.op === 'insert' ? 'Criou' : e.op === 'delete' ? 'Excluiu' : 'Editou'
    const what = TABLE_LABEL[e.table_name] ?? e.table_name
    const changes = e.op === 'update'
      ? Object.entries(e.changes ?? {}).map(([k, v]) => {
        const [from, to] = Array.isArray(v) ? v : [undefined, v]
        return { field: FIELD_LABEL[k] ?? k.replace(/_/g, ' '), from: fmtValue(from, people), to: fmtValue(to, people) }
      })
      : Object.entries(e.changes ?? {}).filter(([k]) => k !== 'id').map(([k, v]) => ({ field: FIELD_LABEL[k] ?? k.replace(/_/g, ' '), to: fmtValue(v, people) }))
    const conv = e.table_name === 'crm_conversations' && e.row_id ? convs.get(e.row_id) : undefined
    items.push({
      at: e.at, kind: 'edit',
      title: `${verb} ${what}`,
      detail: conv ? convName(conv) : e.label ?? undefined,
      href: e.row_id && e.op !== 'delete' ? TABLE_HREF[e.table_name]?.(e.row_id) : undefined,
      changes,
    })
  }
  for (const s of solEvents) {
    items.push({ at: s.created_at, kind: 'event', title: 'Solicitação', detail: s.description ?? s.kind, href: `/solicitacoes/${s.solicitation_id}` })
  }
  for (const a of quoteActs) {
    items.push({ at: a.created_at, kind: 'event', title: 'Orçamento', detail: a.description ?? a.type })
  }
  items.sort((a, b) => a.at.localeCompare(b.at))

  // ── conversas da pessoa que esperaram resposta ──
  // espera = do 1º recebimento sem resposta até a próxima mensagem nossa (de qualquer pessoa)
  const waits: Wait[] = []
  const byConv = new Map<string, MsgRow[]>()
  for (const m of waitMsgs) {
    if (convs.get(m.conversation_id)?.remote_jid.endsWith('@g.us')) continue
    if (!byConv.has(m.conversation_id)) byConv.set(m.conversation_id, [])
    byConv.get(m.conversation_id)!.push(m)
  }
  const nowIso = new Date().toISOString()
  byConv.forEach((list, convId) => {
    let since: string | null = null
    for (const m of list) {
      if (m.direction === 'inbound') { since ??= m.created_at; continue }
      if (since) {
        const minutes = Math.round((new Date(m.created_at).getTime() - new Date(since).getTime()) / 60_000)
        if (minutes >= 15) waits.push({ conversation_id: convId, name: convName(convs.get(convId)), from: since, until: m.created_at, replied_by: people.get(who(m) ?? '') ?? null, minutes })
        since = null
      }
    }
    if (since) {
      const until = end < nowIso ? end : nowIso
      waits.push({ conversation_id: convId, name: convName(convs.get(convId)), from: since, until: null, replied_by: null, minutes: Math.round((new Date(until).getTime() - new Date(since).getTime()) / 60_000) })
    }
  })
  waits.sort((a, b) => Number(!!a.until) - Number(!!b.until) || b.minutes - a.minutes)

  return { team, userId: sel, items, waits }
}
