import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { SolicitationsIndex, type IndexRow, type TeamUser } from '@/components/solicitations/SolicitationsIndex'
import { pickCurrentStage, STAGES } from '@/lib/solicitations/stages'

export const dynamic = 'force-dynamic'

export default async function SolicitacoesListaPage() {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const { data: solicitations } = await db
    .from('solicitations')
    .select('id, number, title, created_at, priority, category, size, client:client_id(name)')
    .order('created_at', { ascending: false })
    .limit(200)

  const ids = (solicitations ?? []).map((s: any) => s.id)

  const empty = { data: [] as any[] }
  const [quotesRes, negsRes, visitsRes, projectsRes, purchRes, shipRes, instRes, pvRes, respRes] = ids.length
    ? await Promise.all([
        db.from('quotes').select('solicitation_id, quoted_value, status, created_at').in('solicitation_id', ids),
        db.from('negotiations').select('solicitation_id, temperature, created_at').in('solicitation_id', ids),
        db.from('visits').select('solicitation_id, status, created_at').in('solicitation_id', ids),
        db.from('design_projects').select('solicitation_id, status, created_at').in('solicitation_id', ids),
        db.from('purchase_checklist_items').select('solicitation_id, status, created_at').in('solicitation_id', ids),
        db.from('shipments').select('solicitation_id, separation_status, is_completed, created_at').in('solicitation_id', ids),
        db.from('installation_trackings').select('solicitation_id, status, created_at').in('solicitation_id', ids),
        db.from('post_sale_followups').select('solicitation_id, resolution, created_at').in('solicitation_id', ids),
        db.from('solicitation_stage_responsibles').select('solicitation_id, stage, user:user_id(id, name, avatar_url, avatar_color)').in('solicitation_id', ids),
      ])
    : [empty, empty, empty, empty, empty, empty, empty, empty, empty]

  const latestQuote = new Map<string, any>()
  for (const q of (quotesRes.data ?? []) as any[]) {
    const prev = latestQuote.get(q.solicitation_id)
    if (!prev || new Date(q.created_at) > new Date(prev.created_at)) latestQuote.set(q.solicitation_id, q)
  }
  const latestNeg = new Map<string, any>()
  for (const n of (negsRes.data ?? []) as any[]) {
    const prev = latestNeg.get(n.solicitation_id)
    if (!prev || new Date(n.created_at) > new Date(prev.created_at)) latestNeg.set(n.solicitation_id, n)
  }

  // started/done por solicitação para calcular etapa atual.
  const stageOrder = STAGES.map(s => s.id)
  const started: Record<string, Record<string, boolean>> = {}
  const done: Record<string, Record<string, boolean>> = {}
  const bumpStarted = (sid: string, st: string) => { (started[sid] ??= {})[st] = true }
  const bumpDone    = (sid: string, st: string) => { (done[sid]    ??= {})[st] = true }

  for (const v of (visitsRes.data ?? []) as any[]) { bumpStarted(v.solicitation_id, 'visita'); if (v.status === 'done') bumpDone(v.solicitation_id, 'visita') }
  for (const p of (projectsRes.data ?? []) as any[]) { bumpStarted(p.solicitation_id, 'projeto'); if (p.status === 'concluido') bumpDone(p.solicitation_id, 'projeto') }
  for (const q of (quotesRes.data ?? []) as any[]) { bumpStarted(q.solicitation_id, 'orcamento'); if (q.status === 'done') bumpDone(q.solicitation_id, 'orcamento') }
  for (const n of (negsRes.data ?? []) as any[]) { bumpStarted(n.solicitation_id, 'negociacao'); if (n.temperature === 'closed' || n.temperature === 'lost') bumpDone(n.solicitation_id, 'negociacao') }
  // compra: só done se tiver items e todos recebidos; aqui sinalizamos "iniciada" e deixamos done ao final por sid.
  const purchStartedSids = new Set<string>()
  const purchAllRecv: Record<string, boolean> = {}
  for (const i of (purchRes.data ?? []) as any[]) {
    purchStartedSids.add(i.solicitation_id)
    const prev = purchAllRecv[i.solicitation_id]
    purchAllRecv[i.solicitation_id] = (prev === undefined ? true : prev) && (i.status === 'recebido')
  }
  purchStartedSids.forEach(sid => { bumpStarted(sid, 'compra'); if (purchAllRecv[sid]) bumpDone(sid, 'compra') })
  for (const sh of (shipRes.data ?? []) as any[]) { bumpStarted(sh.solicitation_id, 'expedicao'); if (sh.is_completed || sh.separation_status === 'delivered') bumpDone(sh.solicitation_id, 'expedicao') }
  for (const i of (instRes.data ?? []) as any[]) { bumpStarted(i.solicitation_id, 'instalacao'); if (i.status === 'concluida') bumpDone(i.solicitation_id, 'instalacao') }
  for (const pv of (pvRes.data ?? []) as any[]) { bumpStarted(pv.solicitation_id, 'posVenda'); if (pv.resolution) bumpDone(pv.solicitation_id, 'posVenda') }

  // Responsáveis designados agrupados por solicitação (deduplicados por user).
  const respBySid = new Map<string, Map<string, TeamUser>>()
  for (const r of (respRes.data ?? []) as any[]) {
    const u = r.user; if (!u) continue
    if (!respBySid.has(r.solicitation_id)) respBySid.set(r.solicitation_id, new Map())
    respBySid.get(r.solicitation_id)!.set(u.id, { id: u.id, name: u.name, avatar_url: u.avatar_url ?? null, avatar_color: u.avatar_color ?? null })
  }


  // Status de cada etapa por solicitação = status do registro MAIS RECENTE
  // daquela etapa. Alimenta as colunas do kanban de cada etapa.
  const stageStatus: Record<string, Record<string, string>> = {}
  const stageStamp: Record<string, Record<string, string>> = {}
  const setStatus = (sid: string, stage: string, status: string, at: string | null) => {
    const stamp = at ?? ''
    const prev = stageStamp[sid]?.[stage]
    if (prev !== undefined && prev > stamp) return
    ;(stageStatus[sid] ??= {})[stage] = status
    ;(stageStamp[sid] ??= {})[stage] = stamp
  }
  for (const v of (visitsRes.data ?? []) as any[]) setStatus(v.solicitation_id, 'visita', v.status ?? 'to_schedule', v.created_at)
  for (const p of (projectsRes.data ?? []) as any[]) setStatus(p.solicitation_id, 'projeto', p.status ?? 'fila', p.created_at)
  for (const q of (quotesRes.data ?? []) as any[]) setStatus(q.solicitation_id, 'orcamento', q.status ?? 'queue', q.created_at)
  for (const n of (negsRes.data ?? []) as any[]) setStatus(n.solicitation_id, 'negociacao', n.temperature ?? 'no_forecast', n.created_at)
  for (const i of (purchRes.data ?? []) as any[]) setStatus(i.solicitation_id, 'compra', i.status ?? 'a_pedir', i.created_at)
  for (const sh of (shipRes.data ?? []) as any[]) setStatus(sh.solicitation_id, 'expedicao', sh.separation_status ?? 'queued', sh.created_at)
  for (const i of (instRes.data ?? []) as any[]) setStatus(i.solicitation_id, 'instalacao', i.status ?? 'agendada', i.created_at)
  for (const pv of (pvRes.data ?? []) as any[]) setStatus(pv.solicitation_id, 'posVenda', pv.resolution ? 'resolvido' : 'em_aberto', pv.created_at)

  // Responsáveis por etapa (para filtrar/mostrar por etapa).
  const teamByStageBySid = new Map<string, Record<string, TeamUser[]>>()
  for (const r of (respRes.data ?? []) as any[]) {
    const u = r.user; if (!u) continue
    const m = teamByStageBySid.get(r.solicitation_id) ?? {}
    const list = (m[r.stage] ??= [])
    if (!list.some(x => x.id === u.id)) list.push({ id: u.id, name: u.name, avatar_url: u.avatar_url ?? null, avatar_color: u.avatar_color ?? null })
    teamByStageBySid.set(r.solicitation_id, m)
  }

  const rows: IndexRow[] = (solicitations ?? []).map((s: any) => {
    const q = latestQuote.get(s.id)
    const n = latestNeg.get(s.id)
    const temp = n?.temperature ?? null
    const status: IndexRow['status'] = temp === 'closed' ? 'closed' : temp === 'lost' ? 'lost' : 'in_progress'
    const current = pickCurrentStage(stageOrder, started[s.id] ?? {}, done[s.id] ?? {})
    const team = Array.from((respBySid.get(s.id) ?? new Map<string, TeamUser>()).values())
    return {
      id: s.id,
      number: s.number,
      title: s.title,
      clientName: s.client?.name ?? null,
      createdAt: s.created_at,
      priority: s.priority ?? 'normal',
      category: s.category ?? null,
      size: s.size ?? null,
      quotedValue: q?.quoted_value != null ? Number(q.quoted_value) : null,
      status,
      currentStage: current,
      team,
      stageStatus: stageStatus[s.id] ?? {},
      teamByStage: teamByStageBySid.get(s.id) ?? {},
    }
  })

  return (
    <div className="space-y-4">
      <Link href="/solicitacoes" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ChevronLeft className="w-4 h-4" /> Voltar para o módulo
      </Link>
      <SolicitationsIndex rows={rows} />
    </div>
  )
}
