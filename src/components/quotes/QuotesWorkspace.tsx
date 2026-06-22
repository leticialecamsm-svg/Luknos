'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatCurrency, formatDate, isOverdue, cn } from '@/lib/utils'
import { TEMPERATURE_LABEL, TEMPERATURE_COLOR, QUOTE_STATUS_LABEL } from '@/types'
import { Search, Flame, Clock, Snowflake, CheckCircle2, AlertTriangle, ListTodo, X } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'

const TABS = [
  { key: 'focus',  label: 'Foco (a fazer)' },
  { key: 'hot',    label: 'Quentes' },
  { key: 'closed', label: 'Fechados' },
  { key: 'all',    label: 'Todos' },
] as const
type TabKey = typeof TABS[number]['key']

function isOpen(q: any) {
  return q.status !== 'done' && !['closed', 'lost'].includes(q.temperature ?? '')
}
const TEMP_ORDER: Record<string, number> = { hot: 0, warm: 1, cold: 2 }

export function QuotesWorkspace({ allQuotes, users }: { allQuotes: any[]; users: any[] }) {
  const [tab, setTab] = useState<TabKey>('focus')
  const [search, setSearch] = useState('')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')

  const today = new Date().toISOString().split('T')[0]
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

  // aplica busca + responsável
  const base = useMemo(() => allQuotes.filter(q => {
    const mSearch = !search ||
      q.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      q.architect_name?.toLowerCase().includes(search.toLowerCase()) ||
      String(q.number).includes(search)
    const mOwner = ownerFilter === 'all' || (q.owners ?? []).some((o: any) => o.user_id === ownerFilter)
    return mSearch && mOwner
  }), [allQuotes, search, ownerFilter])

  const open = base.filter(isOpen)
  const closedMonth = base.filter(q => q.temperature === 'closed' && (q.closed_at ?? '') >= monthStart)

  // KPIs
  const sum = (arr: any[], f: (q: any) => number) => arr.reduce((s, q) => s + f(q), 0)
  const kpis = {
    aFazerCount: open.length,
    aFazerValue: sum(open, q => Number(q.quoted_value ?? 0)),
    hot: open.filter(q => q.temperature === 'hot'),
    warm: open.filter(q => q.temperature === 'warm'),
    cold: open.filter(q => (q.temperature ?? 'cold') === 'cold'),
    overdue: open.filter(q => q.deadline && q.deadline < today),
    closedMonthValue: sum(closedMonth, q => Number(q.final_value ?? q.quoted_value ?? 0)),
    closedMonthCount: closedMonth.length,
  }

  // funil por temperatura (em aberto)
  const funnel = (['hot', 'warm', 'cold'] as const).map(t => {
    const arr = open.filter(q => (q.temperature ?? 'cold') === t)
    return { t, count: arr.length, value: sum(arr, q => Number(q.quoted_value ?? 0)) }
  })
  const maxFunnel = Math.max(1, ...funnel.map(f => f.value))

  // por colaborador (em aberto)
  const byUser = users.map(u => {
    const arr = open.filter(q => (q.owners ?? []).some((o: any) => o.user_id === u.id))
    return { u, count: arr.length, value: sum(arr, q => Number(q.quoted_value ?? 0)) }
  }).filter(x => x.count > 0).sort((a, b) => b.value - a.value)
  const maxUser = Math.max(1, ...byUser.map(x => x.value))

  // lista conforme aba
  let list = base
  if (tab === 'focus') list = open.slice().sort((a, b) =>
    (TEMP_ORDER[a.temperature ?? 'cold'] - TEMP_ORDER[b.temperature ?? 'cold']) ||
    ((a.deadline ?? '9999') < (b.deadline ?? '9999') ? -1 : 1))
  else if (tab === 'hot') list = open.filter(q => q.temperature === 'hot')
  else if (tab === 'closed') list = base.filter(q => q.temperature === 'closed')

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="A fazer" value={kpis.aFazerCount} sub={formatCurrency(kpis.aFazerValue)} icon={ListTodo} tone="blue" onClick={() => setTab('focus')} active={tab === 'focus'} />
        <Kpi label="Quentes" value={kpis.hot.length} sub={formatCurrency(sum(kpis.hot, q => Number(q.quoted_value ?? 0)))} icon={Flame} tone="red" onClick={() => setTab('hot')} active={tab === 'hot'} />
        <Kpi label="Mornos" value={kpis.warm.length} sub={formatCurrency(sum(kpis.warm, q => Number(q.quoted_value ?? 0)))} icon={Clock} tone="amber" />
        <Kpi label="Prazo vencido" value={kpis.overdue.length} sub="retomar contato" icon={AlertTriangle} tone="orange" alert={kpis.overdue.length > 0} />
        <Kpi label="Fechado no mês" value={kpis.closedMonthCount} sub={formatCurrency(kpis.closedMonthValue)} icon={CheckCircle2} tone="emerald" onClick={() => setTab('closed')} active={tab === 'closed'} />
      </div>

      {/* Gráficos: funil + colaboradores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-surface-border bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Funil em aberto</h3>
          <div className="space-y-3">
            {funnel.map(f => {
              const c = TEMPERATURE_COLOR[f.t]
              const icon = f.t === 'hot' ? Flame : f.t === 'warm' ? Clock : Snowflake
              const Icon = icon
              return (
                <div key={f.t} className="flex items-center gap-3">
                  <span className={cn('w-20 text-xs font-semibold flex items-center gap-1', c.text)}><Icon className="w-3.5 h-3.5" />{TEMPERATURE_LABEL[f.t]}</span>
                  <div className="flex-1 h-5 rounded-full bg-gray-100 overflow-hidden">
                    <div className={cn('h-full rounded-full flex items-center justify-end pr-2', c.bg)} style={{ width: `${Math.max(8, (f.value / maxFunnel) * 100)}%` }}>
                      <span className={cn('text-[10px] font-bold', c.text)}>{f.count}</span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-gray-600 w-24 text-right">{formatCurrency(f.value)}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-xl border border-surface-border bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Em aberto por colaborador</h3>
          <div className="space-y-2.5 max-h-44 overflow-y-auto">
            {byUser.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Sem orçamentos em aberto</p>}
            {byUser.map(x => (
              <div key={x.u.id} className="flex items-center gap-2">
                <Avatar user={x.u} size={24} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-700 truncate">{x.u.name.split(' ')[0]}</span>
                    <span className="text-xs font-bold text-gray-700">{formatCurrency(x.value)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-0.5">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(4, (x.value / maxUser) * 100)}%` }} />
                  </div>
                </div>
                <span className="text-[10px] text-gray-400 w-6 text-right">{x.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filtros + abas */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente, arquiteto, nº..." className="input pl-9 pr-8" />
            {search && <button onClick={() => setSearch('')} className="absolute right-3 top-2.5 text-gray-400"><X className="w-4 h-4" /></button>}
          </div>
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} className="select max-w-[180px]">
            <option value="all">Todos os responsáveis</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>

        <div className="flex gap-1 bg-surface-secondary rounded-lg p-1 w-fit">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-border bg-surface text-left">
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Nº</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Cliente</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Negociação</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Equipe</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Prazo</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum orçamento</td></tr>}
            {list.map(q => {
              const tempC = q.temperature ? TEMPERATURE_COLOR[q.temperature as keyof typeof TEMPERATURE_COLOR] : null
              const overdue = isOpen(q) && q.deadline && q.deadline < today
              const pendingPay = Array.isArray(q.payment_splits) && q.payment_splits.some((s: any) => s.status === 'open')
              return (
                <tr key={q.id} className="border-b border-surface-border last:border-0 hover:bg-surface">
                  <td className="px-4 py-3 align-top"><Link href={`/quotes/${q.id}`} className="text-sm text-gray-500">#{String(q.number).padStart(3,'0')}</Link></td>
                  <td className="px-4 py-3">
                    <Link href={`/quotes/${q.id}`} className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-500 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                        {(q.client_name ?? '?').split(' ').slice(0,2).map((w: string) => w[0]).join('').toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-gray-900 truncate">{q.client_name}</span>
                          {pendingPay && <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">⏳ Pgto</span>}
                        </div>
                        {q.architect_name && <p className="text-xs text-gray-400 truncate">Arq. {q.architect_name}</p>}
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {tempC ? <span className={cn('inline-flex text-xs font-medium px-2 py-1 rounded-full', tempC.bg, tempC.text)}>{TEMPERATURE_LABEL[q.temperature as keyof typeof TEMPERATURE_LABEL]}</span> : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center -space-x-1">
                      {(q.owners ?? []).slice(0,3).map((o: any) => <Avatar key={o.user_id} user={o} size={24} className="ring-1 ring-white" />)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {q.deadline ? (
                      <span className={cn('text-xs font-medium', overdue ? 'text-red-600' : 'text-gray-500')}>
                        {overdue && '⚠️ '}{formatDate(q.deadline)}
                      </span>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold text-gray-800">{formatCurrency(q.final_value ?? q.quoted_value ?? 0)}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, icon: Icon, tone, onClick, active, alert }: {
  label: string; value: number; sub: string; icon: any; tone: string; onClick?: () => void; active?: boolean; alert?: boolean
}) {
  const tones: Record<string, string> = {
    blue: 'text-blue-600 bg-blue-50', red: 'text-red-600 bg-red-50', amber: 'text-amber-600 bg-amber-50',
    orange: 'text-orange-600 bg-orange-50', emerald: 'text-emerald-600 bg-emerald-50',
  }
  return (
    <button onClick={onClick} disabled={!onClick}
      className={cn('text-left rounded-xl border bg-white p-4 transition-all',
        onClick && 'hover:shadow-sm cursor-pointer', active ? 'border-brand-300 ring-1 ring-brand-200' : 'border-surface-border',
        alert && 'border-orange-200')}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', tones[tone])}><Icon className="w-4 h-4" /></div>
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
    </button>
  )
}
