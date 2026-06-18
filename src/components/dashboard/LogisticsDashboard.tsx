'use client'

import { Package, CheckSquare, Clock, Truck } from 'lucide-react'
import { SHIPMENT_STATUS_LABEL, SHIPMENT_STATUS_COLOR, SHIPMENT_PRIORITY_COLOR, SHIPMENT_PRIORITY_LABEL } from '@/types'
import { cn } from '@/lib/utils'
import { WorkingDaysCard } from './WorkingDaysCard'

interface LogisticsDashboardProps {
  shipments: any[]
  tasks: any[]
  userName: string
}

export function LogisticsDashboard({ shipments, tasks, userName }: LogisticsDashboardProps) {
  const pending = shipments.filter(s => s.separation_status === 'queued').length
  const inProgress = shipments.filter(s => s.separation_status === 'in_progress').length
  const delivered = shipments.filter(s => s.separation_status === 'delivered' || s.is_completed).length
  const openTasks = tasks.filter(t => t.status !== 'done').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Olá, {userName.split(' ')[0]} 👋</h1>
        <p className="text-sm text-gray-500 mt-0.5">Painel de logística</p>
      </div>

      {/* Working days banner */}
      <WorkingDaysCard />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Package className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Na fila</p>
            <p className="text-2xl font-bold text-blue-600">{pending}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Em andamento</p>
            <p className="text-2xl font-bold text-amber-600">{inProgress}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Truck className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Entregues</p>
            <p className="text-2xl font-bold text-emerald-600">{delivered}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
            <CheckSquare className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Tarefas abertas</p>
            <p className="text-2xl font-bold text-purple-600">{openTasks}</p>
          </div>
        </div>
      </div>

      {/* Expedições recentes */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Expedições recentes</h2>
          <a href="/shipping" className="text-sm text-brand-600 hover:text-brand-700 font-medium">Ver todas →</a>
        </div>
        <div className="divide-y divide-surface-border">
          {shipments.slice(0, 8).map(s => {
            const sc = SHIPMENT_STATUS_COLOR[s.separation_status as keyof typeof SHIPMENT_STATUS_COLOR]
            const pc = SHIPMENT_PRIORITY_COLOR[s.priority as keyof typeof SHIPMENT_PRIORITY_COLOR]
            return (
              <div key={s.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold shrink-0">
                  {(s.client_name ?? '?').split(' ').slice(0,2).map((w: string) => w[0]).join('').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{s.client_name ?? '—'}</p>
                  <p className="text-xs text-gray-400">#{s.quote_number}</p>
                </div>
                <span className={cn('badge text-xs font-medium', pc?.bg, pc?.text)}>
                  {SHIPMENT_PRIORITY_LABEL[s.priority as keyof typeof SHIPMENT_PRIORITY_LABEL] ?? '—'}
                </span>
                <span className={cn('badge text-xs font-medium', sc?.bg, sc?.text)}>
                  {SHIPMENT_STATUS_LABEL[s.separation_status as keyof typeof SHIPMENT_STATUS_LABEL] ?? '—'}
                </span>
              </div>
            )
          })}
          {shipments.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">Nenhuma expedição</p>
          )}
        </div>
      </div>

      {/* Tarefas pendentes */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Minhas tarefas</h2>
          <a href="/dashboard/tasks" className="text-sm text-brand-600 hover:text-brand-700 font-medium">Ver todas →</a>
        </div>
        <div className="divide-y divide-surface-border">
          {tasks.filter(t => t.status !== 'done').slice(0, 8).map(t => (
            <div key={t.id} className="px-4 py-3 flex items-center gap-3">
              <div className="w-4 h-4 rounded border-2 border-gray-300 shrink-0" />
              <p className="text-sm text-gray-900 flex-1 truncate">{t.title}</p>
              {t.priority === 'urgent' && (
                <span className="badge text-xs bg-red-50 text-red-700">Urgente</span>
              )}
              {t.priority === 'high' && (
                <span className="badge text-xs bg-orange-50 text-orange-700">Alta</span>
              )}
            </div>
          ))}
          {tasks.filter(t => t.status !== 'done').length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">Nenhuma tarefa pendente</p>
          )}
        </div>
      </div>
    </div>
  )
}
