'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { QUOTE_STATUS_LABEL, STATUS_COLOR, PRIORITY_LABEL, PRIORITY_COLOR } from '@/types'
import { Search, Inbox, Loader, Eye, CheckCircle2, AlertTriangle, Zap, X } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'

// Operacional: orientado a status de TRABALHO do orçamento (não à negociação)
const TABS = [
  { key: 'todo',        label: 'A fazer' },
  { key: 'queue',       label: 'Na fila' },
  { key: 'in_progress', label: 'Em andamento' },
  { key: 'review',      label: 'Revisão' },
  { key: 'done',        label: 'Concluídos' },
  { key: 'all',         label: 'Todos' },
] as const
type TabKey = typeof TABS[number]['key']

const PRIO_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2 }

export function QuotesWorkspace({ allQuotes, users }: { allQuotes: any[]; users: any[] }) {
  const [tab, setTab] = useState<TabKey>('todo')
  const [search, setSearch] = useState('')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')

  const today = new Date().toISOString().split('T')[0]

  const base = useMemo(() => allQuotes.filter(q => {
    const mSearch = !search ||
      q.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      q.architect_name?.toLowerCase().includes(search.toLowerCase()) ||
      String(q.number).includes(search)
    const mOwner = ownerFilter === 'all' || (q.owners ?? []).some((o: any) => o.user_id === ownerFilter)
    return mSearch && mOwner
  }), [allQuotes, search, ownerFilter])

  const notDone = base.filter(q => q.status !== 'done')
  const counts = {
    queue: base.filter(q => q.status === 'queue').length,
    in_progress: base.filter(q => q.status === 'in_progress').length,
    review: base.filter(q => q.status === 'review').length,
    urgent: notDone.filter(q => q.priority === 'urgent').length,
    overdue: notDone.filter(q => q.deadline && q.deadline < today).length,
    done: base.filter(q => q.status === 'done').length,
  }

  // carga por colaborador (em aberto = não concluído)
  const byUser = users.map(u => ({
    u, count: notDone.filter(q => (q.owners ?? []).some((o: any) => o.user_id === u.id)).length,
  })).filter(x => x.count > 0).sort((a, b) => b.count - a.count)
  const maxUser = Math.max(1, ...byUser.map(x => x.count))

  let list = base
  if (tab === 'todo') list = notDone.slice().sort((a, b) =>
    (PRIO_ORDER[a.priority ?? 'normal'] - PRIO_ORDER[b.priority ?? 'normal']) ||
    ((a.deadline ?? '9999') < (b.deadline ?? '9999') ? -1 : 1))
  else if (tab !== 'all') list = base.filter(q => q.status === tab)

  return (
    <div className="space-y-5">
      {/* KPIs por status de trabalho */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Kpi label="Na fila" value={counts.queue} icon={Inbox} tone="blue" onClick={() => setTab('queue')} active={tab === 'queue'} />
        <Kpi label="Em andamento" value={counts.in_progress} icon={Loader} tone="amber" onClick={() => setTab('in_progress')} active={tab === 'in_progress'} />
        <Kpi label="Revisão" value={counts.review} icon={Eye} tone="violet" onClick={() => setTab('review')} active={tab === 'review'} />
        <Kpi label="Urgentes" value={counts.urgent} icon={Zap} tone="red" sub="não concluídos" />
        <Kpi label="Prazo vencido" value={counts.overdue} icon={AlertTriangle} tone="orange" alert={counts.overdue > 0} />
        <Kpi label="Concluídos" value={counts.done} icon={CheckCircle2} tone="emerald" onClick={() => setTab('done')} active={tab === 'done'} />
      </div>

      {/* Carga por colaborador */}
      {byUser.length > 0 && (
        <div className="rounded-xl border border-surface-border bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Carga de trabalho (em aberto)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
            {byUser.map(x => (
              <div key={x.u.id} className="flex items-center gap-2">
                <Avatar user={x.u} size={24} />
                <span className="text-xs font-medium text-gray-700 w-24 truncate">{x.u.name.split(' ')[0]}</span>
                <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${(x.count / maxUser) * 100}%` }} />
                </div>
                <span className="text-xs font-bold text-gray-600 w-6 text-right">{x.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
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
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-all',
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-border bg-surface text-left">
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Nº</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Cliente</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Prioridade</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Equipe</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Prazo</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum orçamento</td></tr>}
            {list.map(q => {
              const sc = STATUS_COLOR[q.status as keyof typeof STATUS_COLOR]
              const pc = PRIORITY_COLOR[q.priority as keyof typeof PRIORITY_COLOR]
              const overdue = q.status !== 'done' && q.deadline && q.deadline < today
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
                        {q.architect_name && <p className="text-xs text-gray-400 truncate">{q.architect_name}</p>}
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex text-xs font-medium px-2 py-1 rounded-full', sc?.bg, sc?.text)}>{QUOTE_STATUS_LABEL[q.status as keyof typeof QUOTE_STATUS_LABEL]}</span>
                  </td>
                  <td className="px-4 py-3">
                    {q.priority && q.priority !== 'normal'
                      ? <span className={cn('inline-flex text-xs font-medium px-2 py-1 rounded-full', pc?.bg, pc?.text)}>{PRIORITY_LABEL[q.priority as keyof typeof PRIORITY_LABEL]}</span>
                      : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center -space-x-1">
                      {(q.owners ?? []).slice(0,3).map((o: any) => <Avatar key={o.user_id} user={o} size={24} className="ring-1 ring-white" />)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {q.deadline ? <span className={cn('text-xs font-medium', overdue ? 'text-red-600' : 'text-gray-500')}>{overdue && '⚠️ '}{formatDate(q.deadline)}</span> : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right"><span className="text-sm font-semibold text-gray-800">{formatCurrency(q.final_value ?? q.quoted_value ?? 0)}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Kpi({ label, value, icon: Icon, tone, sub, onClick, active, alert }: {
  label: string; value: number; icon: any; tone: string; sub?: string; onClick?: () => void; active?: boolean; alert?: boolean
}) {
  const tones: Record<string, string> = {
    blue: 'text-blue-600 bg-blue-50', amber: 'text-amber-600 bg-amber-50', violet: 'text-violet-600 bg-violet-50',
    red: 'text-red-600 bg-red-50', orange: 'text-orange-600 bg-orange-50', emerald: 'text-emerald-600 bg-emerald-50',
  }
  return (
    <button onClick={onClick} disabled={!onClick}
      className={cn('text-left rounded-xl border bg-white p-4 transition-all',
        onClick && 'hover:shadow-sm cursor-pointer', active ? 'border-brand-300 ring-1 ring-brand-200' : 'border-surface-border', alert && 'border-orange-200')}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', tones[tone])}><Icon className="w-4 h-4" /></div>
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </button>
  )
}
