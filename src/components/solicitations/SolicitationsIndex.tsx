'use client'

// Listagem completa de solicitações: filtros em pills no mesmo visual da
// pipeline de uma solicitação (verde = concluída, âmbar = atual, listrado
// cinza = futura/não iniciada), toggle Lista / Kanban, avatares da equipe
// designada por solicitação e filtro por responsável.

import { useMemo, useState, useEffect, useRef, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X, FileSearch, Check, LayoutList, LayoutGrid, Users, ChevronLeft, ChevronRight, MapPin, Ruler, FileText, HandCoins, ShoppingCart, Package, Wrench, HeartPulse, AlertTriangle, CalendarClock, SlidersHorizontal, Eye, EyeOff, GripVertical, ArrowUp, ArrowDown, Plus, GitFork, Loader2, UserPlus } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { PRIORITY_LABEL, PRIORITY_COLOR, CATEGORY_LABEL, SIZE_LABEL } from '@/types'
import { daysInPipeline } from '@/lib/solicitations/stages'
import { isDoneStatus, dueState, localYmd, resolveCardProps, type IndexRow, type TeamUser, type CardPropsConfig, type ResolvedCardProp } from '@/lib/solicitations/index-types'
import { moveStageCardStatus, saveCardProps, createSolicitation, createStageRecordForSolicitation, searchSolicitationsForStage } from '@/lib/solicitations/actions'
import { searchContacts, createContact } from '@/lib/actions'
import { useToast } from '@/components/ui/Toast'
import { Select } from '@/components/ui/Select'

export type { IndexRow, TeamUser }

const STAGE_ICON: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  visita: MapPin, projeto: Ruler, orcamento: FileText, negociacao: HandCoins,
  compra: ShoppingCart, expedicao: Package, instalacao: Wrench, posVenda: HeartPulse,
}

const STAGE_PILLS: { id: string; label: string; color: string; sectorId: string }[] = [
  { id: 'visita',     label: 'Visita',               color: '#818cf8', sectorId: 'projetos'  }, // indigo-400
  { id: 'projeto',    label: 'Projeto',              color: '#4f46e5', sectorId: 'projetos'  }, // indigo-600
  { id: 'orcamento',  label: 'Orçamento',            color: '#cba455', sectorId: 'comercial' }, // brand amber
  { id: 'negociacao', label: 'Negociação',           color: '#a07830', sectorId: 'comercial' }, // amber escuro
  { id: 'compra',     label: 'Compra',               color: '#f97316', sectorId: 'logistica' }, // orange-500
  { id: 'expedicao',  label: 'Separação e entrega',  color: '#c2410c', sectorId: 'logistica' }, // orange-700
  { id: 'instalacao', label: 'Instalação',           color: '#38bdf8', sectorId: 'satisfacao'}, // sky-400
  { id: 'posVenda',   label: 'Pós-venda',            color: '#0284c7', sectorId: 'satisfacao'}, // sky-600
]

