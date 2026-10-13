'use client'

// Tela inicial de /solicitacoes, no mesmo padrão de /quotes:
// pills de totalizadores por status (clicáveis como filtros rápidos) +
// barra de busca + tabela.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, FileSearch } from 'lucide-react'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { CATEGORY_LABEL, PRIORITY_LABEL, PRIORITY_COLOR } from '@/types'
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

const STATUS_PILLS: [IndexRow['status'], string, string, string][] = [
  ['in_progress', 'Em andamento', 'bg-amber-50 text-amber-700 border-amber-200',  'bg-amber-600 text-white border-amber-600'],
  ['closed',      'Venda fechada', 'bg-green-50 text-green-700 border-green-200', 'bg-green-600 text-white border-green-600'],
  ['lost',        'Perdida',       'bg-red-50 text-red-700 border-red-200',       'bg-red-600 text-white border-red-600'],
]

export function SolicitationsIndex({ rows }: { rows: IndexRow[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<IndexRow['status'] | null>(null)

  const totals = useMemo(() => ({
    in_progress: rows.filter(r => r.status === 'in_progress').length,
    closed:      rows.filter(r => r.status === 'closed').length,
    lost:        rows.filter(r => r.status === 'lost').length,
  }), [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (statusFilter && r.status !== statusFilter) return false
      if (!q) return true
      return (
        (r.title ?? '').toLowerCase().includes(q) ||
        (r.clientName ?? '').toLowerCase().includes(q) ||
        String(r.number).includes(q)
      )
    })
  }, [rows, search, statusFilter])

  const hasFilters = !!(search || statusFilter)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Solicitações</h1>
        <NewSolicitationButton />
      </div>

      {/* Totalizadores / filtros rápidos */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_PILLS.map(([key, label, defaultCls, activeCls]) => (
          <button key={key}
            onClick={() => setStatusFilter(statusFilter === key ? null : key)}
            className={cn('px-4 py-2 rounded-lg text-sm font-medium border transition-all',
              statusFilter === key ? activeCls : defaultCls
            )}>
            {label} <span className="ml-1.5 font-bold">{totals[key]}</span>
          </button>
        ))}
      </div>

      {/* Busca */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar título, cliente ou número…" className="input pl-9 pr-8" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-2.5 text-gray-400">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-surface-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-secondary border-b border-surface-border">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 tracking-wide">Nº</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 tracking-wide">TÍTULO / CLIENTE</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 tracking-wide">STATUS</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 tracking-wide">PRIORIDADE</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 tracking-wide">CATEGORIA</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 tracking-wide">ESTEIRA</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 tracking-wide">VALOR</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const statusC = STATUS_PILLS.find(p => p[0] === r.status)!
              const priorityC = PRIORITY_COLOR[r.priority as keyof typeof PRIORITY_COLOR]
              const days = daysInPipeline(r.createdAt)
              return (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/solicitacoes/${r.id}`)}
                  className="border-b border-surface-border last:border-0 hover:bg-surface-secondary/40 cursor-pointer transition-colors"
                >
                  <td className="px-6 py-3 text-xs font-mono text-gray-400">#{r.number}</td>
                  <td className="px-6 py-3">
                    <div className="text-sm font-medium text-navy">{r.title || r.clientName || '—'}</div>
                    {r.title && r.clientName && (
                      <div className="text-xs text-gray-400 truncate max-w-[300px]">{r.clientName}</div>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <span className={cn('inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border', statusC[2])}>
                      {statusC[1]}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    {r.priority && r.priority !== 'normal' && priorityC ? (
                      <span className={cn('inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold', priorityC.bg, priorityC.text)}>
                        {PRIORITY_LABEL[r.priority as keyof typeof PRIORITY_LABEL] ?? r.priority}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-xs text-gray-600">
                    {r.category ? (CATEGORY_LABEL[r.category as keyof typeof CATEGORY_LABEL] ?? r.category) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-6 py-3 text-xs text-gray-500">
                    {days} {days === 1 ? 'dia' : 'dias'}
                  </td>
                  <td className="px-6 py-3 text-right text-sm font-medium text-navy whitespace-nowrap">
                    {r.quotedValue != null ? formatCurrency(r.quotedValue) : <span className="text-xs text-gray-300 italic">sem orçamento</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="px-6 py-16 text-center flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-surface-secondary flex items-center justify-center">
              <FileSearch className="w-5 h-5 text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-navy">
                {hasFilters ? 'Nenhuma solicitação bate com esses filtros' : 'Nenhuma solicitação por aqui ainda'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {hasFilters ? 'Tente ajustar a busca ou limpar os filtros.' : 'Clique em "Nova solicitação" para começar.'}
              </p>
            </div>
            {hasFilters && (
              <button
                onClick={() => { setSearch(''); setStatusFilter(null) }}
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                Limpar filtros
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
