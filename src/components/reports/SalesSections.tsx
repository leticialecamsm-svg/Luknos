'use client'

import { useState } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import { BarChart3, Users, CalendarDays, Target, Layers, TrendingUp, BadgePercent } from 'lucide-react'
import {
  type ReportRow, type Dim, channelOf, colorOf, monthOf, monthLabel, prevMonth, daysInMonth, WEEKDAYS,
  nf, pct, brlShort, participations, currentMonthBR, median,
} from './lib'
import { Card, Delta, Empty, Legend, MiniStat, SellerName, TH } from './ui'

// ── Vendas por canal ────────────────────────────────────────────────────────

export function ChannelTable({ dim, channels, cur, prev, cohort, month, compare, shareFor }: {
  dim: Dim; channels: string[]; cur: ReportRow[]; prev: ReportRow[]; cohort: ReportRow[]
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
  const convOf = (c: string) => {
    const list = cohort.filter(r => channelOf(r, dim) === c)
    return list.length ? { rate: list.filter(r => r.temperature === 'closed').length / list.length, n: list.length } : null
  }
  const visible = channels.filter(c => A[c] || B[c] || convOf(c))

  return (
    <Card icon={Layers} title={dim === 'partner' ? 'Vendas por parceiro' : 'Vendas por origem'}
      subtitle={`${monthLabel(month)} comparado com ${monthLabel(compare)}`}
      help="Conversão = dos orçamentos abertos no mês por esse canal, quantos já viraram venda.">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border">
              <th className={cn(TH, 'text-left pr-4')}>Canal</th>
              <th className={cn(TH, 'text-left pr-4 w-[30%]')}>Participação no faturamento</th>
              <th className={cn(TH, 'text-right px-3')}>Vendas</th>
              <th className={cn(TH, 'text-right px-3')}>vs comp.</th>
              <th className={cn(TH, 'text-right px-3')}>Faturamento</th>
              <th className={cn(TH, 'text-right px-3')}>Ticket médio</th>
              <th className={cn(TH, 'text-right pl-3')}>Conversão</th>
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

// ── Colaborador × canal ────────────────────────────────────────────────────

export function SellerMatrix({ dim, channels, list, metric, month }: {
  dim: Dim; channels: string[]; list: ReportRow[]; metric: 'qty' | 'value'; month: string
}) {
  const sellers = new Map<string, { name: string; color: string; cells: Record<string, { qty: number; value: number }> }>()
  participations(list).forEach(p => {
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

  const rows = Array.from(sellers.entries())
    .map(([id, s]) => ({ id, ...s, total: cols.reduce((t, c) => t + val(s.cells[c]), 0), reached: cols.filter(c => s.cells[c]).length }))
    .sort((a, b) => b.total - a.total)

  return (
    <Card icon={Users} title="Colaborador × canal"
      subtitle={`${monthLabel(month)} · a célula contornada é quem mais vendeu naquele canal`}
      help="Venda com mais de um responsável conta 1 venda pra cada um; o valor é dividido entre eles.">
      {rows.length === 0 ? <Empty /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                <th className={cn(TH, 'text-left pr-4')}>Colaborador</th>
                <th className={cn(TH, 'text-center px-2')} title="Canais com pelo menos 1 venda">Canais</th>
                {cols.map(c => (
                  <th key={c} className={cn(TH, 'text-center px-2 whitespace-nowrap')}>
                    <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-sm" style={{ background: colorOf(c) }} />{c}</span>
                  </th>
                ))}
                <th className={cn(TH, 'text-right pl-3')}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(s => (
                <tr key={s.id} className="border-b border-gray-50">
                  <td className="py-2 pr-4"><SellerName name={s.name} color={s.color} /></td>
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
        </div>
      )}
    </Card>
  )
}

// ── Vendas por dia × vendedor × canal ──────────────────────────────────────

export function DailyChart({ dim, channels, month, closed, sellerFilter }: {
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
      subtitle={`${monthLabel(month)} · uma linha por vendedor, mesma escala, cada barra dividida pelo canal`}
      help="Passe o mouse numa barra pra ver o dia da semana e os canais daquele dia. Domingos ficam sombreados."
      right={<div className="max-w-md"><Legend items={used} /></div>}>
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
                      <div key={day} title={title} className={cn('h-full flex flex-col justify-end rounded-[3px]', wd === 0 && 'bg-gray-50')}>
                        {tot > 0 && (
                          <div className="flex flex-col-reverse rounded-[3px] overflow-hidden" style={{ height: `${(tot / maxDay) * 100}%` }}>
                            {used.filter(c => dc[c]).map(c => <div key={c} style={{ flex: dc[c], background: colorOf(c) }} />)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            <div className="flex gap-3 pt-1.5">
              <div className="w-28 shrink-0" />
              <div className="flex-1 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
                {Array.from({ length: n }).map((_, i) => {
                  const wd = new Date(y, mo - 1, i + 1).getDay()
                  return <span key={i} className={cn('text-center text-[9.5px] tabular-nums', wd === 0 || wd === 6 ? 'text-gray-300' : 'text-gray-400')}>{i + 1}</span>
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

// ── Dia da semana ───────────────────────────────────────────────────────────

export function WeekdayHeat({ closed, month, months }: { closed: ReportRow[]; month: string; months: string[] }) {
  const idx = months.indexOf(month)
  const window = months.slice(Math.max(0, idx - 2), idx + 1)
  const sellers = new Map<string, { name: string; color: string; wd: number[] }>()
  participations(closed.filter(r => window.includes(monthOf(r.closedAt!)))).forEach(p => {
    const s = sellers.get(p.sellerId) ?? { name: p.sellerName, color: p.color, wd: [0, 0, 0, 0, 0, 0, 0] }
    const [y, m, d] = p.row.closedAt!.split('-').map(Number)
    s.wd[new Date(y, m - 1, d).getDay()] += 1
    sellers.set(p.sellerId, s)
  })
  const list = Array.from(sellers.entries()).sort((a, b) => b[1].wd.reduce((x, y) => x + y) - a[1].wd.reduce((x, y) => x + y))
  const order = [1, 2, 3, 4, 5, 6, 0]

  return (
    <Card icon={CalendarDays} title="Em que dia da semana cada um mais fecha"
      subtitle={`Soma de ${window.map(m => monthLabel(m, true)).join(', ')}`}
      help="Usa 3 meses porque um mês só tem poucas semanas — a tendência fica mais confiável.">
      {list.length === 0 ? <Empty /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={cn(TH, 'text-left pr-4')}>Colaborador</th>
                {order.map(w => <th key={w} className={cn(TH, 'text-center px-1')}>{WEEKDAYS[w]}</th>)}
              </tr>
            </thead>
            <tbody>
              {list.map(([id, s]) => {
                const max = Math.max(1, ...s.wd)
                const total = s.wd.reduce((a, b) => a + b, 0)
                return (
                  <tr key={id}>
                    <td className="py-1 pr-4 text-xs"><SellerName name={s.name} color={s.color} /></td>
                    {order.map(w => {
                      const v = s.wd[w]
                      return (
                        <td key={w} className="py-1 px-1">
                          <div title={`${v} vendas (${total ? pct(v / total) : '0%'} das vendas dessa pessoa)`}
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

// ── Desconto concedido ──────────────────────────────────────────────────────

export function DiscountBySeller({ list, month }: { list: ReportRow[]; month: string }) {
  const sellers = new Map<string, { name: string; color: string; quoted: number; closed: number; n: number; rates: number[] }>()
  participations(list.filter(r => r.quoted > 0 && r.value > 0)).forEach(p => {
    const s = sellers.get(p.sellerId) ?? { name: p.sellerName, color: p.color, quoted: 0, closed: 0, n: 0, rates: [] }
    s.quoted += p.row.quoted * p.share
    s.closed += p.row.value * p.share
    s.n += 1
    s.rates.push((p.row.quoted - p.row.value) / p.row.quoted)
    sellers.set(p.sellerId, s)
  })
  const rows = Array.from(sellers.entries()).map(([id, s]) => ({
    id, ...s, gap: s.quoted - s.closed, rate: s.quoted ? (s.quoted - s.closed) / s.quoted : 0, med: median(s.rates) ?? 0,
  })).sort((a, b) => b.rate - a.rate)
  const team = rows.reduce((a, r) => ({ q: a.q + r.quoted, c: a.c + r.closed }), { q: 0, c: 0 })
  const teamRate = team.q ? (team.q - team.c) / team.q : 0

  return (
    <Card icon={BadgePercent} title="Diferença entre orçado e fechado"
      subtitle={`${monthLabel(month)} · média da equipe: ${pct(teamRate)}`}
      help="Compara o valor orçado com o valor fechado de cada venda. Positivo = desconto concedido; negativo = a venda fechou maior que o orçado (itens adicionados).">
      {rows.length === 0 ? <Empty /> : (
        <div className="space-y-2">
          {rows.map(r => {
            const width = Math.min(Math.abs(r.rate) / 0.3, 1) * 50
            return (
              <div key={r.id} className="grid grid-cols-[150px_1fr_110px_90px] items-center gap-3 text-sm">
                <SellerName name={r.name} color={r.color} />
                <div className="relative h-2.5 bg-gray-100 rounded-full">
                  <div className="absolute top-0 bottom-0 w-px bg-gray-300 left-1/2" />
                  <div className={cn('absolute top-0 bottom-0 rounded-full', r.rate >= 0 ? 'bg-amber-400' : 'bg-emerald-400')}
                    style={r.rate >= 0 ? { left: '50%', width: `${width}%` } : { right: '50%', width: `${width}%` }} />
                </div>
                <span className={cn('text-right tabular-nums font-semibold', r.rate > teamRate + 0.03 ? 'text-amber-700' : 'text-gray-700')}>
                  {r.rate >= 0 ? '−' : '+'}{pct(Math.abs(r.rate))}
                </span>
                <span className="text-right tabular-nums text-xs text-gray-500" title={`${r.n} vendas com valor orçado`}>
                  {r.gap >= 0 ? brlShort(r.gap) : `+${brlShort(-r.gap)}`}
                </span>
              </div>
            )
          })}
          <p className="text-[11px] text-gray-400 pt-2">Amarelo = desconto sobre o orçado · verde = fechou acima do orçado. Em destaque quem está 3 pontos acima da média.</p>
        </div>
      )}
    </Card>
  )
}

// ── Evolução mês a mês ─────────────────────────────────────────────────────

export function MonthlyEvolution({ dim, channels, months, closed, metric, shareFor }: {
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
    <Card icon={TrendingUp} title="Evolução mês a mês"
      subtitle={`${metric === 'qty' ? 'Quantidade de vendas' : 'Faturamento'} por canal em todos os meses registrados`}
      right={<Legend items={used} />}>
      <div className="flex items-end gap-4 h-52 px-2">
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
    </Card>
  )
}

// ── Planejador de metas ────────────────────────────────────────────────────

export function GoalPlanner({ dim, channels, closed, months, month }: {
  dim: Dim; channels: string[]; closed: ReportRow[]; months: string[]; month: string
}) {
  const [growth, setGrowth] = useState(10)
  const [salesDays, setSalesDays] = useState(24)

  const cm = currentMonthBR()
  const full = months.filter(m => m < cm)
  const idx = full.indexOf(month) >= 0 ? full.indexOf(month) : full.length - 1
  const base = full.slice(Math.max(0, idx - 2), idx + 1)
  const factor = 1 + growth / 100
  const nMonths = Math.max(1, base.length)

  // Sazonalidade: se já existe o mesmo mês do ano anterior, ele entra na conta
  const target = prevMonth(cm, -1).slice(0, 7)
  const lastYear = prevMonth(target, 12)
  const lastYearRows = closed.filter(r => monthOf(r.closedAt!) === lastYear)

  const sellers = new Map<string, { name: string; color: string; byC: Record<string, { qty: number; value: number }> }>()
  participations(closed.filter(r => base.includes(monthOf(r.closedAt!)))).forEach(p => {
    const s = sellers.get(p.sellerId) ?? { name: p.sellerName, color: p.color, byC: {} }
    const c = channelOf(p.row, dim)
    s.byC[c] = s.byC[c] ?? { qty: 0, value: 0 }
    s.byC[c].qty += 1
    s.byC[c].value += p.row.value * p.share
    sellers.set(p.sellerId, s)
  })
  const list = Array.from(sellers.entries())
    .map(([id, s]) => ({
      id, ...s,
      value: Object.values(s.byC).reduce((a, b) => a + b.value, 0) / nMonths,
      qty: Object.values(s.byC).reduce((a, b) => a + b.qty, 0) / nMonths,
    }))
    .filter(s => s.id !== '_none')
    .sort((a, b) => b.value - a.value)
  const cols = channels.filter(c => list.some(s => s.byC[c]))
  const teamValue = list.reduce((a, s) => a + s.value, 0) * factor
  // Venda com 2 donos conta 1 pra cada um na linha do vendedor, mas na equipe é 1 venda só
  const teamQty = (closed.filter(r => base.includes(monthOf(r.closedAt!))).length / nMonths) * factor
  const lastYearValue = lastYearRows.reduce((a, r) => a + r.value, 0)

  return (
    <Card icon={Target} title="Planejador de metas"
      subtitle={base.length ? `Base: média de ${base.map(m => monthLabel(m, true)).join(', ')} + crescimento desejado` : 'Ainda não há meses fechados suficientes'}
      help="Meta por canal = o que a pessoa já vende naquele canal, em média, mais o crescimento. É um ponto de partida realista; suba nos canais onde ela está abaixo da equipe."
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <MiniStat label="Meta da equipe no mês" value={formatCurrency(teamValue)} />
            <MiniStat label="Meta da equipe por dia" value={formatCurrency(teamValue / salesDays)} />
            <MiniStat label="Vendas/mês (equipe)" value={nf(teamQty)} />
            <MiniStat label="Vendas/dia (equipe)" value={nf(teamQty / salesDays, 1)} />
          </div>
          <p className="text-[11px] text-gray-500 mb-4 bg-surface rounded-lg px-3 py-2">
            {lastYearRows.length
              ? <>Sazonalidade: em {monthLabel(lastYear)} a loja fechou <b>{formatCurrency(lastYearValue)}</b> — compare com a meta acima antes de decidir.</>
              : <>Sazonalidade: quando o sistema tiver 12 meses de dados, aqui aparece o mesmo mês do ano anterior pra calibrar a meta (a partir de jun/27).</>}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className={cn(TH, 'text-left pr-4')}>Colaborador</th>
                  <th className={cn(TH, 'text-right px-3')}>Meta/mês</th>
                  <th className={cn(TH, 'text-right px-3')}>Meta/dia</th>
                  <th className={cn(TH, 'text-right px-3')}>Vendas/mês</th>
                  {cols.map(c => (
                    <th key={c} className={cn(TH, 'text-right px-2 whitespace-nowrap')}>
                      <span className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-sm" style={{ background: colorOf(c) }} />{c}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {list.map(s => (
                  <tr key={s.id}>
                    <td className="py-2 pr-4"><SellerName name={s.name} color={s.color} /></td>
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
        </>
      )}
    </Card>
  )
}
