// Dados da tela inicial de Solicitações (hub + kanban + lista).
// Uma leitura por tabela, agrupada em memória por solicitation_id.
// Sem .in(ids): com centenas de solicitações a URL estouraria o limite.

import { createAdminClient } from '@/lib/supabase/admin'
import { pickCurrentStage, STAGES } from '@/lib/solicitations/stages'
import { isDoneStatus, type IndexRow, type TeamUser } from '@/lib/solicitations/index-types'

export type { IndexRow, TeamUser } from '@/lib/solicitations/index-types'

type Latest = { stamp: string; status: string; doneAt: string | null; kind: string | null; recordId: string }

export async function loadSolicitationRows(userId: string): Promise<IndexRow[]> {
  const db = createAdminClient()

  const since = new Date(Date.now() - 14 * 86_400_000).toISOString()
  const [sol, quotes, negs, visits, projects, purchases, shipments, installs, postSales, resp, events] = await Promise.all([
    db.from('solicitations')
      .select('id, number, title, created_at, created_by, priority, category, size, client:client_id(name)')
      .order('created_at', { ascending: false }).limit(1000),
    db.from('quotes').select('id, solicitation_id, quoted_value, status, deadline, created_at, completed_at, updated_at').not('solicitation_id', 'is', null),
    db.from('negotiations').select('quote_id, solicitation_id, temperature, closed_at, updated_at').not('solicitation_id', 'is', null),
    db.from('visits').select('id, solicitation_id, status, scheduled_at, created_at, updated_at').not('solicitation_id', 'is', null),
    db.from('design_projects').select('id, solicitation_id, status, kind, created_at, updated_at').not('solicitation_id', 'is', null),
    db.from('purchase_checklist_items').select('id, solicitation_id, status, created_at, updated_at').not('solicitation_id', 'is', null),
    db.from('shipments').select('id, solicitation_id, separation_status, is_completed, delivery_date, created_at, completed_at, updated_at').not('solicitation_id', 'is', null),
    db.from('installation_trackings').select('id, solicitation_id, status, scheduled_date, created_at, updated_at').not('solicitation_id', 'is', null),
    db.from('post_sale_followups').select('id, solicitation_id, resolution, created_at').not('solicitation_id', 'is', null),
    db.from('solicitation_stage_responsibles').select('solicitation_id, stage, user:user_id(id, name, avatar_url, avatar_color)'),
    db.from('solicitation_events').select('solicitation_id, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(1000),
  ])

  const latest = new Map<string, Record<string, Latest>>()
  const started = new Map<string, Record<string, boolean>>()
  const done = new Map<string, Record<string, boolean>>()
  const mark = (m: Map<string, Record<string, boolean>>, sid: string, st: string) => {
    const o = m.get(sid) ?? {}; o[st] = true; m.set(sid, o)
  }
  function put(sid: string, stage: string, recordId: string, stamp: string | null, status: string, doneAtRaw: string | null, kind: string | null = null) {
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
      recordId,
    }
    latest.set(sid, cur)
  }

  const quoteAgg = new Map<string, { value: number | null; at: string }>()

  for (const q of (quotes.data ?? []) as any[]) {
    put(q.solicitation_id, 'orcamento', q.id, q.created_at, q.status ?? 'queue', q.completed_at ?? q.updated_at)
    if (q.status === 'done') mark(done, q.solicitation_id, 'orcamento')
    const prev = quoteAgg.get(q.solicitation_id)
    if (!prev || q.created_at > prev.at) quoteAgg.set(q.solicitation_id, { value: q.quoted_value != null ? Number(q.quoted_value) : null, at: q.created_at })
  }
  const closedAtBySid = new Map<string, string>()
  for (const n of (negs.data ?? []) as any[]) {
    const t = n.temperature ?? 'no_forecast'
    put(n.solicitation_id, 'negociacao', n.quote_id, n.updated_at, t, n.closed_at ?? n.updated_at)
    if (t === 'closed' || t === 'lost') mark(done, n.solicitation_id, 'negociacao')
    if (t === 'closed') closedAtBySid.set(n.solicitation_id, n.closed_at ?? n.updated_at)
  }
  for (const v of (visits.data ?? []) as any[]) {
    put(v.solicitation_id, 'visita', v.id, v.created_at, v.status ?? 'to_schedule', v.updated_at)
    if (v.status === 'done') mark(done, v.solicitation_id, 'visita')
  }
  for (const p of (projects.data ?? []) as any[]) {
    put(p.solicitation_id, 'projeto', p.id, p.created_at, p.status ?? 'fila', p.updated_at, p.kind ?? null)
    if (p.status === 'concluido') mark(done, p.solicitation_id, 'projeto')
  }
  const purchAll = new Map<string, boolean>()
  for (const i of (purchases.data ?? []) as any[]) {
    put(i.solicitation_id, 'compra', i.id, i.created_at, i.status ?? 'a_pedir', i.updated_at)
    purchAll.set(i.solicitation_id, (purchAll.get(i.solicitation_id) ?? true) && i.status === 'recebido')
  }
  purchAll.forEach((all, sid) => { if (all) mark(done, sid, 'compra') })
  for (const sh of (shipments.data ?? []) as any[]) {
    put(sh.solicitation_id, 'expedicao', sh.id, sh.created_at, sh.separation_status ?? 'queued', sh.completed_at ?? sh.updated_at)
    if (sh.is_completed || sh.separation_status === 'delivered') mark(done, sh.solicitation_id, 'expedicao')
  }
  for (const i of (installs.data ?? []) as any[]) {
    put(i.solicitation_id, 'instalacao', i.id, i.created_at, i.status ?? 'agendada', i.updated_at)
    if (i.status === 'concluida') mark(done, i.solicitation_id, 'instalacao')
  }
  for (const pv of (postSales.data ?? []) as any[]) {
    put(pv.solicitation_id, 'posVenda', pv.id, pv.created_at, pv.resolution ? 'resolvido' : 'em_aberto', pv.created_at)
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

  // Próximo compromisso em aberto por solicitação
  const dueBySid = new Map<string, string>()
  const due = (sid: string, raw: any) => {
    const d = raw ? String(raw).slice(0, 10) : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return
    const cur = dueBySid.get(sid)
    if (!cur || d < cur) dueBySid.set(sid, d)
  }
  for (const q of (quotes.data ?? []) as any[]) if (q.status !== 'done') due(q.solicitation_id, q.deadline)
  for (const v of (visits.data ?? []) as any[]) if (v.status === 'scheduled') due(v.solicitation_id, v.scheduled_at)
  for (const sh of (shipments.data ?? []) as any[]) if (!sh.is_completed && sh.separation_status !== 'delivered') due(sh.solicitation_id, sh.delivery_date)
  for (const i of (installs.data ?? []) as any[]) if (i.status !== 'concluida') due(i.solicitation_id, i.scheduled_date)

  // Última movimentação: o mais recente entre registros e eventos do histórico
  const touchBySid = new Map<string, string>()
  const touch = (sid: string, ...isos: (string | null | undefined)[]) => {
    for (const iso of isos) {
      if (!iso) continue
      const cur = touchBySid.get(sid)
      if (!cur || iso > cur) touchBySid.set(sid, iso)
    }
  }
  for (const arr of [quotes.data, negs.data, visits.data, projects.data, purchases.data, shipments.data, installs.data, postSales.data] as any[][]) {
    for (const r of arr ?? []) touch(r.solicitation_id, r.updated_at, r.created_at, r.completed_at)
  }
  for (const e of (events.data ?? []) as any[]) touch(e.solicitation_id, e.created_at)

  const order = STAGES.map(s => s.id)

  return ((sol.data ?? []) as any[]).map(s => {
    const lat = latest.get(s.id) ?? {}
    const temp = lat.negociacao?.status
    const status: IndexRow['status'] = temp === 'closed' ? 'closed' : temp === 'lost' ? 'lost' : 'in_progress'
    const stageStatus: Record<string, string> = {}
    const stageDoneAt: Record<string, string> = {}
    const stageRecordId: Record<string, string> = {}
    let activeStages = 0
    for (const [stage, l] of Object.entries(lat)) {
      stageStatus[stage] = l.status
      if (l.doneAt) stageDoneAt[stage] = l.doneAt
      stageRecordId[stage] = l.recordId
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
      stageRecordId,
      teamByStage: teamByStage.get(s.id) ?? {},
      projectKind: lat.projeto?.kind ?? null,
      nextDue: status === 'lost' ? null : (dueBySid.get(s.id) ?? null),
      lastActivityAt: touchBySid.get(s.id) ?? s.created_at,
      activeStages,
      closedAt: closedAtBySid.get(s.id) ?? null,
      isMine: s.created_by === userId || mineSids.has(s.id),
    } satisfies IndexRow
  })
}
