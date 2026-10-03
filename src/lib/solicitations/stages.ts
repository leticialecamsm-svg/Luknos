// Helpers puros da barra de etapas / Resumo da Solicitação (sem acesso a banco).
import type { SolicitationView } from '@/lib/solicitations/actions'

export const STAGES: { id: string; label: string }[] = [
  { id: 'visita', label: 'Visita' },
  { id: 'projeto', label: 'Projeto' },
  { id: 'orcamento', label: 'Orçamento' },
  { id: 'negociacao', label: 'Negociação' },
  { id: 'compra', label: 'Compra' },
  { id: 'expedicao', label: 'Separação e entrega' },
  { id: 'instalacao', label: 'Instalação' },
  { id: 'posVenda', label: 'Pós-venda' },
]

export type StageState = 'done' | 'current' | 'not_started'

// Etapa "concluída" = já tem desfecho registrado na tabela daquele setor.
export function isStageDone(id: string, s: SolicitationView): boolean {
  switch (id) {
    case 'visita': return s.visits.some(v => v.status === 'done')
    case 'projeto': return s.designProjects.some(p => p.status === 'concluido')
    case 'orcamento': return s.quotes.some(q => q.status === 'done')
    case 'negociacao': return s.negotiations.some(n => n.temperature === 'closed' || n.temperature === 'lost')
    case 'compra': return s.purchaseChecklistItems.length > 0 && s.purchaseChecklistItems.every(i => i.status === 'recebido')
    case 'expedicao': return s.shipments.some(sh => sh.is_completed || sh.separation_status === 'delivered')
    case 'instalacao': return s.installationTrackings.some(i => i.status === 'concluida')
    case 'posVenda': return s.postSaleFollowups.some(f => !!f.resolution)
    default: return false
  }
}

// Regra de "etapa atual": a PRIMEIRA etapa iniciada (com registro) que não está
// concluída, na ordem do fluxo. Se todas as iniciadas estão concluídas, é a
// última concluída. Sem nenhuma iniciada, não há etapa atual (null).
export function pickCurrentStage(order: string[], started: Record<string, boolean>, done: Record<string, boolean>): string | null {
  const firstOpen = order.find(id => started[id] && !done[id])
  if (firstOpen) return firstOpen
  const doneIds = order.filter(id => started[id] && done[id])
  return doneIds.length ? doneIds[doneIds.length - 1] : null
}

// Dias inteiros entre duas datas (mínimo 0). null se alguma for inválida/ausente.
export function dayCount(start: string | Date | null | undefined, end: string | Date | null | undefined): number | null {
  if (!start || !end) return null
  const a = new Date(start).getTime(), b = new Date(end).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.max(0, Math.floor((b - a) / 86_400_000))
}

function minDate(vals: (string | null | undefined)[]): string | null {
  const v = vals.filter(Boolean) as string[]
  if (!v.length) return null
  return v.reduce((m, x) => (new Date(x).getTime() < new Date(m).getTime() ? x : m))
}
function maxDate(vals: (string | null | undefined)[]): string | null {
  const v = vals.filter(Boolean) as string[]
  if (!v.length) return null
  return v.reduce((m, x) => (new Date(x).getTime() > new Date(m).getTime() ? x : m))
}

function records(id: string, s: SolicitationView): any[] {
  switch (id) {
    case 'visita': return s.visits
    case 'projeto': return s.designProjects
    case 'orcamento': return s.quotes
    case 'negociacao': return s.negotiations
    case 'compra': return s.purchaseChecklistItems
    case 'expedicao': return s.shipments
    case 'instalacao': return s.installationTrackings
    case 'posVenda': return s.postSaleFollowups
    default: return []
  }
}

// Fim real de uma etapa concluída, por tabela (só colunas que existem):
// visita: updated_at dos registros 'done' (null se a coluna não existir -> sem contador);
// projeto: updated_at dos 'concluido'; orçamento: updated_at dos 'done';
// negociação: closed_at (fecha/perde); compra: maior updated_at dos itens;
// expedição: completed_at ?? received_at ?? updated_at; instalação: updated_at
// das 'concluida'; pós-venda: contacted_at dos com resolução (sem updated_at).
export function stageEnd(id: string, s: SolicitationView): string | null {
  switch (id) {
    case 'visita': return maxDate(s.visits.filter(v => v.status === 'done').map(v => v.updated_at))
    case 'projeto': return maxDate(s.designProjects.filter(p => p.status === 'concluido').map(p => p.updated_at))
    case 'orcamento': return maxDate(s.quotes.filter(q => q.status === 'done').map(q => q.updated_at))
    case 'negociacao': return maxDate(s.negotiations.filter(n => n.temperature === 'closed' || n.temperature === 'lost').map(n => n.closed_at ?? n.updated_at))
    case 'compra': return maxDate(s.purchaseChecklistItems.map(i => i.updated_at))
    case 'expedicao': return maxDate(s.shipments.filter(sh => sh.is_completed || sh.separation_status === 'delivered').map(sh => sh.completed_at ?? sh.received_at ?? sh.updated_at))
    case 'instalacao': return maxDate(s.installationTrackings.filter(i => i.status === 'concluida').map(i => i.updated_at))
    case 'posVenda': return maxDate(s.postSaleFollowups.filter(f => !!f.resolution).map(f => f.contacted_at))
    default: return null
  }
}

