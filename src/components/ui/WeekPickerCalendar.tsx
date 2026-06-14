'use client'

import { useState, useRef, useEffect } from 'react'

interface WeekPickerCalendarProps {
  weekOffset: number
  onChange: (offset: number) => void
}

function getSundayOfWeek(offset: number): Date {
  const today = new Date()
  const day = today.getDay() // 0=Sun
  const sun = new Date(today)
  sun.setDate(today.getDate() - day + offset * 7)
  sun.setHours(0, 0, 0, 0)
  return sun
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DAYS_PT = ['D','S','T','Q','Q','S','S']

export function WeekPickerCalendar({ weekOffset, onChange }: WeekPickerCalendarProps) {
  const [open, setOpen] = useState(false)
  const [hoverDate, setHoverDate] = useState<Date | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Calendar view state — month/year being displayed
  const selectedSun = getSundayOfWeek(weekOffset)
  const [viewYear, setViewYear] = useState(selectedSun.getFullYear())
  const [viewMonth, setViewMonth] = useState(selectedSun.getMonth())

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Sync view when weekOffset changes externally
  useEffect(() => {
    const s = getSundayOfWeek(weekOffset)
    setViewYear(s.getFullYear())
    setViewMonth(s.getMonth())
  }, [weekOffset])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1)
  const startOffset = firstDay.getDay() // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const daysInPrev = new Date(viewYear, viewMonth, 0).getDate()

  const cells: { date: Date; inMonth: boolean }[] = []
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({ date: new Date(viewYear, viewMonth - 1, daysInPrev - i), inMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(viewYear, viewMonth, d), inMonth: true })
  }
  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    cells.push({ date: new Date(viewYear, viewMonth + 1, d), inMonth: false })
  }

  const getWeekSun = (date: Date): Date => {
    const s = new Date(date)
    s.setDate(date.getDate() - date.getDay())
    s.setHours(0, 0, 0, 0)
    return s
  }

  const isInSelectedWeek = (date: Date) => {
    const s = getWeekSun(date)
    return isSameDay(s, selectedSun)
  }

  const isInHoverWeek = (date: Date) => {
    if (!hoverDate) return false
    const hs = getWeekSun(hoverDate)
    const s = getWeekSun(date)
    return isSameDay(s, hs)
  }

  const handleDayClick = (date: Date) => {
    const clickedSun = getWeekSun(date)
    const today = new Date()
    const todaySun = getWeekSun(today)
    const diff = Math.round((clickedSun.getTime() - todaySun.getTime()) / (7 * 24 * 60 * 60 * 1000))
    onChange(diff)
    setOpen(false)
  }

  // Format week label
  const formatWeekLabel = (offset: number) => {
    const sun = getSundayOfWeek(offset)
    const sat = new Date(sun); sat.setDate(sun.getDate() + 6)
    const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    if (sun.getMonth() === sat.getMonth()) {
      return `${sun.getDate()} a ${sat.getDate()} de ${months[sun.getMonth()]}`
    }
    return `${sun.getDate()} de ${months[sun.getMonth()]} a ${sat.getDate()} de ${months[sat.getMonth()]}`
  }

  const label = weekOffset === 0 ? 'Esta semana' : weekOffset === -1 ? 'Semana passada' : formatWeekLabel(weekOffset)

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-2 py-1.5 w-fit">
        <button
          onClick={() => onChange(weekOffset - 1)}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-500 text-lg leading-none"
        >
          ‹
        </button>
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 px-2 hover:bg-gray-50 rounded-lg py-1 transition-colors"
        >
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-sm font-semibold text-gray-700">{label}</span>
          <span className="text-xs text-gray-400">({formatWeekLabel(weekOffset)})</span>
        </button>
        <button
          onClick={() => onChange(weekOffset + 1)}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-500 text-lg leading-none"
        >
          ›
        </button>
      </div>

      {open && (
        <div className="absolute top-full mt-2 left-0 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 w-72 select-none">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 text-lg">‹</button>
            <span className="text-sm font-semibold text-gray-800 capitalize">
              {MONTHS_PT[viewMonth]} de {viewYear}
            </span>
            <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 text-lg">›</button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS_PT.map((d, i) => (
              <div key={i} className="text-center text-[11px] font-semibold text-gray-400 py-1">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {cells.map((cell, i) => {
              const isSelected = isInSelectedWeek(cell.date)
              const isHovered = isInHoverWeek(cell.date)
              const dayOfWeek = cell.date.getDay()
              const isSun = dayOfWeek === 0
              const isSat = dayOfWeek === 6
              const today = new Date(); today.setHours(0,0,0,0)
              const isToday = isSameDay(cell.date, today)

              const highlighted = isSelected || isHovered
              const bg = isSelected
                ? isSun || isSat ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-800'
                : isHovered
                  ? isSun || isSat ? 'bg-gray-200 text-gray-800' : 'bg-gray-100 text-gray-700'
                  : ''

              return (
                <div
                  key={i}
                  onClick={() => handleDayClick(cell.date)}
                  onMouseEnter={() => setHoverDate(cell.date)}
                  onMouseLeave={() => setHoverDate(null)}
                  className={`
                    h-8 flex items-center justify-center text-[13px] cursor-pointer transition-colors
                    ${highlighted ? bg : 'hover:bg-gray-50'}
                    ${isSun && highlighted ? 'rounded-l-full' : ''}
                    ${isSat && highlighted ? 'rounded-r-full' : ''}
                    ${!cell.inMonth ? 'text-gray-300' : isSelected && !isSun && !isSat ? 'text-blue-800' : isHovered && !isSun && !isSat ? 'text-gray-700' : 'text-gray-700'}
                    ${isToday && !highlighted ? 'font-bold text-blue-600' : ''}
                  `}
                >
                  {cell.date.getDate()}
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="mt-3 flex justify-between">
            <button
              onClick={() => { onChange(0); setOpen(false) }}
              className="text-xs text-blue-600 hover:underline font-medium"
            >
              Semana atual
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
