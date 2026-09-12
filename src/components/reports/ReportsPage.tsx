'use client'

import { useMemo, useState } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus, BarChart3, Users, CalendarDays, Target, Layers } from 'lucide-react'

export type ReportRow = {
  id: string
  number: number
  client: string
  origin: string
  paidTraffic: boolean
  partnerType: string | null
  temperature: string | null
  value: number
  quoted: number
  createdAt: string        // YYYY-MM-DD
  closedAt: string | null  // YYYY-MM-DD
  owners: { id: string; name: string; color: string }[]
}

// ── Dimensões de canal ──────────────────────────────────────────────────────
// "Parceiro" responde QUEM trouxe a venda; "Origem" responde POR ONDE o cliente
// chegou. As duas se sobrepõem (arquiteto que mandou pelo WhatsApp), por isso
// ficam em chaves separadas em vez de um canal só misturado.

type Dim = 'partner' | 'origin'

const PARTNER_LABEL: Record<string, string> = {
  architect: 'Arquiteto', designer: 'Designer', engineer: 'Engenheiro',
  electrician: 'Eletricista', plasterer: 'Gesseiro', carpenter: 'Marceneiro', other: 'Outro parceiro',
}
const ORIGIN_LABEL: Record<string, string> = {
  store: 'Loja', whatsapp: 'WhatsApp', referral: 'Indicação', visit: 'Visita', other: 'Outros',
}