export type StageInfo = { id: string; label: string; state: StageState; days: number | null }

export function computeStages(s: SolicitationView, now: Date = new Date()): StageInfo[] {
  const started: Record<string, boolean> = {}
  const done: Record<string, boolean> = {}
  for (const st of STAGES) {
    started[st.id] = records(st.id, s).length > 0
    done[st.id] = isStageDone(st.id, s)
  }
  const current = pickCurrentStage(STAGES.map(x => x.id), started, done)
  return STAGES.map(st => {
    if (!started[st.id]) return { id: st.id, label: st.label, state: 'not_started' as const, days: null }
    const start = minDate(records(st.id, s).map(r => r.created_at))
    let state: StageState
    let days: number | null
    if (done[st.id] && st.id !== current) {
      state = 'done'; days = dayCount(start, stageEnd(st.id, s))
    } else if (st.id === current && !done[st.id]) {
      state = 'current'; days = dayCount(start, now)
    } else {
      // concluída e é a última (current por regra): continua "concluída"
      state = 'done'; days = dayCount(start, stageEnd(st.id, s))
    }
    return { id: st.id, label: st.label, state, days }
  })
}

export type NextStep = { text: string; tab: string | null }

// Próximo passo (determinístico, nesta ordem): 1) visita/instalação agendada
// futura mais próxima; 2) item de compra a_pedir/pedido; 3) expedição não
// entregue; 4) "Tudo em dia". `today` = data local YYYY-MM-DD.
export function nextStep(s: SolicitationView, today: string, fmt: (d: string) => string = d => d): NextStep {
  const upcoming: { date: string; text: string; tab: string }[] = []
  for (const v of s.visits) {
    const d = v.scheduled_at ? String(v.scheduled_at).slice(0, 10) : null
    if (d && d >= today && v.status !== 'done' && v.status !== 'not_needed') upcoming.push({ date: d, text: `Visita em ${fmt(d)}`, tab: 'visita' })
  }
  for (const i of s.installationTrackings) {
    const d = i.scheduled_date ? String(i.scheduled_date).slice(0, 10) : null
    if (d && d >= today && (i.status === 'agendada' || i.status === 'em_andamento')) upcoming.push({ date: d, text: `Instalação em ${fmt(d)}`, tab: 'instalacao' })
  }
  if (upcoming.length) {
    upcoming.sort((a, b) => a.date.localeCompare(b.date))
    return { text: upcoming[0].text, tab: upcoming[0].tab }
  }
  const aPedir = s.purchaseChecklistItems.filter(i => i.status === 'a_pedir').length
  const pedido = s.purchaseChecklistItems.filter(i => i.status === 'pedido').length
  if (aPedir > 0) return { text: `${aPedir} ${aPedir === 1 ? 'item' : 'itens'} de compra a pedir`, tab: 'compra' }
  if (pedido > 0) return { text: `Aguardando ${pedido} ${pedido === 1 ? 'item pedido' : 'itens pedidos'} chegar${pedido === 1 ? '' : 'em'}`, tab: 'compra' }
  if (s.shipments.some(sh => !sh.is_completed && sh.separation_status !== 'delivered')) return { text: 'Entrega ainda não concluída', tab: 'expedicao' }
  return { text: 'Tudo em dia', tab: null }
}

// Valores do orçamento principal: recebido = splits com status != 'open'
// (mesma regra do app); em aberto = splits 'open'. Sem splits, não há recebido/aberto.
export function quoteValues(q: any | null) {
  if (!q) return { quoted: null, final: null, received: null, open: null }
  const splits: any[] = q.payment_splits ?? []
  const sum = (arr: any[]) => arr.reduce((a, x) => a + Number(x.amount ?? 0), 0)
  return {
    quoted: q.quoted_value != null ? Number(q.quoted_value) : null,
    final: q.final_value != null ? Number(q.final_value) : null,
    received: splits.length ? sum(splits.filter(x => x.status !== 'open')) : null,
    open: splits.length ? sum(splits.filter(x => x.status === 'open')) : null,
  }
}
