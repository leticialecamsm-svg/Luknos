'use client'

import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const WEEKDAYS_SHORT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']

const TYPE_CONFIG: Record<string, { bg: string; border: string; text: string }> = {
  visita:    { bg: 'bg-blue-50',  border: 'border-l-blue-500',  text: 'text-blue-700' },
  reuniao:   { bg: 'bg-amber-50', border: 'border-l-amber-500', text: 'text-amber-700' },
  follow_up: { bg: 'bg-green-50', border: 'border-l-green-500', text: 'text-green-700' },
}

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function WeekView({
  weekStart,            // domingo (Date)
  schedules,
  onPrevWeek,
  onNextWeek,
  onSelectSchedule,
  onAddOnDay,
}: {
  weekStart: Date
  schedules: any[]
  onPrevWeek: () => void
  onNextWeek: () => void
  onSelectSchedule: (s: any) => void
  onAddOnDay: (dateISO: string) => void
}) {
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })
  const todayISO = toISO(new Date())

  const rangeLabel = `${days[0].getDate()} ${new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(days[0])} – ${days[6].getDate()} ${new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(days[6])}`

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900 capitalize">{rangeLabel}</h2>
        <div className="flex items-center gap-1">
          <button onClick={onPrevWeek} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={onNextWeek} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 divide-x divide-gray-100">
        {days.map((d, i) => {
          const iso = toISO(d)
          const isToday = iso === todayISO
          const daySchedules = schedules
            .filter(s => s.scheduled_date === iso)
            .sort((a, b) => (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? ''))
          return (
            <div key={iso} className="min-h-[420px] flex flex-col">
              <div className={cn('px-2 py-2 text-center border-b border-gray-100', isToday && 'bg-brand-50')}>
                <p className="text-[10px] font-semibold text-gray-400">{WEEKDAYS_SHORT[i]}</p>
                <p className={cn('text-sm font-bold', isToday ? 'text-brand-600' : 'text-gray-700')}>{d.getDate()}</p>
              </div>
              <div className="flex-1 p-1.5 space-y-1.5">
                {daySchedules.map(s => {
                  const tc = TYPE_CONFIG[s.type] ?? { bg: 'bg-gray-50', border: 'border-l-gray-400', text: 'text-gray-600' }
                  return (
                    <button key={s.id} onClick={() => onSelectSchedule(s)}
                      className={cn('w-full text-left rounded-md border-l-4 px-2 py-1.5 transition-all hover:shadow-sm', tc.bg, tc.border)}>
                      {s.scheduled_time && <p className={cn('text-[10px] font-bold', tc.text)}>{s.scheduled_time}</p>}
                      <p className="text-xs font-medium text-gray-800 leading-tight line-clamp-2">{s.title}</p>
                      {s.quote && (
                        <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">
                          <span className="font-semibold text-brand-600">#{s.quote.number}</span> · {s.quote.client_name}
                        </p>
                      )}
                      {s.participants?.length > 0 && (
                        <div className="flex -space-x-1 mt-1">
                          {s.participants.slice(0, 4).map((p: any) => (
                            <Avatar key={p.id} user={p} size={18} className="ring-1 ring-white" />
                          ))}
                        </div>
                      )}
                    </button>
                  )
                })}
                <button onClick={() => onAddOnDay(iso)}
                  className="w-full flex items-center justify-center gap-1 py-1 rounded-md text-[10px] text-gray-300 hover:text-brand-500 hover:bg-brand-50 transition-colors">
                  <Plus className="w-3 h-3" /> Novo
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
