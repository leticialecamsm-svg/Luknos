// Dados da tela inicial de Solicitações (hub + kanban + lista).
// Uma leitura por tabela, agrupada em memória por solicitation_id.
// Sem .in(ids): com centenas de solicitações a URL estouraria o limite.

import { createAdminClient } from '@/lib/supabase/admin'
import { pickCurrentStage, STAGES } from '@/lib/solicitations/stages'

export type TeamUser = { id: string; name: string; avatar_url: string | null; avatar_color: string | null }

export type IndexRow = {
  id: string
  number: number
  title: string | null
  clientName: string | null
  createdAt: string
  priority: string
  category: string | null
  size: string | null
  quotedValue: number | null
  // desfecho da negociação
  status: 'in_progress' | 'closed' | 'lost'
  currentStage: string | null
  team: TeamUser[]
  // status do registro mais recente de cada etapa que a solicitação possui
  stageStatus: Record<string, string>
  // quando o registro mais recente da etapa foi concluído (só se está concluído)
  stageDoneAt: Record<string, string>
  teamByStage: Record<string, TeamUser[]>
  projectKind: string | null
  overdue: boolean
  activeStages: number
  closedAt: string | null
  isMine: boolean
}

// Status que contam como "concluído" em cada etapa (alimentam o filtro de mês).
export const STAGE_DONE_STATUSES: Record<string, string[]> = {
  visita: ['done', 'not_needed'],
  projeto: ['concluido'],
  orcamento: ['done'],
  negociacao: ['closed', 'lost'],
  compra: ['recebido'],
  expedicao: ['completed', 'delivered'],
  instalacao: ['concluida'],
  posVenda: ['resolvido'],
}

export function isDoneStatus(stage: string, status: string): boolean {
  return (STAGE_DONE_STATUSES[stage] ?? []).includes(status)
}

type Latest = { stamp: string; status: string; doneAt: string | null; kind: string | null }

