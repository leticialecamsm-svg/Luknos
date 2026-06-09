'use client'

import { useState } from 'react'
import { ShippingList } from './ShippingList'
import { ShippingBoard } from './ShippingBoard'
import type { Shipment } from '@/types'
import { LayoutList, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ShippingContainerProps {
  initialShipments: Shipment[]
}

export function ShippingContainer({ initialShipments }: ShippingContainerProps) {
  const [activeTab, setActiveTab] = useState<'list' | 'kanban'>('list')

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-surface-border">
        <button
          onClick={() => setActiveTab('list')}
          className={cn(
            'px-4 py-3 text-sm font-medium transition-all flex items-center gap-2 border-b-2',
            activeTab === 'list'
              ? 'text-brand-600 border-brand-600'
              : 'text-gray-500 border-transparent hover:text-gray-700'
          )}
        >
          <LayoutList className="w-4 h-4" />
          Lista
        </button>
        <button
          onClick={() => setActiveTab('kanban')}
          className={cn(
            'px-4 py-3 text-sm font-medium transition-all flex items-center gap-2 border-b-2',
            activeTab === 'kanban'
              ? 'text-brand-600 border-brand-600'
              : 'text-gray-500 border-transparent hover:text-gray-700'
          )}
        >
          <LayoutGrid className="w-4 h-4" />
          Kanban
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'list' && <ShippingList initialShipments={initialShipments} />}
      {activeTab === 'kanban' && <ShippingBoard initialShipments={initialShipments} />}
    </div>
  )
}
