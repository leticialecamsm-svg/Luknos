'use client'

import { formatDate, getInitials, cn } from '@/lib/utils'
import { Trash2 } from 'lucide-react'
import { deleteSchedule } from '@/lib/actions'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/useConfirm'

const SCHEDULE_TYPE_COLORS = {
  visita: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-l-blue-500', label: 'Visita' },
  reuniao: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-l-amber-500', label: 'Reunião' },
  follow_up: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-l-green-500', label: 'Follow-up' },
}

export function SchedulesList({
  date,
  schedules,
  onAddSchedule,
}: {
  date: string
  schedules: any[]
  onAddSchedule: () => void
}) {
  const router = useRouter()
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const dateObj = new Date(date + 'T00:00:00')
  const dateFormatted = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(dateObj)

  const handleDelete = async (id: string) => {
    const ok = await confirm('Tem certeza que deseja excluir este agendamento?', 'Sim, excluir')
    if (!ok) return
    const result = await deleteSchedule(id)
    if (result?.error) {
      toast.error('OCORREU UM ERRO', 'Não foi possível excluir o agendamento.')
    } else {
      toast.success('TUDO CERTO!', 'Agendamento excluído.')
      router.refresh()
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Agenda {dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1)}
          </h2>
          <p className="text-sm text-gray-500 mt-1">{schedules.length} agendamento(s)</p>
        </div>
        <button
          onClick={onAddSchedule}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Agendar
        </button>
      </div>

      {/* Schedules */}
      <div className="space-y-3">
        {schedules.length > 0 ? (
          schedules.map(schedule => {
            const typeConfig = SCHEDULE_TYPE_COLORS[schedule.type as keyof typeof SCHEDULE_TYPE_COLORS]

            return (
              <div
                key={schedule.id}
                className={cn(
                  'rounded-lg border-l-4 p-4 flex items-start justify-between',
                  typeConfig.bg,
                  typeConfig.border
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm font-semibold text-gray-900">{schedule.scheduled_time}</span>
                    <span className={cn('text-xs font-bold px-2 py-1 rounded', typeConfig.text)}>
                      {typeConfig.label}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900">{schedule.title}</h3>
                  {schedule.location && (
                    <p className="text-xs text-gray-600 mt-1">📍 {schedule.location}</p>
                  )}
                  {schedule.quote && (
                    <p className="text-xs text-gray-600 mt-1">
                      Orç. #{String(schedule.quote.number).padStart(3, '0')} - {schedule.quote.client_name}
                    </p>
                  )}
                  {schedule.team_members && schedule.team_members.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {schedule.team_members.slice(0, 3).map((member: any, i: number) => (
                        <div
                          key={i}
                          className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-xs font-bold text-gray-600 border border-gray-200"
                          title={typeof member === 'string' ? member : member.name}
                        >
                          {typeof member === 'string' ? member.substring(0, 1) : getInitials(member.name)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleDelete(schedule.id)}
                  className="text-gray-400 hover:text-red-600 transition-colors p-1 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )
          })
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">Nenhum agendamento para este dia</p>
          </div>
        )}
      </div>
      {ConfirmDialog}
    </div>
  )
}
