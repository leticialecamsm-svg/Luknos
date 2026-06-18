'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate, getInitials, isOverdue, cn } from '@/lib/utils'
import { QUOTE_STATUS_LABEL, TEMPERATURE_LABEL, TEMPERATURE_COLOR } from '@/types'
import { ChevronDown, ChevronUp, Search, X, Pencil, Trash2, Loader2, AlertTriangle, LayoutList, LayoutGrid } from 'lucide-react'
import { deleteQuote, deleteQuotes } from '@/lib/actions'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/useConfirm'
import { QuotesKanban } from './QuotesKanban'

type SortField = 'status' | 'deadline' | 'quoted_value' | null
type SortOrder = 'asc' | 'desc'

export function QuotesList({ myQuotes, allQuotes, isAdmin }: { myQuotes: any[]; allQuotes: any[]; isAdmin: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [view, setView] = useState<'mine' | 'all'>(isAdmin ? 'all' : 'mine')
  const [layout, setLayout] = useState<'list' | 'kanban'>('list')
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>(null)
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [dateFilter, setDateFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  const quotes = view === 'mine' ? myQuotes : allQuotes

  // All unique owners across allQuotes for the dropdown
  const allOwners: { id: string; name: string }[] = []
  const ownersSeen = new Set<string>()
  for (const q of allQuotes) {
    for (const o of (q.owners ?? [])) {
      if (!ownersSeen.has(o.user_id)) {
        ownersSeen.add(o.user_id)
        allOwners.push({ id: o.user_id, name: o.name })
      }
    }
  }

  const filtered = quotes.filter(q => {
    const matchesSearch = !search ||
      q.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      q.architect_name?.toLowerCase().includes(search.toLowerCase()) ||
      String(q.number).includes(search)

    const matchesDate = !dateFilter ||
      (q.deadline && q.deadline.startsWith(dateFilter)) ||
      (q.quote_date && q.quote_date.startsWith(dateFilter)) ||
      (q.closed_at && q.closed_at.startsWith(dateFilter))

    const matchesStatus = !statusFilter || (() => {
      if (statusFilter === 'urgent') return q.temperature === 'hot' && q.status !== 'done'
      return q.status === statusFilter
    })()

    const matchesOwner = !ownerFilter ||
      (q.owners ?? []).some((o: any) => o.user_id === ownerFilter)

    return matchesSearch && matchesDate && matchesStatus && matchesOwner
  })

  // Ordena
  const sorted = [...filtered].sort((a, b) => {
    if (!sortField) return 0

    let aVal = a[sortField]
    let bVal = b[sortField]

    if (sortField === 'deadline') {
      aVal = a.deadline ? new Date(a.deadline).getTime() : 0
      bVal = b.deadline ? new Date(b.deadline).getTime() : 0
    }

    if (aVal === null || aVal === undefined) return 1
    if (bVal === null || bVal === undefined) return -1

    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    return sortOrder === 'asc' ? cmp : -cmp
  })

  // Totals always from current view (before status filter so counts stay stable)
  const totals = {
    'queue':       quotes.filter(q => q.status === 'queue').length,
    'in_progress': quotes.filter(q => q.status === 'in_progress').length,
    'urgent':      quotes.filter(q => q.temperature === 'hot' && q.status !== 'done').length,
    'done':        quotes.filter(q => q.status === 'done').length,
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  function toggleSelectQuote(id: string) {
    const newSelected = new Set(selected)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelected(newSelected)
  }

  function toggleSelectAll() {
    if (selected.size === sorted.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(sorted.map(q => q.id)))
    }
  }

  async function handleDeleteSelected() {
    if (selected.size === 0) return
    const message = selected.size === 1
      ? `Excluir 1 orçamento?`
      : `Excluir ${selected.size} orçamentos?`
    const ok = await confirm(message, 'Sim, excluir')
    if (!ok) return

    setDeleting(true)
    const res = await deleteQuotes(Array.from(selected))
    setDeleting(false)

    if (res.ok) {
      toast.success('TUDO CERTO!', 'Orçamentos excluídos com sucesso.')
      setSelected(new Set())
      router.refresh()
    } else {
      toast.error('OCORREU UM ERRO', res.error || 'Não foi possível excluir os orçamentos.')
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string, clientName: string) {
    e.preventDefault()
    e.stopPropagation()
    const ok = await confirm(`Excluir orçamento de "${clientName}"?`, 'Sim, excluir')
    if (!ok) return
    const res = await deleteQuote(id)
    if (res?.error) {
      toast.error('OCORREU UM ERRO', 'Não foi possível excluir o orçamento.')
    } else {
      toast.success('TUDO CERTO!', 'Orçamento excluído.')
      router.refresh()
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronDown className="w-4 h-4 text-gray-300" />
    return sortOrder === 'asc' ?
      <ChevronUp className="w-4 h-4 text-brand-600" /> :
      <ChevronDown className="w-4 h-4 text-brand-600" />
  }

  return (
    <div className="space-y-4">
      {/* Totalizadores / filtros rápidos */}
      <div className="flex gap-2 flex-wrap">
        {([
          ['queue',       'Na fila',      'bg-gray-50 text-gray-700 border-gray-200',    'bg-gray-700 text-white border-gray-700'],
          ['in_progress', 'Em andamento', 'bg-gray-50 text-gray-700 border-gray-200',    'bg-gray-700 text-white border-gray-700'],
          ['urgent',      'Urgentes',     'bg-red-50 text-red-700 border-red-200',       'bg-red-600 text-white border-red-600'],
          ['done',        'Fechados',     'bg-green-50 text-green-700 border-green-200', 'bg-green-600 text-white border-green-600'],
        ] as const).map(([key, label, defaultCls, activeCls]) => (
          <button key={key}
            onClick={() => setStatusFilter(statusFilter === key ? null : key)}
            className={cn('px-4 py-2 rounded-lg text-sm font-medium border transition-all',
              statusFilter === key ? activeCls : defaultCls
            )}>
            {label} <span className="ml-1.5 font-bold">{totals[key]}</span>
          </button>
        ))}
      </div>

      {/* Abas + Filtros */}
      <div className="flex flex-col gap-3">
        {!isAdmin && (
          <div className="flex gap-1 bg-surface-secondary rounded-lg p-1 w-fit">
            {([['mine', 'Meus orçamentos'], ['all', 'Todos']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente, arquiteto..." className="input pl-9 pr-8" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-2.5 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filtro de responsável (aba Todos ou admin) */}
          {(view === 'all' || isAdmin) && allOwners.length > 0 && (
            <div className="relative">
              <select value={ownerFilter ?? ''} onChange={e => setOwnerFilter(e.target.value || null)}
                className={cn('select pr-8', ownerFilter ? 'border-brand-400 text-brand-700 bg-brand-50' : '')}>
                <option value="">Responsável</option>
                {allOwners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              {ownerFilter && (
                <button onClick={() => setOwnerFilter(null)} className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Filtro de data */}
          <div className="relative">
            <input type="month" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
              className={cn('input', dateFilter ? 'border-brand-400 text-brand-700 bg-brand-50' : '')} />
            {dateFilter && (
              <button onClick={() => setDateFilter('')} className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <p className="text-xs text-gray-400">{sorted.length} orçamento{sorted.length !== 1 ? 's' : ''}</p>

          {/* Layout toggle */}
          <div className="ml-auto flex gap-1 bg-surface-secondary rounded-lg p-1">
            <button onClick={() => setLayout('list')}
              title="Lista"
              className={cn('p-1.5 rounded-md transition-all', layout === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600')}>
              <LayoutList className="w-4 h-4" />
            </button>
            <button onClick={() => setLayout('kanban')}
              title="Kanban"
              className={cn('p-1.5 rounded-md transition-all', layout === 'kanban' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600')}>
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p className="flex-1 text-sm font-medium text-red-700">
              {selected.size} orçamento{selected.size !== 1 ? 's' : ''} selecionado{selected.size !== 1 ? 's' : ''}
            </p>
            <button
              onClick={() => setSelected(new Set())}
              className="text-sm text-red-600 hover:text-red-800 font-medium"
            >
              Limpar
            </button>
            <button
              onClick={handleDeleteSelected}
              disabled={deleting}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:bg-red-400 transition-colors"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Deletar
            </button>
          </div>
        )}
      </div>

      {/* Kanban */}
      {layout === 'kanban' && (
        <QuotesKanban initialQuotes={sorted} />
      )}

      {/* Tabela */}
      {layout === 'list' && <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selected.size > 0 && selected.size === sorted.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded cursor-pointer"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Nº</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">CLIENTE</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                <button onClick={() => toggleSort('status')} className="flex items-center gap-1 hover:text-brand-600">
                  STATUS <SortIcon field="status" />
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">NEGOCIAÇÃO</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">EQUIPE</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                <button onClick={() => toggleSort('deadline')} className="flex items-center gap-1 hover:text-brand-600">
                  PRAZO <SortIcon field="deadline" />
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                <button onClick={() => toggleSort('quoted_value')} className="flex items-center gap-1 hover:text-brand-600">
                  VALOR <SortIcon field="quoted_value" />
                </button>
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700">AÇÕES</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(q => {
              const overdue = isOverdue(q.deadline) && q.status !== 'done'
              const tempC = q.temperature ? TEMPERATURE_COLOR[q.temperature as keyof typeof TEMPERATURE_COLOR] : null

              // Calculate days using local timezone (string-based)
              const getDaysUntil = (deadline: string | null) => {
                if (!deadline) return null
                const today = new Date()
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
                const deadlineStr = deadline.split('T')[0]

                const [deadlineY, deadlineM, deadlineD] = deadlineStr.split('-').map(Number)
                const [todayY, todayM, todayD] = todayStr.split('-').map(Number)

                const deadlineDate = new Date(deadlineY, deadlineM - 1, deadlineD)
                const todayDate = new Date(todayY, todayM - 1, todayD)

                return Math.floor((deadlineDate.getTime() - todayDate.getTime()) / 86400000)
              }

              const daysUntil = getDaysUntil(q.deadline)

              // Format deadline status message
              const getDeadlineStatus = (days: number | null) => {
                if (days === null) return ''
                if (q.status === 'done') {
                  // Concluído: não mostra alerta, apenas registra atraso se houve
                  if (days < 0) return `concluído com ${Math.abs(days)} dia${Math.abs(days) > 1 ? 's' : ''} de atraso`
                  return ''
                }
                if (days < 0) return `Venceu a ${Math.abs(days)} dia${Math.abs(days) > 1 ? 's' : ''}`
                if (days === 0) return 'Vence hoje'
                if (days === 1) return 'Vence amanhã'
                return `Vence em ${days} dias`
              }

              return (
                <tr key={q.id} onClick={() => router.push(`/quotes/${q.id}`)}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-3" onClick={e => { e.stopPropagation(); toggleSelectQuote(q.id) }}>
                      <input
                        type="checkbox"
                        checked={selected.has(q.id)}
                        onChange={() => toggleSelectQuote(q.id)}
                        className="w-4 h-4 rounded cursor-pointer"
                      />
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500 cursor-pointer">#{String(q.number).padStart(3, '0')}</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold bg-blue-500">
                          {getInitials(q.client_name)}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-900">{q.client_name}</span>
                          {q.architect_name && <span className="text-xs text-gray-500">Arq. {q.architect_name}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                        q.status === 'queue' ? 'bg-blue-100 text-blue-800' :
                        q.status === 'in_progress' ? 'bg-amber-100 text-amber-800' :
                        q.status === 'review' ? 'bg-purple-100 text-purple-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {QUOTE_STATUS_LABEL[q.status as keyof typeof QUOTE_STATUS_LABEL]}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      {tempC ? (
                        <span className={cn('inline-flex text-xs font-medium px-2 py-1 rounded-full', tempC.bg, tempC.text)}>
                          {TEMPERATURE_LABEL[q.temperature as keyof typeof TEMPERATURE_LABEL]}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-1">
                        {q.owners?.slice(0, 3).map((o: any) => (
                          <div key={o.user_id} title={o.name}
                            className="w-6 h-6 rounded-full text-white text-[9px] font-bold flex items-center justify-center ring-1 ring-white"
                            style={{ backgroundColor: o.avatar_color }}>
                            {getInitials(o.name)}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">
                          {q.deadline ? formatDate(q.deadline) : '—'}
                        </span>
                        {q.deadline && (
                          <div className="flex items-center gap-1">
                            {daysUntil !== null && daysUntil < 0 && q.status !== 'done' && (
                              <AlertTriangle className="w-3 h-3 text-red-600" />
                            )}
                            <span className={`text-xs font-medium ${
                              q.status === 'done' ? 'text-gray-400' :
                              daysUntil !== null && daysUntil < 0 ? 'text-red-600' :
                              daysUntil === 0 ? 'text-orange-500' :
                              daysUntil === 1 ? 'text-purple-600' :
                              'text-gray-500'
                            }`}>
                              {getDeadlineStatus(daysUntil)}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm font-semibold text-gray-900">
                      {formatCurrency(q.final_value ?? q.quoted_value)}
                    </td>
                    <td className="px-6 py-3 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={e => { e.stopPropagation(); router.push(`/quotes/${q.id}/edit`) }}
                          className="text-gray-400 hover:text-brand-600 transition-colors p-1">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={e => handleDelete(e, q.id, q.client_name)}
                          className="text-gray-400 hover:text-red-600 transition-colors p-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
              )
            })}
          </tbody>
        </table>

        {sorted.length === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="text-gray-500">Nenhum orçamento encontrado</p>
          </div>
        )}
      </div>}
      {ConfirmDialog}
    </div>
  )
}
