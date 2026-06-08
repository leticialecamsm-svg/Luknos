'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const WEEKDAYS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']
const WEEKDAYS_FULL = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

export function ScheduleCalendar({
  selectedDate,
  onDateChange,
  datesWithSchedules,
}: {
  selectedDate: string
  onDateChange: (date: string) => void
  datesWithSchedules: Set<string>
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate))

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()

  // Primeiro dia do mês
  const firstDay = new Date(year, month, 1)
  const firstDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1 // Ajustar para segunda

  // Último dia do mês
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()

  // Cria array de semanas
  const weeks: (number | null)[][] = []
  let week: (number | null)[] = Array(firstDayOfWeek).fill(null)

  for (let day = 1; day <= daysInMonth; day++) {
    week.push(day)
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }

  if (week.length > 0) {
    weeks.push([...week, ...Array(7 - week.length).fill(null)])
  }

  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month
  const todayDay = today.getDate()

  const handleDayClick = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    onDateChange(dateStr)
  }

  const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(currentMonth)

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h3 className="text-sm font-semibold text-gray-900 capitalize">{monthName}</h3>
        <button
          onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Weekdays */}
      <div className="grid grid-cols-7 gap-2 mb-4">
        {WEEKDAYS.map(day => (
          <div key={day} className="text-center text-xs font-semibold text-gray-500 py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Days */}
      <div className="space-y-3">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 gap-2">
            {week.map((day, dayIndex) => {
              if (day === null) {
                return <div key={dayIndex} className="aspect-square" />
              }

              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const hasSchedules = datesWithSchedules.has(dateStr)
              const isSelected = selectedDate === dateStr
              const isTodayAndCurrentMonth = isCurrentMonth && todayDay === day

              return (
                <button
                  key={dayIndex}
                  onClick={() => handleDayClick(day)}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center relative text-sm font-medium transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : isTodayAndCurrentMonth
                      ? 'bg-blue-50 text-blue-600 border border-blue-200'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {day}
                  {hasSchedules && (
                    <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-600'} mt-1`} />
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