type Sector = { id: string; label: string; color: string; stageIds: string[] }
const SECTORS: Sector[] = [
  { id: 'projetos',   label: 'Setor de Projetos',   color: '#818cf8', stageIds: ['visita', 'projeto'] },
  { id: 'comercial',  label: 'Setor Comercial',      color: '#cba455', stageIds: ['orcamento', 'negociacao'] },
  { id: 'logistica',  label: 'Setor de Logística',  color: '#f97316', stageIds: ['compra', 'expedicao'] },
  { id: 'satisfacao', label: 'Setor de Satisfação', color: '#38bdf8', stageIds: ['instalacao', 'posVenda'] },
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

export function SolicitationsIndex({ rows: rowsProp, month, onMonthChange, cardPrefs }: { rows: IndexRow[]; month: Date; onMonthChange: (d: Date) => void; cardPrefs: Record<string, CardPropsConfig> }) {
  const router = useRouter()
  const toast = useToast()
  // Propriedades dos cartões: por usuário, uma configuração para cada etapa
  // (e uma para a visão geral). Salvas no servidor a cada mudança.
  const [prefs, setPrefs] = useState<Record<string, CardPropsConfig>>(cardPrefs)
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

  const scope = stageFilter ?? 'all'
  const resolvedProps = useMemo(() => resolveCardProps(scope, prefs[scope]), [scope, prefs])

  function updateProps(next: ResolvedCardProp[]) {
    const cfg: CardPropsConfig = { order: next.map(p => p.key), hidden: next.filter(p => !p.visible).map(p => p.key) }
    setPrefs(p => ({ ...p, [scope]: cfg }))
    saveCardProps(scope, cfg).then(r => {
      if (r.error) toast.error('NÃO FOI POSSÍVEL SALVAR', r.error)
    })
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

        <Select
          value={respFilter ?? ''}
          onChange={v => setRespFilter(v || null)}
          aria-label="Filtrar por responsável"
          className={cn('min-w-[190px]', respFilter && 'border-brand-400 bg-brand-50')}
          options={[
            { value: '', label: 'Todos os responsáveis' },
            ...allResponsibles.map(u => ({ value: u.id, label: u.name, avatar: { name: u.name, avatar_url: u.avatar_url, avatar_color: u.avatar_color } })),
          ]}
        />

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

          <PropertiesMenu
            scopeLabel={stageFilter ? (STAGE_PILLS.find(s => s.id === stageFilter)?.label ?? '') : 'Todas as etapas'}
            props={resolvedProps}
            onChange={updateProps}
          />

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
        <ListTable rows={filtered} stageId={stageFilter} props={resolvedProps} />
      ) : (
        stageFilter
          ? <StatusKanban stageId={stageFilter} rows={filtered} onMove={moveCard} props={resolvedProps} />
          : <KanbanBoard rows={filtered} props={resolvedProps} />
      )}
    </div>
  )
}

// ── Lista (tabela) ────────────────────────────────────────────────────────────

