'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateQuoteStatus, deleteQuote } from '@/lib/actions'
import { formatCurrency, formatDate, isOverdue, cn } from '@/lib/utils'
import {
  QUOTE_STATUS_LABEL, TEMPERATURE_COLOR, TEMPERATURE_LABEL, PRIORITY_COLOR, PRIORITY_LABEL,
  type QuoteStatus, type QuotePriority,
} from '@/types'
import { Trash2, Pencil, AlertTriangle, Inbox } from 'lucide-react'
import { useConfirm } from '@/components/ui/useConfirm'
import { useToast } from '@/components/ui/Toast'
import { Avatar } from '@/components/ui/Avatar'

// Todos os status de QuoteStatus têm coluna — antes só 4 dos 6 apareciam e
// orçamentos "Pausado"/"Elaborando nova versão" sumiam do kanban.
const COLUMNS: { key: QuoteStatus; dot: string; text: string }[] = [
  { key: 'queue',       dot: 'bg-blue-500',   text: 'text-blue-700' },
  { key: 'in_progress', dot: 'bg-amber-500',  text: 'text-amber-700' },
  { key: 'review',      dot: 'bg-purple-500', text: 'text-purple-700' },
  { key: 'revision',    dot: 'bg-pink-500',   text: 'text-pink-700' },
  { key: 'paused',      dot: 'bg-gray-400',   text: 'text-gray-600' },
  { key: 'done',        dot: 'bg-green-500',  text: 'text-green-700' },
]

// A busca e os filtros vivem em QuotesList (que já entrega a lista filtrada);
// o kanban só desenha. Mudanças otimistas (mover/excluir) ficam em overrides
// e são descartadas quando a lista do servidor chega atualizada.
export function QuotesKanban({ initialQuotes }: { initialQuotes: any[] }) {
  const router = useRouter()
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [statusOverride, setStatusOverride] = useState<Record<string, QuoteStatus>>({})
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [dragging, setDragging] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => { setStatusOverride({}); setRemoved(new Set()) }, [initialQuotes])

  const quotes = initialQuotes
    .filter(q => !removed.has(q.id))
    .map(q => (statusOverride[q.id] ? { ...q, status: statusOverride[q.id] } : q))

  function handleDrop(e: React.DragEvent, newStatus: QuoteStatus) {
    e.preventDefault()
    const quoteId = e.dataTransfer.getData('quoteId')
    setDragging(null); setOverCol(null)
    const quote = quotes.find(q => q.id === quoteId)
    if (!quote || quote.status === newStatus) return
    const previous = quote.status as QuoteStatus
    setStatusOverride(prev => ({ ...prev, [quoteId]: newStatus }))
    startTransition(async () => {
      const res = await updateQuoteStatus(quoteId, newStatus)
      if (res && 'error' in res && res.error) {
        setStatusOverride(prev => ({ ...prev, [quoteId]: previous }))
        toast.error('Não foi possível mover o orçamento', res.error)
      }
    })
  }

  async function handleDelete(e: React.MouseEvent, id: string, clientName: string) {
    e.preventDefault(); e.stopPropagation()
    const ok = await confirm(`Excluir orçamento de "${clientName}"?`, 'Sim, excluir')
    if (!ok) return
    startTransition(async () => {
      const res: any = await deleteQuote(id)
      if (res?.error) return toast.error('Não foi possível excluir', res.error)
      setRemoved(prev => new Set(prev).add(id))
    })
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3 min-h-[520px] items-stretch">
      {COLUMNS.map(col => {
        const cards = quotes.filter(q => q.status === col.key)
        const colValue = cards.reduce((s, q) => s + (q.final_value ?? q.quoted_value ?? 0), 0)
        const isOver = overCol === col.key && dragging !== null

        return (
          <div key={col.key}
            onDragOver={e => { e.preventDefault(); setOverCol(col.key) }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null) }}
            onDrop={e => handleDrop(e, col.key)}
            className={cn(
              'w-72 shrink-0 flex flex-col rounded-card border bg-surface-secondary shadow-card transition-colors',
              isOver ? 'border-brand-500 bg-brand-50/40' : 'border-surface-border'
            )}
          >
            <div className="px-3 py-2.5 border-b border-surface-border">
              <div className="flex items-center gap-2">
                <span className={cn('w-2 h-2 rounded-full', col.dot)} />
                <span className={cn('text-xs font-bold uppercase tracking-wide', col.text)}>
                  {QUOTE_STATUS_LABEL[col.key]}
                </span>
                <span className="ml-auto text-xs font-semibold text-gray-500 bg-white border border-surface-border rounded-full px-1.5">
                  {cards.length}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">{formatCurrency(colValue)}</p>
            </div>

            <div className="p-2 space-y-2 flex-1 overflow-y-auto max-h-[calc(100vh-18rem)]">
              {cards.length === 0 && (
                <div className="h-20 rounded-lg border border-dashed border-surface-border flex flex-col items-center justify-center gap-1 text-gray-300">
                  <Inbox className="w-4 h-4" />
                  <p className="text-xs">{dragging ? 'Solte aqui' : 'Nenhum orçamento'}</p>
                </div>
              )}
              {cards.map(q => (
                <QuoteCard
                  key={q.id}
                  quote={q}
                  isDragging={dragging === q.id}
                  onDragStart={e => { e.dataTransfer.setData('quoteId', q.id); e.dataTransfer.effectAllowed = 'move'; setDragging(q.id) }}
                  onDragEnd={() => { setDragging(null); setOverCol(null) }}
                  onOpen={() => router.push(`/quotes/${q.id}`)}
                  onEdit={() => router.push(`/quotes/${q.id}/edit`)}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </div>
        )
      })}
      {ConfirmDialog}
    </div>
  )
}

