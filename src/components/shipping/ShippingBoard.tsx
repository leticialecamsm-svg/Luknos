'use client'

import { useState } from 'react'
import { ShippingCard } from './ShippingCard'
import { ShippingModal } from './ShippingModal'
import { ShippingViewModal } from './ShippingViewModal'
import type { ShipmentStatus } from '@/types'
import { SHIPMENT_STATUS_LABEL } from '@/types'
import { cn } from '@/lib/utils'

interface ShippingBoardProps {
  initialShipments: any[]
  filterYear: number
  filterMonth: number // 1-based
}

const COLUMNS: { status: ShipmentStatus; color: string; bg: string; header: string; text: string }[] = [
  { status: 'queued',            color: 'border-blue-200',   bg: 'bg-blue-50/50',   header: 'bg-blue-100',   text: 'text-blue-700' },
  { status: 'in_progress',       color: 'border-amber-200',  bg: 'bg-amber-50/50',  header: 'bg-amber-100',  text: 'text-amber-700' },
  { status: 'awaiting_material', color: 'border-orange-200', bg: 'bg-orange-50/50', header: 'bg-orange-100', text: 'text-orange-700' },
  { status: 'completed',         color: 'border-green-200',  bg: 'bg-green-50/50',  header: 'bg-green-100',  text: 'text-green-700' },
  { status: 'delivered',         color: 'border-emerald-200',bg: 'bg-emerald-50/50',header: 'bg-emerald-100',text: 'text-emerald-700' },
]

export function ShippingBoard({ initialShipments, filterYear, filterMonth }: ShippingBoardProps) {
  const [shipments, setShipments] = useState<any[]>(initialShipments)
  const [viewingShipment, setViewingShipment] = useState<any | null>(null)
  const [editingShipment, setEditingShipment] = useState<any | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)

  const monthShipments = shipments.filter(s => {
    const d = s.created_at ? new Date(s.created_at) : null
    return d ? (d.getFullYear() === filterYear && d.getMonth() + 1 === filterMonth) : true
  })

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDrop = async (e: React.DragEvent, status: ShipmentStatus) => {
    e.preventDefault()
    if (!draggedId) return
    setShipments(prev => prev.map(s => s.id === draggedId ? { ...s, separation_status: status } : s))
    const id = draggedId
    setDraggedId(null)
    const { updateShipment } = await import('@/lib/actions')
    updateShipment(id, { separation_status: status }).catch(console.error)
  }

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLUMNS.map(col => {
          const cards = monthShipments.filter(s => s.separation_status === col.status)

          return (
            <div key={col.status}
              className={cn('rounded-xl border-2 flex flex-col transition-all min-w-[220px] w-[220px] flex-shrink-0', col.color, col.bg)}
              onDragOver={e => e.preventDefault()}
              onDrop={e => handleDrop(e, col.status)}
            >
              <div className={cn('px-3 py-2.5 rounded-t-xl', col.header)}>
                <div className="flex items-center justify-between">
                  <span className={cn('text-xs font-semibold', col.text)}>{SHIPMENT_STATUS_LABEL[col.status]}</span>
                  <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded-full bg-white/70', col.text)}>{cards.length}</span>
                </div>
              </div>

              <div className="p-2 space-y-2 flex-1 min-h-[500px]">
                {cards.length === 0 && (
                  <div className="h-16 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center">
                    <p className="text-xs text-gray-300">Arraste expedições aqui</p>
                  </div>
                )}
                {cards.map(shipment => (
                  <div
                    key={shipment.id}
                    draggable
                    onDragStart={e => handleDragStart(e, shipment.id)}
                    onClick={() => setViewingShipment(shipment)}
                    className={cn('cursor-grab active:cursor-grabbing', draggedId === shipment.id && 'opacity-50')}
                  >
                    <ShippingCard shipment={shipment} draggable={false} onDragStart={() => {}} />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal de visualização (abre ao clicar) */}
      {viewingShipment && (
        <ShippingViewModal
          shipment={viewingShipment}
          onClose={() => setViewingShipment(null)}
          onEdit={() => { setEditingShipment(viewingShipment); setViewingShipment(null) }}
        />
      )}

      {/* Modal de edição */}
      {editingShipment && (
        <ShippingModal
          shipment={editingShipment}
          onClose={() => setEditingShipment(null)}
          onSave={(updated) => {
            setShipments(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s))
            setEditingShipment(null)
          }}
          onComplete={() => {
            setShipments(prev => prev.map(s =>
              s.id === editingShipment.id ? { ...s, is_completed: true, completed_at: new Date().toISOString() } : s
            ))
            setEditingShipment(null)
          }}
        />
      )}
    </>
  )
}
