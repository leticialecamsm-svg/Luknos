// ── Enums (espelham o banco) ──────────────────────────────────

export type UserRole = 'admin' | 'seller'
export type ContactType = 'client' | 'architect' | 'designer' | 'engineer' | 'electrician' | 'plasterer' | 'carpenter' | 'other'
export type QuoteOrigin = 'visit' | 'whatsapp' | 'store' | 'referral' | 'other'
export type QuoteCategory = 'lighting' | 'automation' | 'both'
export type QuoteSize = 'small' | 'medium' | 'large'
export type WorkStage = 'project' | 'execution' | 'finishing' | 'delivered'
export type QuotePriority = 'normal' | 'high' | 'urgent'
export type QuoteStatus = 'queue' | 'in_progress' | 'review' | 'done'
export type VisitStatus = 'to_schedule' | 'scheduled' | 'done' | 'not_needed'
export type NegTemperature = 'cold' | 'warm' | 'hot' | 'closed' | 'lost'
export type PaymentMethod = 'pix' | 'card' | 'cash' | 'invoice' | 'other'
export type LossReason = 'price' | 'competition' | 'gave_up' | 'no_reply' | 'other'
export type ActivityType = 'note' | 'call' | 'whatsapp' | 'visit' | 'status_change' | 'temperature_change' | 'owner_added' | 'value_updated'
export type OwnerRole = 'primary' | 'collaborator'

// ── Entidades ─────────────────────────────────────────────────

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  avatar_color: string
  active: boolean
  created_at: string
}

export interface Contact {
  id: string
  name: string
  phone: string | null
  email: string | null
  type: ContactType
  company: string | null
  notes: string | null
  created_at: string
}

export interface Quote {
  id: string
  number: number
  client_id: string
  architect_id: string | null
  origin: QuoteOrigin
  category: QuoteCategory
  size: QuoteSize | null
  work_stage: WorkStage | null
  priority: QuotePriority
  status: QuoteStatus
  deadline: string | null
  quoted_value: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface QuoteOwner {
  quote_id: string
  user_id: string
  role: OwnerRole
  user?: User
}

export interface Visit {
  id: string
  quote_id: string
  status: VisitStatus
  scheduled_at: string | null
  address: string | null
  notes: string | null
}

export interface Negotiation {
  id: string
  quote_id: string
  temperature: NegTemperature
  started_at: string
  closed_at: string | null
  final_value: number | null
  payment_method: PaymentMethod | null
  loss_reason: LossReason | null
  notes: string | null
  updated_at: string
}

export interface Activity {
  id: string
  quote_id: string
  user_id: string
  type: ActivityType
  description: string
  metadata: Record<string, unknown>
  created_at: string
  user?: User
}

export interface MonthlyGoal {
  id: string
  user_id: string | null
  year: number
  month: number
  target: number
}

// ── View: QuoteFull (da view quotes_full) ─────────────────────

export interface QuoteOwnerSummary {
  user_id: string
  name: string
  role: OwnerRole
  avatar_color: string
}

export interface QuoteFull {
  id: string
  number: number
  status: QuoteStatus
  priority: QuotePriority
  origin: QuoteOrigin
  category: QuoteCategory
  size: QuoteSize | null
  work_stage: WorkStage | null
  deadline: string | null
  quoted_value: number | null
  notes: string | null
  created_at: string
  updated_at: string
  // cliente
  client_id: string
  client_name: string
  client_phone: string | null
  // arquiteto
  architect_id: string | null
  architect_name: string | null
  // negociação
  negotiation_id: string | null
  temperature: NegTemperature | null
  final_value: number | null
  payment_method: PaymentMethod | null
  loss_reason: LossReason | null
  closed_at: string | null
  // donos
  owners: QuoteOwnerSummary[]
  // visita
  visit_status: VisitStatus | null
  visit_date: string | null
  visit_address: string | null
}

// ── Dashboard types ───────────────────────────────────────────

export interface FunnelRow {
  user_id: string
  user_name: string
  temperature: NegTemperature | null
  count: number
  total_quoted: number
  total_final: number
}

export interface SalesByMonthRow {
  user_id: string
  user_name: string
  year: number
  month: number
  closed_count: number
  total_sold: number
}

export interface DashboardStats {
  totalSold: number
  storeGoal: number
  inNegotiation: number
  openOpportunities: number
  lostCount: number
  funnel: FunnelByTemp
  byUser: UserStats[]
}

export interface FunnelByTemp {
  cold:   { count: number; value: number }
  warm:   { count: number; value: number }
  hot:    { count: number; value: number }
  closed: { count: number; value: number }
  lost:   { count: number; value: number }
}

export interface UserStats {
  user: User
  sold: number
  goal: number
  pct: number
  quotes: number
  hot: number
}

// ── Labels para UI ────────────────────────────────────────────

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  queue:       'Na fila',
  in_progress: 'Em andamento',
  review:      'Revisão',
  done:        'Concluído',
}

