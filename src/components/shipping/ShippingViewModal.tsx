'use client'

import { X, ExternalLink, Package, Truck, Calendar, MapPin, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import { SHIPMENT_STATUS_LABEL, SHIPMENT_PRIORITY_LABEL, SHIPMENT_DELIVERY_TYPE_LABEL, SHIPMENT_STATUS_COLOR, SHIPMENT_PRIORITY_COLOR } from '@/types'

interface ShippingViewModalProps {
  shipment: any
  onClose: () => void
  onEdit: () => void
}

export function ShippingViewModal({ shipment, onClose, onEdit }: ShippingViewModalProps) {
  const statusColor  = SHIPMENT_STATUS_COLOR[shipment.separation_status as keyof typeof SHIPMENT_STATUS_COLOR]
  const priorityColor = SHIPMENT_PRIORITY_COLOR[shipment.priority as keyof typeof SHIPMENT_PRIORITY_COLOR]

  const initials = (shipment.client_name ?? '?')
    .split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()

  const deliveryDateFmt = shipment.delivery_date
    ? new Date(shipment.delivery_date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : null

  const closedAtFmt = shipment.created_at
    ? new Date(shipment.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-surface-border px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-sm font-bold shrink-0">
              {initials}
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">{shipment.client_name ?? '—'}</h2>
              {shipment.architect_name && (
                <p className="text-xs text-gray-400">{shipment.architect_name}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="btn-secondary text-sm px-3 py-1.5">Editar</button>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Status + Prioridade */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('badge text-xs font-semibold', statusColor?.bg, statusColor?.text)}>
              {SHIPMENT_STATUS_LABEL[shipment.separation_status as keyof typeof SHIPMENT_STATUS_LABEL] ?? '—'}
            </span>
            <span className={cn('badge text-xs font-semibold', priorityColor?.bg, priorityColor?.text)}>
              {SHIPMENT_PRIORITY_LABEL[shipment.priority as keyof typeof SHIPMENT_PRIORITY_LABEL] ?? '—'}
            </span>
            {shipment.is_completed && (
              <span className="inline-flex items-center gap-1 badge text-xs font-semibold bg-emerald-50 text-emerald-700">
                <Check className="w-3 h-3" /> Entregue
              </span>
            )}
          </div>

          {/* Orçamento + Valor */}
          <div className="card p-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Orçamento</p>
              <p className="text-sm font-semibold text-gray-900">#{shipment.quote_number}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Valor</p>
              <p className="text-sm font-semibold text-brand-600">
                {shipment.quoted_value
                  ? `R$ ${Number(shipment.quoted_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : '—'}
              </p>
            </div>
          </div>

          {/* Responsável */}
          {shipment.owner && (
            <div className="card p-4 flex items-center gap-3">
              <Avatar user={shipment.owner} size={36} />
              <div>
                <p className="text-xs text-gray-400">Responsável pela venda</p>
                <p className="text-sm font-semibold text-gray-900">{shipment.owner.name}</p>
              </div>
            </div>
          )}

          {/* Entrega */}
          <div className="card p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Entrega</p>

            <div className="flex items-center gap-3">
              {shipment.delivery_type === 'delivery' ? (
                <Truck className="w-4 h-4 text-brand-500 shrink-0" />
              ) : shipment.delivery_type === 'pickup' ? (
                <MapPin className="w-4 h-4 text-brand-500 shrink-0" />
              ) : (
                <Package className="w-4 h-4 text-gray-400 shrink-0" />
              )}
              <span className="text-sm text-gray-800">
                {shipment.delivery_type
                  ? SHIPMENT_DELIVERY_TYPE_LABEL[shipment.delivery_type as keyof typeof SHIPMENT_DELIVERY_TYPE_LABEL]
                  : <span className="text-gray-400">Tipo não definido</span>}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-brand-500 shrink-0" />
              <span className="text-sm text-gray-800">
                {deliveryDateFmt ?? <span className="text-gray-400">Data não definida</span>}
              </span>
            </div>
          </div>

          {/* Link Drive */}
          {shipment.drive_link ? (
            <div className="card p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Separação</p>
              <a href={shipment.drive_link} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700 font-medium">
                <ExternalLink className="w-4 h-4" />
                Abrir pasta de separação
              </a>
            </div>
          ) : null}

          {/* Datas */}
          <div className="text-xs text-gray-400 space-y-1">
            {closedAtFmt && <p>Venda fechada em {closedAtFmt}</p>}
            {shipment.completed_at && (
              <p>Entregue em {new Date(shipment.completed_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
