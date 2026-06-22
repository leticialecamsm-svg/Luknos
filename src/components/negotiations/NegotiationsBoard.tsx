'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { updateTemperature } from '@/lib/actions'
import { formatCurrency, formatDate, getInitials, isOverdue, cn } from '@/lib/utils'
import { TEMPERATURE_LABEL, TEMPERATURE_COLOR } from '@/types'
import { Flame, TrendingUp, Search, X } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'

const COLUMNS = [
  { key: 'cold',   label: 'Frio',          color: 'border-blue-200',  bg: 'bg-blue-50/50',  header: 'bg-blue-100',  text: 'text-blue-700' },
  { key: 'warm',   label: 'Morno',         color: 'border-amber-200', bg: 'bg-amber-50/50', header: 'bg-amber-100', text: 'text-amber-700' },
  { key: 'hot',    label: 'Quente',        color: 'border-red-200',   bg: 'bg-red-50/50',   header: 'bg-red-100',   text: 'text-red-700' },
  { key: 'closed', label: 'Venda fechada', color: 'border-green-200', bg: 'bg-green-50/50', header: 'bg-green-100', text: 'text-green-700' },
  { key: 'lost',   label: 'Perdida',       color: 'border-gray-200',  bg: 'bg-gray-50/50',  header: 'bg-gray-100',  text: 'text-gray-500' },
] as const

export function NegotiationsBoard({ quotes: initialQuotes, isAdmin }: { quotes: any[]; isAdmin: boolean }) {
  const [quotes, setQuotes] = useState(initialQuotes)
  const [search, setSearch] = useState('')
  const [pending, startTransition] = useTransition()
  const [dragging, setDragging] = useState<string | null>(null)

  const filtered = quotes.filter(q =>
    !search ||
    q.client_name?.toLowerCase().includes(search.toLowerCase()) ||
    q.architect_name?.toLowerCase().includes(search.toLowerCase())
  )

  function getColumn(temp: string | null) {
    return filtered.filter(q => (q.temperature ?? 'cold') === temp || (!q.temperature && temp === 'cold'))
  }

  function handleDragStart(e: React.DragEvent, quoteId: string) {
    e.dataTransfer.setData('quoteId', quoteId)
    setDragging(quoteId)
  }

  function handleDrop(e: React.DragEvent, newTemp: string) {
    e.preventDefault()
    const quoteId = e.dataTransfer.getData('quoteId')
    const quote = quotes.find(q => q.id === quoteId)
    if (!quote || quote.temperature === newTemp) { setDragging(null); return }

    // Optimistic update
    setQuotes(prev => prev.map(q => q.id === quoteId ? { ...q, temperature: newTemp } : q))
    setDragging(null)

    startTransition(async () => {
      await updateTemperature(quoteId, newTemp as any)
    })
  }

  // Totals
  const totalOpen = quotes.filter(q => !['closed','lost'].includes(q.temperature ?? 'cold'))
    .reduce((s, q) => s + (q.quoted_value ?? 0), 0)
  const totalClosed = quotes.filter(q => q.temperature === 'closed')
    .reduce((s, q) => s + (q.final_value ?? 0), 0)
  const totalHot = quotes.filter(q => q.temperature === 'hot')
    .reduce((s, q) => s + (q.quoted_value ?? 0), 0)

  return (
    <div className="space-y-4 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Negociações</h1>
          <p className="text-sm text-gray-500 mt-0.5">Arraste os cards entre colunas para atualizar o status</p>
        </div>
        <Link href="/quotes/new" className="btn-primary">+ Novo orçamento</Link>
      </div>

      {/* KPIs rápidos */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Em aberto', value: formatCurrency(totalOpen), color: 'text-blue-600' },
          { label: 'Quente', value: formatCurrency(totalHot), color: 'text-red-600', icon: <Flame className="w-3.5 h-3.5" /> },
          { label: 'Fechado no mês', value: formatCurrency(totalClosed), color: 'text-green-600', icon: <TrendingUp className="w-3.5 h-3.5" /> },
        ].map(kpi => (
          <div key={kpi.label} className="card px-4 py-3">
            <p className="text-xs text-gray-500">{kpi.label}</p>
            <p className={cn('text-lg font-bold mt-0.5', kpi.color)}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Busca */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar cliente..." className="input pl-9 pr-8" />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-2.5 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Kanban */}
      <div className="grid grid-cols-5 gap-3 min-h-[600px]">
        {COLUMNS.map(col => {
          const cards = getColumn(col.key)
          const colValue = cards.reduce((s, q) => s + (q.final_value ?? q.quoted_value ?? 0), 0)

          return (
            <div
              key={col.key}
              onDragOver={e => e.preventDefault()}
              onDrop={e => handleDrop(e, col.key)}
              className={cn('rounded-xl border-2 flex flex-col transition-all', col.color, col.bg,
                dragging ? 'border-dashed' : ''
              )}
            >
              {/* Column header */}
              <div className={cn('px-3 py-2.5 rounded-t-xl', col.header)}>
                <div className="flex items-center justify-between">
                  <span className={cn('text-xs font-semibold', col.text)}>{col.label}</span>
                  <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded-full bg-white/70', col.text)}>
                    {cards.length}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{formatCurrency(colValue)}</p>
              </div>

              {/* Cards */}
              <div className="p-2 space-y-2 flex-1">
                {cards.length === 0 && (
                  <div className="h-16 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center">
                    <p className="text-xs text-gray-300">Arraste aqui</p>
                  </div>
                )}
                {cards.map(q => (
                  <KanbanCard
                    key={q.id}
                    quote={q}
                    onDragStart={handleDragStart}
                    isDragging={dragging === q.id}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function KanbanCard({ quote: q, onDragStart, isDragging }: {
  quote: any
  onDragStart: (e: React.DragEvent, id: string) => void
  isDragging: boolean
}) {
  const overdue = isOverdue(q.deadline) && q.status !== 'done'

  return (
    <Link href={`/quotes/${q.id}`}>
      <div
        draggable
        onDragStart={e => onDragStart(e, q.id)}
        className={cn(
          'bg-white rounded-lg p-3 border border-gray-100 shadow-sm',
          'hover:shadow-md transition-all cursor-grab active:cursor-grabbing',
          isDragging && 'opacity-50 scale-95'
        )}
      >
        {/* Cliente */}
        <p className="text-sm font-semibold text-gray-900 truncate leading-tight">
          {q.client_name}
        </p>
        {q.architect_name && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{q.architect_name}</p>
        )}

        {/* Valor */}
        <p className="text-sm font-bold text-gray-700 mt-2">
          {formatCurrency(q.final_value ?? q.quoted_value)}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between mt-2">
          {/* Donos */}
          <div className="flex items-center gap-0.5">
            {q.owners?.slice(0,3).map((o: any) => (
              <Avatar key={o.user_id} user={o} size={20} className="ring-1 ring-white" />
            ))}
          </div>

          {/* Prazo */}
          {q.deadline && (
            <span className={cn('text-[10px] font-medium',
              overdue ? 'text-red-500' : 'text-gray-400'
            )}>
              {overdue ? '⚠️ ' : ''}{formatDate(q.deadline)}
            </span>
          )}
        </div>

        {/* Priority indicator */}
        {q.priority === 'urgent' && (
          <div className="mt-1.5 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] text-red-500 font-medium">Urgente</span>
          </div>
        )}
      </div>
    </Link>
  )
}
