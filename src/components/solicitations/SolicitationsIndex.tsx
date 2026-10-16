'use client'

// Listagem completa de solicitações: filtros em pills no mesmo visual da
// pipeline de uma solicitação (verde = concluída, âmbar = atual, listrado
// cinza = futura/não iniciada), toggle Lista / Kanban, avatares da equipe
// designada por solicitação e filtro por responsável.

import { useMemo, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X, FileSearch, Check, LayoutList, LayoutGrid, Users, ChevronLeft, ChevronRight, MapPin, Ruler, FileText, HandCoins, ShoppingCart, Package, Wrench, HeartPulse, AlertTriangle, CalendarClock } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { PRIORITY_LABEL, PRIORITY_COLOR } from '@/types'
import { daysInPipeline } from '@/lib/solicitations/stages'
import { isDoneStatus, dueState, localYmd, type IndexRow, type TeamUser } from '@/lib/solicitations/index-types'
import { moveStageCardStatus } from '@/lib/solicitations/actions'
import { useToast } from '@/components/ui/Toast'

export type { IndexRow, TeamUser }

const STAGE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  visita: MapPin, projeto: Ruler, orcamento: FileText, negociacao: HandCoins,
  compra: ShoppingCart, expedicao: Package, instalacao: Wrench, posVenda: HeartPulse,
}

const STAGE_PILLS: { id: string; label: string; color: string }[] = [
  { id: 'visita',     label: 'Visita',               color: '#6366f1' }, // indigo
  { id: 'projeto',    label: 'Projeto',              color: '#6366f1' },
  { id: 'orcamento',  label: 'Orçamento',            color: '#cba455' }, // amber (brand)
  { id: 'negociacao', label: 'Negociação',           color: '#cba455' },
  { id: 'compra',     label: 'Compra',               color: '#eab308' }, // yellow
  { id: 'expedicao',  label: 'Separação e entrega',  color: '#eab308' },
  { id: 'instalacao', label: 'Instalação',           color: '#3b82f6' }, // blue
  { id: 'posVenda',   label: 'Pós-venda',            color: '#3b82f6' },
]


// Colunas do kanban de cada etapa = lista de status DAQUELA etapa (os mesmos
// das telas atuais: Orçamentos, Negociações, Expedição, etc.).
type StatusCol = { key: string; label: string; color: string }
const STAGE_STATUSES: Record<string, StatusCol[]> = {
  visita: [
    { key: 'to_schedule', label: 'A agendar',      color: '#9ca3af' },
    { key: 'scheduled',   label: 'Agendada',       color: '#3b82f6' },
    { key: 'done',        label: 'Realizada',      color: '#22c55e' },
    { key: 'not_needed',  label: 'Não necessária', color: '#d1d5db' },
  ],
  projeto: [
    { key: 'fila',         label: 'Na fila',      color: '#9ca3af' },
    { key: 'em_andamento', label: 'Em andamento', color: '#f59e0b' },
    { key: 'concluido',    label: 'Concluído',    color: '#22c55e' },
  ],
  orcamento: [
    { key: 'queue',       label: 'Na fila',                color: '#3b82f6' },
    { key: 'in_progress', label: 'Em andamento',           color: '#f59e0b' },
    { key: 'review',      label: 'Revisão',                color: '#a855f7' },
    { key: 'revision',    label: 'Elaborando nova versão', color: '#ec4899' },
    { key: 'paused',      label: 'Pausado',                color: '#9ca3af' },
    { key: 'done',        label: 'Concluído',              color: '#22c55e' },
  ],
  negociacao: [
    { key: 'no_forecast', label: 'Sem previsão',  color: '#9ca3af' },
    { key: 'cold',        label: 'Frio',          color: '#38bdf8' },
    { key: 'warm',        label: 'Morno',         color: '#f59e0b' },
    { key: 'hot',         label: 'Quente',        color: '#ef4444' },
    { key: 'closed',      label: 'Venda fechada', color: '#22c55e' },
    { key: 'lost',        label: 'Perdida',       color: '#6b7280' },
  ],
  compra: [
    { key: 'a_pedir',  label: 'A pedir',  color: '#9ca3af' },
    { key: 'pedido',   label: 'Pedido',   color: '#f59e0b' },
    { key: 'recebido', label: 'Recebido', color: '#22c55e' },
  ],
  expedicao: [
    { key: 'queued',            label: 'Na fila',             color: '#9ca3af' },
    { key: 'in_progress',       label: 'Em andamento',        color: '#f59e0b' },
    { key: 'awaiting_material', label: 'Aguardando material', color: '#f97316' },
    { key: 'completed',         label: 'Concluída',           color: '#14b8a6' },
    { key: 'delivered',         label: 'Entregue/Retirada',   color: '#16a34a' },
  ],
  instalacao: [
    { key: 'agendada',      label: 'Agendada',      color: '#3b82f6' },
    { key: 'em_andamento',  label: 'Em andamento',  color: '#f59e0b' },
    { key: 'com_pendencia', label: 'Com pendência', color: '#ef4444' },
    { key: 'concluida',     label: 'Concluída',     color: '#22c55e' },
  ],
  posVenda: [
    { key: 'em_aberto', label: 'Em aberto', color: '#f59e0b' },
    { key: 'resolvido', label: 'Resolvido', color: '#22c55e' },
  ],
}


