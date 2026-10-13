// Hub do módulo Solicitações (wireframe original):
// hero azul-marinho com 4 números · 3 tiles de métrica · grade de etapas.
// A listagem completa fica em /solicitacoes/lista.

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SolicitationsHub, type HubData } from '@/components/solicitations/SolicitationsHub'

export const dynamic = 'force-dynamic'

export default async function SolicitacoesPage() {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()

  // Puxa tudo de uma vez — não é caro para o volume atual (centenas de
  // solicitações, poucas por etapa). Agrupamos em memória.
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const todayYmd = now.toISOString().slice(0, 10)

  const [
    { data: solicitations },
    { data: quotes },
    { data: negs },
    { data: visits },
    { data: projects },
    { data: purchases },
    { data: shipments },
    { data: installs },
    { data: postSales },
  ] = await Promise.all([
    db.from('solicitations').select('id, created_at'),
    db.from('quotes').select('solicitation_id, status, deadline, completed_at'),
    db.from('negotiations').select('solicitation_id, temperature, created_at, updated_at'),
    db.from('visits').select('solicitation_id, status'),
    db.from('design_projects').select('solicitation_id, status'),
    db.from('purchase_checklist_items').select('solicitation_id, status'),
    db.from('shipments').select('solicitation_id, separation_status, is_completed'),
    db.from('installation_trackings').select('solicitation_id, status'),
    db.from('post_sale_followups').select('solicitation_id, resolution'),
  ])

  const S = solicitations ?? []
  const Q = quotes ?? []
  const N = negs ?? []
  const V = visits ?? []
  const P = projects ?? []
  const C = purchases ?? []
  const E = shipments ?? []
  const I = installs ?? []
  const PV = postSales ?? []

  // Status da solicitação pelo "temperature" da negociação mais recente.
  const latestNegBySid = new Map<string, any>()
  for (const n of N as any[]) {
    const prev = latestNegBySid.get(n.solicitation_id)
    if (!prev || new Date(n.created_at) > new Date(prev.created_at)) latestNegBySid.set(n.solicitation_id, n)
  }
  const sidStatus = (sid: string): 'closed' | 'lost' | 'open' => {
    const t = latestNegBySid.get(sid)?.temperature
    if (t === 'closed') return 'closed'
    if (t === 'lost') return 'lost'
    return 'open'
  }

  // Métricas gerais
  const opened = S.filter((s: any) => sidStatus(s.id) === 'open').length
  const closedThisMonth = (N as any[]).filter(n => n.temperature === 'closed' && (n.updated_at ?? n.created_at) >= monthStart).length
  // Atrasada: solicitação em aberto que tem orçamento com deadline passado e não concluído.
  const overdueSids = new Set<string>()
  for (const q of Q as any[]) {
    if (q.deadline && q.deadline < todayYmd && q.status !== 'done' && sidStatus(q.solicitation_id) === 'open') {
      overdueSids.add(q.solicitation_id)
    }
  }
  const overdue = overdueSids.size

  // Em etapas simultâneas: solicitação aberta com registros em >= 2 etapas
  // ativas (não concluídas) ao mesmo tempo.
  const activeStagesBySid = new Map<string, Set<string>>()
  const bump = (sid: string, stage: string) => {
    if (!activeStagesBySid.has(sid)) activeStagesBySid.set(sid, new Set())
    activeStagesBySid.get(sid)!.add(stage)
  }
  for (const v of V as any[]) if (v.status !== 'done' && v.status !== 'not_needed') bump(v.solicitation_id, 'visita')
  for (const p of P as any[]) if (p.status !== 'concluido') bump(p.solicitation_id, 'projeto')
  for (const q of Q as any[]) if (q.status !== 'done') bump(q.solicitation_id, 'orcamento')
  for (const n of N as any[]) if (n.temperature !== 'closed' && n.temperature !== 'lost') bump(n.solicitation_id, 'negociacao')
  for (const c of C as any[]) if (c.status !== 'recebido') bump(c.solicitation_id, 'compra')
  for (const e of E as any[]) if (!e.is_completed && e.separation_status !== 'delivered') bump(e.solicitation_id, 'expedicao')
  for (const i of I as any[]) if (i.status !== 'concluida') bump(i.solicitation_id, 'instalacao')
  for (const pv of PV as any[]) if (!pv.resolution) bump(pv.solicitation_id, 'posVenda')
  let simultaneous = 0
  activeStagesBySid.forEach((stages, sid) => {
    if (sidStatus(sid) === 'open' && stages.size >= 2) simultaneous++
  })

  // Métricas secundárias
  const newThisWeek = (S as any[]).filter(s => s.created_at >= weekStart).length
  const totalClosed = (N as any[]).filter(n => n.temperature === 'closed').length
  const totalLost = (N as any[]).filter(n => n.temperature === 'lost').length
  const conversionPct = (totalClosed + totalLost) > 0 ? Math.round((totalClosed / (totalClosed + totalLost)) * 100) : null

  // Ciclo médio até venda fechada: diff em dias entre solicitation.created_at e negotiation.updated_at (close)
  const sidCreated = new Map<string, string>()
  for (const s of S as any[]) sidCreated.set(s.id, s.created_at)
  const diffs: number[] = []
  for (const n of N as any[]) {
    if (n.temperature !== 'closed') continue
    const start = sidCreated.get(n.solicitation_id)
    if (!start) continue
    const d = Math.round((new Date(n.updated_at ?? n.created_at).getTime() - new Date(start).getTime()) / 86400000)
    if (d >= 0 && d < 365) diffs.push(d)
  }
  const avgCycle = diffs.length ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length) : null

  // Contadores por etapa (ativas)
  const counters = {
    visita:     (V as any[]).filter(v => v.status !== 'done' && v.status !== 'not_needed').length,
    projeto:    (P as any[]).filter(p => p.status !== 'concluido').length,
    orcamento:  (Q as any[]).filter(q => q.status !== 'done').length,
    negociacao: (N as any[]).filter(n => n.temperature !== 'closed' && n.temperature !== 'lost').length,
    desfecho:   closedThisMonth,
    compra:     (C as any[]).filter(c => c.status !== 'recebido').length,
    expedicao:  (E as any[]).filter(e => !e.is_completed && e.separation_status !== 'delivered').length,
    instalacao: (I as any[]).filter(i => i.status !== 'concluida').length,
    posVenda:   (PV as any[]).filter(pv => !pv.resolution).length,
  }

  const data: HubData = {
    hero: { opened, closedThisMonth, overdue, simultaneous },
    tiles: { newThisWeek, conversionPct, avgCycleDays: avgCycle },
    counters,
  }

  return <SolicitationsHub data={data} />
}
