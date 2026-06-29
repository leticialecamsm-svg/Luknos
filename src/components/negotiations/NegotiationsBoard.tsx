'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { updateTemperature } from '@/lib/actions'
import { formatCurrency, formatDate, isOverdue, cn } from '@/lib/utils'
import { Search, X, Users } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { QuoteQuickViewModal } from '@/components/quotes/QuoteQuickViewModal'
import { NewQuoteButton } from '@/components/quotes/NewQuoteButton'

const COLUMNS = [
  { key: 'no_forecast', label: 'Sem previsão', accent: '#94A3B8' },
  { key: 'cold',   label: 'Frio',   accent: '#3B82F6' },
  { key: 'warm',   label: 'Morno',  accent: '#F59E0B' },
  { key: 'hot',    label: 'Quente', accent: '#EF4444' },
  { key: 'closed', label: 'Fechada', accent: '#10B981' },
  { key: 'lost',   label: 'Perdida', accent: '#9CA3AF' },
] as const

export function NegotiationsBoard({ quotes: initialQuotes, isAdmin }: { quotes: any[]; isAdmin: boolean }) {
  const [quotes, setQuotes] = useState(initialQuotes)
  const [search, setSearch] = useState('')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [pending, startTransition] = useTransition()
  const [dragging, setDragging] = useState<string | null>(null)
  const [quoteModal, setQuoteModal] = useState<string | null>(null)

  // Lista única de responsáveis para o filtro
  const owners: { id: string; name: string }[] = []
  const seen = new Set<string>()
  for (const q of quotes) for (const o of (q.owners ?? [])) {
    if (!seen.has(o.user_id)) { seen.add(o.user_id); owners.push({ id: o.user_id, name: o.name }) }
  }
  owners.sort((a, b) => a.name.localeCompare(b.name))

  const filtered = quotes.filter(q => {
    const mSearch = !search ||
      q.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      q.architect_name?.toLowerCase().includes(search.toLowerCase())
    const mOwner = ownerFilter === 'all' || (q.owners ?? []).some((o: any) => o.user_id === ownerFilter)
    return mSearch && mOwner
  })

  function getColumn(temp: string) {
    const columnCards = filtered.filter(q => (q.temperature ?? 'cold') === temp)
    // Ordena: alertas flagged no topo, depois o resto
    return columnCards.sort((a, b) => {
      const aFlagged = a.is_flagged_alert ? 0 : 1
      const bFlagged = b.is_flagged_alert ? 0 : 1
      return aFlagged - bFlagged
    })
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
    setQuotes(prev => prev.map(q => q.id === quoteId ? { ...q, temperature: newTemp } : q))
    setDragging(null)
    startTransition(async () => { await updateTemperature(quoteId, newTemp as any) })
  }

  // Totais (respeitam o filtro de colaborador)
  const totalOpen = filtered.filter(q => !['closed','lost'].includes(q.temperature ?? 'cold')).reduce((s, q) => s + (q.quoted_value ?? 0), 0)
  const totalHot = filtered.filter(q => q.temperature === 'hot').reduce((s, q) => s + (q.quoted_value ?? 0), 0)
  const totalClosed = filtered.filter(q => q.temperature === 'closed').reduce((s, q) => s + (q.final_value ?? 0), 0)

  return (
    <div className="space-y-5 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Negociações</h1>
          <p className="text-sm text-gray-400 mt-0.5">Arraste os cards entre as colunas para atualizar a negociação</p>
        </div>
        <NewQuoteButton className="btn-primary">+ Novo orçamento</NewQuoteButton>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Em aberto', value: formatCurrency(totalOpen), dot: '#3B82F6' },
          { label: 'Quente', value: formatCurrency(totalHot), dot: '#EF4444' },
          { label: 'Fechado no período', value: formatCurrency(totalClosed), dot: '#10B981' },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-2xl border border-gray-100 bg-white px-4 py-3">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: kpi.dot }} />
              <p className="text-xs text-gray-400">{kpi.label}</p>
            </div>
            <p className="text-lg font-bold text-gray-800 mt-1">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cliente, arquiteto..." className="input pl-9 pr-8" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-2.5 text-gray-400"><X className="w-4 h-4" /></button>}
        </div>
        <div className="relative">
          <Users className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}
            className={cn('select pl-9 pr-8', ownerFilter !== 'all' && 'border-brand-300 text-brand-700 bg-brand-50')}>
            <option value="all">Todos os colaboradores</option>
            {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      </div>

      {/* Kanban */}
      <div className="grid grid-cols-6 gap-3 min-h-[600px]">
        {COLUMNS.map(col => {
          const cards = getColumn(col.key)
          const colValue = cards.reduce((s, q) => s + (q.final_value ?? q.quoted_value ?? 0), 0)
          const isDropTarget = dragging != null

          return (
            <div
              key={col.key}
              onDragOver={e => e.preventDefault()}
              onDrop={e => handleDrop(e, col.key)}
              className={cn('rounded-2xl bg-gray-50/70 border border-gray-100 flex flex-col overflow-hidden transition-colors',
                isDropTarget && 'bg-gray-50')}
            >
              {/* Accent + header */}
              <div className="h-1" style={{ backgroundColor: col.accent }} />
              <div className="px-3 pt-3 pb-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.accent }} />
                  <span className="text-sm font-semibold text-gray-700">{col.label}</span>
                  <span className="ml-auto text-xs font-medium text-gray-400 bg-white border border-gray-100 rounded-full px-2 py-0.5">{cards.length}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1 pl-4">{formatCurrency(colValue)}</p>
              </div>

              {/* Cards */}
              <div className="px-2 pb-2 space-y-2 flex-1">
                {cards.length === 0 && (
                  <div className="h-14 rounded-xl border border-dashed border-gray-200 flex items-center justify-center">
                    <p className="text-[11px] text-gray-300">vazio</p>
                  </div>
                )}
                {cards.map(q => (
                  <KanbanCard key={q.id} quote={q} accent={col.accent} onDragStart={handleDragStart} isDragging={dragging === q.id} onOpen={() => setQuoteModal(q.id)} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {quoteModal && <QuoteQuickViewModal quoteId={quoteModal} onClose={() => setQuoteModal(null)} onFlagChange={() => { window.location.reload() }} />}
    </div>
  )
}

function KanbanCard({ quote: q, accent, onDragStart, isDragging, onOpen }: {
  quote: any
  accent: string
  onDragStart: (e: React.DragEvent, id: string) => void
  isDragging: boolean
  onOpen: () => void
}) {
  const overdue = isOverdue(q.deadline) && q.status !== 'done'

  return (
      <div
        draggable
        onDragStart={e => onDragStart(e, q.id)}
        onClick={onOpen}
        className={cn(
          'group bg-white rounded-xl p-3 border border-gray-100 transition-all cursor-pointer',
          'hover:border-gray-200 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]',
          isDragging && 'opacity-40'
        )}
      >
        <div className="flex items-start gap-2">
          <span className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: accent }} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{q.client_name}</p>
              {q.is_flagged_alert && <span className="text-orange-500 shrink-0">🚩</span>}
            </div>
            {q.architect_name && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{q.architect_name}</p>}
            <div className="flex items-center gap-1.5 mt-2">
              <p className="text-sm font-bold text-gray-800">{formatCurrency(q.final_value ?? q.quoted_value)}</p>
              {q.proposal_count > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-brand-100 text-brand-700 border border-brand-200">
                  +{q.proposal_count}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center -space-x-1">
                {q.owners?.slice(0,3).map((o: any) => (
                  <Avatar key={o.user_id} user={o} size={20} className="ring-2 ring-white" />
                ))}
              </div>
              {q.deadline && (
                <span className={cn('text-[10px] font-medium', overdue ? 'text-red-500' : 'text-gray-300')}>
                  {overdue ? '⚠️ ' : ''}{formatDate(q.deadline)}
                </span>
              )}
            </div>

            {/* Barra de urgência por tempo na temperatura */}
            {(() => {
              const LIMITS: Record<string, number> = { hot: 2, warm: 10, cold: 20 }
              const daysInTemp = q.temperature_updated_at
                ? Math.floor((Date.now() - new Date(q.temperature_updated_at).getTime()) / 86400000)
                : null
              const limit = LIMITS[q.temperature ?? '']
              const urgencyPct = limit && daysInTemp !== null ? daysInTemp / limit : 0
              if (daysInTemp === null || !limit) return null
              return (
                <div className="flex items-center gap-1 mt-1.5">
                  <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all',
                        urgencyPct >= 1 ? 'bg-red-500' : urgencyPct >= 0.7 ? 'bg-orange-400' : 'bg-green-400'
                      )}
                      style={{ width: `${Math.min(urgencyPct * 100, 100)}%` }}
                    />
                  </div>
                  <span className={cn('text-[10px] font-medium shrink-0',
                    urgencyPct >= 1 ? 'text-red-500' : 'text-gray-400'
                  )}>
                    {daysInTemp}d/{limit}d
                  </span>
                </div>
              )
            })()}

            {/* Badges de movimento de temperatura */}
            {q.last_auto_demoted_at && (Date.now() - new Date(q.last_auto_demoted_at).getTime()) < 48 * 60 * 60 * 1000 && (
              <div className="mt-1 inline-flex items-center gap-1">
                <span className="text-[10px] text-orange-500 font-medium">⬇ Rebaixado</span>
              </div>
            )}
            {q.last_promoted_at && (Date.now() - new Date(q.last_promoted_at).getTime()) < 24 * 60 * 60 * 1000 && (
              <div className="mt-1 inline-flex items-center gap-1">
                <span className="text-[10px] text-green-600 font-medium">⬆ Subiu</span>
              </div>
            )}

            {q.priority === 'urgent' && (
              <div className="mt-1.5 inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                <span className="text-[10px] text-red-500 font-medium">Urgente</span>
              </div>
            )}

            {/* Aviso: alerta flagado há 1+ dia sem atualização */}
            {q.is_flagged_alert && q.flagged_alert_at && (Date.now() - new Date(q.flagged_alert_at).getTime()) >= 24 * 60 * 60 * 1000 && (
              <div className="mt-2 p-1.5 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-[10px] font-medium text-orange-700">⚠️ 1+ dia sem atualização</p>
              </div>
            )}
          </div>
        </div>
      </div>
  )
}
