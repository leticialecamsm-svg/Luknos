'use client'

import { useState } from 'react'
import { X, Pencil, Trash2, Calendar, Clock, MapPin, Users, FileText, Briefcase, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import { QuoteQuickViewModal } from '@/components/quotes/QuoteQuickViewModal'

const TYPE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  visita:    { label: 'Visita',    bg: 'bg-blue-50',  text: 'text-blue-700' },
  reuniao:   { label: 'Reunião',   bg: 'bg-amber-50', text: 'text-amber-700' },
  follow_up: { label: 'Follow-up', bg: 'bg-green-50', text: 'text-green-700' },
}

export function ScheduleViewModal({
  schedule, onClose, onEdit, onDelete,
}: {
  schedule: any
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [quoteModal, setQuoteModal] = useState<string | null>(null)
  const type = TYPE_CONFIG[schedule.type] ?? { label: schedule.type, bg: 'bg-gray-50', text: 'text-gray-600' }
  const dateObj = new Date(schedule.scheduled_date + 'T00:00:00')
  const dateFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(dateObj)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-start justify-between">
            <div className="min-w-0 pr-2">
              <span className={cn('inline-block text-xs font-semibold px-2 py-0.5 rounded mb-2', type.bg, type.text)}>{type.label}</span>
              <h2 className="text-lg font-semibold text-gray-900 leading-tight">{schedule.title}</h2>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-brand-500 rounded-lg hover:bg-gray-50" title="Editar">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-50" title="Excluir">
                <Trash2 className="w-4 h-4" />
              </button>
              <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Detalhes */}
        <div className="px-6 pb-6 space-y-3.5 text-sm">
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-gray-700 capitalize">{dateFmt}</span>
          </div>
          {schedule.scheduled_time && (
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-gray-700">{schedule.scheduled_time}</span>
            </div>
          )}
          {schedule.location && (
            <div className="flex items-center gap-3">
              <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-gray-700">{schedule.location}</span>
            </div>
          )}
          {schedule.partner_name && (
            <div className="flex items-center gap-3">
              <Briefcase className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-gray-700">{schedule.partner_name}</span>
            </div>
          )}
          {schedule.quote && schedule.quote_id && (
            <button type="button" onClick={() => setQuoteModal(schedule.quote_id)}
              className="w-full flex items-center gap-3 group rounded-lg -mx-2 px-2 py-1 hover:bg-brand-50 transition-colors text-left">
              <FileText className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-gray-700 group-hover:text-brand-700">
                <span className="font-semibold text-brand-600">#{schedule.quote.number}</span> · {schedule.quote.client_name}
              </span>
              <ExternalLink className="w-3.5 h-3.5 text-gray-300 group-hover:text-brand-500 ml-auto" />
            </button>
          )}
          {schedule.participants && schedule.participants.length > 0 && (
            <div className="flex items-start gap-3">
              <Users className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
              <div className="flex flex-wrap gap-1.5">
                {schedule.participants.map((p: any) => (
                  <span key={p.id} className="inline-flex items-center gap-1.5 bg-gray-50 border border-surface-border rounded-full pl-1 pr-2.5 py-0.5">
                    <Avatar user={p} size={20} />
                    <span className="text-xs text-gray-700">{p.name.split(' ')[0]}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {schedule.creator && (
          <div className="px-6 py-3 border-t border-surface-border flex items-center gap-2 text-xs text-gray-400">
            <Avatar user={schedule.creator} size={18} />
            Criado por {schedule.creator.name}
          </div>
        )}
      </div>
      {quoteModal && <QuoteQuickViewModal quoteId={quoteModal} onClose={() => setQuoteModal(null)} />}
    </div>
  )
}
