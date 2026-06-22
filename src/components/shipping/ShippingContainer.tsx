'use client'

import { useState } from 'react'
import { ShippingList } from './ShippingList'
import { ShippingBoard } from './ShippingBoard'
import type { Shipment } from '@/types'
import { LayoutList, LayoutGrid, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

interface ShippingContainerProps {
  initialShipments: Shipment[]
}

export function ShippingContainer({ initialShipments }: ShippingContainerProps) {
  const now = new Date()
  const [activeTab, setActiveTab] = useState<'list' | 'kanban'>('list')
  const [filterYear, setFilterYear] = useState(now.getFullYear())
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1)

  function prevMonth() {
    if (filterMonth === 1) { setFilterMonth(12); setFilterYear(y => y - 1) }
    else setFilterMonth(m => m - 1)
  }
  function nextMonth() {
    if (filterMonth === 12) { setFilterMonth(1); setFilterYear(y => y + 1) }
    else setFilterMonth(m => m + 1)
  }

  return (
    <div className="space-y-4">
      {/* Abas + calendário (mesma linha) */}
      <div className="flex items-center justify-between border-b border-surface-border">
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('list')}
            className={cn('px-4 py-3 text-sm font-medium transition-all flex items-center gap-2 border-b-2',
              activeTab === 'list' ? 'text-brand-600 border-brand-600' : 'text-gray-500 border-transparent hover:text-gray-700')}>
            <LayoutList className="w-4 h-4" /> Lista
          </button>
          <button onClick={() => setActiveTab('kanban')}
            className={cn('px-4 py-3 text-sm font-medium transition-all flex items-center gap-2 border-b-2',
              activeTab === 'kanban' ? 'text-brand-600 border-brand-600' : 'text-gray-500 border-transparent hover:text-gray-700')}>
            <LayoutGrid className="w-4 h-4" /> Kanban
          </button>
        </div>

        <div className="flex items-center gap-1 bg-white border border-surface-border rounded-xl px-2 py-1.5 mb-1">
          <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-gray-700 px-2 min-w-[150px] text-center">
            {MONTHS_PT[filterMonth - 1]} de {filterYear}
          </span>
          <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {activeTab === 'list'
        ? <ShippingList initialShipments={initialShipments} filterYear={filterYear} filterMonth={filterMonth} />
        : <ShippingBoard initialShipments={initialShipments} filterYear={filterYear} filterMonth={filterMonth} />
      }
    </div>
  )
}
