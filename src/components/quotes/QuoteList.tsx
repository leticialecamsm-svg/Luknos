'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Search, X, Pencil } from 'lucide-react'
import { deleteQuote } from '@/lib/actions'
import { cn, formatDate, formatCurrency, getInitials, isOverdue, isDueToday } from '@/lib/utils'
import { QUOTE_STATUS_LABEL, STATUS_COLOR, TEMPERATURE_LABEL, TEMPERATURE_COLOR, CATEGORY_LABEL } from '@/types'

export function QuoteList({ quotes }: { quotes: any[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [pending, startTransition] = useTransition()

  const filtered = quotes.filter(q =>
    q.client_name?.toLowerCase().includes(search.toLowerCase()) ||
    (q.architect_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    String(q.number).includes(search)
  )

  function handleDelete(e: React.MouseEvent, id: string, clientName: string) {
    e.preventDefault(); e.stopPropagation()
    if (!confirm(`Excluir orçamento de "${clientName}"? Esta ação não pode ser desfeita.`)) return
    startTransition(async () => {
      await deleteQuote(id)
      router.refresh()
    })
  }

  if (quotes.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm text-gray-500 mb-3">Nenhum orçamento ainda</p>
        <a href="/quotes/new" className="btn-primary inline-flex">+ Criar primeiro orçamento</a>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por cliente, arquiteto ou número..." className="input pl-9 pr-9" />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-2.5 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {filtered.length === 0 && search && (
        <div className="card p-8 text-center">
          <p className="text-sm text-gray-400">Nenhum resultado para "{search}"</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(q => {
          const statusC  = STATUS_COLOR[q.status as keyof typeof STATUS_COLOR]
          const tempC    = q.temperature ? TEMPERATURE_COLOR[q.temperature as keyof typeof TEMPERATURE_COLOR] : null
          const overdue  = isOverdue(q.deadline) && q.status !== 'done'
          const dueToday = isDueToday(q.deadline)

          return (
            <div key={q.id}
              onClick={() => router.push(`/quotes/${q.id}`)}
              className="card flex items-center gap-4 px-4 py-3 hover:shadow-md transition-all group cursor-pointer"
            >
              <span className="text-xs text-gray-400 shrink-0 w-10 tabular-nums">
                #{String(q.number).padStart(3,'0')}
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{q.client_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {q.architect_name && <span className="text-xs text-gray-400 truncate">{q.architect_name}</span>}
                  <span className="text-xs text-gray-300">·</span>
                  <span className="text-xs text-gray-400">{CATEGORY_LABEL[q.category as keyof typeof CATEGORY_LABEL]}</span>
                </div>
              </div>

              {q.owners?.length > 0 && (
                <div className="hidden sm:flex items-center gap-1 shrink-0">
                  {q.owners.slice(0,3).map((o: any) => (
                    <div key={o.user_id} title={o.name}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-semibold ring-2 ring-white"
                      style={{ backgroundColor: o.avatar_color }}
                    >
                      {getInitials(o.name)}
                    </div>
                  ))}
                </div>
              )}

              <span className={cn('badge shrink-0', statusC.bg, statusC.text)}>
                {QUOTE_STATUS_LABEL[q.status as keyof typeof QUOTE_STATUS_LABEL]}
              </span>

              {tempC && (
                <span className={cn('badge shrink-0 border hidden sm:inline-flex', tempC.bg, tempC.text, tempC.border)}>
                  {TEMPERATURE_LABEL[q.temperature as keyof typeof TEMPERATURE_LABEL]}
                </span>
              )}

              <span className={cn('text-xs shrink-0 hidden md:block',
                overdue ? 'text-red-500 font-semibold' : dueToday ? 'text-amber-500 font-semibold' : 'text-gray-400'
              )}>
                {overdue ? '⚠️ ' : dueToday ? '⏰ ' : ''}{formatDate(q.deadline)}
              </span>

              <span className="text-sm font-medium text-gray-700 shrink-0 hidden sm:block">
                {q.final_value ? formatCurrency(q.final_value) : q.quoted_value ? formatCurrency(q.quoted_value) : '—'}
              </span>

              {/* Ações */}
<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
  <button
    onClick={e => { e.preventDefault(); e.stopPropagation(); router.push(`/quotes/${q.id}/edit`) }}
    className="p-1 text-gray-400 hover:text-brand-500 transition-colors"
    title="Editar"
  >
    <Pencil className="w-4 h-4" />
  </button>
  <button
    onClick={e => handleDelete(e, q.id, q.client_name)}
    disabled={pending}
    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
    title="Excluir"
  >
    <Trash2 className="w-4 h-4" />
  </button>
</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