function QuoteCard({ quote: q, isDragging, onDragStart, onDragEnd, onOpen, onEdit, onDelete }: {
  quote: any
  isDragging: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onOpen: () => void
  onEdit: () => void
  onDelete: (e: React.MouseEvent, id: string, name: string) => void
}) {
  const overdue = isOverdue(q.deadline) && q.status !== 'done'
  const tempC = q.temperature ? TEMPERATURE_COLOR[q.temperature as keyof typeof TEMPERATURE_COLOR] : null
  const priority = (q.priority ?? 'normal') as QuotePriority
  const pc = PRIORITY_COLOR[priority]

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn(
        'bg-white rounded-lg p-3 border border-surface-border shadow-card group',
        'hover:border-gray-300 transition-all cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-40 scale-95'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-sm font-semibold text-gray-900 leading-tight flex-1 min-w-0 truncate">{q.client_name}</p>
        <span className="text-[10px] text-gray-400 shrink-0">#{String(q.number).padStart(3, '0')}</span>
      </div>

      {q.architect_name && <p className="text-xs text-gray-400 truncate mb-1.5">{q.architect_name}</p>}

      <div className="flex flex-wrap gap-1 mb-1.5">
        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', pc.bg, pc.text)}>
          {PRIORITY_LABEL[priority]}
        </span>
        {tempC && (
          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full border', tempC.bg, tempC.text, tempC.border)}>
            {TEMPERATURE_LABEL[q.temperature as keyof typeof TEMPERATURE_LABEL]}
          </span>
        )}
      </div>

      <p className="text-sm font-bold text-gray-700">{formatCurrency(q.final_value ?? q.quoted_value)}</p>

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-0.5">
          {q.owners?.slice(0, 3).map((o: any) => (
            <Avatar key={o.user_id} user={o} size={20} className="ring-1 ring-white" />
          ))}
        </div>
        {q.deadline && (
          <span className={cn('flex items-center gap-1 text-[10px] font-medium', overdue ? 'text-red-600' : 'text-gray-400')}>
            {overdue && <AlertTriangle className="w-3 h-3" />}
            {formatDate(q.deadline)}
          </span>
        )}
      </div>

      <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={e => { e.stopPropagation(); onEdit() }}
          className="flex-1 flex items-center justify-center gap-1 py-1 text-xs text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors">
          <Pencil className="w-3 h-3" /> Editar
        </button>
        <button onClick={e => onDelete(e, q.id, q.client_name)}
          className="flex-1 flex items-center justify-center gap-1 py-1 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
          <Trash2 className="w-3 h-3" /> Excluir
        </button>
      </div>
    </div>
  )
}
