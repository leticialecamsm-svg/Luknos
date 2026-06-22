'use client'

import { useState, useTransition } from 'react'
import { completeShipment } from '@/lib/actions'
import { SHIPMENT_STATUS_LABEL, SHIPMENT_PRIORITY_LABEL, SHIPMENT_DELIVERY_TYPE_LABEL, SHIPMENT_STATUS_COLOR, SHIPMENT_PRIORITY_COLOR } from '@/types'
import { ShippingModal } from './ShippingModal'
import { ShippingViewModal } from './ShippingViewModal'
import { Search, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'

const STATUS_FILTER_OPTIONS = [
  { value: null,              label: 'Todos' },
  { value: 'queued',         label: 'Na fila' },
  { value: 'in_progress',    label: 'Em andamento' },
  { value: 'awaiting_material', label: 'Aguard. material' },
  { value: 'completed',      label: 'Concluídas' },
  { value: 'delivered',      label: 'Entregue/Retirada' },
]

interface ShippingListProps {
  initialShipments: any[]
  filterYear: number
  filterMonth: number // 1-based
}

export function ShippingList({ initialShipments, filterYear, filterMonth }: ShippingListProps) {
  const [shipments, setShipments] = useState<any[]>(initialShipments)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [viewingShipment, setViewingShipment] = useState<any | null>(null)
  const [selectedShipment, setSelectedShipment] = useState<any | null>(null)
  const [pending, startTransition] = useTransition()

  const filtered = shipments.filter(s => {
    const matchSearch = (s.client_name || '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus ? s.separation_status === filterStatus : true
    // Filter by sale close date (created_at as proxy — negotiations closed_at not in shipment)
    const closedAt = s.created_at ? new Date(s.created_at) : null
    const matchMonth = closedAt
      ? closedAt.getFullYear() === filterYear && closedAt.getMonth() + 1 === filterMonth
      : true
    return matchSearch && matchStatus && matchMonth
  })

  const stats = {
    total:      filtered.length,
    queued:     filtered.filter(s => s.separation_status === 'queued').length,
    inProgress: filtered.filter(s => s.separation_status === 'in_progress').length,
    delivered:  filtered.filter(s => s.separation_status === 'delivered').length,
  }

  const handleComplete = (shipmentId: string) => {
    startTransition(async () => {
      try {
        await completeShipment(shipmentId)
        setShipments(prev => prev.map(s =>
          s.id === shipmentId ? { ...s, is_completed: true, completed_at: new Date().toISOString() } : s
        ))
        setSelectedShipment(null)
      } catch (err) {
        console.error('Failed to complete shipment:', err)
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-3">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-gray-500">Na fila</p>
          <p className="text-2xl font-bold text-blue-600">{stats.queued}</p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-gray-500">Em andamento</p>
          <p className="text-2xl font-bold text-amber-600">{stats.inProgress}</p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-gray-500">Entregues</p>
          <p className="text-2xl font-bold text-emerald-600">{stats.delivered}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por cliente..."
            className="input pl-9"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTER_OPTIONS.map(opt => (
            <button
              key={String(opt.value)}
              onClick={() => setFilterStatus(opt.value)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                filterStatus === opt.value
                  ? 'bg-brand-500 text-white border-brand-500'
                  : 'bg-white text-gray-500 border-surface-border hover:border-gray-300'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-border bg-surface">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Orçamento</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Valor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Entrega</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Data entrega</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Prioridade</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Resp.</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">
                    Nenhuma expedição neste mês
                  </td>
                </tr>
              )}
              {filtered.map((shipment, idx) => {
                const statusColor = SHIPMENT_STATUS_COLOR[shipment.separation_status as keyof typeof SHIPMENT_STATUS_COLOR]
                const priorityColor = SHIPMENT_PRIORITY_COLOR[shipment.priority as keyof typeof SHIPMENT_PRIORITY_COLOR]
                return (
                  <tr key={shipment.id} onClick={() => setViewingShipment(shipment)}
                    className={cn('border-b border-surface-border hover:bg-surface transition-colors cursor-pointer', idx === filtered.length - 1 && 'border-0')}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold shrink-0">
                          {(shipment.client_name ?? '?').split(' ').slice(0,2).map((w: string) => w[0]).join('').toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{shipment.client_name ?? '—'}</p>
                          {shipment.architect_name && (
                            <p className="text-xs text-gray-400">Arq. {shipment.architect_name}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">#{shipment.quote_number}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-brand-600">
                      R$ {(shipment.quoted_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      {shipment.delivery_type ? (
                        <span className="badge text-xs bg-blue-50 text-blue-700">
                          {SHIPMENT_DELIVERY_TYPE_LABEL[shipment.delivery_type as keyof typeof SHIPMENT_DELIVERY_TYPE_LABEL]}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {shipment.delivery_date ? new Date(shipment.delivery_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('badge text-xs font-semibold', priorityColor?.bg, priorityColor?.text)}>
                        {SHIPMENT_PRIORITY_LABEL[shipment.priority as keyof typeof SHIPMENT_PRIORITY_LABEL] ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('badge text-xs font-semibold', statusColor?.bg, statusColor?.text)}>
                        {SHIPMENT_STATUS_LABEL[shipment.separation_status as keyof typeof SHIPMENT_STATUS_LABEL] ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {shipment.owner
                        ? <Avatar user={shipment.owner} size={26} title={shipment.owner.name} />
                        : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedShipment(shipment)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-700"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {viewingShipment && !selectedShipment && (
        <ShippingViewModal
          shipment={viewingShipment}
          onClose={() => setViewingShipment(null)}
          onEdit={() => { setSelectedShipment(viewingShipment); setViewingShipment(null) }}
        />
      )}

      {selectedShipment && (
        <ShippingModal
          shipment={selectedShipment}
          onClose={() => setSelectedShipment(null)}
          onSave={(updated) => {
            setShipments(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s))
            setSelectedShipment(null)
          }}
          onComplete={() => handleComplete(selectedShipment.id)}
        />
      )}
    </div>
  )
}
