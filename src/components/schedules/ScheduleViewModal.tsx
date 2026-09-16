'use client'

import { useState } from 'react'
import { X, Pencil, Trash2, Calendar, Clock, MapPin, Users, FileText, Briefcase, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import { QuoteQuickViewModal } from '@/components/quotes/QuoteQuickViewModal'

const TYPE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  visita:    { label: 'Visita',    bg: 'bg-blue-400/15',  text: 'text-blue-200' },
  reuniao:   { label: 'Reunião',   bg: 'bg-amber-400/15', text: 'text-amber-200' },
  follow_up: { label: 'Follow-up', bg: 'bg-green-400/15', text: 'text-green-200' },
}

function Row({ icon: Icon, children }: { icon: typeof Calendar; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-8 h-8 rounded-full bg-surface-secondary flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-navy-muted" />
      </span>
      <span className="text-navy min-w-0">{children}</span>
    </div>
  )
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
  const type = TYPE_CONFIG[schedule.type] ?? { label: schedule.type, bg: 'bg-white/10', text: 'text-white/70' }
  const dateObj = new Date(schedule.scheduled_date + 'T00:00:00')
  const dateFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(dateObj)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-gradient-card rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header — card navy, mesma receita do hero/toast */}
        <div className="rounded-t-2xl bg-gradient-navy-mesh px-6 py-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 pr-2">
              <span className={cn('inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-2', type.bg, type.text)}>{type.label}</span>
              <h2 className="text-lg font-semibold text-white leading-tight">{schedule.title}</h2>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={onEdit} className="p-1.5 text-white/50 hover:text-white rounded-lg hover:bg-white/10" title="Editar">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={onDelete} className="p-1.5 text-white/50 hover:text-red-300 rounded-lg hover:bg-white/10" title="Excluir">
                <Trash2 className="w-4 h-4" />
              </button>
              <button onClick={onClose} className="p-1.5 text-white/50 hover:text-white rounded-lg hover:bg-white/10">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Detalhes */}
        <div className="px-6 py-5 space-y-3.5 text-sm">
          <Row icon={Calendar}><span className="capitalize">{dateFmt}</span></Row>
          {schedule.scheduled_time && (
            <Row icon={Clock}>{schedule.scheduled_time}</Row>
          )}
          {schedule.location && (
            <Row icon={MapPin}>{schedule.location}</Row>
          )}
          {schedule.partner_name && (
            <Row icon={Briefcase}>{schedule.partner_name}</Row>
          )}
          {schedule.quote && schedule.quote_id && (
            <button type="button" onClick={() => setQuoteModal(schedule.quote_id)}
              className="w-full flex items-center gap-3 group rounded-lg -mx-1 px-1 py-1 hover:bg-brand-50 transition-colors text-left">
              <span className="w-8 h-8 rounded-full bg-surface-secondary flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-navy-muted" />
              </span>
              <span className="text-navy group-hover:text-brand-700 min-w-0">
                <span className="font-semibold text-brand-600">#{schedule.quote.number}</span> · {schedule.quote.client_name}
              </span>
              <ExternalLink className="w-3.5 h-3.5 text-navy-muted/40 group-hover:text-brand-500 ml-auto shrink-0" />
            </button>
          )}
          {schedule.participants && schedule.participants.length > 0 && (
            <div className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-full bg-surface-secondary flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-navy-muted" />
              </span>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {schedule.participants.map((p: any) => (
                  <span key={p.id} className="inline-flex items-center gap-1.5 bg-surface-secondary border border-surface-border rounded-full pl-1 pr-2.5 py-0.5">
                    <Avatar user={p} size={20} />
                    <span className="text-xs text-navy">{p.name.split(' ')[0]}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {schedule.creator && (
          <div className="px-6 py-3 border-t border-surface-border flex items-center gap-2 text-xs text-navy-muted">
            <Avatar user={schedule.creator} size={18} />
            Criado por {schedule.creator.name}
          </div>
        )}
      </div>
      {quoteModal && <QuoteQuickViewModal quoteId={quoteModal} onClose={() => setQuoteModal(null)} />}
    </div>
  )
}
