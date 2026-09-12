'use client'

import { useMemo, useState } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import {
  type ReportRow, type Dim, type TeamHealth, type Goal, ORDER, monthOf, monthLabel, prevMonth,
  nf, pct, participations, currentMonthBR,
} from './lib'
import { Kpi, Select, Seg } from './ui'
import {
  ChannelTable, SellerMatrix, DailyChart, WeekdayHeat, DiscountBySeller, MonthlyEvolution, GoalPlanner,
} from './SalesSections'
import { UpdateHealth, PipelineCoverage, ChannelFunnel, LossReasons, SalesCycle } from './PipelineSections'
import { PartnerRadar, PartnerRanking, RepeatClients } from './PartnerSections'

export type { ReportRow } from './lib'

type Tab = 'overview' | 'team' | 'funnel' | 'partners' | 'clients' | 'goals'

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'overview', label: 'Visão geral', hint: 'Resultado do mês, canais e se dá pra confiar no funil' },
  { id: 'team', label: 'Equipe', hint: 'Quem vende em qual canal, em que dias e com quanto desconto' },
  { id: 'funnel', label: 'Funil e perdas', hint: 'Pra onde vão os orçamentos, por que se perdem e quanto demoram' },
  { id: 'partners', label: 'Parceiros', hint: 'Quem procurar hoje, na semana e no mês — e o ranking' },
  { id: 'clients', label: 'Clientes', hint: 'Quem volta a comprar' },
  { id: 'goals', label: 'Metas', hint: 'Meta por vendedor, por canal e por dia a partir do histórico' },
]

// Quais filtros fazem sentido em cada aba (o resto some pra não poluir)
const FILTERS: Record<Tab, { month: boolean; compare: boolean; seller: boolean; dim: boolean; metric: boolean }> = {
  overview: { month: true, compare: true, seller: true, dim: true, metric: false },
  team: { month: true, compare: false, seller: true, dim: true, metric: true },
  funnel: { month: true, compare: false, seller: true, dim: true, metric: false },
  partners: { month: false, compare: false, seller: true, dim: false, metric: false },
  clients: { month: false, compare: false, seller: false, dim: false, metric: false },
  goals: { month: true, compare: false, seller: false, dim: true, metric: true },
}

