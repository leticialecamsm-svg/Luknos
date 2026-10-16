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

// ── Propriedades dos cartões (o que aparece e em que ordem) ─────────────────

export type CardPropKey =
  | 'number' | 'client' | 'priority' | 'value' | 'team' | 'days' | 'due' | 'kind' | 'category' | 'size'

export type CardPropDef = { key: CardPropKey; label: string; stageOnly?: string; defaultHidden?: boolean }

export const CARD_PROPS: CardPropDef[] = [
  { key: 'number',   label: 'Número' },
  { key: 'client',   label: 'Cliente' },
  { key: 'priority', label: 'Prioridade' },
  { key: 'value',    label: 'Valor' },
  { key: 'team',     label: 'Responsáveis' },
  { key: 'days',     label: 'Dias na esteira' },
  { key: 'due',      label: 'Prazo (hoje / atrasada)' },
  { key: 'kind',     label: 'Tipo do projeto', stageOnly: 'projeto' },
  { key: 'category', label: 'Categoria', defaultHidden: true },
  { key: 'size',     label: 'Tamanho', defaultHidden: true },
]

export type CardPropsConfig = { order: string[]; hidden: string[] }
export type ResolvedCardProp = { key: CardPropKey; label: string; visible: boolean }

// Junta o que o usuário salvou com o catálogo: propriedades novas entram no
// fim, desconhecidas somem, e "Tipo do projeto" só existe no escopo Projeto.
export function resolveCardProps(scope: string, cfg?: CardPropsConfig | null): ResolvedCardProp[] {
  const base = CARD_PROPS.filter(p => !p.stageOnly || p.stageOnly === scope)
  const saved = cfg?.order ?? []
  const ordered = [
    ...saved.map(k => base.find(p => p.key === k)).filter((p): p is CardPropDef => !!p),
    ...base.filter(p => !saved.includes(p.key)),
  ]
  return ordered.map(p => ({
    key: p.key,
    label: p.label,
    visible: cfg
      ? !cfg.hidden.includes(p.key) && !(p.defaultHidden && !saved.includes(p.key))
      : !p.defaultHidden,
  }))
}
