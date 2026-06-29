'use client'

import { useState, useMemo } from 'react'
import { SHIPMENT_STATUS_LABEL, SHIPMENT_PRIORITY_LABEL, SHIPMENT_DELIVERY_TYPE_LABEL, SHIPMENT_STATUS_COLOR, SHIPMENT_PRIORITY_COLOR } from '@/types'
import { Search, Package, AlertTriangle, CalendarClock, Loader, Truck, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const TODO_STATUSES = ['queued', 'in_progress', 'awaiting_material']
const PRIO_ORDER: Record<string, number> = { high: 0, mid: 1, low: 2 }

const TABS = [
  { key: 'todo',              label: 'A fazer' },
  { key: 'overdue',          label: 'Atrasadas' },
  { key: 'today',            label: 'Para hoje' },
  { key: 'queued',           label: 'Na fila' },
  { key: 'awaiting_material', label: 'Aguard. material' },
  { key: 'delivered',        label: 'Entregues' },
  { key: 'all',              label: 'Todas' },
] as const
type TabKey = typeof TABS[number]['key']

function isDone(s: any) { return s.separation_status === 'delivered' || s.is_completed }

export function ShippingWorkspace({ initialShipments }: { initialShipments: any[] }) {
  const [tab, setTab] = useState<TabKey>('todo')
  const [search, setSearch] = useState('')
  const [prio, setPrio] = useState<string>('all')

  const today = new Date().toISOString().split('T')[0]

  const base = useMemo(() => initialShipments.filter(s => {
    const mSearch = !search || (s.client_name ?? '').toLowerCase().includes(search.toLowerCase()) || String(s.quote_number ?? '').includes(search)
    const mPrio = prio === 'all' || s.priority === prio
    return mSearch && mPrio
  }), [initialShipments, search, prio])

  const todo = base.filter(s => !isDone(s) && TODO_STATUSES.includes(s.separation_status))
  const overdue = todo.filter(s => s.delivery_date && s.delivery_date < today)
  const todayList = todo.filter(s => s.delivery_date === today)

  const counts = {
    todo: todo.length,
    overdue: overdue.length,
    today: todayList.length,
    awaiting: base.filter(s => s.separation_status === 'awaiting_material' && !isDone(s)).length,
    delivered: base.filter(s => isDone(s)).length,
  }

  let list = base
  if (tab === 'todo') list = todo.slice().sort((a, b) =>
    (PRIO_ORDER[a.priority ?? 'mid'] - PRIO_ORDER[b.priority ?? 'mid']) ||
    ((a.delivery_date ?? '9999') < (b.delivery_date ?? '9999') ? -1 : 1))
  else if (tab === 'overdue') list = overdue
  else if (tab === 'today') list = todayList
  else if (tab === 'queued') list = base.filter(s => s.separation_status === 'queued')
  else if (tab === 'awaiting_material') list = base.filter(s => s.separation_status === 'awaiting_material')
  else if (tab === 'delivered') list = base.filter(s => isDone(s))

  return (
    <div className="space-y-5">
      {/* KPIs proativos */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="A fazer" value={counts.todo} icon={Package} tone="blue" onClick={() => setTab('todo')} active={tab === 'todo'} />
        <Kpi label="Atrasadas" value={counts.overdue} icon={AlertTriangle} tone="red" alert={counts.overdue > 0} onClick={() => setTab('overdue')} active={tab === 'overdue'} />
        <Kpi label="Para hoje" value={counts.today} icon={CalendarClock} tone="amber" onClick={() => setTab('today')} active={tab === 'today'} />
        <Kpi label="Aguard. material" value={counts.awaiting} icon={Loader} tone="orange" onClick={() => setTab('awaiting_material')} active={tab === 'awaiting_material'} />
        <Kpi label="Entregues" value={counts.delivered} icon={Truck} tone="emerald" onClick={() => setTab('delivered')} active={tab === 'delivered'} />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente ou nº..." className="input pl-9 pr-8" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-2.5 text-gray-400"><X className="w-4 h-4" /></button>}
        </div>
        <select value={prio} onChange={e => setPrio(e.target.value)} className="select max-w-[160px]">
          <option value="all">Toda prioridade</option>
          <option value="high">Alta</option>
          <option value="mid">Média</option>
          <option value="low">Baixa</option>
        </select>
      </div>

      <div className="flex gap-1 bg-surface-secondary rounded-lg p-1 w-fit flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-all', tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>{t.label}</button>
        ))}
      </div>

      {/* Lista */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-border bg-surface text-left">
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Cliente</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Orç.</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Entrega</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Data</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Prioridade</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">Nenhuma expedição</td></tr>}
            {list.map(s => {
              const sc = SHIPMENT_STATUS_COLOR[s.separation_status as keyof typeof SHIPMENT_STATUS_COLOR]
              const pc = SHIPMENT_PRIORITY_COLOR[s.priority as keyof typeof SHIPMENT_PRIORITY_COLOR]
              const overdueRow = !isDone(s) && s.delivery_date && s.delivery_date < today
              return (
                <tr key={s.id} className="border-b border-surface-border last:border-0 hover:bg-surface">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0">
                        {(s.client_name ?? '?').split(' ').slice(0,2).map((w: string) => w[0]).join('').toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{s.client_name ?? '—'}</p>
                        {s.architect_name && <p className="text-xs text-gray-400 truncate">{s.architect_name}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">#{s.quote_number}</td>
                  <td className="px-4 py-3">
                    {s.delivery_type ? <span className="badge text-xs bg-blue-50 text-blue-700">{SHIPMENT_DELIVERY_TYPE_LABEL[s.delivery_type as keyof typeof SHIPMENT_DELIVERY_TYPE_LABEL]}</span> : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {s.delivery_date ? <span className={cn('text-xs font-medium', overdueRow ? 'text-red-600' : 'text-gray-600')}>{overdueRow && '⚠️ '}{new Date(s.delivery_date + 'T00:00:00').toLocaleDateString('pt-BR')}</span> : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3"><span className={cn('badge text-xs font-semibold', pc?.bg, pc?.text)}>{SHIPMENT_PRIORITY_LABEL[s.priority as keyof typeof SHIPMENT_PRIORITY_LABEL] ?? '—'}</span></td>
                  <td className="px-4 py-3"><span className={cn('badge text-xs font-semibold', sc?.bg, sc?.text)}>{SHIPMENT_STATUS_LABEL[s.separation_status as keyof typeof SHIPMENT_STATUS_LABEL] ?? '—'}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Kpi({ label, value, icon: Icon, tone, onClick, active, alert }: {
  label: string; value: number; icon: any; tone: string; onClick?: () => void; active?: boolean; alert?: boolean
}) {
  const tones: Record<string, string> = {
    blue: 'text-blue-600 bg-blue-50', red: 'text-red-600 bg-red-50', amber: 'text-amber-600 bg-amber-50',
    orange: 'text-orange-600 bg-orange-50', emerald: 'text-emerald-600 bg-emerald-50',
  }
  return (
    <button onClick={onClick} disabled={!onClick}
      className={cn('text-left rounded-xl border bg-white p-4 transition-all',
        onClick && 'hover:shadow-sm cursor-pointer', active ? 'border-brand-300 ring-1 ring-brand-200' : 'border-surface-border', alert && 'border-red-200')}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', tones[tone])}><Icon className="w-4 h-4" /></div>
      </div>
      <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
    </button>
  )
}
