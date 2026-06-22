'use client'

import { useState } from 'react'
import { ScheduleCalendar } from './ScheduleCalendar'
import { ScheduleModal } from './ScheduleModal'
import { ScheduleViewModal } from './ScheduleViewModal'
import { WeekView } from './WeekView'
import { getSchedules, deleteSchedule } from '@/lib/actions'
import { Plus, Trash2, MapPin, CalendarDays, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/useConfirm'

const TYPE_CONFIG: Record<string, { label: string; bg: string; border: string; text: string }> = {
  visita:    { label: 'Visita',    bg: 'bg-blue-50',  border: 'border-l-blue-500',  text: 'text-blue-700' },
  reuniao:   { label: 'Reunião',   bg: 'bg-amber-50', border: 'border-l-amber-500', text: 'text-amber-700' },
  follow_up: { label: 'Follow-up', bg: 'bg-green-50', border: 'border-l-green-500', text: 'text-green-700' },
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// domingo da semana que contém `date`
function startOfWeek(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay()) // getDay: 0=domingo
  return d
}

export function SchedulesContainer({ initialSchedules }: { initialSchedules: any[] }) {
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [schedules, setSchedules] = useState<any[]>(initialSchedules)
  const [view, setView] = useState<'month' | 'week'>('month')
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))

  const [creating, setCreating] = useState<{ date?: string } | null>(null)
  const [editing, setEditing] = useState<any | null>(null)
  const [viewing, setViewing] = useState<any | null>(null)

  async function reload() {
    const data = await getSchedules()
    setSchedules(data as any[])
  }

  const datesWithSchedules = schedules.reduce((acc, s) => { acc.add(s.scheduled_date); return acc }, new Set<string>())
  const daySchedules = schedules
    .filter(s => s.scheduled_date === selectedDate)
    .sort((a, b) => (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? ''))

  const dateObj = new Date(selectedDate + 'T00:00:00')
  const dateFormatted = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(dateObj)

  async function handleDelete(id: string) {
    const ok = await confirm('Excluir este agendamento?', 'Sim, excluir')
    if (!ok) return
    const res = await deleteSchedule(id)
    if (res?.error) { toast.error('OCORREU UM ERRO', res.error); return }
    toast.success('TUDO CERTO!', 'Agendamento excluído.')
    setViewing(null)
    reload()
  }

  return (
    <div className="space-y-4">
      {/* Tabs de visualização */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-surface-secondary rounded-lg p-1 w-fit">
          {([['month', 'Mês', CalendarDays], ['week', 'Semana', LayoutGrid]] as const).map(([v, label, Icon]) => (
            <button key={v} onClick={() => setView(v)}
              className={cn('flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all',
                view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
        <button onClick={() => setCreating({ date: selectedDate })} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Novo agendamento
        </button>
      </div>

      {view === 'month' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <ScheduleCalendar
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              datesWithSchedules={datesWithSchedules}
            />
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 capitalize">{dateFormatted}</h2>
                  <p className="text-sm text-gray-500 mt-0.5">{daySchedules.length} agendamento(s)</p>
                </div>
                <button onClick={() => setCreating({ date: selectedDate })}
                  className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium">
                  <Plus className="w-4 h-4" /> Novo agendamento
                </button>
              </div>

              <div className="space-y-3">
                {daySchedules.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-gray-400 text-sm">Nenhum agendamento para este dia</p>
                    <button onClick={() => setCreating({ date: selectedDate })}
                      className="mt-2 text-sm text-brand-600 hover:text-brand-700 font-medium">+ Criar agendamento</button>
                  </div>
                ) : daySchedules.map(s => {
                  const tc = TYPE_CONFIG[s.type] ?? { label: s.type, bg: 'bg-gray-50', border: 'border-l-gray-400', text: 'text-gray-600' }
                  return (
                    <div key={s.id} onClick={() => setViewing(s)}
                      className={cn('rounded-lg border-l-4 p-4 flex items-start justify-between cursor-pointer hover:shadow-sm transition-all group', tc.bg, tc.border)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          {s.scheduled_time && <span className="text-sm font-semibold text-gray-900">{s.scheduled_time}</span>}
                          <span className={cn('text-xs font-bold', tc.text)}>{tc.label}</span>
                        </div>
                        <h3 className="text-sm font-semibold text-gray-900">{s.title}</h3>
                        {s.location && <p className="text-xs text-gray-600 mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> {s.location}</p>}
                        {s.quote && <p className="text-xs text-gray-600 mt-1">Orç. <span className="font-semibold text-brand-600">#{s.quote.number}</span> · {s.quote.client_name}</p>}
                        {s.participants?.length > 0 && (
                          <div className="flex gap-0.5 mt-2">
                            {s.participants.slice(0, 4).map((p: any) => <Avatar key={p.id} user={p} size={22} className="ring-1 ring-white" />)}
                          </div>
                        )}
                      </div>
                      <button onClick={e => { e.stopPropagation(); handleDelete(s.id) }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-600 p-1 shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <WeekView
          weekStart={weekStart}
          schedules={schedules}
          onPrevWeek={() => setWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() - 7); return n })}
          onNextWeek={() => setWeekStart(d => { const n = new Date(d); n.setDate(d.getDate() + 7); return n })}
          onSelectSchedule={setViewing}
          onAddOnDay={(iso) => setCreating({ date: iso })}
        />
      )}

      {creating && (
        <ScheduleModal
          defaultDate={creating.date}
          onClose={() => setCreating(null)}
          onSuccess={() => { setCreating(null); reload() }}
        />
      )}
      {editing && (
        <ScheduleModal
          schedule={editing}
          onClose={() => setEditing(null)}
          onSuccess={() => { setEditing(null); reload() }}
        />
      )}
      {viewing && (
        <ScheduleViewModal
          schedule={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => { setEditing(viewing); setViewing(null) }}
          onDelete={() => handleDelete(viewing.id)}
        />
      )}
      {ConfirmDialog}
    </div>
  )
}
