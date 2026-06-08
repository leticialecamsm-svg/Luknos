'use client'

import { useState } from 'react'
import { ScheduleCalendar } from './ScheduleCalendar'
import { ScheduleForm } from './ScheduleForm'
import { SchedulesList } from './SchedulesList'
import { getInitials, formatCurrency } from '@/lib/utils'

export function SchedulesContainer({ initialSchedules }: { initialSchedules: any[] }) {
  const [schedules, setSchedules] = useState(initialSchedules)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [showForm, setShowForm] = useState(false)

  const todaySchedules = schedules.filter(s => s.scheduled_date === selectedDate)

  const getDatesWithSchedules = () => {
    return schedules.reduce((acc, s) => {
      acc.add(s.scheduled_date)
      return acc
    }, new Set<string>())
  }

  const handleScheduleCreated = () => {
    setShowForm(false)
    // Revalidar e buscar novos dados seria feito através de uma action
  }

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Calendário */}
      <div className="col-span-1">
        <ScheduleCalendar
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          datesWithSchedules={getDatesWithSchedules()}
        />
      </div>

      {/* Listagem + Form */}
      <div className="col-span-2 space-y-6">
        <SchedulesList
          date={selectedDate}
          schedules={todaySchedules}
          onAddSchedule={() => setShowForm(!showForm)}
        />

        {showForm && (
          <ScheduleForm
            selectedDate={selectedDate}
            onClose={() => setShowForm(false)}
            onSuccess={handleScheduleCreated}
          />
        )}
      </div>
    </div>
  )
}
