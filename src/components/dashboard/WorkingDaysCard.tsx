'use client'

import { useMemo } from 'react'
import { CalendarDays } from 'lucide-react'

function calcWorkingDaysLeft(): { remaining: number; total: number } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  // Last day of current month
  const lastDay = new Date(year, month + 1, 0).getDate()

  let remaining = 0
  let total = 0

  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(year, month, d)
    const dow = date.getDay()
    if (dow !== 0 && dow !== 6) {
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
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <CalendarDays className="w-4 h-4 text-brand-500" />
          Dias úteis restantes
        </div>
        <span className="text-xs text-gray-400">este mês</span>
      </div>

      <div className="flex items-end justify-between">
        <span className={`text-4xl font-bold ${urgent ? 'text-red-600' : 'text-gray-900'}`}>
          {remaining}
        </span>
        <span className="text-sm text-gray-400 mb-1">de {total} dias úteis</span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${urgent ? 'bg-red-500' : 'bg-brand-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="text-xs text-gray-400">
        {remaining === 0
          ? 'Mês encerrado'
          : urgent
          ? `Atenção: restam apenas ${remaining} dia${remaining > 1 ? 's' : ''} útil${remaining > 1 ? 'is' : ''}`
          : `${pct}% do mês já passou`}
      </p>
    </div>
  )
}