function channelOf(r: ReportRow, dim: Dim): string {
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
const colorOf = (c: string) => CHANNEL_COLOR[c] ?? '#94A3B8'

const ORDER: Record<Dim, string[]> = {
  partner: ['Arquiteto', 'Designer', 'Engenheiro', 'Eletricista', 'Gesseiro', 'Marceneiro', 'Outro parceiro', 'Sem parceiro'],
  origin: ['Loja', 'WhatsApp', 'Indicação', 'Visita', 'Tráfego pago', 'Outros'],
}

// ── Datas ───────────────────────────────────────────────────────────────────

const monthOf = (iso: string) => iso.slice(0, 7)
function monthLabel(m: string, short = false) {
  const [y, mo] = m.split('-').map(Number)
  const s = new Intl.DateTimeFormat('pt-BR', { month: short ? 'short' : 'long', year: short ? '2-digit' : 'numeric' })
    .format(new Date(y, mo - 1, 1)).replace('.', '').replace(' de ', ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
function prevMonth(m: string) {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function daysInMonth(m: string) {
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, mo, 0).getDate()
}
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const nf = (n: number, d = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: 0 })
const pct = (n: number) => `${nf(n * 100, 1)}%`
const brlShort = (n: number) => n >= 1000 ? `R$ ${nf(n / 1000, n >= 10000 ? 0 : 1)} mil` : formatCurrency(n)

// ── Participação por colaborador ────────────────────────────────────────────
// Venda com 2 donos: cada um conta 1 venda (participou), mas o VALOR é
// dividido — igual ao ranking do dashboard, pra os totais baterem.
type Part = { row: ReportRow; sellerId: string; sellerName: string; color: string; share: number }

function participations(rows: ReportRow[]): Part[] {
  return rows.flatMap(r => {
    if (r.owners.length === 0) return [{ row: r, sellerId: '_none', sellerName: 'Sem responsável', color: '#94A3B8', share: 1 }]
    return r.owners.map(o => ({ row: r, sellerId: o.id, sellerName: o.name, color: o.color, share: 1 / r.owners.length }))
  })
}

// ─────────────────────────────────────────────────────────────────────────────

export function ReportsPage({ rows }: { rows: ReportRow[] }) {
  const closed = useMemo(() => rows.filter(r => r.temperature === 'closed' && r.closedAt), [rows])

  const months = useMemo(() => {
    const set = new Set(closed.map(r => monthOf(r.closedAt!)))
    return Array.from(set).sort()
  }, [closed])

  const currentMonth = new Date().toISOString().slice(0, 7)
  const lastFull = [...months].reverse().find(m => m < currentMonth) ?? months[months.length - 1] ?? currentMonth

  const [month, setMonth] = useState(lastFull)
  const [compare, setCompare] = useState(prevMonth(lastFull))
  const [dim, setDim] = useState<Dim>('partner')
  const [metric, setMetric] = useState<'qty' | 'value'>('qty')
  const [seller, setSeller] = useState<string>('all')

  const sellers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string; total: number }>()
    participations(closed).forEach(p => {
      const s = map.get(p.sellerId) ?? { id: p.sellerId, name: p.sellerName, color: p.color, total: 0 }
      s.total += p.row.value * p.share
      map.set(p.sellerId, s)
    })
    return Array.from(map.values()).filter(s => s.id !== '_none').sort((a, b) => b.total - a.total)
  }, [closed])

  const filterSeller = (list: ReportRow[]) =>
    seller === 'all' ? list : list.filter(r => r.owners.some(o => o.id === seller))
  const shareFor = (r: ReportRow) =>
    seller === 'all' ? 1 : (r.owners.some(o => o.id === seller) ? 1 / Math.max(1, r.owners.length) : 0)

  const inMonth = (m: string) => filterSeller(closed.filter(r => monthOf(r.closedAt!) === m))
  const cur = inMonth(month)
  const prev = inMonth(compare)

  const summary = (list: ReportRow[], m: string) => {
    const qty = list.length
    const value = list.reduce((s, r) => s + r.value * shareFor(r), 0)
    const cohort = filterSeller(rows.filter(r => monthOf(r.createdAt) === m))
    const conv = cohort.length ? cohort.filter(r => r.temperature === 'closed').length / cohort.length : 0
    return { qty, value, ticket: qty ? value / qty : 0, conv, cohort: cohort.length }
  }
  const S = summary(cur, month)
  const P = summary(prev, compare)

  const channels = ORDER[dim]

  return (
    <div className="space-y-6">
      {/* Cabeçalho + filtros */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
          <p className="text-sm text-gray-500 mt-1">Vendas fechadas por canal, colaborador e dia — com comparação entre meses</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select label="Mês" value={month} onChange={setMonth} options={months.map(m => [m, monthLabel(m)])} />
          <Select label="Comparar com" value={compare} onChange={setCompare} options={months.map(m => [m, monthLabel(m)])} />
          <Select label="Colaborador" value={seller} onChange={setSeller}
            options={[['all', 'Toda a equipe'], ...sellers.map(s => [s.id, s.name] as [string, string])]} />
          <Seg value={dim} onChange={v => setDim(v as Dim)} options={[['partner', 'Por parceiro'], ['origin', 'Por origem']]} />
          <Seg value={metric} onChange={v => setMetric(v as any)} options={[['qty', 'Quantidade'], ['value', 'Valor']]} />
        </div>
      </div>

      {month === currentMonth && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          {monthLabel(month)} ainda está em andamento — a comparação com meses fechados vai parecer menor até o mês acabar.
        </p>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Vendas fechadas" value={nf(S.qty)} cur={S.qty} prev={P.qty} compare={compare} />
        <Kpi label="Faturamento (valor fechado)" value={formatCurrency(S.value)} cur={S.value} prev={P.value} compare={compare} />
        <Kpi label="Ticket médio" value={formatCurrency(S.ticket)} cur={S.ticket} prev={P.ticket} compare={compare} />
        <Kpi label="Conversão dos orçamentos do mês" value={pct(S.conv)} cur={S.conv} prev={P.conv} compare={compare}
          hint={`${nf(S.cohort)} orçamentos abertos em ${monthLabel(month, true)}`} />
      </div>

      <ChannelTable dim={dim} channels={channels} cur={cur} prev={prev} rows={filterSeller(rows)} month={month}
        compare={compare} shareFor={shareFor} />

      <SellerMatrix dim={dim} channels={channels} list={closed.filter(r => monthOf(r.closedAt!) === month)}
        metric={metric} month={month} />

      <DailyChart dim={dim} channels={channels} month={month} closed={closed} sellerFilter={seller} />

      <WeekdayHeat closed={closed} month={month} months={months} />

      <MonthlyEvolution dim={dim} channels={channels} months={months} closed={filterSeller(closed)}
        metric={metric} shareFor={shareFor} />

      <GoalPlanner dim={dim} channels={channels} closed={closed} months={months} month={month} />
    </div>
  )
}

// ── Componentes base ────────────────────────────────────────────────────────

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][]
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="bg-white border border-surface-border rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-brand-500">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}