export function ReportsPage({ rows, health, goals }: { rows: ReportRow[]; health: TeamHealth[]; goals: Goal[] }) {
  const closed = useMemo(() => rows.filter(r => r.temperature === 'closed' && r.closedAt), [rows])
  const months = useMemo(() => Array.from(new Set(closed.map(r => monthOf(r.closedAt!)))).sort(), [closed])

  const cm = currentMonthBR()
  const lastFull = [...months].reverse().find(m => m < cm) ?? months[months.length - 1] ?? cm

  const [tab, setTab] = useState<Tab>('overview')
  const [month, setMonth] = useState(lastFull)
  const [compare, setCompare] = useState(prevMonth(lastFull))
  const [dim, setDim] = useState<Dim>('partner')
  const [metric, setMetric] = useState<'qty' | 'value'>('qty')
  const [seller, setSeller] = useState<string>('all')

  const sellers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; total: number }>()
    participations(closed).forEach(p => {
      if (p.sellerId === '_none') return
      const s = map.get(p.sellerId) ?? { id: p.sellerId, name: p.sellerName, total: 0 }
      s.total += p.row.value * p.share
      map.set(p.sellerId, s)
    })
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [closed])

  const bySeller = (list: ReportRow[]) => seller === 'all' ? list : list.filter(r => r.owners.some(o => o.id === seller))
  const shareFor = (r: ReportRow) =>
    seller === 'all' ? 1 : (r.owners.some(o => o.id === seller) ? 1 / Math.max(1, r.owners.length) : 0)

  const closedIn = (m: string) => bySeller(closed.filter(r => monthOf(r.closedAt!) === m))
  const cohortOf = (m: string) => bySeller(rows.filter(r => monthOf(r.createdAt) === m))

  const cur = closedIn(month)
  const prev = closedIn(compare)
  const summary = (list: ReportRow[], m: string) => {
    const value = list.reduce((s, r) => s + r.value * shareFor(r), 0)
    const cohort = cohortOf(m)
    return {
      qty: list.length, value, ticket: list.length ? value / list.length : 0,
      conv: cohort.length ? cohort.filter(r => r.temperature === 'closed').length / cohort.length : 0,
      cohort: cohort.length,
    }
  }
  const S = summary(cur, month)
  const P = summary(prev, compare)

  const channels = ORDER[dim]
  const f = FILTERS[tab]
  const lossWindow = months.slice(Math.max(0, months.indexOf(month) - 2), months.indexOf(month) + 1)
  const monthOptions = months.map(m => [m, monthLabel(m)] as [string, string])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
        <p className="text-sm text-gray-500 mt-1">{TABS.find(t => t.id === tab)!.hint}</p>
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b border-surface-border overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
              tab === t.id ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-800')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filtros da aba */}
      {(f.month || f.seller || f.dim || f.metric) && (
        <div className="flex flex-wrap items-end gap-2">
          {f.month && <Select label="Mês" value={month} onChange={setMonth} options={monthOptions} />}
          {f.compare && <Select label="Comparar com" value={compare} onChange={setCompare} options={monthOptions} />}
          {f.seller && (
            <Select label="Colaborador" value={seller} onChange={setSeller}
              options={[['all', 'Toda a equipe'], ...sellers.map(s => [s.id, s.name] as [string, string])]} />
          )}
          {f.dim && <Seg value={dim} onChange={v => setDim(v as Dim)} options={[['partner', 'Por parceiro'], ['origin', 'Por origem']]} />}
          {f.metric && <Seg value={metric} onChange={v => setMetric(v as any)} options={[['qty', 'Quantidade'], ['value', 'Valor']]} />}
        </div>
      )}

      {f.month && month === cm && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          {monthLabel(month)} ainda está em andamento — os números vão parecer menores que os de meses fechados até o mês acabar.
        </p>
      )}

      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Vendas fechadas" value={nf(S.qty)} cur={S.qty} prev={P.qty} compare={compare} />
            <Kpi label="Faturamento (valor fechado)" value={formatCurrency(S.value)} cur={S.value} prev={P.value} compare={compare} />
            <Kpi label="Ticket médio" value={formatCurrency(S.ticket)} cur={S.ticket} prev={P.ticket} compare={compare} />
            <Kpi label="Conversão dos orçamentos do mês" value={pct(S.conv)} cur={S.conv} prev={P.conv} compare={compare}
              hint={`${nf(S.cohort)} orçamentos abertos em ${monthLabel(month, true)}`} />
          </div>
          <UpdateHealth health={seller === 'all' ? health : health.filter(h => h.userId === seller)} />
          <PipelineCoverage rows={bySeller(rows)} closedNow={closedIn(cm)} goals={goals} />
          <ChannelTable dim={dim} channels={channels} cur={cur} prev={prev} cohort={cohortOf(month)}
            month={month} compare={compare} shareFor={shareFor} />
        </>
      )}

      {tab === 'team' && (
        <>
          <SellerMatrix dim={dim} channels={channels} list={closed.filter(r => monthOf(r.closedAt!) === month)} metric={metric} month={month} />
          <DailyChart dim={dim} channels={channels} month={month} closed={closed} sellerFilter={seller} />
          <div className="grid xl:grid-cols-2 gap-5">
            <WeekdayHeat closed={closed} month={month} months={months} />
            <DiscountBySeller list={closed.filter(r => monthOf(r.closedAt!) === month)} month={month} />
          </div>
        </>
      )}

      {tab === 'funnel' && (
        <>
          <ChannelFunnel dim={dim} channels={channels} cohort={cohortOf(month)} month={month} />
          <LossReasons dim={dim} months={lossWindow}
            lost={bySeller(rows.filter(r => r.temperature === 'lost' && lossWindow.includes(monthOf(r.createdAt))))} />
          <SalesCycle dim={dim} channels={channels} closed={cur} month={month} openRows={bySeller(rows.filter(r => r.temperature !== 'closed' && r.temperature !== 'lost'))} />
        </>
      )}

      {tab === 'partners' && (
        <>
          <PartnerRadar rows={rows} sellerFilter={seller} />
          <PartnerRanking rows={bySeller(rows)} />
        </>
      )}

      {tab === 'clients' && <RepeatClients closed={closed} />}

      {tab === 'goals' && (
        <>
          <GoalPlanner dim={dim} channels={channels} closed={closed} months={months} month={month} />
          <MonthlyEvolution dim={dim} channels={channels} months={months} closed={closed} metric={metric} shareFor={() => 1} />
        </>
      )}
    </div>
  )
}
