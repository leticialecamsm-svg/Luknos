'use client'

import { useState, useEffect } from 'react'
import { getSchedulesByQuote } from '@/lib/actions'
import { CalendarClock, Plus, Loader2, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScheduleModal } from '@/components/schedules/ScheduleModal'
import { ScheduleViewModal } from '@/components/schedules/ScheduleViewModal'

const TYPE_CONFIG: Record<string, { label: string; bg: string; border: string; text: string }> = {
  visita:    { label: 'Visita',    bg: 'bg-blue-50',  border: 'border-l-blue-500',  text: 'text-blue-700' },
  reuniao:   { label: 'Reunião',   bg: 'bg-amber-50', border: 'border-l-amber-500', text: 'text-amber-700' },
  follow_up: { label: 'Follow-up', bg: 'bg-green-50', border: 'border-l-green-500', text: 'text-green-700' },
}

export function QuoteSchedules({ quoteId, quoteLabel }: { quoteId: string; quoteLabel: string }) {
  const [schedules, setSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [viewing, setViewing] = useState<any | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const data = await getSchedulesByQuote(quoteId)
    setSchedules(data as any[])
    setLoading(false)
  }

  function fmtDate(iso: string) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <CalendarClock className="w-4 h-4" />
          Agendamentos
          {schedules.length > 0 && <span className="text-xs font-normal text-gray-400">{schedules.length}</span>}
        </h2>
        <button onClick={() => setCreating(true)} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
          <Plus className="w-3.5 h-3.5" /> Novo agendamento
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-300" /></div>
      ) : schedules.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">Nenhum agendamento vinculado</p>
      ) : (
        <div className="space-y-2">
          {schedules.map(s => {
            const tc = TYPE_CONFIG[s.type] ?? { label: s.type, bg: 'bg-gray-50', border: 'border-l-gray-400', text: 'text-gray-600' }
            return (
              <div key={s.id} onClick={() => setViewing(s)}
                className={cn('rounded-lg border-l-4 px-3 py-2 cursor-pointer hover:shadow-sm transition-all', tc.bg, tc.border)}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-700">{fmtDate(s.scheduled_date)}</span>
                  {s.scheduled_time && <span className="text-xs text-gray-500">{s.scheduled_time}</span>}
                  <span className={cn('text-[10px] font-bold ml-auto', tc.text)}>{tc.label}</span>
                </div>
                <p className="text-sm font-medium text-gray-800 mt-0.5">{s.title}</p>
                {s.location && <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1"><MapPin className="w-3 h-3" /> {s.location}</p>}
              </div>
            )
          })}
        </div>
      )}

      {creating && (
        <ScheduleModal
          defaultQuote={{ id: quoteId, label: quoteLabel }}
          onClose={() => setCreating(false)}
          onSuccess={() => { setCreating(false); load() }}
        />
      )}
      {editing && (
        <ScheduleModal
          schedule={editing}
          onClose={() => setEditing(null)}
          onSuccess={() => { setEditing(null); load() }}
        />
      )}
      {viewing && (
        <ScheduleViewModal
          schedule={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => { setEditing(viewing); setViewing(null) }}
          onDelete={async () => {
            const { deleteSchedule } = await import('@/lib/actions')
            await deleteSchedule(viewing.id)
            setViewing(null)
            load()
          }}
        />
      )}
    </div>
  )
}
