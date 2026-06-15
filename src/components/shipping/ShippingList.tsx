'use client'

import { useState, useTransition } from 'react'
import { completeShipment } from '@/lib/actions'
import type { Shipment } from '@/types'
import { SHIPMENT_STATUS_LABEL, SHIPMENT_PRIORITY_LABEL, SHIPMENT_DELIVERY_TYPE_LABEL, SHIPMENT_STATUS_COLOR, SHIPMENT_PRIORITY_COLOR } from '@/types'
import { ShippingModal } from './ShippingModal'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ShippingListProps {
  initialShipments: Shipment[]
}

export function ShippingList({ initialShipments }: ShippingListProps) {
  const [shipments, setShipments] = useState<any[]>(initialShipments)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [filterDeliveryType, setFilterDeliveryType] = useState<string | null>(null)
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null)
  const [pending, startTransition] = useTransition()

  const filtered = shipments.filter(s => {
    const matchSearch = (s.client_name || '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus ? s.separation_status === filterStatus : true
    const matchDelivery = filterDeliveryType ? s.delivery_type === filterDeliveryType : true
    return matchSearch && matchStatus && matchDelivery
  })

  // Stats
  const stats = {
    total: shipments.length,
    queued: shipments.filter(s => s.separation_status === 'queued').length,
    inProgress: shipments.filter(s => s.separation_status === 'in_progress').length,
    completed: shipments.filter(s => s.separation_status === 'completed').length,
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
    <>
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
          <p className="text-xs text-gray-500">Concluídas</p>
          <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
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
          <button
            onClick={() => setFilterStatus(null)}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
              filterStatus === null
                ? 'bg-brand-500 text-white border-brand-500'
                : 'bg-white text-gray-500 border-surface-border hover:border-gray-300'
            )}
          >
            Todos
          </button>
          <button
            onClick={() => setFilterStatus('queued')}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
              filterStatus === 'queued'
                ? 'bg-brand-500 text-white border-brand-500'
                : 'bg-white text-gray-500 border-surface-border hover:border-gray-300'
            )}
          >
            Na fila
          </button>
          <button
            onClick={() => setFilterStatus('in_progress')}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
              filterStatus === 'in_progress'
                ? 'bg-brand-500 text-white border-brand-500'
                : 'bg-white text-gray-500 border-surface-border hover:border-gray-300'
            )}
          >
            Em andamento
          </button>
          <button
            onClick={() => setFilterStatus('completed')}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
              filterStatus === 'completed'
                ? 'bg-brand-500 text-white border-brand-500'
                : 'bg-white text-gray-500 border-surface-border hover:border-gray-300'
            )}
          >
            Concluídas
          </button>
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
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Data</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Prioridade</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((shipment, idx) => (
                <tr key={shipment.id} onClick={() => setSelectedShipment(shipment)} className={cn('border-b border-surface-border hover:bg-surface transition-colors group cursor-pointer', idx === filtered.length - 1 && 'border-0')}>
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
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                        {SHIPMENT_DELIVERY_TYPE_LABEL[shipment.delivery_type as keyof typeof SHIPMENT_DELIVERY_TYPE_LABEL]}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {shipment.delivery_date
                      ? new Date(shipment.delivery_date).toLocaleDateString('pt-BR')
                      : '—'
                    }
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('badge text-xs', SHIPMENT_PRIORITY_COLOR[shipment.priority as keyof typeof SHIPMENT_PRIORITY_COLOR])}>
                      {SHIPMENT_PRIORITY_LABEL[shipment.priority as keyof typeof SHIPMENT_PRIORITY_LABEL]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('badge text-xs', SHIPMENT_STATUS_COLOR[shipment.separation_status as keyof typeof SHIPMENT_STATUS_COLOR])}>
                      {SHIPMENT_STATUS_LABEL[shipment.separation_status as keyof typeof SHIPMENT_STATUS_LABEL]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setSelectedShipment(shipment)}
                      className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
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
    </>
  )
}
