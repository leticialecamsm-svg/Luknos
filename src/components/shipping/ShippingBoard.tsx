'use client'

import { useState } from 'react'
import { ShippingCard } from './ShippingCard'
import { ShippingModal } from './ShippingModal'
import type { Shipment, ShipmentStatus } from '@/types'
import { SHIPMENT_STATUS_LABEL } from '@/types'

interface ShippingBoardProps {
  initialShipments: Shipment[]
}

const COLUMNS: ShipmentStatus[] = ['queued', 'in_progress', 'awaiting_material', 'completed']

export function ShippingBoard({ initialShipments }: ShippingBoardProps) {
  const [shipments, setShipments] = useState(initialShipments)
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null)
  const [draggedShipment, setDraggedShipment] = useState<Shipment | null>(null)

  const handleDragStart = (e: React.DragEvent, shipment: Shipment) => {
    setDraggedShipment(shipment)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e: React.DragEvent, status: ShipmentStatus) => {
    e.preventDefault()
    if (!draggedShipment) return

    setShipments(prev =>
      prev.map(s =>
        s.id === draggedShipment.id ? { ...s, separation_status: status } : s
      )
    )
    setDraggedShipment(null)

    // Update in database (async, no await to avoid blocking UI)
    const { updateShipment } = await import('@/lib/actions')
    updateShipment(draggedShipment.id, { separation_status: status }).catch(console.error)
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {COLUMNS.map(status => {
          const statusShipments = shipments.filter(s => s.separation_status === status && !s.is_completed)
          const count = statusShipments.length

          return (
            <div key={status} className="space-y-3">
              {/* Column Header */}
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">{SHIPMENT_STATUS_LABEL[status]}</h3>
                <span className="inline-block bg-gray-200 text-gray-700 text-xs font-bold px-2.5 py-1 rounded-full">
                  {count}
                </span>
              </div>

              {/* Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDrop={e => handleDrop(e, status)}
                className="space-y-2 min-h-96 bg-surface rounded-lg p-3 border-2 border-dashed border-surface-border hover:border-brand-300 transition-colors"
              >
                {statusShipments.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                    Arraste expedições aqui
                  </div>
                ) : (
                  statusShipments.map(shipment => (
                    <div key={shipment.id} onClick={() => setSelectedShipment(shipment)}>
                      <ShippingCard
                        shipment={shipment}
                        draggable={true}
                        onDragStart={(e) => handleDragStart(e, shipment)}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal */}
      {selectedShipment && (
        <ShippingModal
          shipment={selectedShipment}
          onClose={() => setSelectedShipment(null)}
          onSave={() => setSelectedShipment(null)}
          onComplete={() => {
            setShipments(prev => prev.map(s =>
              s.id === selectedShipment.id ? { ...s, is_completed: true, completed_at: new Date().toISOString() } : s
            ))
            setSelectedShipment(null)
          }}
        />
      )}
    </>
  )
}