function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="flex bg-gray-100 rounded-lg p-1 gap-0.5 self-end">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)}
          className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-all',
            value === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
          {l}
        </button>
      ))}
    </div>
  )
}

function Card({ icon: Icon, title, subtitle, right, children }: {
  icon: any; title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2.5">
          <Icon className="w-4 h-4 text-gray-400 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

function Delta({ cur, prev, inverse }: { cur: number; prev: number; inverse?: boolean }) {
  if (!prev && !cur) return <span className="text-xs text-gray-300">—</span>
  if (!prev) return <span className="text-xs font-semibold text-emerald-600">novo</span>
  const d = (cur - prev) / prev
  const good = inverse ? d < 0 : d > 0
  const Icon = Math.abs(d) < 0.005 ? Minus : d > 0 ? TrendingUp : TrendingDown
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums',
      Math.abs(d) < 0.005 ? 'text-gray-400' : good ? 'text-emerald-600' : 'text-red-500')}>
      <Icon className="w-3 h-3" /> {d > 0 ? '+' : ''}{nf(d * 100, 0)}%
    </span>
  )
}

function Kpi({ label, value, cur, prev, compare, hint }: {
  label: string; value: string; cur: number; prev: number; compare: string; hint?: string
}) {
  return (
    <div className="card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1.5 tabular-nums">{value}</p>
      <div className="flex items-center gap-1.5 mt-1">
        <Delta cur={cur} prev={prev} />
        <span className="text-[11px] text-gray-400">vs {monthLabel(compare, true)}</span>
      </div>
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

// ── 1. Canais ───────────────────────────────────────────────────────────────

function ChannelTable({ dim, channels, cur, prev, rows, month, compare, shareFor }: {
  dim: Dim; channels: string[]; cur: ReportRow[]; prev: ReportRow[]; rows: ReportRow[]
  month: string; compare: string; shareFor: (r: ReportRow) => number
}) {
  const agg = (list: ReportRow[]) => {
    const m: Record<string, { qty: number; value: number }> = {}
    list.forEach(r => {
      const c = channelOf(r, dim)
      m[c] = m[c] ?? { qty: 0, value: 0 }
      m[c].qty += 1
      m[c].value += r.value * shareFor(r)
    })
    return m
  }
  const A = agg(cur), B = agg(prev)
  const totalValue = Object.values(A).reduce((s, x) => s + x.value, 0) || 1
  const maxValue = Math.max(1, ...Object.values(A).map(x => x.value))

  const cohort = rows.filter(r => monthOf(r.createdAt) === month)
  const convOf = (c: string) => {
    const list = cohort.filter(r => channelOf(r, dim) === c)
    return list.length ? { rate: list.filter(r => r.temperature === 'closed').length / list.length, n: list.length } : null
  }

  const visible = channels.filter(c => A[c] || B[c] || convOf(c))

  return (
    <Card icon={Layers} title={dim === 'partner' ? 'Vendas por parceiro' : 'Vendas por origem'}
      subtitle={`${monthLabel(month)} comparado com ${monthLabel(compare)}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
              <th className="text-left font-semibold py-2 pr-4">Canal</th>
              <th className="text-left font-semibold py-2 pr-4 w-[32%]">Participação no faturamento</th>
              <th className="text-right font-semibold py-2 px-3">Vendas</th>
              <th className="text-right font-semibold py-2 px-3">vs mês comp.</th>
              <th className="text-right font-semibold py-2 px-3">Faturamento</th>
              <th className="text-right font-semibold py-2 px-3">Ticket médio</th>
              <th className="text-right font-semibold py-2 pl-3" title="Dos orçamentos abertos no mês por esse canal, quantos já fecharam">Conversão</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {visible.map(c => {
              const a = A[c] ?? { qty: 0, value: 0 }
              const b = B[c] ?? { qty: 0, value: 0 }
              const cv = convOf(c)
              return (
                <tr key={c}>
                  <td className="py-2.5 pr-4">
                    <span className="inline-flex items-center gap-2 font-medium text-gray-800">
                      <i className="w-2.5 h-2.5 rounded-sm" style={{ background: colorOf(c) }} /> {c}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(a.value / maxValue) * 100}%`, background: colorOf(c) }} />
                      </div>
                      <span className="text-xs text-gray-500 tabular-nums w-10 text-right">{pct(a.value / totalValue)}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold tabular-nums">{nf(a.qty)}</td>
                  <td className="py-2.5 px-3 text-right"><Delta cur={a.qty} prev={b.qty} /></td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{formatCurrency(a.value)}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-gray-600">{a.qty ? formatCurrency(a.value / a.qty) : '—'}</td>
                  <td className="py-2.5 pl-3 text-right tabular-nums text-gray-600" title={cv ? `${cv.n} orçamentos abertos` : ''}>
                    {cv ? pct(cv.rate) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ── 2. Colaborador × canal ─────────────────────────────────────────────────

function SellerMatrix({ dim, channels, list, metric, month }: {
  dim: Dim; channels: string[]; list: ReportRow[]; metric: 'qty' | 'value'; month: string
}) {
  const parts = participations(list)
  const sellers = new Map<string, { name: string; color: string; cells: Record<string, { qty: number; value: number }> }>()
  parts.forEach(p => {
    const s = sellers.get(p.sellerId) ?? { name: p.sellerName, color: p.color, cells: {} }
    const c = channelOf(p.row, dim)
    s.cells[c] = s.cells[c] ?? { qty: 0, value: 0 }
    s.cells[c].qty += 1
    s.cells[c].value += p.row.value * p.share
    sellers.set(p.sellerId, s)
  })

  const cols = channels.filter(c => Array.from(sellers.values()).some(s => s.cells[c]))
  const val = (x?: { qty: number; value: number }) => x ? (metric === 'qty' ? x.qty : x.value) : 0
  const colMax: Record<string, number> = {}
  cols.forEach(c => { colMax[c] = Math.max(0, ...Array.from(sellers.values()).map(s => val(s.cells[c]))) })

  const list2 = Array.from(sellers.entries())
    .map(([id, s]) => ({ id, ...s, total: cols.reduce((t, c) => t + val(s.cells[c]), 0), reached: cols.filter(c => s.cells[c]).length }))
    .sort((a, b) => b.total - a.total)

  return (
    <Card icon={Users} title="Colaborador × canal"
      subtitle={`${monthLabel(month)} · a célula mais forte de cada canal fica destacada — onde cada um mais vende e onde falta alcance`}>
      {list2.length === 0 ? <Empty /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                <th className="text-left font-semibold py-2 pr-4">Colaborador</th>
                <th className="text-center font-semibold py-2 px-2" title="Quantos canais tiveram pelo menos 1 venda">Canais</th>
                {cols.map(c => (
                  <th key={c} className="text-center font-semibold py-2 px-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-sm" style={{ background: colorOf(c) }} />{c}</span>
                  </th>
                ))}
                <th className="text-right font-semibold py-2 pl-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {list2.map(s => (
                <tr key={s.id} className="border-b border-gray-50">
                  <td className="py-2 pr-4">
                    <span className="inline-flex items-center gap-2 font-medium text-gray-800 whitespace-nowrap">
                      <i className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} /> {s.name}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className="inline-block min-w-[44px] text-xs font-semibold rounded-full px-2 py-0.5 bg-gray-100 text-gray-700 tabular-nums">
                      {s.reached}/{cols.length}
                    </span>
                  </td>
                  {cols.map(c => {
                    const v = val(s.cells[c])
                    const intensity = colMax[c] ? v / colMax[c] : 0
                    const isTop = v > 0 && v === colMax[c]
                    return (
                      <td key={c} className="py-1.5 px-1 text-center">
                        <div className={cn('rounded-md py-1.5 text-xs tabular-nums', isTop ? 'font-bold' : 'font-medium', v ? 'text-gray-900' : 'text-gray-300')}
                          style={{ background: v ? `${colorOf(c)}${Math.round(18 + intensity * 50).toString(16).padStart(2, '0')}` : 'transparent',
                                   boxShadow: isTop ? `inset 0 0 0 1.5px ${colorOf(c)}` : undefined }}>
                          {v ? (metric === 'qty' ? nf(v) : brlShort(v)) : '·'}
                        </div>
                      </td>
                    )
                  })}
                  <td className="py-2 pl-3 text-right font-semibold tabular-nums">{metric === 'qty' ? nf(s.total) : formatCurrency(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-gray-400 mt-3">
            Venda com mais de um responsável conta 1 venda pra cada um; o valor é dividido entre eles.
          </p>
        </div>
      )}
    </Card>
  )
}

// ── 3. Vendas por dia × vendedor × canal ───────────────────────────────────

function DailyChart({ dim, channels, month, closed, sellerFilter }: {
  dim: Dim; channels: string[]; month: string; closed: ReportRow[]; sellerFilter: string
}) {
  const n = daysInMonth(month)
  const parts = participations(closed.filter(r => monthOf(r.closedAt!) === month))
    .filter(p => sellerFilter === 'all' || p.sellerId === sellerFilter)

  const sellers = new Map<string, { name: string; color: string; days: Record<number, Record<string, number>>; total: number }>()
  parts.forEach(p => {
    const s = sellers.get(p.sellerId) ?? { name: p.sellerName, color: p.color, days: {}, total: 0 }
    const d = Number(p.row.closedAt!.slice(8, 10))
    const c = channelOf(p.row, dim)
    s.days[d] = s.days[d] ?? {}
    s.days[d][c] = (s.days[d][c] ?? 0) + 1
    s.total += 1
    sellers.set(p.sellerId, s)
  })
  const list = Array.from(sellers.entries()).sort((a, b) => b[1].total - a[1].total)
  const maxDay = Math.max(1, ...list.flatMap(([, s]) => Object.values(s.days).map(dc => Object.values(dc).reduce((a, b) => a + b, 0))))
  const used = channels.filter(c => list.some(([, s]) => Object.values(s.days).some(dc => dc[c])))
  const [y, mo] = month.split('-').map(Number)

  return (
    <Card icon={BarChart3} title="Vendas por dia do mês"
      subtitle={`${monthLabel(month)} · uma linha por vendedor, mesma escala · cada barra é o dia, dividida pelo canal da venda`}
      right={
        <div className="flex flex-wrap gap-x-3 gap-y-1 max-w-md justify-end">
          {used.map(c => (
            <span key={c} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600">
              <i className="w-2.5 h-2.5 rounded-sm" style={{ background: colorOf(c) }} />{c}
            </span>
          ))}
        </div>
      }>
      {list.length === 0 ? <Empty /> : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: 760 }}>
            {list.map(([id, s]) => (
              <div key={id} className="flex items-end gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="w-28 shrink-0 pb-1">
                  <p className="text-xs font-semibold text-gray-800 truncate flex items-center gap-1.5">
                    <i className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />{s.name}
                  </p>
                  <p className="text-[10px] text-gray-400">{s.total} vendas</p>
                </div>
                <div className="flex-1 grid items-end gap-[3px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))`, height: 64 }}>
                  {Array.from({ length: n }).map((_, i) => {
                    const day = i + 1
                    const dc = s.days[day] ?? {}
                    const tot = Object.values(dc).reduce((a, b) => a + b, 0)
                    const wd = new Date(y, mo - 1, day).getDay()
                    const title = tot
                      ? `${s.name} · dia ${day} (${WEEKDAYS[wd]}): ${tot} venda(s)\n` + Object.entries(dc).map(([c, q]) => `${c}: ${q}`).join('\n')
                      : `${s.name} · dia ${day} (${WEEKDAYS[wd]}): sem vendas`
                    return (
                      <div key={day} title={title}
                        className={cn('h-full flex flex-col justify-end rounded-[3px]', wd === 0 && 'bg-gray-50')}>
                        {tot > 0 && (
                          <div className="flex flex-col-reverse rounded-[3px] overflow-hidden" style={{ height: `${(tot / maxDay) * 100}%` }}>
                            {used.filter(c => dc[c]).map(c => (
                              <div key={c} style={{ flex: dc[c], background: colorOf(c) }} />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            {/* eixo dos dias */}
            <div className="flex gap-3 pt-1.5">
              <div className="w-28 shrink-0" />
              <div className="flex-1 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
                {Array.from({ length: n }).map((_, i) => {
                  const wd = new Date(y, mo - 1, i + 1).getDay()
                  return (
                    <span key={i} className={cn('text-center text-[9.5px] tabular-nums', wd === 0 || wd === 6 ? 'text-gray-300' : 'text-gray-400')}>
                      {i + 1}
                    </span>
                  )
                })}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-3">Passe o mouse numa barra pra ver o dia da semana e os canais daquele dia.</p>
        </div>
      )}
    </Card>
  )
}

// ── 4. Dia da semana (tendência, últimos 3 meses) ───────────────────────────

function WeekdayHeat({ closed, month, months }: { closed: ReportRow[]; month: string; months: string[] }) {
  const idx = months.indexOf(month)
  const window = months.slice(Math.max(0, idx - 2), idx + 1)
  const parts = participations(closed.filter(r => window.includes(monthOf(r.closedAt!))))

  const sellers = new Map<string, { name: string; color: string; wd: number[] }>()
  parts.forEach(p => {
    const s = sellers.get(p.sellerId) ?? { name: p.sellerName, color: p.color, wd: [0, 0, 0, 0, 0, 0, 0] }
    const [y, m, d] = p.row.closedAt!.split('-').map(Number)
    s.wd[new Date(y, m - 1, d).getDay()] += 1
    sellers.set(p.sellerId, s)
  })
  const list = Array.from(sellers.entries()).sort((a, b) => b[1].wd.reduce((x, y) => x + y) - a[1].wd.reduce((x, y) => x + y))
  const order = [1, 2, 3, 4, 5, 6, 0]

  return (
    <Card icon={CalendarDays} title="Em que dia da semana cada um mais fecha"
      subtitle={`Soma de ${window.map(m => monthLabel(m, true)).join(', ')} — 3 meses dão uma tendência mais confiável que um só`}>
      {list.length === 0 ? <Empty /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-gray-400">
                <th className="text-left font-semibold py-2 pr-4">Colaborador</th>
                {order.map(w => <th key={w} className="text-center font-semibold py-2 px-1">{WEEKDAYS[w]}</th>)}
              </tr>
            </thead>
            <tbody>
              {list.map(([id, s]) => {
                const max = Math.max(1, ...s.wd)
                const total = s.wd.reduce((a, b) => a + b, 0)
                return (
                  <tr key={id}>
                    <td className="py-1 pr-4 text-xs font-medium text-gray-800 whitespace-nowrap">
                      <span className="inline-flex items-center gap-2"><i className="w-2 h-2 rounded-full" style={{ background: s.color }} />{s.name}</span>
                    </td>
                    {order.map(w => {
                      const v = s.wd[w]
                      return (
                        <td key={w} className="py-1 px-1">
                          <div title={`${v} vendas (${total ? pct(v / total) : '0%'} das vendas dele(a))`}
                            className={cn('rounded-md py-2 text-center text-xs tabular-nums', v === max && v > 0 ? 'font-bold text-white' : 'text-gray-700')}
                            style={{ background: v ? `rgba(24,95,165,${0.08 + (v / max) * 0.82})` : '#F9FAFB' }}>
                            {v || '·'}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ── 5. Evolução mês a mês ───────────────────────────────────────────────────

function MonthlyEvolution({ dim, channels, months, closed, metric, shareFor }: {
  dim: Dim; channels: string[]; months: string[]; closed: ReportRow[]; metric: 'qty' | 'value'
  shareFor: (r: ReportRow) => number
}) {
  const data = months.map(m => {
    const byC: Record<string, number> = {}
    closed.filter(r => monthOf(r.closedAt!) === m).forEach(r => {
      const c = channelOf(r, dim)
      byC[c] = (byC[c] ?? 0) + (metric === 'qty' ? 1 : r.value * shareFor(r))
    })
    return { m, byC, total: Object.values(byC).reduce((a, b) => a + b, 0) }
  })
  const max = Math.max(1, ...data.map(d => d.total))
  const used = channels.filter(c => data.some(d => d.byC[c]))

  return (
    <Card icon={TrendingUp} title="Evolução mês a mês" subtitle={`${metric === 'qty' ? 'Quantidade de vendas' : 'Faturamento'} por canal em todos os meses registrados`}>
      <div className="flex items-end gap-4 h-56 px-2">
        {data.map(d => (
          <div key={d.m} className="flex-1 flex flex-col items-center gap-2 h-full justify-end min-w-[48px]">
            <span className="text-xs font-semibold text-gray-700 tabular-nums">{metric === 'qty' ? nf(d.total) : brlShort(d.total)}</span>
            <div className="w-full max-w-[72px] flex flex-col-reverse rounded-md overflow-hidden" style={{ height: `${(d.total / max) * 100}%` }}>
              {used.filter(c => d.byC[c]).map(c => (
                <div key={c} style={{ flex: d.byC[c], background: colorOf(c) }}
                  title={`${c}: ${metric === 'qty' ? nf(d.byC[c]) : formatCurrency(d.byC[c])} (${pct(d.byC[c] / d.total)})`} />
              ))}
            </div>
            <span className="text-[11px] text-gray-500">{monthLabel(d.m, true)}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-4">
        {used.map(c => (
          <span key={c} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600">
            <i className="w-2.5 h-2.5 rounded-sm" style={{ background: colorOf(c) }} />{c}
          </span>
        ))}
      </div>
    </Card>
  )
}

// ── 6. Planejador de metas ─────────────────────────────────────────────────

function GoalPlanner({ dim, channels, closed, months, month }: {
  dim: Dim; channels: string[]; closed: ReportRow[]; months: string[]; month: string
}) {
  const [growth, setGrowth] = useState(10)
  const [salesDays, setSalesDays] = useState(24)

  const currentMonth = new Date().toISOString().slice(0, 7)
  const full = months.filter(m => m < currentMonth)
  const idx = full.indexOf(month) >= 0 ? full.indexOf(month) : full.length - 1
  const base = full.slice(Math.max(0, idx - 2), idx + 1)
  const factor = 1 + growth / 100

  const parts = participations(closed.filter(r => base.includes(monthOf(r.closedAt!))))
  const sellers = new Map<string, { name: string; color: string; byC: Record<string, { qty: number; value: number }> }>()
  parts.forEach(p => {
    const s = sellers.get(p.sellerId) ?? { name: p.sellerName, color: p.color, byC: {} }
    const c = channelOf(p.row, dim)
    s.byC[c] = s.byC[c] ?? { qty: 0, value: 0 }
    s.byC[c].qty += 1
    s.byC[c].value += p.row.value * p.share
    sellers.set(p.sellerId, s)
  })
  const nMonths = Math.max(1, base.length)
  const list = Array.from(sellers.entries())
    .map(([id, s]) => {
      const value = Object.values(s.byC).reduce((a, b) => a + b.value, 0) / nMonths
      const qty = Object.values(s.byC).reduce((a, b) => a + b.qty, 0) / nMonths
      return { id, ...s, value, qty }
    })
    .sort((a, b) => b.value - a.value)
  const cols = channels.filter(c => list.some(s => s.byC[c]))
  const teamValue = list.reduce((a, s) => a + s.value, 0) * factor
  const teamQty = list.reduce((a, s) => a + s.qty, 0) * factor

  return (
    <Card icon={Target} title="Planejador de metas"
      subtitle={base.length ? `Base: média de ${base.map(m => monthLabel(m, true)).join(', ')} (só meses fechados) + crescimento desejado` : 'Ainda não há meses fechados suficientes'}
      right={
        <div className="flex items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Crescimento</span>
            <div className="flex items-center gap-1">
              <input type="number" value={growth} onChange={e => setGrowth(Number(e.target.value) || 0)}
                className="w-16 bg-white border border-surface-border rounded-lg px-2 py-1.5 text-sm text-right" />
              <span className="text-sm text-gray-500">%</span>
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Dias de venda/mês</span>
            <input type="number" value={salesDays} onChange={e => setSalesDays(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 bg-white border border-surface-border rounded-lg px-2 py-1.5 text-sm text-right" />
          </label>
        </div>
      }>
      {list.length === 0 ? <Empty /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <MiniStat label="Meta da equipe no mês" value={formatCurrency(teamValue)} />
            <MiniStat label="Meta da equipe por dia" value={formatCurrency(teamValue / salesDays)} />
            <MiniStat label="Vendas/mês (equipe)" value={nf(teamQty)} />
            <MiniStat label="Vendas/dia (equipe)" value={nf(teamQty / salesDays, 1)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="text-left font-semibold py-2 pr-4">Colaborador</th>
                  <th className="text-right font-semibold py-2 px-3">Meta/mês</th>
                  <th className="text-right font-semibold py-2 px-3">Meta/dia</th>
                  <th className="text-right font-semibold py-2 px-3">Vendas/mês</th>
                  {cols.map(c => (
                    <th key={c} className="text-right font-semibold py-2 px-2 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-sm" style={{ background: colorOf(c) }} />{c}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {list.map(s => (
                  <tr key={s.id}>
                    <td className="py-2 pr-4 font-medium text-gray-800 whitespace-nowrap">
                      <span className="inline-flex items-center gap-2"><i className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />{s.name}</span>
                    </td>
                    <td className="py-2 px-3 text-right font-semibold tabular-nums">{formatCurrency(s.value * factor)}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-gray-600">{formatCurrency((s.value * factor) / salesDays)}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-gray-600">{nf(s.qty * factor, 1)}</td>
                    {cols.map(c => {
                      const x = s.byC[c]
                      return (
                        <td key={c} className="py-2 px-2 text-right tabular-nums text-xs text-gray-600"
                          title={x ? `${nf((x.qty / nMonths) * factor, 1)} vendas/mês nesse canal` : ''}>
                          {x ? brlShort((x.value / nMonths) * factor) : <span className="text-gray-300">·</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-400 mt-3">
            Meta por canal = o que a pessoa já vendeu naquele canal, em média, mais o crescimento. É um ponto de partida realista — ajuste pra cima nos canais onde ela está abaixo da equipe.
          </p>
        </>
      )}
    </Card>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface border border-surface-border px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900 mt-0.5 tabular-nums">{value}</p>
    </div>
  )
}

function Empty() {
  return <p className="text-sm text-gray-400 py-6 text-center">Nenhuma venda fechada nesse período.</p>
}
