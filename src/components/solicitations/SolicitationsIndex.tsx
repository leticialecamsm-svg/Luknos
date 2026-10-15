'use client'

// Listagem completa de solicitações: filtros em pills no mesmo visual da
// pipeline de uma solicitação (verde = concluída, âmbar = atual, listrado
// cinza = futura/não iniciada), toggle Lista / Kanban, avatares da equipe
// designada por solicitação e filtro por responsável.

import { useMemo, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X, FileSearch, Check, Clock, LayoutList, LayoutGrid, Users } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { PRIORITY_LABEL, PRIORITY_COLOR } from '@/types'
import { NewSolicitationButton } from './NewSolicitationButton'
import { daysInPipeline } from '@/lib/solicitations/stages'

export type TeamUser = { id: string; name: string; avatar_url: string | null; avatar_color: string | null }

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
  currentStage: string | null
  team: TeamUser[]
}

const STAGE_PILLS: { id: string; label: string }[] = [
  { id: 'visita',     label: 'Visita' },
  { id: 'projeto',    label: 'Projeto' },
  { id: 'orcamento',  label: 'Orçamento' },
  { id: 'negociacao', label: 'Negociação' },
  { id: 'compra',     label: 'Compra' },
  { id: 'expedicao',  label: 'Separação e e…' },
  { id: 'instalacao', label: 'Instalação' },
  { id: 'posVenda',   label: 'Pós-venda' },
]

// Estilo visual IDÊNTICO ao StagePipeline da solicitação:
// current = âmbar (filtro ativo), done = verde (etapas concluídas em geral),
// not_started = tracejado cinza.
function pillStyle(state: 'current' | 'done' | 'not_started'): React.CSSProperties {
  if (state === 'current') return { background: 'linear-gradient(180deg,#fdecc0,#f5d78a)', color: '#5c4410', border: '1px solid #e0bd69' }
  if (state === 'done')    return { background: 'linear-gradient(180deg,#d9f7e6,#bdeed3)', color: '#065f46', border: '1px solid #9fe0bc' }
  return { backgroundImage: 'repeating-linear-gradient(45deg,#eef0f4,#eef0f4 9px,#f7f8fa 9px,#f7f8fa 18px)', color: '#8b94a5', border: '1px dashed #cdd3de' }
}