export async function loadSolicitationRows(userId: string): Promise<IndexRow[]> {
  const db = createAdminClient()

  const [sol, quotes, negs, visits, projects, purchases, shipments, installs, postSales, resp] = await Promise.all([
    db.from('solicitations')
      .select('id, number, title, created_at, created_by, priority, category, size, client:client_id(name)')
      .order('created_at', { ascending: false }).limit(1000),
    db.from('quotes').select('solicitation_id, quoted_value, status, deadline, created_at, completed_at, updated_at').not('solicitation_id', 'is', null),
    db.from('negotiations').select('solicitation_id, temperature, closed_at, updated_at').not('solicitation_id', 'is', null),
    db.from('visits').select('solicitation_id, status, created_at, updated_at').not('solicitation_id', 'is', null),
    db.from('design_projects').select('solicitation_id, status, kind, created_at, updated_at').not('solicitation_id', 'is', null),
    db.from('purchase_checklist_items').select('solicitation_id, status, created_at, updated_at').not('solicitation_id', 'is', null),
    db.from('shipments').select('solicitation_id, separation_status, is_completed, created_at, completed_at, updated_at').not('solicitation_id', 'is', null),
    db.from('installation_trackings').select('solicitation_id, status, created_at, updated_at').not('solicitation_id', 'is', null),
    db.from('post_sale_followups').select('solicitation_id, resolution, created_at').not('solicitation_id', 'is', null),
    db.from('solicitation_stage_responsibles').select('solicitation_id, stage, user:user_id(id, name, avatar_url, avatar_color)'),
  ])

  const latest = new Map<string, Record<string, Latest>>()
  const started = new Map<string, Record<string, boolean>>()
  const done = new Map<string, Record<string, boolean>>()
  const mark = (m: Map<string, Record<string, boolean>>, sid: string, st: string) => {
    const o = m.get(sid) ?? {}; o[st] = true; m.set(sid, o)
  }
  function put(sid: string, stage: string, stamp: string | null, status: string, doneAtRaw: string | null, kind: string | null = null) {
    mark(started, sid, stage)
    const at = stamp ?? ''
    const cur = latest.get(sid) ?? {}
    const prev = cur[stage]
    if (prev && prev.stamp > at) return
    cur[stage] = {
      stamp: at,
      status,
      doneAt: isDoneStatus(stage, status) ? (doneAtRaw ?? stamp) : null,
      kind,
    }
    latest.set(sid, cur)
  }

  const quoteAgg = new Map<string, { value: number | null; at: string }>()
  const overdueSids = new Set<string>()
  const today = new Date().toISOString().slice(0, 10)

  for (const q of (quotes.data ?? []) as any[]) {
    put(q.solicitation_id, 'orcamento', q.created_at, q.status ?? 'queue', q.completed_at ?? q.updated_at)
    if (q.status === 'done') mark(done, q.solicitation_id, 'orcamento')
    const prev = quoteAgg.get(q.solicitation_id)
    if (!prev || q.created_at > prev.at) quoteAgg.set(q.solicitation_id, { value: q.quoted_value != null ? Number(q.quoted_value) : null, at: q.created_at })
    if (q.deadline && String(q.deadline).slice(0, 10) < today && q.status !== 'done') overdueSids.add(q.solicitation_id)
  }
  const closedAtBySid = new Map<string, string>()
  for (const n of (negs.data ?? []) as any[]) {
    const t = n.temperature ?? 'no_forecast'
    put(n.solicitation_id, 'negociacao', n.updated_at, t, n.closed_at ?? n.updated_at)
    if (t === 'closed' || t === 'lost') mark(done, n.solicitation_id, 'negociacao')
    if (t === 'closed') closedAtBySid.set(n.solicitation_id, n.closed_at ?? n.updated_at)
  }
  for (const v of (visits.data ?? []) as any[]) {
    put(v.solicitation_id, 'visita', v.created_at, v.status ?? 'to_schedule', v.updated_at)
    if (v.status === 'done') mark(done, v.solicitation_id, 'visita')
  }
  for (const p of (projects.data ?? []) as any[]) {
    put(p.solicitation_id, 'projeto', p.created_at, p.status ?? 'fila', p.updated_at, p.kind ?? null)
    if (p.status === 'concluido') mark(done, p.solicitation_id, 'projeto')
  }
  const purchAll = new Map<string, boolean>()
  for (const i of (purchases.data ?? []) as any[]) {
    put(i.solicitation_id, 'compra', i.created_at, i.status ?? 'a_pedir', i.updated_at)
    purchAll.set(i.solicitation_id, (purchAll.get(i.solicitation_id) ?? true) && i.status === 'recebido')
  }
  purchAll.forEach((all, sid) => { if (all) mark(done, sid, 'compra') })
  for (const sh of (shipments.data ?? []) as any[]) {
    put(sh.solicitation_id, 'expedicao', sh.created_at, sh.separation_status ?? 'queued', sh.completed_at ?? sh.updated_at)
    if (sh.is_completed || sh.separation_status === 'delivered') mark(done, sh.solicitation_id, 'expedicao')
  }
  for (const i of (installs.data ?? []) as any[]) {
    put(i.solicitation_id, 'instalacao', i.created_at, i.status ?? 'agendada', i.updated_at)
    if (i.status === 'concluida') mark(done, i.solicitation_id, 'instalacao')
  }
  for (const pv of (postSales.data ?? []) as any[]) {
    put(pv.solicitation_id, 'posVenda', pv.created_at, pv.resolution ? 'resolvido' : 'em_aberto', pv.created_at)
    if (pv.resolution) mark(done, pv.solicitation_id, 'posVenda')
  }

  const teamBySid = new Map<string, Map<string, TeamUser>>()
  const teamByStage = new Map<string, Record<string, TeamUser[]>>()
  const mineSids = new Set<string>()
  for (const r of (resp.data ?? []) as any[]) {
    const u = r.user; if (!u) continue
    const tu: TeamUser = { id: u.id, name: u.name, avatar_url: u.avatar_url ?? null, avatar_color: u.avatar_color ?? null }
    const all = teamBySid.get(r.solicitation_id) ?? new Map<string, TeamUser>()
    all.set(tu.id, tu); teamBySid.set(r.solicitation_id, all)
    const per = teamByStage.get(r.solicitation_id) ?? {}
    const list = (per[r.stage] ??= [])
    if (!list.some(x => x.id === tu.id)) list.push(tu)
    teamByStage.set(r.solicitation_id, per)
    if (tu.id === userId) mineSids.add(r.solicitation_id)
  }

  const order = STAGES.map(s => s.id)

  return ((sol.data ?? []) as any[]).map(s => {
    const lat = latest.get(s.id) ?? {}
    const temp = lat.negociacao?.status
    const status: IndexRow['status'] = temp === 'closed' ? 'closed' : temp === 'lost' ? 'lost' : 'in_progress'
    const stageStatus: Record<string, string> = {}
    const stageDoneAt: Record<string, string> = {}
    let activeStages = 0
    for (const [stage, l] of Object.entries(lat)) {
      stageStatus[stage] = l.status
      if (l.doneAt) stageDoneAt[stage] = l.doneAt
      if (!isDoneStatus(stage, l.status)) activeStages++
    }
    return {
      id: s.id,
      number: s.number,
      title: s.title ?? null,
      clientName: s.client?.name ?? null,
      createdAt: s.created_at,
      priority: s.priority ?? 'normal',
      category: s.category ?? null,
      size: s.size ?? null,
      quotedValue: quoteAgg.get(s.id)?.value ?? null,
      status,
      currentStage: pickCurrentStage(order, started.get(s.id) ?? {}, done.get(s.id) ?? {}),
      team: Array.from((teamBySid.get(s.id) ?? new Map<string, TeamUser>()).values()),
      stageStatus,
      stageDoneAt,
      teamByStage: teamByStage.get(s.id) ?? {},
      projectKind: lat.projeto?.kind ?? null,
      overdue: status === 'in_progress' && overdueSids.has(s.id),
      activeStages,
      closedAt: closedAtBySid.get(s.id) ?? null,
      isMine: s.created_by === userId || mineSids.has(s.id),
    } satisfies IndexRow
  })
}
