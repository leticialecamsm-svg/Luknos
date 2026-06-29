'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { TEMPERATURE_LABEL, TEMPERATURE_COLOR, getContactTypeLabel } from '@/types'
import { Search, Flame, Clock, Snowflake, CircleDollarSign, TrendingUp, Percent, X } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'

function isOpen(q: any) {
  return q.status !== 'done' && !['closed', 'lost'].includes(q.temperature ?? '')
}

export function NegotiationsWorkspace({ allQuotes, users }: { allQuotes: any[]; users: any[] }) {
  const [search, setSearch] = useState('')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [tab, setTab] = useState<'close' | 'hot' | 'warm' | 'cold' | 'closed'>('close')

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

  const base = useMemo(() => allQuotes.filter(q => {
    const mSearch = !search ||
      q.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      q.architect_name?.toLowerCase().includes(search.toLowerCase()) ||
      String(q.number).includes(search)
    const mOwner = ownerFilter === 'all' || (q.owners ?? []).some((o: any) => o.user_id === ownerFilter)
    return mSearch && mOwner
  }), [allQuotes, search, ownerFilter])

  const open = base.filter(isOpen)
  const sum = (arr: any[], f: (q: any) => number) => arr.reduce((s, q) => s + f(q), 0)
  const openVal = (q: any) => Number(q.quoted_value ?? 0)
  const closedVal = (q: any) => Number(q.final_value ?? q.quoted_value ?? 0)

  const hot = open.filter(q => q.temperature === 'hot')
  const warm = open.filter(q => q.temperature === 'warm')
  const cold = open.filter(q => (q.temperature ?? 'cold') === 'cold')
  const closedMonth = base.filter(q => q.temperature === 'closed' && (q.closed_at ?? '') >= monthStart)
  const lostMonth = base.filter(q => q.temperature === 'lost')

  const totalOpen = sum(open, openVal)
  const closedMonthVal = sum(closedMonth, closedVal)
  const closedAll = base.filter(q => q.temperature === 'closed').length
  const decided = closedAll + lostMonth.length
  const conversion = decided > 0 ? Math.round((closedAll / decided) * 100) : 0

  // funil
  const funnel = ([['hot', hot], ['warm', warm], ['cold', cold]] as const).map(([t, arr]) => ({ t, count: arr.length, value: sum(arr, openVal) }))
  const maxFunnel = Math.max(1, ...funnel.map(f => f.value))

  // ranking por colaborador (fechado no mês)
  const byUser = users.map(u => ({
    u,
    closed: sum(closedMonth.filter(q => (q.owners ?? []).some((o: any) => o.user_id === u.id)), closedVal),
    pipeline: sum(open.filter(q => (q.owners ?? []).some((o: any) => o.user_id === u.id)), openVal),
  })).filter(x => x.closed > 0 || x.pipeline > 0).sort((a, b) => b.closed - a.closed)
  const maxClosed = Math.max(1, ...byUser.map(x => x.closed))

  // lista priorizada para fechar
  let list = [...hot, ...warm].sort((a, b) => closedVal(b) - closedVal(a))
  if (tab === 'hot') list = hot
  else if (tab === 'warm') list = warm
  else if (tab === 'cold') list = cold
  else if (tab === 'closed') list = closedMonth

  return (
    <div className="space-y-5">
      {/* KPIs comerciais */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Em negociação" value={formatCurrency(totalOpen)} sub={`${open.length} oportunidade(s)`} icon={TrendingUp} tone="blue" />
        <Kpi label="Quente (a fechar)" value={formatCurrency(sum(hot, openVal))} sub={`${hot.length} pronto(s)`} icon={Flame} tone="red" onClick={() => setTab('hot')} active={tab === 'hot'} />
        <Kpi label="Fechado no mês" value={formatCurrency(closedMonthVal)} sub={`${closedMonth.length} venda(s)`} icon={CircleDollarSign} tone="emerald" onClick={() => setTab('closed')} active={tab === 'closed'} />
        <Kpi label="Conversão" value={`${conversion}%`} sub="fechadas / decididas" icon={Percent} tone="violet" />
        <Kpi label="Perdidas" value={String(lostMonth.length)} sub={formatCurrency(sum(lostMonth, openVal))} icon={X} tone="gray" />
      </div>

      {/* Funil + ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-surface-border bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Funil de negociação</h3>
          <div className="space-y-3">
            {funnel.map(f => {
              const c = TEMPERATURE_COLOR[f.t]
              const Icon = f.t === 'hot' ? Flame : f.t === 'warm' ? Clock : Snowflake
              return (
                <div key={f.t} className="flex items-center gap-3">
                  <span className={cn('w-20 text-xs font-semibold flex items-center gap-1', c.text)}><Icon className="w-3.5 h-3.5" />{TEMPERATURE_LABEL[f.t]}</span>
                  <div className="flex-1 h-6 rounded-full bg-gray-100 overflow-hidden">
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
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Vendas no mês por colaborador</h3>
          <div className="space-y-2.5 max-h-48 overflow-y-auto">
            {byUser.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Sem dados no mês</p>}
            {byUser.map(x => (
              <div key={x.u.id} className="flex items-center gap-2">
                <Avatar user={x.u} size={24} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-700 truncate">{x.u.name.split(' ')[0]}</span>
                    <span className="text-xs font-bold text-emerald-600">{formatCurrency(x.closed)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-0.5">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(x.closed / maxClosed) * 100}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">pipeline {formatCurrency(x.pipeline)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filtros + abas */}
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

      <div className="flex gap-1 bg-surface-secondary rounded-lg p-1 w-fit flex-wrap">
        {([['close','🎯 Prioridade p/ fechar'],['hot','Quentes'],['warm','Mornos'],['cold','Frios'],['closed','Fechados no mês']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-all', tab === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>{l}</button>
        ))}
      </div>

      {/* Lista priorizada */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-border bg-surface text-left">
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Nº</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Cliente</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Temperatura</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Equipe</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-right">Valor</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">Nenhuma negociação</td></tr>}
            {list.map(q => {
              const c = q.temperature ? TEMPERATURE_COLOR[q.temperature as keyof typeof TEMPERATURE_COLOR] : null
              return (
                <tr key={q.id} className="border-b border-surface-border last:border-0 hover:bg-surface">
                  <td className="px-4 py-3"><Link href={`/quotes/${q.id}`} className="text-sm text-gray-500">#{String(q.number).padStart(3,'0')}</Link></td>
                  <td className="px-4 py-3">
                    <Link href={`/quotes/${q.id}`} className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-500 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                        {(q.client_name ?? '?').split(' ').slice(0,2).map((w: string) => w[0]).join('').toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-gray-900 truncate block">{q.client_name}</span>
                        {q.architect_name && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-xs text-gray-400 truncate">{q.architect_name}</span>
                            {getContactTypeLabel(q.architect_type) && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded shrink-0">
                                {getContactTypeLabel(q.architect_type)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {c ? <span className={cn('inline-flex text-xs font-medium px-2 py-1 rounded-full', c.bg, c.text)}>{TEMPERATURE_LABEL[q.temperature as keyof typeof TEMPERATURE_LABEL]}</span> : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center -space-x-1">
                      {(q.owners ?? []).slice(0,3).map((o: any) => <Avatar key={o.user_id} user={o} size={24} className="ring-1 ring-white" />)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right"><span className="text-sm font-semibold text-gray-800">{formatCurrency(q.final_value ?? q.quoted_value ?? 0)}</span></td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/quotes/${q.id}`} className="text-xs font-semibold text-brand-600 hover:text-brand-700">{q.temperature === 'closed' ? 'Ver' : 'Fechar →'}</Link>
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

function Kpi({ label, value, sub, icon: Icon, tone, onClick, active }: {
  label: string; value: string; sub: string; icon: any; tone: string; onClick?: () => void; active?: boolean
}) {
  const tones: Record<string, string> = {
    blue: 'text-blue-600 bg-blue-50', red: 'text-red-600 bg-red-50', emerald: 'text-emerald-600 bg-emerald-50',
    violet: 'text-violet-600 bg-violet-50', gray: 'text-gray-500 bg-gray-100',
  }
  return (
    <button onClick={onClick} disabled={!onClick}
      className={cn('text-left rounded-xl border bg-white p-4 transition-all',
        onClick && 'hover:shadow-sm cursor-pointer', active ? 'border-brand-300 ring-1 ring-brand-200' : 'border-surface-border')}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', tones[tone])}><Icon className="w-4 h-4" /></div>
      </div>
      <p className="text-lg font-bold text-gray-900 mt-2">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
    </button>
  )
}