export const TEMPERATURE_LABEL: Record<NegTemperature, string> = {
  cold:   'Frio',
  warm:   'Morno',
  hot:    'Quente',
  closed: 'Venda fechada',
  lost:   'Perdida',
}

export const ORIGIN_LABEL: Record<QuoteOrigin, string> = {
  visit:    'Visita',
  whatsapp: 'WhatsApp',
  store:    'Loja',
  referral: 'Indicação',
  other:    'Outro',
}

export const CATEGORY_LABEL: Record<QuoteCategory, string> = {
  lighting:   'Iluminação',
  automation: 'Automação',
  both:       'Iluminação + Automação',
}

export const SIZE_LABEL: Record<QuoteSize, string> = {
  small:  'Pequeno',
  medium: 'Médio',
  large:  'Grande',
}

export const PRIORITY_LABEL: Record<QuotePriority, string> = {
  normal: 'Normal',
  high:   'Alta',
  urgent: 'Urgente',
}

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  pix:     'PIX',
  card:    'Cartão',
  cash:    'Dinheiro',
  invoice: 'Boleto',
  other:   'Outro',
}

export const LOSS_REASON_LABEL: Record<LossReason, string> = {
  price:       'Preço',
  competition: 'Concorrência',
  gave_up:     'Desistiu da obra',
  no_reply:    'Sem resposta',
  other:       'Outro',
}

// ── Cores por temperatura ─────────────────────────────────────

export const TEMPERATURE_COLOR: Record<NegTemperature, { bg: string; text: string; border: string }> = {
  cold:   { bg: 'bg-blue-50',   text: 'text-blue-800',  border: 'border-blue-200' },
  warm:   { bg: 'bg-amber-50',  text: 'text-amber-800', border: 'border-amber-200' },
  hot:    { bg: 'bg-red-50',    text: 'text-red-800',   border: 'border-red-200' },
  closed: { bg: 'bg-green-50',  text: 'text-green-800', border: 'border-green-200' },
  lost:   { bg: 'bg-gray-100',  text: 'text-gray-600',  border: 'border-gray-200' },
}

export const STATUS_COLOR: Record<QuoteStatus, { bg: string; text: string }> = {
  queue:       { bg: 'bg-blue-50',   text: 'text-blue-700' },
  in_progress: { bg: 'bg-amber-50',  text: 'text-amber-700' },
  review:      { bg: 'bg-purple-50', text: 'text-purple-700' },
  done:        { bg: 'bg-green-50',  text: 'text-green-700' },
}

export const PRIORITY_COLOR: Record<QuotePriority, { bg: string; text: string }> = {
  normal: { bg: 'bg-gray-100',   text: 'text-gray-600' },
  high:   { bg: 'bg-orange-50',  text: 'text-orange-700' },
  urgent: { bg: 'bg-red-50',     text: 'text-red-700' },
}
