// Tipos e regras puras da tela inicial de Solicitações (seguro para o cliente).

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
  // id do registro mais recente de cada etapa (negociação = quote_id)
  stageRecordId: Record<string, string>
  teamByStage: Record<string, TeamUser[]>
  projectKind: string | null
  // menor data (AAAA-MM-DD) de algo em aberto: prazo do orçamento, visita
  // agendada, entrega prevista ou instalação agendada
  nextDue: string | null
  // última movimentação (registro criado/alterado ou evento do histórico)
  lastActivityAt: string
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

// Data local AAAA-MM-DD (o "hoje" do navegador, não o do servidor).
export function localYmd(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Situação do próximo compromisso da solicitação em relação a hoje.
export function dueState(r: Pick<IndexRow, 'nextDue'>, todayYmd: string): 'overdue' | 'today' | null {
  if (!r.nextDue) return null
  if (r.nextDue < todayYmd) return 'overdue'
  if (r.nextDue === todayYmd) return 'today'
  return null
}