function ListTable({ rows, stageId, props }: { rows: IndexRow[]; stageId: string | null; props: ResolvedCardProp[] }) {
  const router = useRouter()
  // "Cliente" aparece sob o título; as demais viram colunas, na ordem escolhida.
  const showClient = props.some(p => p.key === 'client' && p.visible)
  const cols = props.filter(p => p.visible && p.key !== 'client')
  const today = localYmd()
  const th = 'px-5 py-3 text-left text-xs font-semibold text-gray-500 tracking-wide uppercase'

  function cell(r: IndexRow, key: string) {
    switch (key) {
      case 'number':
        return <span className="text-xs font-mono text-gray-400">#{r.number}</span>
      case 'team':
        return <TeamStack team={stageId ? (r.teamByStage[stageId] ?? []) : r.team} />
      case 'priority': {
        const c = PRIORITY_COLOR[r.priority as keyof typeof PRIORITY_COLOR]
        return r.priority !== 'normal' && c
          ? <span className={cn('inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold', c.bg, c.text)}>
              {PRIORITY_LABEL[r.priority as keyof typeof PRIORITY_LABEL] ?? r.priority}
            </span>
          : <span className="text-xs text-gray-300">—</span>
      }
      case 'days': {
        const d = daysInPipeline(r.createdAt)
        return <span className="text-xs text-gray-500">{d} {d === 1 ? 'dia' : 'dias'}</span>
      }
      case 'value':
        return r.quotedValue != null
          ? <span className="text-sm font-medium text-navy whitespace-nowrap">{formatCurrency(r.quotedValue)}</span>
          : <span className="text-xs text-gray-300 italic">sem orçamento</span>
      case 'due': {
        const due = dueState(r, today)
        return due === 'overdue'
          ? <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-px rounded bg-red-50 text-red-700"><AlertTriangle className="w-3 h-3" /> Atrasada</span>
          : due === 'today'
            ? <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-px rounded bg-amber-50 text-amber-800"><CalendarClock className="w-3 h-3" /> Hoje</span>
            : <span className="text-xs text-gray-300">—</span>
      }
      case 'kind':
        return r.projectKind && PROJECT_KIND[r.projectKind]
          ? <span className={cn('text-[11px] font-medium px-1.5 py-px rounded', PROJECT_KIND[r.projectKind].bg, PROJECT_KIND[r.projectKind].text)}>{PROJECT_KIND[r.projectKind].label}</span>
          : <span className="text-xs text-gray-300">—</span>
      case 'category':
        return <span className="text-xs text-gray-600">{r.category ? (CATEGORY_LABEL[r.category as keyof typeof CATEGORY_LABEL] ?? r.category) : '—'}</span>
      case 'size':
        return <span className="text-xs text-gray-600">{r.size ? (SIZE_LABEL[r.size as keyof typeof SIZE_LABEL] ?? r.size) : '—'}</span>
      default:
        return null
    }
  }

  return (
    <div className="bg-white rounded-xl border border-surface-border overflow-x-auto">
      <table className="w-full">
        <thead className="bg-surface-secondary border-b border-surface-border">
          <tr>
            <th className={th}>Título</th>
            <th className={th}>{stageId ? 'Status' : 'Etapa atual'}</th>
            {cols.map(c => <th key={c.key} className={th}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const stLabel = STAGE_PILLS.find(s => s.id === r.currentStage)?.label ?? '—'
            return (
              <tr
                key={r.id}
                onClick={() => router.push(`/solicitacoes/${r.id}`)}
                className="border-b border-surface-border last:border-0 hover:bg-surface-secondary/40 cursor-pointer transition-colors"
              >
                <td className="px-5 py-3">
                  <div className="text-sm font-medium text-navy">{r.title || r.clientName || '—'}</div>
                  {showClient && r.title && r.clientName && <div className="text-xs text-gray-400 truncate max-w-[280px]">{r.clientName}</div>}
                </td>
                <td className="px-5 py-3">
                  {stageId ? (() => {
                    const col = (STAGE_STATUSES[stageId] ?? []).find(c => c.key === r.stageStatus[stageId])
                    return col ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-md border" style={{ background: '#f9fafb', borderLeft: `3px solid ${col.color}`, color: '#111827' }}>
                        {col.label}
                      </span>
                    ) : <span className="text-xs text-gray-300">—</span>
                  })() : r.currentStage ? (
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-md border"
                      style={{ background: '#f9fafb', borderLeft: `3px solid ${STAGE_PILLS.find(s => s.id === r.currentStage)?.color ?? '#9ca3af'}`, color: '#111827' }}
                    >
                      {stLabel}
                    </span>
                  ) : <span className="text-xs text-gray-300">—</span>}
                </td>
                {cols.map(c => <td key={c.key} className="px-5 py-3">{cell(r, c.key)}</td>)}
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
// ── Modal de criação rápida por etapa ─────────────────────────────────────────
// Dois modos: "Nova solicitação" (cria sol. + registro da etapa) ou
// "Solicitação existente" (busca sol. existente + adiciona etapa).

// Campos extras por etapa (apenas o essencial)
const STAGE_EXTRA_FIELDS: Record<string, Array<'title' | 'scheduledAt' | 'deliveryType' | 'deliveryDate' | 'kind'>> = {
  visita:     ['title', 'scheduledAt'],
  projeto:    ['title', 'kind'],
  orcamento:  [],
  negociacao: [],
  compra:     [],
  expedicao:  ['deliveryType', 'deliveryDate'],
  instalacao: ['scheduledAt'],
  posVenda:   [],
}

// Typeahead genérico reutilizável
function Typeahead<T extends { id: string; label: string; sub?: string | null }>({
  value, label, onSelect, onClear, search, placeholder, createLabel, onCreate,
}: {
  value: string | null; label: string; onSelect: (item: T) => void; onClear: () => void
  search: (q: string) => Promise<T[]>; placeholder: string
  createLabel?: (q: string) => string; onCreate?: (q: string) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<T[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    search(q).then(r => { if (active) setResults(r) })
    return () => { active = false }
  }, [q, search])

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-surface-border px-3 py-2">
        <span className="flex-1 text-sm text-gray-900">{label}</span>
        <button type="button" onClick={onClear} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
      </div>
    )
  }

  return (
    <div ref={boxRef} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
      <input type="text" value={q} onChange={e => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-surface-border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
      {open && (results.length > 0 || (q.length >= 2 && onCreate)) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 max-h-52 overflow-y-auto">
          {results.map(r => (
            <button key={r.id} type="button" onClick={() => { onSelect(r); setOpen(false); setQ('') }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors">
              <span className="block text-sm text-gray-900">{r.label}</span>
              {r.sub && <span className="block text-xs text-gray-400">{r.sub}</span>}
            </button>
          ))}
          {results.length === 0 && q.length >= 2 && onCreate && createLabel && (
            <button type="button" onClick={() => { onCreate(q); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm text-brand-600 hover:bg-brand-50 flex items-center gap-2">
              <UserPlus className="w-3.5 h-3.5" />{createLabel(q)}
            </button>
          )}
          {results.length === 0 && q.length < 2 && <p className="px-3 py-2 text-xs text-gray-400">Digite para buscar…</p>}
        </div>
      )}
    </div>
  )
}

function QuickCreateModal({ stageId, stageLabel, onClose, onCreated }: {
  stageId: string; stageLabel: string
  onClose: () => void; onCreated: (id: string) => void
}) {
  const [pending, startTransition] = useTransition()
  const [mode, setMode] = useState<'new' | 'existing'>('new')

  // Dados de solicitação (modo "nova")
  const [clientId, setClientId] = useState<string | null>(null)
  const [clientLabel, setClientLabel] = useState('')
  const [solTitle, setSolTitle] = useState('')

  // Dados de solicitação (modo "existente")
  const [solId, setSolId] = useState<string | null>(null)
  const [solLabel, setSolLabel] = useState('')
  const [solClientId, setSolClientId] = useState<string | null>(null)

  // Campos da etapa
  const [stageTitle, setStageTitle] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>('delivery')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [kind, setKind] = useState<'elaboracao' | 'alocacao_pontos'>('elaboracao')

  // Sub-formulário de novo contato
  const [showNewContact, setShowNewContact] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [creatingContact, setCreatingContact] = useState(false)

  const [error, setError] = useState<string | null>(null)

  const stageColor = STAGE_PILLS.find(s => s.id === stageId)?.color ?? '#9ca3af'
  const Icon = STAGE_ICON[stageId]
  const extraFields = STAGE_EXTRA_FIELDS[stageId] ?? []
  const needsTitle = extraFields.includes('title')

  const searchContactsFn = useRef(async (q: string) => {
    const r = await searchContacts(q)
    return (r as any[]).map((c: any) => ({ id: c.id, label: c.name, sub: c.phone ?? null }))
  }).current

  const searchSolFn = useRef(async (q: string) => {
    const r = await searchSolicitationsForStage(q)
    return r.map(s => ({ id: s.id, label: s.label, sub: s.clientName, clientId: s.clientId }))
  }).current

  async function handleCreateContact(q: string) {
    setNewName(q); setNewPhone(''); setShowNewContact(true)
  }

  async function doCreateContact() {
    if (!newName.trim()) { setError('Informe o nome'); return }
    setCreatingContact(true)
    const res = await createContact({ name: newName.trim(), phone: newPhone.trim() || undefined, type: 'client' })
    setCreatingContact(false)
    if ('error' in res && res.error) { setError(res.error); return }
    const c = (res as any).data
    if (c?.id) { setClientId(c.id); setClientLabel(c.name); setShowNewContact(false) }
  }

  async function handleSubmit() {
    setError(null)
    if (mode === 'new') {
      if (!clientId) { setError('Selecione um cliente'); return }
      startTransition(async () => {
        const res = await createSolicitation({ clientId, title: solTitle.trim() || null })
        if ('error' in res && res.error) { setError(res.error); return }
        const sid = res.solicitationId
        if (!sid) { setError('Erro ao criar solicitação'); return }
        const res2 = await createStageRecordForSolicitation({
          solicitationId: sid, clientId,
          stage: stageId,
          title: stageTitle.trim() || null,
          scheduledAt: scheduledAt || null,
          deliveryType, deliveryDate: deliveryDate || null,
          kind,
        })
        if ('error' in res2 && res2.error) { setError(res2.error); return }
        onCreated(sid)
      })
    } else {
      if (!solId || !solClientId) { setError('Selecione uma solicitação'); return }
      startTransition(async () => {
        const res = await createStageRecordForSolicitation({
          solicitationId: solId, clientId: solClientId,
          stage: stageId,
          title: stageTitle.trim() || null,
          scheduledAt: scheduledAt || null,
          deliveryType, deliveryDate: deliveryDate || null,
          kind,
        })
        if ('error' in res && res.error) { setError(res.error); return }
        onCreated(solId)
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        {/* Cabeçalho */}
        <div className="flex items-center gap-2.5 px-6 pt-5 pb-4 border-b border-gray-100">
          {Icon && <span className="p-1.5 rounded-lg shrink-0" style={{ background: `${stageColor}20` }}>
            <Icon className="w-4 h-4" style={{ color: stageColor }} />
          </span>}
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-gray-900">Nova {stageLabel}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Seletor de modo */}
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 w-full">
            {([['new', 'Nova solicitação'], ['existing', 'Solicitação existente']] as const).map(([m, l]) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={cn('flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors',
                  mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                {l}
              </button>
            ))}
          </div>

          {/* Modo: nova solicitação */}
          {mode === 'new' && (
            <>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Título da solicitação <span className="text-gray-400">(opcional)</span></label>
                <input type="text" value={solTitle} onChange={e => setSolTitle(e.target.value)}
                  placeholder="Ex.: Sala de estar — Iluminação cênica"
                  className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Cliente *</label>
                <Typeahead
                  value={clientId} label={clientLabel}
                  onSelect={c => { setClientId(c.id); setClientLabel(c.label) }}
                  onClear={() => { setClientId(null); setClientLabel('') }}
                  search={searchContactsFn}
                  placeholder="Buscar cliente…"
                  createLabel={q => `Criar cliente "${q}"`}
                  onCreate={handleCreateContact}
                />
              </div>
              {showNewContact && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-700">Novo cliente</p>
                  <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome *"
                    className="w-full rounded-lg border border-surface-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
                  <input type="text" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Telefone"
                    className="w-full rounded-lg border border-surface-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setShowNewContact(false)} className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">Cancelar</button>
                    <button type="button" onClick={doCreateContact} disabled={creatingContact}
                      className="flex-1 rounded-lg bg-gray-900 text-white px-3 py-1.5 text-xs font-medium hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-1">
                      {creatingContact ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Criar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Modo: solicitação existente */}
          {mode === 'existing' && (
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Solicitação *</label>
              <Typeahead
                value={solId} label={solLabel}
                onSelect={(s: any) => { setSolId(s.id); setSolLabel(s.label); setSolClientId(s.clientId ?? null) }}
                onClear={() => { setSolId(null); setSolLabel(''); setSolClientId(null) }}
                search={searchSolFn}
                placeholder="Buscar por número ou título…"
              />
            </div>
          )}

          {/* Campos da etapa (comuns a ambos os modos) */}
          {(extraFields.length > 0 || needsTitle) && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: stageColor }}>{stageLabel}</p>
              {extraFields.includes('title') && (
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Descrição <span className="text-gray-400">(opcional)</span></label>
                  <input type="text" value={stageTitle} onChange={e => setStageTitle(e.target.value)}
                    placeholder={stageId === 'visita' ? 'Ex.: Medição do apartamento' : 'Ex.: Projeto luminotécnico sala'}
                    className="w-full rounded-lg border border-surface-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
                </div>
              )}
              {extraFields.includes('scheduledAt') && (
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">
                    {stageId === 'visita' ? 'Data e horário' : 'Data agendada'} <span className="text-gray-400">(opcional)</span>
                  </label>
                  <input type={stageId === 'visita' ? 'datetime-local' : 'date'} value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                    className="w-full rounded-lg border border-surface-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
                </div>
              )}
              {extraFields.includes('kind') && (
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Tipo de projeto</label>
                  <div className="flex gap-2">
                    {([['elaboracao', 'Elaboração'], ['alocacao_pontos', 'Alocação de pontos']] as const).map(([v, l]) => (
                      <button key={v} type="button" onClick={() => setKind(v)}
                        className={cn('flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                          kind === v ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50')}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {extraFields.includes('deliveryType') && (
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Tipo de entrega</label>
                  <div className="flex gap-2">
                    {([['delivery', 'Entrega'], ['pickup', 'Retirada']] as const).map(([v, l]) => (
                      <button key={v} type="button" onClick={() => setDeliveryType(v)}
                        className={cn('flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                          deliveryType === v ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50')}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {extraFields.includes('deliveryDate') && (
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Data prevista <span className="text-gray-400">(opcional)</span></label>
                  <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
                    className="w-full rounded-lg border border-surface-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200" />
                </div>
              )}
            </div>
          )}

          {stageId === 'negociacao' && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              A negociação é criada automaticamente junto com o orçamento. Abra a solicitação e acesse a aba Orçamento para gerenciar a negociação.
            </p>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex gap-3 px-6 pb-5">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
          {stageId !== 'negociacao' && (
            <button type="button" onClick={handleSubmit} disabled={pending || (mode === 'new' ? !clientId : !solId)}
              className="flex-1 rounded-xl bg-navy text-white px-4 py-2.5 text-sm font-semibold hover:bg-navy/90 disabled:opacity-50 flex items-center justify-center gap-2">
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Criar {stageLabel.toLowerCase()}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// trilho w-10 com o nome em texto vertical. Cartões: fundo branco, border-l-4
// na cor da etapa, shadow leve, hover com shadow maior.

function KanbanBoard({ rows, props }: { rows: IndexRow[]; props: ResolvedCardProp[] }) {
  const router = useRouter()
  const [createStage, setCreateStage] = useState<string | null>(null)

  // Cada solicitação aparece em TODAS as etapas onde tem registro ativo (não concluído)
  const byStage = useMemo(() => {
    const map: Record<string, IndexRow[]> = {}
    for (const r of rows) {
      let placed = false
      for (const st of STAGE_PILLS) {
        const status = r.stageStatus[st.id]
        if (status && !isDoneStatus(st.id, status)) {
          ;(map[st.id] ??= []).push(r)
          placed = true
        }
      }
      // fallback: solicitação sem nenhuma etapa ativa vai para a coluna do currentStage
      if (!placed && r.currentStage) {
        ;(map[r.currentStage] ??= []).push(r)
      }
    }
    return map
  }, [rows])

  return (
    <>
      {createStage && (
        <QuickCreateModal
          stageId={createStage}
          stageLabel={STAGE_PILLS.find(s => s.id === createStage)?.label ?? ''}
          onClose={() => setCreateStage(null)}
          onCreated={(id) => { setCreateStage(null); router.push(`/solicitacoes/${id}?tab=${createStage}`) }}
        />
      )}
      <div className="overflow-x-auto">
        <div className="flex gap-0 pb-2 items-stretch" style={{ minWidth: 'fit-content' }}>
          {SECTORS.map((sector, si) => {
            const sectorStages = STAGE_PILLS.filter(s => s.sectorId === sector.id)
            return (
              <div key={sector.id} className={cn('flex flex-col gap-0', si > 0 && 'ml-4')}>
                {/* Cabeçalho de setor */}
                <div
                  className="flex items-center gap-1.5 px-2 pb-1 mb-1"
                  style={{ borderBottom: `2px solid ${sector.color}22` }}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: sector.color }}
                  />
                  <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: sector.color }}>
                    {sector.label}
                  </span>
                </div>
                {/* Colunas de etapa deste setor */}
                <div className="flex gap-3 flex-1 items-stretch">
                  {sectorStages.map(st => {
                    const items = byStage[st.id] ?? []
                    const Icon = STAGE_ICON[st.id]
                    if (items.length === 0) {
                      return (
                        <section
                          key={st.id}
                          aria-label={`Coluna ${st.label} (vazia)`}
                          className="w-10 shrink-0 flex flex-col items-center justify-start py-2 gap-2 rounded-xl bg-gray-50 border border-gray-200"
                          style={{ borderTop: `3px solid ${st.color}` }}
                        >
                          <button
                            type="button"
                            onClick={() => setCreateStage(st.id)}
                            className="text-gray-300 hover:text-gray-500 transition-colors mt-1"
                            title={`Nova ${st.label}`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-[10px] text-gray-400">0</span>
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
                            {Icon && <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: st.color }} />}
                            <span className="font-semibold text-sm text-gray-900 truncate flex-1" title={st.label}>{st.label}</span>
                            <span className="text-xs text-gray-500">{items.length}</span>
                            <button
                              type="button"
                              onClick={() => setCreateStage(st.id)}
                              className="ml-1 p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
                              title={`Nova ${st.label}`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </header>
                        <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
                          {items.map(r => (
                            <KanbanCard
                              key={`${r.id}-${st.id}`}
                              r={r}
                              props={props}
                              stageColor={st.color}
                              multiStage={r.activeStages > 1}
                              onClick={() => router.push(`/solicitacoes/${r.id}?tab=${st.id}`)}
                            />
                          ))}
                        </div>
                      </section>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}


// ── Kanban de UMA etapa: colunas = status daquela etapa ──────────────────────

function StatusKanban({ stageId, rows, onMove, props }: { stageId: string; rows: IndexRow[]; onMove: (rowId: string, stage: string, toStatus: string) => void; props: ResolvedCardProp[] }) {
  const router = useRouter()
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const stageColorVal = STAGE_PILLS.find(s => s.id === stageId)?.color ?? '#9ca3af'
  const stageLabelVal = STAGE_PILLS.find(s => s.id === stageId)?.label ?? ''
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
    <>
      {showCreate && (
        <QuickCreateModal
          stageId={stageId}
          stageLabel={stageLabelVal}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); router.push(`/solicitacoes/${id}?tab=${stageId}`) }}
        />
      )}
      <div className="overflow-x-auto">
        {/* Botão de adicionar acima do kanban de status */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] text-gray-400">
            Colunas = status da etapa {stageLabelVal}. Clique no cartão para abrir direto nessa aba.
          </p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors hover:opacity-90"
            style={{ borderColor: `${stageColorVal}60`, background: `${stageColorVal}12`, color: stageColorVal }}
          >
            <Plus className="w-3.5 h-3.5" />
            Nova {stageLabelVal.toLowerCase()}
          </button>
        </div>
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
                    props={props}
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
      </div>
    </>
  )
}

function KanbanCard({ r, stageColor, onClick, team, kindKey, dragging, onDragStart, onDragEnd, props, multiStage }: {
  r: IndexRow; stageColor: string; onClick: () => void; team?: TeamUser[]; kindKey?: string | null
  dragging?: boolean; onDragStart?: (e: React.DragEvent) => void; onDragEnd?: () => void
  props: ResolvedCardProp[]; multiStage?: boolean
}) {
  const priorityC = PRIORITY_COLOR[r.priority as keyof typeof PRIORITY_COLOR]
  const days = daysInPipeline(r.createdAt)
  const name = r.title || r.clientName || '—'
  const due = dueState(r, localYmd())

  // Cada propriedade devolve seu pedaço (ou nada); a ordem é a do usuário.
  const parts = props.filter(p => p.visible).map(p => {
    switch (p.key) {
      case 'number':
        return <span key="number" className="text-[10px] font-mono text-gray-400">#{r.number}</span>
      case 'client':
        return r.title && r.clientName
          ? <span key="client" className="text-xs text-gray-500 truncate max-w-full">{r.clientName}</span>
          : null
      case 'priority':
        return r.priority !== 'normal' && priorityC
          ? <span key="priority" className={cn('text-[10px] font-medium px-1.5 py-px rounded', priorityC.bg, priorityC.text)}>
              {PRIORITY_LABEL[r.priority as keyof typeof PRIORITY_LABEL] ?? r.priority}
            </span>
          : null
      case 'value':
        return r.quotedValue != null
          ? <span key="value" className="text-[11px] font-medium text-gray-700">{formatCurrency(r.quotedValue)}</span>
          : null
      case 'team':
        return <TeamStack key="team" team={team ?? r.team} size={20} />
      case 'days':
        return <span key="days" className="text-[11px] text-gray-400">{days}d</span>
      case 'due':
        return due === 'overdue'
          ? <span key="due" className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-px rounded bg-red-50 text-red-700" title="Há algo em aberto com data vencida">
              <AlertTriangle className="w-3 h-3" /> Atrasada
            </span>
          : due === 'today'
            ? <span key="due" className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-px rounded bg-amber-50 text-amber-800" title="Há algo marcado para hoje">
                <CalendarClock className="w-3 h-3" /> Hoje
              </span>
            : null
      case 'kind':
        return kindKey && PROJECT_KIND[kindKey]
          ? <span key="kind" className={cn('text-[10px] font-medium px-1.5 py-px rounded', PROJECT_KIND[kindKey].bg, PROJECT_KIND[kindKey].text)}>
              {PROJECT_KIND[kindKey].label}
            </span>
          : null
      case 'category':
        return r.category
          ? <span key="category" className="text-[10px] font-medium px-1.5 py-px rounded bg-gray-100 text-gray-600">
              {CATEGORY_LABEL[r.category as keyof typeof CATEGORY_LABEL] ?? r.category}
            </span>
          : null
      case 'size':
        return r.size
          ? <span key="size" className="text-[10px] font-medium px-1.5 py-px rounded bg-gray-100 text-gray-600">
              {SIZE_LABEL[r.size as keyof typeof SIZE_LABEL] ?? r.size}
            </span>
          : null
      default:
        return null
    }
  }).filter(Boolean)

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
      <div className="flex items-start gap-1.5">
        <span className="block truncate text-sm text-gray-900 font-medium flex-1" title={name}>{name}</span>
        {multiStage && (
          <span title="Ativa em mais de uma etapa simultaneamente" className="shrink-0 mt-0.5">
            <GitFork className="w-3 h-3 text-indigo-400" />
          </span>
        )}
      </div>
      {parts.length > 0 && (
        <div className="mt-1.5 flex items-center gap-x-2 gap-y-1 flex-wrap">{parts}</div>
      )}
    </article>
  )
}

// ── Propriedades: mostrar/ocultar (olho) e reordenar ─────────────────────────

function PropertiesMenu({ scopeLabel, props, onChange }: { scopeLabel: string; props: ResolvedCardProp[]; onChange: (next: ResolvedCardProp[]) => void }) {
  const [open, setOpen] = useState(false)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const hiddenCount = props.filter(p => !p.visible).length

  function toggle(key: string) {
    onChange(props.map(p => (p.key === key ? { ...p, visible: !p.visible } : p)))
  }
  function move(from: number, to: number) {
    if (to < 0 || to >= props.length || from === to) return
    const next = [...props]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onChange(next)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        title="Escolher quais propriedades aparecem nos cartões e em que ordem"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-medium transition-colors',
          open ? 'border-brand-400 text-brand-700' : 'border-surface-border text-gray-600 hover:text-gray-900',
        )}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" /> Propriedades
        {hiddenCount > 0 && <span className="text-[10px] rounded-full bg-gray-100 text-gray-500 px-1.5">{hiddenCount} oculta{hiddenCount > 1 ? 's' : ''}</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-30 w-72 rounded-xl border border-surface-border bg-white shadow-xl">
          <div className="px-3 py-2.5 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-800">Propriedades dos cartões</p>
            <p className="text-[11px] text-gray-400">{scopeLabel} · salvo para você</p>
          </div>
          <ul className="py-1 max-h-80 overflow-y-auto">
            {props.map((p, i) => (
              <li
                key={p.key}
                draggable
                onDragStart={e => { e.dataTransfer.setData('text/plain', p.key); e.dataTransfer.effectAllowed = 'move'; setDragKey(p.key) }}
                onDragOver={e => { if (dragKey) e.preventDefault() }}
                onDrop={e => {
                  e.preventDefault()
                  const from = props.findIndex(x => x.key === dragKey)
                  setDragKey(null)
                  if (from >= 0) move(from, i)
                }}
                onDragEnd={() => setDragKey(null)}
                className={cn('flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50', dragKey === p.key && 'opacity-40')}
              >
                <GripVertical className="w-3.5 h-3.5 text-gray-300 cursor-grab shrink-0" />
                <span className={cn('flex-1 text-sm', p.visible ? 'text-gray-800' : 'text-gray-400')}>{p.label}</span>
                <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Subir ${p.label}`}
                  className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => move(i, i + 1)} disabled={i === props.length - 1} aria-label={`Descer ${p.label}`}
                  className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button
                  type="button"
                  onClick={() => toggle(p.key)}
                  aria-label={p.visible ? `Ocultar ${p.label}` : `Mostrar ${p.label}`}
                  aria-pressed={p.visible}
                  className={cn('p-1 rounded', p.visible ? 'text-brand-600 hover:bg-brand-50' : 'text-gray-300 hover:bg-gray-100')}
                >
                  {p.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </li>
            ))}
          </ul>
          <p className="px-3 py-2 border-t border-gray-100 text-[11px] text-gray-400">
            Cada etapa tem a sua configuração. O título do cartão sempre aparece.
          </p>
        </div>
      )}
    </div>
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