function sameMonth(iso: string, month: Date) {
  const d = new Date(iso)
  return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth()
}

// Visível = tem registro na etapa e, se já concluído, foi concluído no mês escolhido.
function visibleIn(r: IndexRow, stage: string, month: Date) {
  const st = r.stageStatus[stage]
  if (st === undefined) return false
  if (!isDoneStatus(stage, st)) return true
  const at = r.stageDoneAt[stage]
  return !!at && sameMonth(at, month)
}

const PROJECT_KIND: Record<string, { label: string; bg: string; text: string }> = {
  elaboracao:      { label: 'Elaboração para orçamento', bg: 'bg-violet-50', text: 'text-violet-700' },
  alocacao_pontos: { label: 'Alocação de pontos', bg: 'bg-sky-50',    text: 'text-sky-700' },
}

export function SolicitationsIndex({ rows: rowsProp, month, onMonthChange }: { rows: IndexRow[]; month: Date; onMonthChange: (d: Date) => void }) {
  const router = useRouter()
  const toast = useToast()
  // Mudanças otimistas do arrastar: ficam até a lista do servidor chegar atualizada.
  const [overrides, setOverrides] = useState<Record<string, { status: string; doneAt: string | null }>>({})
  useEffect(() => { setOverrides({}) }, [rowsProp])
  const rows = useMemo(() => {
    const keys = Object.keys(overrides)
    if (keys.length === 0) return rowsProp
    return rowsProp.map(r => {
      const mine = keys.filter(k => k.startsWith(`${r.id}:`))
      if (mine.length === 0) return r
      const stageStatus = { ...r.stageStatus }
      const stageDoneAt = { ...r.stageDoneAt }
      for (const k of mine) {
        const stage = k.slice(r.id.length + 1)
        const o = overrides[k]
        stageStatus[stage] = o.status
        if (o.doneAt) stageDoneAt[stage] = o.doneAt; else delete stageDoneAt[stage]
      }
      return { ...r, stageStatus, stageDoneAt }
    })
  }, [rowsProp, overrides])

  async function moveCard(rowId: string, stage: string, toStatus: string) {
    const row = rowsProp.find(r => r.id === rowId)
    if (!row) return
    const from = (rows.find(r => r.id === rowId) ?? row).stageStatus[stage]
    if (from === toStatus) return
    if (stage === 'posVenda') {
      toast.info('PÓS-VENDA', 'Para marcar como resolvido, registre o encaminhamento na aba Pós-venda da solicitação.')
      return
    }
    const recordId = row.stageRecordId[stage]
    if (!recordId) return
    const key = `${rowId}:${stage}`
    const prev = overrides[key]
    setOverrides(o => ({ ...o, [key]: { status: toStatus, doneAt: isDoneStatus(stage, toStatus) ? new Date().toISOString() : null } }))
    const res = await moveStageCardStatus({ solicitationId: rowId, stage, recordId, status: toStatus })
    if (res.error) {
      setOverrides(o => {
        const n = { ...o }
        if (prev) n[key] = prev; else delete n[key]
        return n
      })
      toast.error('NÃO FOI POSSÍVEL MOVER', res.error)
      return
    }
    router.refresh()
  }

  const searchParams = useSearchParams()
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<string | null>(searchParams.get('etapa'))
  const [respFilter, setRespFilter] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'kanban'>('kanban')

  // Sincroniza stageFilter com a URL (?etapa=visita)
  useEffect(() => { setStageFilter(searchParams.get('etapa')) }, [searchParams])
  function setStage(id: string | null) {
    setStageFilter(id)
    const sp = new URLSearchParams(searchParams.toString())
    if (id) sp.set('etapa', id); else sp.delete('etapa')
    router.replace(`/solicitacoes${sp.toString() ? `?${sp}` : ''}`, { scroll: false })
  }

  // Contadores por etapa (apenas solicitações em andamento)
  const stageTotals = useMemo(() => {
    const t: Record<string, number> = {}
    for (const r of rows) {
      for (const stId of Object.keys(r.stageStatus)) {
        if (visibleIn(r, stId, month)) t[stId] = (t[stId] ?? 0) + 1
      }
    }
    return t
  }, [rows, month])

  // Lista de responsáveis para o dropdown
  const allResponsibles = useMemo(() => {
    const seen = new Map<string, TeamUser>()
    for (const r of rows) {
      const list = stageFilter ? (r.teamByStage[stageFilter] ?? []) : r.team
      for (const u of list) if (!seen.has(u.id)) seen.set(u.id, u)
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [rows, stageFilter])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (stageFilter) {
        if (!visibleIn(r, stageFilter, month)) return false
      } else if (r.currentStage && !visibleIn(r, r.currentStage, month)) {
        return false
      }
      const people = stageFilter ? (r.teamByStage[stageFilter] ?? []) : r.team
      if (respFilter && !people.some(u => u.id === respFilter)) return false
      if (!q) return true
      return (
        (r.title ?? '').toLowerCase().includes(q) ||
        (r.clientName ?? '').toLowerCase().includes(q) ||
        String(r.number).includes(q)
      )
    })
  }, [rows, search, stageFilter, respFilter, month])

  const hasFilters = !!(search || stageFilter || respFilter)

  function clearAll() { setSearch(''); setStage(null); setRespFilter(null) }

  return (
    <div className="space-y-4">
      {/* Etapas: um cartão por etapa, ocupando toda a linha */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
        {STAGE_PILLS.map(st => {
          const isActive = stageFilter === st.id
          const total = stageTotals[st.id] ?? 0
          const Icon = STAGE_ICON[st.id]
          return (
            <button
              key={st.id}
              type="button"
              onClick={() => setStage(isActive ? null : st.id)}
              aria-pressed={isActive}
              className={cn(
                'relative text-left rounded-2xl bg-white px-3 py-2.5 transition-all border',
                isActive ? 'shadow-sm' : 'border-surface-border hover:border-gray-300',
              )}
              style={isActive ? { borderColor: st.color, boxShadow: `0 0 0 1px ${st.color}`, background: `${st.color}14` } : undefined}
            >
              {isActive && <Check className="absolute top-2 right-2 w-3.5 h-3.5" style={{ color: st.color }} />}
              <span
                className="w-8 h-8 rounded-xl flex items-center justify-center mb-2"
                style={{ background: `${st.color}1f`, color: st.color }}
              >
                <Icon className="w-4 h-4" />
              </span>
              <p className="text-[13px] font-semibold text-navy leading-tight truncate" title={st.label}>{st.label}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                <span className="font-semibold text-gray-700">{total}</span> {total === 1 ? 'solicitação' : 'solicitações'}
              </p>
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

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {/* Passador de mês: concluídos aparecem só do mês escolhido */}
          <div className="inline-flex items-center rounded-lg border border-surface-border bg-white" title="Concluídos de todas as etapas aparecem apenas do mês escolhido">
            <button
              type="button"
              aria-label="Mês anterior"
              onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              className="p-1.5 text-gray-500 hover:text-gray-800"
            ><ChevronLeft className="w-4 h-4" /></button>
            <span className="px-1 text-xs font-medium text-gray-700 min-w-[110px] text-center capitalize">
              {month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              aria-label="Próximo mês"
              disabled={month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth()}
              onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              className="p-1.5 text-gray-500 hover:text-gray-800 disabled:opacity-30"
            ><ChevronRight className="w-4 h-4" /></button>
          </div>

          <div className="inline-flex rounded-lg border border-surface-border bg-white p-0.5">
            <button
              type="button"
              onClick={() => setView('kanban')}
              className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                view === 'kanban' ? 'bg-navy text-white' : 'text-gray-500 hover:text-gray-700')}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Kanban
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                view === 'list' ? 'bg-navy text-white' : 'text-gray-500 hover:text-gray-700')}
            >
              <LayoutList className="w-3.5 h-3.5" /> Lista
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState hasFilters={hasFilters} onClear={clearAll} />
      ) : view === 'list' ? (
        <ListTable rows={filtered} stageId={stageFilter} />
      ) : (
        stageFilter
          ? <StatusKanban stageId={stageFilter} rows={filtered} onMove={moveCard} />
          : <KanbanBoard rows={filtered} />
      )}
    </div>
  )
}