export function SolicitationsIndex({ rows }: { rows: IndexRow[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<string | null>(searchParams.get('etapa'))
  const [respFilter, setRespFilter] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'kanban'>('list')

  // Sincroniza stageFilter com a URL (?etapa=visita)
  useEffect(() => { setStageFilter(searchParams.get('etapa')) }, [searchParams])
  function setStage(id: string | null) {
    setStageFilter(id)
    const sp = new URLSearchParams(searchParams.toString())
    if (id) sp.set('etapa', id); else sp.delete('etapa')
    router.replace(`/solicitacoes/lista${sp.toString() ? `?${sp}` : ''}`, { scroll: false })
  }

  // Contadores por etapa (apenas solicitações em andamento)
  const stageTotals = useMemo(() => {
    const t: Record<string, number> = {}
    for (const r of rows) {
      if (r.status !== 'in_progress') continue
      if (r.currentStage) t[r.currentStage] = (t[r.currentStage] ?? 0) + 1
    }
    return t
  }, [rows])

  // Lista de responsáveis para o dropdown
  const allResponsibles = useMemo(() => {
    const seen = new Map<string, TeamUser>()
    for (const r of rows) for (const u of r.team) if (!seen.has(u.id)) seen.set(u.id, u)
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (stageFilter && r.currentStage !== stageFilter) return false
      if (respFilter && !r.team.some(u => u.id === respFilter)) return false
      if (!q) return true
      return (
        (r.title ?? '').toLowerCase().includes(q) ||
        (r.clientName ?? '').toLowerCase().includes(q) ||
        String(r.number).includes(q)
      )
    })
  }, [rows, search, stageFilter, respFilter])

  const hasFilters = !!(search || stageFilter || respFilter)

  function clearAll() { setSearch(''); setStage(null); setRespFilter(null) }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Solicitações</h1>
        <NewSolicitationButton />
      </div>

      {/* Pills de etapa — mesmo visual da pipeline da solicitação */}
      <div className="flex gap-1 flex-wrap">
        {STAGE_PILLS.map(st => {
          const isActive = stageFilter === st.id
          const total = stageTotals[st.id] ?? 0
          const state: 'current' | 'not_started' = isActive ? 'current' : 'not_started'
          return (
            <button
              key={st.id}
              type="button"
              onClick={() => setStage(isActive ? null : st.id)}
              className="min-w-[110px] text-left px-3 py-2 transition-shadow hover:opacity-90"
              style={{ borderRadius: 12, ...pillStyle(state) }}
            >
              <div className="flex items-center gap-1">
                <span className="text-[11.5px] font-semibold truncate">{st.label}</span>
                {isActive && <Clock className="ml-auto shrink-0 w-3 h-3" />}
              </div>
              <div className="text-[10.5px] font-medium opacity-85 mt-0.5">
                {total} {total === 1 ? 'solic.' : 'solic.'}
              </div>
            </button>
          )
        })}
      </div>

      {/* Linha de controles: busca + responsável + view toggle */}
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

        <div className="relative">
          <Users className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
          <select value={respFilter ?? ''} onChange={e => setRespFilter(e.target.value || null)}
            className={cn('select pl-8 pr-8', respFilter ? 'border-brand-400 text-brand-700 bg-brand-50' : '')}>
            <option value="">Responsável</option>
            {allResponsibles.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          {respFilter && (
            <button onClick={() => setRespFilter(null)} className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {hasFilters && (
          <button onClick={clearAll} className="text-xs font-medium text-brand-600 hover:text-brand-700">
            Limpar filtros
          </button>
        )}

        <div className="ml-auto inline-flex rounded-lg border border-surface-border bg-white p-0.5">
          <button
            type="button"
            onClick={() => setView('list')}
            className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
              view === 'list' ? 'bg-navy text-white' : 'text-gray-500 hover:text-gray-700')}
          >
            <LayoutList className="w-3.5 h-3.5" /> Lista
          </button>
          <button
            type="button"
            onClick={() => setView('kanban')}
            className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
              view === 'kanban' ? 'bg-navy text-white' : 'text-gray-500 hover:text-gray-700')}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Kanban
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState hasFilters={hasFilters} onClear={clearAll} />
      ) : view === 'list' ? (
        <ListTable rows={filtered} />
      ) : (
        <KanbanBoard rows={filtered} />
      )}
    </div>
  )
}

// ── Lista (tabela) ────────────────────────────────────────────────────────────

