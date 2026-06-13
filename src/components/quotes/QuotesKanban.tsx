'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { updateQuoteStatus, deleteQuote } from '@/lib/actions'
import { formatCurrency, formatDate, getInitials, isOverdue, cn } from '@/lib/utils'
import { QUOTE_STATUS_LABEL, TEMPERATURE_COLOR, TEMPERATURE_LABEL } from '@/types'
import { Search, X, Trash2, Pencil } from 'lucide-react'
import { useConfirm } from '@/components/ui/useConfirm'

const COLUMNS = [
  { key: 'queue',       label: 'Na fila',       color: 'border-blue-200',   bg: 'bg-blue-50/50',   header: 'bg-blue-100',   text: 'text-blue-700' },
  { key: 'in_progress', label: 'Em andamento',  color: 'border-amber-200',  bg: 'bg-amber-50/50',  header: 'bg-amber-100',  text: 'text-amber-700' },
  { key: 'review',      label: 'Revisão',       color: 'border-purple-200', bg: 'bg-purple-50/50', header: 'bg-purple-100', text: 'text-purple-700' },
  { key: 'done',        label: 'Concluído',     color: 'border-green-200',  bg: 'bg-green-50/50',  header: 'bg-green-100',  text: 'text-green-700' },
] as const

export function QuotesKanban({ myQuotes, allQuotes, isAdmin }: { myQuotes: any[]; allQuotes: any[]; isAdmin: boolean }) {
  const router = useRouter()
  const [view, setView] = useState<'mine' | 'all'>(isAdmin ? 'all' : 'mine')
  const initialQuotes = view === 'mine' ? myQuotes : allQuotes
  const [quotes, setQuotes] = useState(initialQuotes)
  const [search, setSearch] = useState('')

  // Sincroniza quando muda de aba
  const handleViewChange = (v: 'mine' | 'all') => {
    setView(v)
    setQuotes(v === 'mine' ? myQuotes : allQuotes)
  }
  const { confirm, ConfirmDialog } = useConfirm()
  const [dragging, setDragging] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const filtered = quotes.filter(q =>
    !search ||
    q.client_name?.toLowerCase().includes(search.toLowerCase()) ||
    q.architect_name?.toLowerCase().includes(search.toLowerCase()) ||
    String(q.number).includes(search)
  )

  function getColumn(status: string) {
    return filtered.filter(q => q.status === status)
  }

  function handleDragStart(e: React.DragEvent, quoteId: string) {
    e.dataTransfer.setData('quoteId', quoteId)
    setDragging(quoteId)
  }

  function handleDrop(e: React.DragEvent, newStatus: string) {
    e.preventDefault()
    const quoteId = e.dataTransfer.getData('quoteId')
    const quote = quotes.find(q => q.id === quoteId)
    if (!quote || quote.status === newStatus) { setDragging(null); return }
    setQuotes(prev => prev.map(q => q.id === quoteId ? { ...q, status: newStatus } : q))
    setDragging(null)
    startTransition(async () => { await updateQuoteStatus(quoteId, newStatus as any) })
  }

  async function handleDelete(e: React.MouseEvent, id: string, clientName: string) {
    e.preventDefault(); e.stopPropagation()
    const ok = await confirm(`Excluir orçamento de "${clientName}"?`, 'Sim, excluir')
    if (!ok) return
    startTransition(async () => {
      await deleteQuote(id)
      setQuotes(prev => prev.filter(q => q.id !== id))
    })
  }

  return (
    <div className="space-y-4">
      {/* Abas */}
      {!isAdmin && (
        <div className="flex gap-1 bg-surface-secondary rounded-lg p-1 w-fit">
          {([['mine', 'Meus orçamentos'], ['all', 'Todos']] as const).map(([v, label]) => (
            <button key={v} onClick={() => handleViewChange(v)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {label}
              <span className="ml-1.5 text-xs opacity-60">
                {v === 'mine' ? myQuotes.length : allQuotes.length}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cliente, número..." className="input pl-9 pr-8" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-2.5 text-gray-400">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400">{filtered.length} orçamento{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="grid grid-cols-4 gap-3 min-h-[600px]">
        {COLUMNS.map(col => {
          const cards = getColumn(col.key)
          const colValue = cards.reduce((s, q) => s + (q.final_value ?? q.quoted_value ?? 0), 0)

          return (
            <div key={col.key}
              onDragOver={e => e.preventDefault()}
              onDrop={e => handleDrop(e, col.key)}
              className={cn('rounded-xl border-2 flex flex-col transition-all', col.color, col.bg,
                dragging ? 'border-dashed' : ''
              )}
            >
              <div className={cn('px-3 py-2.5 rounded-t-xl', col.header)}>
                <div className="flex items-center justify-between">
                  <span className={cn('text-xs font-semibold', col.text)}>{col.label}</span>
                  <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded-full bg-white/70', col.text)}>
                    {cards.length}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{formatCurrency(colValue)}</p>
              </div>

              <div className="p-2 space-y-2 flex-1">
                {cards.length === 0 && (
                  <div className="h-16 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center">
                    <p className="text-xs text-gray-300">Arraste aqui</p>
                  </div>
                )}
                {cards.map(q => (
                  <QuoteCard
                    key={q.id}
                    quote={q}
                    onDragStart={handleDragStart}
                    isDragging={dragging === q.id}
                    onDelete={handleDelete}
                    onEdit={() => router.push(`/quotes/${q.id}/edit`)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {ConfirmDialog}
    </div>
  )
}

function QuoteCard({ quote: q, onDragStart, isDragging, onDelete, onEdit }: {
  quote: any
  onDragStart: (e: React.DragEvent, id: string) => void
  isDragging: boolean
  onDelete: (e: React.MouseEvent, id: string, name: string) => void
  onEdit: () => void
}) {
  const overdue = isOverdue(q.deadline) && q.status !== 'done'
  const tempC = q.temperature ? TEMPERATURE_COLOR[q.temperature as keyof typeof TEMPERATURE_COLOR] : null

  return (
    <Link href={`/quotes/${q.id}`}>
      <div
        draggable
        onDragStart={e => onDragStart(e, q.id)}
        className={cn(
          'bg-white rounded-lg p-3 border border-gray-100 shadow-sm group',
          'hover:shadow-md transition-all cursor-grab active:cursor-grabbing',
          isDragging && 'opacity-50 scale-95'
        )}
      >
        <div className="flex items-start justify-between gap-1 mb-1">
          <p className="text-sm font-semibold text-gray-900 truncate leading-tight flex-1">
            {q.client_name}
          </p>
          <span className="text-[10px] text-gray-300 shrink-0">#{String(q.number).padStart(3,'0')}</span>
        </div>

        {q.architect_name && (
          <p className="text-xs text-gray-400 truncate mb-1.5">{q.architect_name}</p>
        )}

        {tempC && (
          <span className={cn('inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full border mb-1.5', tempC.bg, tempC.text, tempC.border)}>
            {TEMPERATURE_LABEL[q.temperature as keyof typeof TEMPERATURE_LABEL]}
          </span>
        )}

        <p className="text-sm font-bold text-gray-700 mt-1">
          {formatCurrency(q.final_value ?? q.quoted_value)}
        </p>

        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-0.5">
            {q.owners?.slice(0,3).map((o: any) => (
              <div key={o.user_id} title={o.name}
                className="w-5 h-5 rounded-full text-white text-[9px] font-bold flex items-center justify-center ring-1 ring-white"
                style={{ backgroundColor: o.avatar_color }}>
                {getInitials(o.name)}
              </div>
            ))}
          </div>
          {q.deadline && (
            <span className={cn('text-[10px] font-medium', overdue ? 'text-red-500' : 'text-gray-400')}>
              {overdue ? '⚠️ ' : ''}{formatDate(q.deadline)}
            </span>
          )}
        </div>

        {/* Ações */}
        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-all">
          <button onClick={e => { e.preventDefault(); e.stopPropagation(); onEdit() }}
            className="flex-1 flex items-center justify-center gap-1 py-1 text-xs text-gray-400 hover:text-brand-500 hover:bg-brand-50 rounded transition-colors">
            <Pencil className="w-3 h-3" /> Editar
          </button>
          <button onClick={e => onDelete(e, q.id, q.client_name)}
            className="flex-1 flex items-center justify-center gap-1 py-1 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
            <Trash2 className="w-3 h-3" /> Excluir
          </button>
        </div>
      </div>
    </Link>
  )
}