// ── Lista (tabela) ────────────────────────────────────────────────────────────

function ListTable({ rows, stageId }: { rows: IndexRow[]; stageId: string | null }) {
  const router = useRouter()
  return (
    <div className="bg-white rounded-xl border border-surface-border overflow-hidden">
      <table className="w-full">
        <thead className="bg-surface-secondary border-b border-surface-border">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 tracking-wide">Nº</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 tracking-wide">TÍTULO / CLIENTE</th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 tracking-wide">{stageId ? 'STATUS' : 'ETAPA ATUAL'}</th>
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
                  {stageId ? (() => {
                    const col = (STAGE_STATUSES[stageId] ?? []).find(c => c.key === r.stageStatus[stageId])
                    return col ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-md border" style={{ background: '#f9fafb', borderLeft: `3px solid ${col.color}`, color: '#111827' }}>
                          {col.label}
                        </span>
                        {stageId === 'projeto' && r.projectKind && PROJECT_KIND[r.projectKind] && (
                          <span className={cn('text-[10px] font-medium px-1.5 py-px rounded', PROJECT_KIND[r.projectKind].bg, PROJECT_KIND[r.projectKind].text)}>
                            {PROJECT_KIND[r.projectKind].label}
                          </span>
                        )}
                      </span>
                    ) : <span className="text-xs text-gray-300">—</span>
                  })() : r.currentStage ? (
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-md border"
                      style={{
                        background: '#f9fafb',
                        borderLeft: `3px solid ${STAGE_PILLS.find(s => s.id === r.currentStage)?.color ?? '#9ca3af'}`,
                        color: '#111827',
                      }}
                    >
                      {stLabel}
                    </span>
                  ) : <span className="text-xs text-gray-300">—</span>}
                </td>
                <td className="px-6 py-3"><TeamStack team={stageId ? (r.teamByStage[stageId] ?? []) : r.team} /></td>
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

// ── Kanban por etapa atual (padrão do CrmBoardPage) ──────────────────────────
// Colunas w-64 (256px) com fundo cinza-50, borda cinza, header com borda
// superior de 3px na cor da etapa. Colunas sem cartões ficam RECOLHIDAS num
// trilho w-10 com o nome em texto vertical. Cartões: fundo branco, border-l-4
// na cor da etapa, shadow leve, hover com shadow maior.

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
      <div className="flex gap-3 pb-2 items-stretch" style={{ minWidth: 'fit-content' }}>
        {STAGE_PILLS.map(st => {
          const items = byStage[st.id] ?? []
          if (items.length === 0) {
            return (
              <section
                key={st.id}
                aria-label={`Coluna ${st.label} (vazia)`}
                className="w-10 shrink-0 flex flex-col items-center justify-start py-2 gap-2 rounded-xl bg-gray-50 border border-gray-200"
                style={{ borderTop: `3px solid ${st.color}` }}
              >
                <span className="text-[11px] text-gray-400">0</span>
                <span className="text-xs font-medium text-gray-500 whitespace-nowrap [writing-mode:vertical-rl] rotate-180">{st.label}</span>
              </section>
            )
          }
          return (
            <section
              key={st.id}
              aria-label={`Coluna ${st.label}`}
              className="w-64 shrink-0 flex flex-col rounded-xl bg-gray-50 border border-gray-200"
            >
              <header
                className="px-3 py-2 border-b border-gray-200"
                style={{ borderTop: `3px solid ${st.color}`, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-gray-900 truncate" title={st.label}>{st.label}</span>
                  <span className="text-xs text-gray-500">{items.length}</span>
                </div>
              </header>
              <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
                {items.map(r => <KanbanCard key={r.id} r={r} stageColor={st.color} onClick={() => router.push(`/solicitacoes/${r.id}`)} />)}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}


// ── Kanban de UMA etapa: colunas = status daquela etapa ──────────────────────

function StatusKanban({ stageId, rows, onMove }: { stageId: string; rows: IndexRow[]; onMove: (rowId: string, stage: string, toStatus: string) => void }) {
  const router = useRouter()
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const dropProps = (colKey: string) => ({
    onDragOver: (e: React.DragEvent) => { if (dragId) { e.preventDefault(); setOverCol(colKey) } },
    onDragLeave: () => setOverCol(o => (o === colKey ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      const id = e.dataTransfer.getData('text/plain') || dragId
      setOverCol(null); setDragId(null)
      if (id) onMove(id, stageId, colKey)
    },
  })
  const cols = STAGE_STATUSES[stageId] ?? []
  const stageLabel = STAGE_PILLS.find(s => s.id === stageId)?.label ?? ''

  const byStatus = useMemo(() => {
    const map: Record<string, IndexRow[]> = {}
    const known = new Set(cols.map(c => c.key))
    for (const r of rows) {
      const raw = r.stageStatus[stageId]
      // status fora da lista conhecida cai na primeira coluna, para o cartão não sumir
      const key = raw && known.has(raw) ? raw : cols[0]?.key
      if (!key) continue
      ;(map[key] ??= []).push(r)
    }
    return map
  }, [rows, cols, stageId])

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-3 pb-2 items-stretch" style={{ minWidth: 'fit-content' }}>
        {cols.map(col => {
          const items = byStatus[col.key] ?? []
          // poucas colunas (<= 4): todas ficam abertas; só recolhe vazias quando há muitas
          if (items.length === 0 && cols.length > 4) {
            return (
              <section
                key={col.key}
                aria-label={`Coluna ${col.label} (vazia)`}
                {...dropProps(col.key)}
                className={cn(
                  'w-10 shrink-0 flex flex-col items-center justify-start py-2 gap-2 rounded-xl border transition-colors',
                  overCol === col.key ? 'border-gray-900 bg-gray-100' : 'bg-gray-50 border-gray-200',
                )}
                style={{ borderTop: `3px solid ${col.color}` }}
              >
                <span className="text-[11px] text-gray-400">0</span>
                <span className="text-xs font-medium text-gray-500 whitespace-nowrap [writing-mode:vertical-rl] rotate-180">{col.label}</span>
              </section>
            )
          }
          return (
            <section
              key={col.key}
              aria-label={`Coluna ${col.label}`}
              {...dropProps(col.key)}
              className={cn(
                'w-64 shrink-0 flex flex-col rounded-xl border transition-colors',
                overCol === col.key ? 'border-gray-900 bg-gray-100' : 'bg-gray-50 border-gray-200',
              )}
            >
              <header
                className="px-3 py-2 border-b border-gray-200"
                style={{ borderTop: `3px solid ${col.color}`, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-gray-900 truncate" title={col.label}>{col.label}</span>
                  <span className="text-xs text-gray-500">{items.length}</span>
                </div>
              </header>
              <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5 min-h-[60px]">
                {items.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Nenhuma solicitação</p>}
                {items.map(r => (
                  <KanbanCard
                    key={r.id}
                    kindKey={stageId === 'projeto' ? r.projectKind : null}
                    dragging={dragId === r.id}
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', r.id); e.dataTransfer.effectAllowed = 'move'; setDragId(r.id) }}
                    onDragEnd={() => { setDragId(null); setOverCol(null) }}
                    r={r}
                    stageColor={col.color}
                    team={r.teamByStage[stageId] ?? []}
                    onClick={() => router.push(`/solicitacoes/${r.id}?tab=${stageId}`)}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
      <p className="text-[11px] text-gray-400 mt-1">Colunas = status da etapa {stageLabel}. Clique no cartão para abrir direto nessa aba.</p>
    </div>
  )
}

function KanbanCard({ r, stageColor, onClick, team, kindKey, dragging, onDragStart, onDragEnd }: {
  r: IndexRow; stageColor: string; onClick: () => void; team?: TeamUser[]; kindKey?: string | null
  dragging?: boolean; onDragStart?: (e: React.DragEvent) => void; onDragEnd?: () => void
}) {
  const priorityC = PRIORITY_COLOR[r.priority as keyof typeof PRIORITY_COLOR]
  const days = daysInPipeline(r.createdAt)
  const name = r.title || r.clientName || '—'
  const due = dueState(r, localYmd())
  return (
    <article
      onClick={onClick}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'group relative bg-white border-l-4 rounded-lg px-2.5 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.08)] hover:shadow-md transition-shadow',
        onDragStart ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        dragging && 'opacity-40',
      )}
      style={{ borderLeftColor: stageColor }}
    >
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 text-[10px] font-mono text-gray-400">#{r.number}</span>
        <span className="flex-1 min-w-0 truncate text-sm text-gray-900 font-medium" title={name}>{name}</span>
        <span className="shrink-0 text-[11px] text-gray-400">{days}d</span>
      </div>
      {r.title && r.clientName && (
        <p className="text-xs text-gray-500 truncate mt-0.5">{r.clientName}</p>
      )}

      {/* Linha de badges + valor sempre visível */}
      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        {due === 'overdue' && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-px rounded bg-red-50 text-red-700" title="Há algo em aberto com data vencida">
            <AlertTriangle className="w-3 h-3" /> Atrasada
          </span>
        )}
        {due === 'today' && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-px rounded bg-amber-50 text-amber-800" title="Há algo marcado para hoje">
            <CalendarClock className="w-3 h-3" /> Hoje
          </span>
        )}
        {kindKey && PROJECT_KIND[kindKey] && (
          <span className={cn('text-[10px] font-medium px-1.5 py-px rounded', PROJECT_KIND[kindKey].bg, PROJECT_KIND[kindKey].text)}>
            {PROJECT_KIND[kindKey].label}
          </span>
        )}
        {r.priority !== 'normal' && priorityC && (
          <span className={cn('text-[10px] font-medium px-1.5 py-px rounded border', priorityC.bg, priorityC.text, 'border-transparent')}>
            {PRIORITY_LABEL[r.priority as keyof typeof PRIORITY_LABEL] ?? r.priority}
          </span>
        )}
        {r.quotedValue != null && (
          <span className="ml-auto text-[11px] font-medium text-gray-600">{formatCurrency(r.quotedValue)}</span>
        )}
      </div>

      {/* Responsáveis — rodapé */}
      <div className="mt-1.5 flex items-center justify-between">
        <TeamStack team={team ?? r.team} size={20} />
      </div>
    </article>
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
