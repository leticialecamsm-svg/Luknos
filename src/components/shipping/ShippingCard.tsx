'use client'

import { Shipment, SHIPMENT_STATUS_LABEL, SHIPMENT_PRIORITY_LABEL, SHIPMENT_DELIVERY_TYPE_LABEL, SHIPMENT_STATUS_COLOR, SHIPMENT_PRIORITY_COLOR } from '@/types'
import { cn } from '@/lib/utils'

interface ShippingCardProps {
  shipment: Shipment & { client_name?: string; quote_number?: number; quoted_value?: number }
  onClick?: () => void
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
}

export function ShippingCard({ shipment, onClick, draggable = false, onDragStart }: ShippingCardProps) {
  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      className={cn(
        'card p-4 hover:shadow-md transition-all space-y-3',
        draggable && 'cursor-grab active:cursor-grabbing',
        onClick && 'cursor-pointer'
      )}
    >
      {/* Header */}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-gray-900">{shipment.client_name || 'Cliente'}</p>
        <p className="text-xs text-gray-500">Orçamento #{shipment.quote_number}</p>
      </div>

      {/* Valor */}
      {shipment.quoted_value && (
        <p className="text-sm font-bold text-brand-600">
          R$ {shipment.quoted_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </p>
      )}

      {/* Delivery Type */}
      {shipment.delivery_type && (
        <span className="inline-block badge text-xs bg-blue-50 text-blue-700">
          {SHIPMENT_DELIVERY_TYPE_LABEL[shipment.delivery_type as keyof typeof SHIPMENT_DELIVERY_TYPE_LABEL]}
        </span>
      )}

      {/* Data */}
      {shipment.delivery_date && (
        <p className="text-xs text-gray-600">
          📅 {new Date(shipment.delivery_date).toLocaleDateString('pt-BR')}
        </p>
      )}

      {/* Status and Priority */}
      <div className="flex gap-2 flex-wrap">
        <span className={cn('badge text-xs', SHIPMENT_STATUS_COLOR[shipment.separation_status])}>
          {SHIPMENT_STATUS_LABEL[shipment.separation_status]}
        </span>
        <span className={cn('badge text-xs', SHIPMENT_PRIORITY_COLOR[shipment.priority])}>
          {SHIPMENT_PRIORITY_LABEL[shipment.priority]}
        </span>
      </div>

      {/* Completed indicator */}
      {shipment.is_completed && (
        <p className="text-xs text-green-600 font-semibold">✓ Finalizada</p>
      )}
    </div>
  )
}
