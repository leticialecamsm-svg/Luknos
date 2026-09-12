import { formatCurrency } from '@/lib/utils'
import { cadenceFor, type Temp } from '@/lib/negotiation-rules'

export type ReportRow = {
  id: string
  number: number
  client: string
  clientId: string | null
  origin: string
  paidTraffic: boolean
  partnerId: string | null
  partnerName: string | null
  partnerType: string | null
  temperature: string | null
  lossReason: string | null
  value: number
  quoted: number
  createdAt: string        // YYYY-MM-DD (data do pedido do orçamento)
  closedAt: string | null  // YYYY-MM-DD
  lastTouch: string | null // ISO — última notícia dada por uma pessoa
  owners: { id: string; name: string; color: string }[]
}

export type TeamHealth = {
  userId: string; name: string; color: string
  open: number; overdue: number; overdueValue: number
  todayDue: number; todayDone: number
  compliance30: number | null; daysTracked: number
}

export type Goal = { userId: string | null; year: number; month: number; target: number }

// ── Canais ──────────────────────────────────────────────────────────────────
// "Parceiro" = QUEM trouxe a venda; "Origem" = POR ONDE o cliente chegou.
// As duas se sobrepõem (arquiteto que mandou pelo WhatsApp), por isso ficam
// em chaves separadas em vez de um canal só misturado.

export type Dim = 'partner' | 'origin'

const PARTNER_LABEL: Record<string, string> = {
  architect: 'Arquiteto', designer: 'Designer', engineer: 'Engenheiro',
  electrician: 'Eletricista', plasterer: 'Gesseiro', carpenter: 'Marceneiro', other: 'Outro parceiro',
}
const ORIGIN_LABEL: Record<string, string> = {
  store: 'Loja', whatsapp: 'WhatsApp', referral: 'Indicação', visit: 'Visita', other: 'Outros',
}

export function channelOf(r: ReportRow, dim: Dim): string {
  if (dim === 'partner') return r.partnerType ? (PARTNER_LABEL[r.partnerType] ?? 'Outro parceiro') : 'Sem parceiro'
  if (r.paidTraffic) return 'Tráfego pago'
  return ORIGIN_LABEL[r.origin] ?? 'Outros'
}

const CHANNEL_COLOR: Record<string, string> = {
  'Arquiteto': '#185FA5', 'Designer': '#7C3AED', 'Engenheiro': '#0891B2', 'Eletricista': '#D97706',
  'Gesseiro': '#DB2777', 'Marceneiro': '#65A30D', 'Outro parceiro': '#64748B', 'Sem parceiro': '#CBD5E1',
  'Loja': '#185FA5', 'WhatsApp': '#16A34A', 'Indicação': '#CBA455', 'Visita': '#0891B2',
  'Tráfego pago': '#DB2777', 'Outros': '#94A3B8',
}
export const colorOf = (c: string) => CHANNEL_COLOR[c] ?? '#94A3B8'

export const ORDER: Record<Dim, string[]> = {
  partner: ['Arquiteto', 'Designer', 'Engenheiro', 'Eletricista', 'Gesseiro', 'Marceneiro', 'Outro parceiro', 'Sem parceiro'],
  origin: ['Loja', 'WhatsApp', 'Indicação', 'Visita', 'Tráfego pago', 'Outros'],
}

export const LOSS_LABEL: Record<string, string> = {
  price: 'Preço', competition: 'Fechou com concorrente', no_reply: 'Parou de responder',
  gave_up: 'Desistiu da compra', other: 'Outro motivo',
}

// ── Estado de uma negociação aberta ─────────────────────────────────────────

export const OPEN_TEMPS = ['hot', 'warm', 'cold', 'no_forecast']
export const isOpen = (r: ReportRow) => !r.temperature || OPEN_TEMPS.includes(r.temperature)

export function daysSince(iso: string | null | undefined, now = new Date()) {
  if (!iso) return 999
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000)
}
export function isStale(r: ReportRow, now = new Date()) {
  const t = (r.temperature && OPEN_TEMPS.includes(r.temperature) ? r.temperature : 'no_forecast') as Temp
  return daysSince(r.lastTouch ?? r.createdAt, now) >= cadenceFor(t, !!r.partnerId)
}

// ── Datas e números ─────────────────────────────────────────────────────────

export const monthOf = (iso: string) => iso.slice(0, 7)
export function monthLabel(m: string, short = false) {
  const [y, mo] = m.split('-').map(Number)
  const s = new Intl.DateTimeFormat('pt-BR', { month: short ? 'short' : 'long', year: short ? '2-digit' : 'numeric' })
    .format(new Date(y, mo - 1, 1)).replace('.', '').replace(' de ', ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
export function prevMonth(m: string, n = 1) {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 1 - n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
export function daysInMonth(m: string) {
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, mo, 0).getDate()
}
export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export const currentMonthBR = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 7)

export const nf = (n: number, d = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: 0 })
export const pct = (n: number) => `${nf(n * 100, 1)}%`
export const brlShort = (n: number) =>
  Math.abs(n) >= 1000 ? `R$ ${nf(n / 1000, Math.abs(n) >= 10000 ? 0 : 1)} mil` : formatCurrency(n)

export function median(xs: number[]) {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// ── Participação por colaborador ────────────────────────────────────────────
// Venda com 2 donos: cada um conta 1 venda (participou), mas o VALOR é
// dividido — igual ao ranking do dashboard, pra os totais baterem.
export type Part = { row: ReportRow; sellerId: string; sellerName: string; color: string; share: number }

export function participations(rows: ReportRow[]): Part[] {
  return rows.flatMap(r => {
    if (r.owners.length === 0) return [{ row: r, sellerId: '_none', sellerName: 'Sem responsável', color: '#94A3B8', share: 1 }]
    return r.owners.map(o => ({ row: r, sellerId: o.id, sellerName: o.name, color: o.color, share: 1 / r.owners.length }))
  })
}
