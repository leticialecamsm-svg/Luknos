'use client'

import { useMemo } from 'react'
import { CalendarDays } from 'lucide-react'

function calcWorkingDaysLeft() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const lastDay = new Date(year, month + 1, 0).getDate()
  let remaining = 0, total = 0
  for (let d = 1; d <= lastDay; d++) {
    const dow = new Date(year, month, d).getDay()
    if (dow !== 0) { // domingo não conta, sábado sim
      total++
      if (d > now.getDate()) remaining++
    }
  }
  return { remaining, total }
}

export function WorkingDaysCard() {
  const { remaining, total } = useMemo(calcWorkingDaysLeft, [])
  const pct = total > 0 ? Math.round(((total - remaining) / total) * 100) : 0
  const urgent = remaining <= 3

  return (
    <div className={`flex items-center gap-4 px-4 py-3 rounded-xl border ${urgent ? 'bg-red-50 border-red-200' : 'bg-white border-surface-border'}`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${urgent ? 'bg-red-100' : 'bg-brand-50'}`}>
        <CalendarDays className={`w-5 h-5 ${urgent ? 'text-red-500' : 'text-brand-500'}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">Dias úteis restantes no mês</p>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className={`text-2xl font-bold leading-none ${urgent ? 'text-red-600' : 'text-gray-900'}`}>{remaining}</span>
          <span className="text-xs text-gray-400">de {total}</span>
        </div>
      </div>
      <div className="flex-1 min-w-[80px]">
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div className={`h-1.5 rounded-full ${urgent ? 'bg-red-400' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[10px] text-gray-400 mt-1">{pct}% do mês passou</p>
      </div>
    </div>
  )
}