function ListTable({ rows }: { rows: IndexRow[] }) {
  const router = useRouter()
  return (
    <div className="bg-white rounded-xl border border-surface-border overflow-hidden">
      <table className="w-full">
        <thead className="bg-surface-secondary border-b border-surface-border">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 tracking-wide">Nº</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 tracking-wide">TÍTULO / CLIENTE</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 tracking-wide">ETAPA ATUAL</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 tracking-wide">RESPONSÁVEIS</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 tracking-wide">PRIORIDADE</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 tracking-wide">ESTEIRA</th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 tracking-wide">VALOR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const priorityC = PRIORITY_COLOR[r.priority as keyof typeof PRIORITY_COLOR]
            const stLabel = STAGE_PILLS.find(s => s.id === r.currentStage)?.label ?? '—'
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
                  {r.title && r.clientName && <div className="text-xs text-gray-400 truncate max-w-[280px]">{r.clientName}</div>}
                </td>
                <td className="px-6 py-3">
                  {r.currentStage ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md" style={pillStyle(r.status === 'in_progress' ? 'current' : 'done')}>
                      {r.status === 'in_progress' ? <Clock className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                      {stLabel}
                    </span>
                  ) : <span className="text-xs text-gray-300">—</span>}
                </td>
                <td className="px-6 py-3"><TeamStack team={r.team} /></td>
                <td className="px-6 py-3">
                  {r.priority !== 'normal' && priorityC ? (
                    <span className={cn('inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold', priorityC.bg, priorityC.text)}>
                      {PRIORITY_LABEL[r.priority as keyof typeof PRIORITY_LABEL] ?? r.priority}
                    </span>
                  ) : <span className="text-xs text-gray-300">—</span>}
                </td>
                <td className="px-6 py-3 text-xs text-gray-500">{days} {days === 1 ? 'dia' : 'dias'}</td>
                <td className="px-6 py-3 text-right text-sm font-medium text-navy whitespace-nowrap">
                  {r.quotedValue != null ? formatCurrency(r.quotedValue) : <span className="text-xs text-gray-300 italic">sem orçamento</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Kanban por etapa atual ────────────────────────────────────────────────────

function KanbanBoard({ rows }: { rows: IndexRow[] }) {
  const router = useRouter()
  const byStage = useMemo(() => {
    const map: Record<string, IndexRow[]> = {}
    for (const r of rows) {
      const key = r.currentStage ?? '_none'
      ;(map[key] ??= []).push(r)
    }
    return map
  }, [rows])

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-3 pb-2" style={{ minWidth: 'fit-content' }}>
        {STAGE_PILLS.map(st => {
          const items = byStage[st.id] ?? []
          return (
            <div key={st.id} className="w-[260px] shrink-0">
              <div
                className="px-3 py-2 mb-2 rounded-xl text-[12px] font-semibold flex items-center justify-between"
                style={pillStyle(items.length > 0 ? 'current' : 'not_started')}
              >
                <span>{st.label}</span>
                <span className="text-[11px] font-bold">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map(r => <KanbanCard key={r.id} r={r} onClick={() => router.push(`/solicitacoes/${r.id}`)} />)}
                {items.length === 0 && <p className="text-[11px] text-gray-300 italic text-center py-2">vazio</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function KanbanCard({ r, onClick }: { r: IndexRow; onClick: () => void }) {
  const priorityC = PRIORITY_COLOR[r.priority as keyof typeof PRIORITY_COLOR]
  const days = daysInPipeline(r.createdAt)
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white border border-surface-border rounded-xl px-3 py-2.5 hover:border-brand-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[10px] font-mono text-gray-400">#{r.number}</span>
        {r.priority !== 'normal' && priorityC && (
          <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-full', priorityC.bg, priorityC.text)}>
            {PRIORITY_LABEL[r.priority as keyof typeof PRIORITY_LABEL] ?? r.priority}
          </span>
        )}
      </div>
      <div className="text-[13px] font-semibold text-navy truncate">{r.title || r.clientName || '—'}</div>
      {r.title && r.clientName && <div className="text-[11px] text-gray-400 truncate">{r.clientName}</div>}
      <div className="flex items-center justify-between gap-2 mt-2">
        <TeamStack team={r.team} size={18} />
        <span className="text-[10px] text-gray-400">{days}d</span>
      </div>
      {r.quotedValue != null && (
        <div className="text-[11px] font-semibold text-navy mt-1">{formatCurrency(r.quotedValue)}</div>
      )}
    </button>
  )
}

// ── Avatares empilhados ──────────────────────────────────────────────────────

function TeamStack({ team, size = 22 }: { team: TeamUser[]; size?: number }) {
  if (team.length === 0) return <span className="text-[10px] text-gray-300 italic">sem responsáveis</span>
  const visible = team.slice(0, 4)
  const extra = team.length - visible.length
  return (
    <div className="flex -space-x-1.5">
      {visible.map(u => <Avatar key={u.id} user={u} size={size} />)}
      {extra > 0 && (
        <div
          className="rounded-full bg-gray-100 ring-1 ring-white text-gray-600 flex items-center justify-center font-semibold shrink-0"
          style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
        >
          +{extra}
        </div>
      )}
    </div>
  )
}

function Avatar({ user, size }: { user: TeamUser; size: number }) {
  if (user.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.avatar_url} alt={user.name} title={user.name}
      className="rounded-full object-cover ring-1 ring-white shrink-0"
      style={{ width: size, height: size }} />
  }
  const initials = user.name.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div
      title={user.name}
      className="rounded-full flex items-center justify-center font-semibold ring-1 ring-white shrink-0 text-white"
      style={{
        width: size, height: size,
        background: user.avatar_color ?? '#9ca3af',
        fontSize: Math.round(size * 0.42),
      }}
    >
      {initials}
    </div>
  )
}

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-surface-border px-6 py-16 text-center flex flex-col items-center gap-3">
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
        <button onClick={onClear} className="text-xs font-medium text-brand-600 hover:text-brand-700">
          Limpar filtros
        </button>
      )}
    </div>
  )
}
