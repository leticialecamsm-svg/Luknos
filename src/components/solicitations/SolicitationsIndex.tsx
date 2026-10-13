'use client'

// Tela inicial de /solicitacoes: cards de resumo no topo + busca em memória
// (título ou cliente) + lista rica. Data vem pré-agregada do server.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Clock, CheckCircle2, XCircle, Sparkles, FileText, DollarSign } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { CATEGORY_LABEL, SIZE_LABEL, PRIORITY_LABEL, PRIORITY_COLOR } from '@/types'
import { NewSolicitationButton } from './NewSolicitationButton'
import { daysInPipeline } from '@/lib/solicitations/stages'

export type IndexRow = {
  id: string
  number: number
  title: string | null
  clientName: string | null
  createdAt: string
  priority: string
  category: string | null
  size: string | null
  quotedValue: number | null
  status: 'in_progress' | 'closed' | 'lost'
}

const STATUS_CONFIG: Record<IndexRow['status'], { label: string; bg: string; text: string; border: string }> = {
  in_progress: { label: 'Em andamento', bg: 'bg-amber-50',  text: 'text-amber-800', border: 'border-amber-200' },
  closed:      { label: 'Venda fechada', bg: 'bg-green-50', text: 'text-green-800', border: 'border-green-200' },
  lost:        { label: 'Perdida',       bg: 'bg-red-50',   text: 'text-red-800',   border: 'border-red-200'   },
}

function SummaryCard({ icon: Icon, label, value, tint }: { icon: any; label: string; value: number; tint: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2.5">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', tint)}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="leading-tight">
          <div className="text-[10.5px] uppercase tracking-wide text-gray-400 font-semibold">{label}</div>
          <div className="text-2xl font-bold text-navy">{value}</div>
        </div>
      </div>
    </div>
  )
}

export function SolicitationsIndex({ rows }: { rows: IndexRow[] }) {
  const [query, setQuery] = useState('')

  // Cards de resumo
  const summary = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    return {
      inProgress: rows.filter(r => r.status === 'in_progress').length,
      closed:     rows.filter(r => r.status === 'closed').length,
      lost:       rows.filter(r => r.status === 'lost').length,
      newInMonth: rows.filter(r => r.createdAt >= monthStart).length,
    }
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      (r.title ?? '').toLowerCase().includes(q) ||
      (r.clientName ?? '').toLowerCase().includes(q) ||
      String(r.number).includes(q)
    )
  }, [rows, query])

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-navy">Solicitações</h1>
        <NewSolicitationButton />
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryCard icon={Clock}         label="Em andamento"   value={summary.inProgress} tint="bg-amber-50 text-amber-700" />
        <SummaryCard icon={CheckCircle2}  label="Venda fechada"  value={summary.closed}     tint="bg-green-50 text-green-700" />
        <SummaryCard icon={XCircle}       label="Perdidas"       value={summary.lost}       tint="bg-red-50 text-red-700" />
        <SummaryCard icon={Sparkles}      label="Novas no mês"   value={summary.newInMonth} tint="bg-violet-50 text-violet-700" />
      </div>

      {/* Busca */}
      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar por título, cliente ou número…"
          className="input w-full pl-9 text-sm"
        />
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10 italic">
          {query ? 'Nenhuma solicitação com esses termos.' : 'Nenhuma solicitação ainda.'}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => <IndexRowCard key={r.id} r={r} />)}
        </div>
      )}
    </div>
  )
}

function IndexRowCard({ r }: { r: IndexRow }) {
  const statusC = STATUS_CONFIG[r.status]
  const priorityC = PRIORITY_COLOR[r.priority as keyof typeof PRIORITY_COLOR]
  const days = daysInPipeline(r.createdAt)

  return (
    <Link
      href={`/solicitacoes/${r.id}`}
      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 bg-white hover:shadow-sm hover:border-brand-300 transition-all"
    >
      <span className="text-[11px] font-mono text-gray-400 shrink-0 w-10">#{r.number}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-gray-800 truncate">{r.title || r.clientName || '—'}</span>
          <span className={cn('text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full border', statusC.bg, statusC.text, statusC.border)}>
            {statusC.label}
          </span>
          {r.priority && r.priority !== 'normal' && priorityC && (
            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', priorityC.bg, priorityC.text)}>
              {PRIORITY_LABEL[r.priority as keyof typeof PRIORITY_LABEL] ?? r.priority}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-1 flex-wrap">
          {r.title && r.clientName && <span className="truncate">{r.clientName}</span>}
          {r.category && (
            <span className="inline-flex items-center gap-1"><FileText className="w-3 h-3 text-gray-400" />{CATEGORY_LABEL[r.category as keyof typeof CATEGORY_LABEL] ?? r.category}</span>
          )}
          {r.size && (
            <span>{SIZE_LABEL[r.size as keyof typeof SIZE_LABEL] ?? r.size}</span>
          )}
          <span className="inline-flex items-center gap-1 text-gray-400">
            <Clock className="w-3 h-3" />{days} {days === 1 ? 'dia' : 'dias'} na esteira
          </span>
        </div>
      </div>

      <div className="text-right shrink-0 min-w-[80px]">
        {r.quotedValue != null ? (
          <div className="inline-flex items-center gap-1 text-sm font-semibold text-navy">
            <DollarSign className="w-3.5 h-3.5 text-gray-400" />
            {formatCurrency(r.quotedValue).replace('R$', '').trim()}
          </div>
        ) : (
          <span className="text-[11px] text-gray-300 italic">sem orçamento</span>
        )}
      </div>
    </Link>
  )
}
