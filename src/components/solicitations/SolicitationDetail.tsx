'use client'

// Tela de detalhe da Solicitação. Layout único em todas as abas: hero no topo,
// coluna fixa à esquerda (Detalhes + Histórico) e, à direita, as abas de etapa.
// - Orçamento: QuoteDetail de sempre (showNegotiation=false; os anexos do
//   orçamento já vivem na coluna direita dele).
// - Negociação: NegotiationSection de sempre.
// - Demais etapas: painel "Planejado / Concluído + Arquivos" (StagePanel),
//   reaproveitando todas as server actions de criar/editar/excluir/status.

import { useState, useTransition } from 'react'
import { ChevronLeft, Truck, Calendar, CalendarDays, Ruler, ShoppingCart, Wrench, HeartHandshake, Star, Plus, MapPin, FileText, HandCoins, Package, HeartPulse, LayoutDashboard, Check, Clock } from 'lucide-react'
import Link from 'next/link'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { NegotiationSection } from '@/components/quotes/NegotiationSection'
import { QuoteTab } from '@/components/solicitations/QuoteTab'
import { formatDate, cn } from '@/lib/utils'
import {
  SHIPMENT_STATUS_LABEL, SHIPMENT_PRIORITY_LABEL, SHIPMENT_DELIVERY_TYPE_LABEL,
  SHIPMENT_STATUS_COLOR, SHIPMENT_PRIORITY_COLOR,
} from '@/types'
import type { SolicitationView } from '@/lib/solicitations/actions'
import {
  savePurchaseChecklistItem, deletePurchaseChecklistItem, updatePurchaseChecklistItemStatus,
  saveInstallationTracking, deleteInstallationTracking,
  savePostSaleFollowup, deletePostSaleFollowup,
  createVisitForSolicitation, createDesignProjectForSolicitation,
  updateShipmentForSolicitation, updateVisitForSolicitation,
  updateDesignProjectKindForSolicitation, updateDesignProjectDescriptionForSolicitation,
  updateDesignProjectStatusForSolicitation, deleteVisitForSolicitation, deleteDesignProjectForSolicitation,
  deleteShipmentForSolicitation,
} from '@/lib/solicitations/actions'
import { RichTextEditor, RichTextView } from '@/components/solicitations/RichTextEditor'
import { useConfirm } from '@/components/ui/useConfirm'
import { isStageDone, splitPlannedDone } from '@/lib/solicitations/stages'
import { SolicitationHero, StagePipeline, SolicitationSidebar } from '@/components/solicitations/SolicitationOverview'
import { avatarColor } from '@/lib/avatar-color'
import { RecordRow, StagePanel, StatusSelect } from '@/components/solicitations/StageRecords'

type Team = SolicitationView['team']

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-gray-400 italic py-6 text-center">{children}</div>
}

function Card({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={cn('card p-4', className)} style={style}>{children}</div>
}

function FormHeading({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3 text-brand-700">
      <Icon className="w-4 h-4" />
      <h3 className="eyebrow !text-brand-700">{children}</h3>
    </div>
  )
}

function InlineEdit({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2 bg-surface-secondary/60 rounded-card p-3 mt-2">{children}</div>
}

// "Responsável • etapa" — autor resolvido pela lista de equipe da Solicitação.
function metaLine(team: Team, createdBy: string | null | undefined, stage: string) {
  const who = team.find(u => u.id === createdBy)?.name
  return `${who ?? 'Sem responsável'} • ${stage}`
}

// ── Cores/labels de status (inalterados) ──────────────────────────────────

const VISIT_STATUS_LABEL: Record<string, string> = {
  to_schedule: 'A agendar', scheduled: 'Agendada', done: 'Realizada', not_needed: 'Não necessária',
}
const VISIT_STATUS_COLOR: Record<string, { bg: string; text: string; accent: string }> = {
  to_schedule: { bg: 'bg-gray-100', text: 'text-gray-600', accent: '#9ca3af' },
  scheduled: { bg: 'bg-blue-50', text: 'text-blue-700', accent: '#3b82f6' },
  done: { bg: 'bg-green-50', text: 'text-green-700', accent: '#22c55e' },
  not_needed: { bg: 'bg-gray-100', text: 'text-gray-500', accent: '#9ca3af' },
}
const PROJECT_STATUS_LABEL: Record<string, string> = { fila: 'Na fila', em_andamento: 'Em andamento', concluido: 'Concluído' }
const PROJECT_STATUS_COLOR: Record<string, { bg: string; text: string; accent: string }> = {
  fila: { bg: 'bg-gray-100', text: 'text-gray-600', accent: '#9ca3af' },
  em_andamento: { bg: 'bg-amber-50', text: 'text-amber-700', accent: '#f59e0b' },
  concluido: { bg: 'bg-green-50', text: 'text-green-700', accent: '#22c55e' },
}
const PROJECT_KIND_LABEL: Record<string, string> = { elaboracao: 'Elaboração', alocacao_pontos: 'Alocação de pontos' }
const PROJECT_KIND_COLOR: Record<string, { bg: string; text: string }> = {
  elaboracao: { bg: 'bg-violet-50', text: 'text-violet-700' },
  alocacao_pontos: { bg: 'bg-sky-50', text: 'text-sky-700' },
}
const PURCHASE_STATUS_LABEL: Record<string, string> = { a_pedir: 'A pedir', pedido: 'Pedido', recebido: 'Recebido' }
const PURCHASE_STATUS_COLOR: Record<string, { bg: string; text: string; accent: string }> = {
  a_pedir: { bg: 'bg-gray-100', text: 'text-gray-600', accent: '#9ca3af' },
  pedido: { bg: 'bg-amber-50', text: 'text-amber-700', accent: '#f59e0b' },
  recebido: { bg: 'bg-green-50', text: 'text-green-700', accent: '#22c55e' },
}
const SHIPMENT_STATUS_ACCENT: Record<string, string> = {
  queued: '#9ca3af', in_progress: '#f59e0b', awaiting_material: '#f59e0b', completed: '#22c55e', delivered: '#22c55e',
}
const INSTALLATION_STATUS_LABEL: Record<string, string> = {
  agendada: 'Agendada', em_andamento: 'Em andamento', concluida: 'Concluída', com_pendencia: 'Com pendência',
}
const INSTALLATION_STATUS_COLOR: Record<string, { bg: string; text: string; accent: string }> = {
  agendada: { bg: 'bg-blue-50', text: 'text-blue-700', accent: '#3b82f6' },
  em_andamento: { bg: 'bg-amber-50', text: 'text-amber-700', accent: '#f59e0b' },
  concluida: { bg: 'bg-green-50', text: 'text-green-700', accent: '#22c55e' },
  com_pendencia: { bg: 'bg-red-50', text: 'text-red-700', accent: '#ef4444' },
}

export function SolicitationDetail({
  solicitation,
  primaryQuote,
  primaryQuoteActivities,
  initialTab,
}: {
  initialTab?: string
  solicitation: SolicitationView
  primaryQuote: any | null
  primaryQuoteActivities: any[]
}) {
  const clientColor = avatarColor(solicitation.clientId || solicitation.clientName || '')
  const headBg = `linear-gradient(120deg,${clientColor.bg} 0%,#ffffff 50%,#fdf6e3 100%)`
  const STAGE_IDS = ['visita', 'projeto', 'orcamento', 'negociacao', 'compra', 'expedicao', 'instalacao', 'posVenda']
  const doneMap = Object.fromEntries(STAGE_IDS.map(id => [id, isStageDone(id, solicitation)]))
  const doneCount = Object.values(doneMap).filter(Boolean).length
  // Denominador = só etapas com pelo menos um registro (solicitation.tabs).
  const startedCount = STAGE_IDS.filter(id => solicitation.tabs[id as keyof typeof solicitation.tabs]).length

  function label(id: string, text: string) {
    return doneMap[id] ? `✓ ${text}` : text
  }

  const ALL_TAB_IDS = ['visao-geral', ...STAGE_IDS]
  const [activeTab, setActiveTab] = useState(
    initialTab && ALL_TAB_IDS.includes(initialTab) ? initialTab : 'visao-geral'
  )
  const team = solicitation.team
  const sid = solicitation.id

  const visits = splitPlannedDone('visita', solicitation.visits)
  const projects = splitPlannedDone('projeto', solicitation.designProjects)
  const purchases = splitPlannedDone('compra', solicitation.purchaseChecklistItems)
  const shipments = splitPlannedDone('expedicao', solicitation.shipments)
  const installs = splitPlannedDone('instalacao', solicitation.installationTrackings)
  const postSales = splitPlannedDone('posVenda', solicitation.postSaleFollowups)

  // ── Conteúdo da Visão Geral ─────────────────────────────────────────────
  const overviewStages = STAGE_IDS.map(id => {
    const label = { visita: 'Visita', projeto: 'Projeto', orcamento: 'Orçamento', negociacao: 'Negociação', compra: 'Compra', expedicao: 'Separação e entrega', instalacao: 'Instalação', posVenda: 'Pós-venda' }[id] ?? id
    const icons: Record<string, any> = { visita: MapPin, projeto: Ruler, orcamento: FileText, negociacao: HandCoins, compra: ShoppingCart, expedicao: Package, instalacao: Wrench, posVenda: HeartPulse }
    const hasRecords = !!solicitation.tabs[id as keyof typeof solicitation.tabs]
    const isDone = doneMap[id]
    return { id, label, icon: icons[id], hasRecords, isDone }
  })

  const overviewContent = (
    <div className="space-y-4">
      <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Etapas desta solicitação</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {overviewStages.map(st => {
          const Icon = st.icon
          return (
            <button
              key={st.id}
              type="button"
              onClick={() => setActiveTab(st.id)}
              disabled={!st.hasRecords}
              className={cn(
                'flex flex-col items-start gap-1.5 rounded-xl p-3 text-left transition-shadow',
                st.hasRecords ? 'hover:shadow-sm cursor-pointer' : 'opacity-40 cursor-default',
                st.isDone ? 'bg-green-50 border border-green-200' : st.hasRecords ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-200'
              )}
            >
              <div className="flex items-center gap-1.5 w-full">
                {Icon && <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: st.isDone ? '#16a34a' : st.hasRecords ? '#d97706' : '#9ca3af' }} />}
                <span className="text-[11.5px] font-semibold truncate" style={{ color: st.isDone ? '#15803d' : st.hasRecords ? '#92400e' : '#9ca3af' }}>
                  {st.label}
                </span>
                {st.isDone && <Check className="ml-auto w-3 h-3 text-green-600 shrink-0" />}
                {!st.isDone && st.hasRecords && <Clock className="ml-auto w-3 h-3 text-amber-600 shrink-0" />}
              </div>
              <span className="text-[10px]" style={{ color: st.isDone ? '#15803d' : st.hasRecords ? '#78350f' : '#9ca3af' }}>
                {st.isDone ? 'Concluído' : st.hasRecords ? 'Em andamento' : 'Sem registro'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )

  const items: TabItem[] = [
    {
      id: 'visao-geral',
      label: 'Visão geral',
      icon: LayoutDashboard,
      content: overviewContent,
    },
    {
      id: 'visita',
      label: label('visita', 'Visita'),
      icon: MapPin,
      badge: solicitation.visits.length,
      content: (
        <StagePanel
          stage="visita" solicitationId={sid}
          planned={visits.planned.map(v => <VisitRow key={v.id} visit={v} solicitationId={sid} team={team} />)}
          done={visits.done.map(v => <VisitRow key={v.id} visit={v} solicitationId={sid} team={team} />)}
          emptyPlanned="Nenhuma visita planejada." emptyDone="Nenhuma visita concluída ainda."
          addLabel="Adicionar visita"
          renderAddForm={close => <AddVisitForm solicitation={solicitation} onClose={close} />}
        />
      ),
    },
    {
      id: 'projeto',
      label: label('projeto', 'Projeto'),
      icon: Ruler,
      badge: solicitation.designProjects.length,
      content: (
        <StagePanel
          stage="projeto" solicitationId={sid}
          planned={projects.planned.map(p => <ProjectRow key={p.id} project={p} solicitationId={sid} team={team} />)}
          done={projects.done.map(p => <ProjectRow key={p.id} project={p} solicitationId={sid} team={team} />)}
          emptyPlanned="Nenhum projeto em andamento." emptyDone="Nenhum projeto concluído ainda."
          addLabel="Adicionar projeto"
          renderAddForm={close => <AddProjectForm solicitation={solicitation} onClose={close} />}
        />
      ),
    },
    {
      id: 'orcamento',
      label: label('orcamento', 'Orçamento'),
      icon: FileText,
      badge: solicitation.quotes.length,
      content: <QuoteTab solicitation={solicitation} quote={primaryQuote} />,
    },
    {
      id: 'negociacao',
      label: label('negociacao', 'Negociação'),
      icon: HandCoins,
      badge: solicitation.negotiations.length,
      content: primaryQuote ? (
        <NegotiationSection quote={primaryQuote} />
      ) : (
        <Empty>Nenhuma negociação vinculada a esta solicitação.</Empty>
      ),
    },
    {
      id: 'compra',
      label: label('compra', 'Compra de material'),
      icon: ShoppingCart,
      badge: solicitation.purchaseChecklistItems.length,
      content: (
        <StagePanel
          stage="compra" solicitationId={sid}
          planned={purchases.planned.map(i => <PurchaseRow key={i.id} item={i} solicitationId={sid} team={team} suppliers={solicitation.suppliers} />)}
          done={purchases.done.map(i => <PurchaseRow key={i.id} item={i} solicitationId={sid} team={team} suppliers={solicitation.suppliers} />)}
          emptyPlanned="Nenhum item a comprar." emptyDone="Nenhum item recebido ainda."
          addLabel="Adicionar item"
          renderAddForm={close => <AddPurchaseForm solicitationId={sid} suppliers={solicitation.suppliers} onClose={close} />}
        />
      ),
    },
    {
      id: 'expedicao',
      label: label('expedicao', 'Separação e entrega'),
      icon: Package,
      badge: solicitation.shipments.length,
      content: (
        <StagePanel
          stage="expedicao" solicitationId={sid}
          planned={shipments.planned.map(s => <ShipmentRow key={s.id} shipment={s} team={team} />)}
          done={shipments.done.map(s => <ShipmentRow key={s.id} shipment={s} team={team} />)}
          emptyPlanned="Nenhuma separação/entrega pendente." emptyDone="Nenhuma entrega concluída ainda."
        />
      ),
    },
    {
      id: 'instalacao',
      label: label('instalacao', 'Instalação'),
      icon: Wrench,
      badge: solicitation.installationTrackings.length,
      content: (
        <StagePanel
          stage="instalacao" solicitationId={sid}
          planned={installs.planned.map(i => <InstallationRow key={i.id} item={i} solicitationId={sid} team={team} />)}
          done={installs.done.map(i => <InstallationRow key={i.id} item={i} solicitationId={sid} team={team} />)}
          emptyPlanned="Nenhuma instalação planejada." emptyDone="Nenhuma instalação concluída ainda."
          addLabel="Agendar instalação"
          renderAddForm={close => <AddInstallationForm solicitationId={sid} onClose={close} />}
        />
      ),
    },
    {
      id: 'posVenda',
      label: label('posVenda', 'Pós-venda'),
      icon: HeartPulse,
      badge: solicitation.postSaleFollowups.length,
      content: (
        <StagePanel
          stage="posVenda" solicitationId={sid}
          planned={postSales.planned.map(i => <PostSaleRow key={i.id} item={i} solicitationId={sid} team={team} />)}
          done={postSales.done.map(i => <PostSaleRow key={i.id} item={i} solicitationId={sid} team={team} />)}
          emptyPlanned="Nenhum contato em aberto." emptyDone="Nenhum contato resolvido ainda."
          addLabel="Registrar contato"
          renderAddForm={close => <AddPostSaleForm solicitationId={sid} onClose={close} />}
        />
      ),
    },
  ]

  return (
    <div>
      <div className="rounded-2xl px-6 pt-5 pb-4 mb-5" style={{ background: headBg, border: '1px solid rgba(10,31,59,.08)', boxShadow: 'rgba(255,255,255,.98) 0 1.5px 0 0 inset, rgba(255,255,255,.45) 0 0 0 1px inset, rgba(10,31,59,.03) 0 -1px 0 0 inset, rgba(10,31,59,.06) 0 2px 8px 0, rgba(10,31,59,.16) 0 22px 44px -20px' }}>
        <SolicitationHero s={solicitation} primaryQuote={primaryQuote} doneCount={doneCount} startedCount={startedCount} onSelect={setActiveTab} />
        <div className="flex items-end justify-between gap-3 mt-3">
          <div className="flex-1 min-w-0">
            <StagePipeline s={solicitation} primaryQuote={primaryQuote} onSelect={setActiveTab} />
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('visao-geral')}
            className={cn(
              'shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-semibold border transition-colors',
              activeTab === 'visao-geral'
                ? 'bg-navy text-white border-navy'
                : 'bg-white/80 text-navy border-black/10 hover:border-navy'
            )}
          >
            <LayoutDashboard className="w-3.5 h-3.5" /> Visão geral
          </button>
        </div>
      </div>
      {/* Coluna esquerda fixa em todas as abas; abaixo de 1024px empilha. */}
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <SolicitationSidebar s={solicitation} primaryQuote={primaryQuote} activities={primaryQuoteActivities} />
        <div className="flex-1 min-w-0 w-full">
          <Tabs items={items} active={activeTab} onChange={setActiveTab} hideTabBar />
        </div>
      </div>
    </div>
  )
}

// ── Visita ────────────────────────────────────────────────────────────────

function AddVisitForm({ solicitation, onClose }: { solicitation: SolicitationView; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [address, setAddress] = useState('')
  const [pending, startTransition] = useTransition()
  return (
    <Card>
      <FormHeading icon={CalendarDays}>Nova visita</FormHeading>
      <div className="space-y-2">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título da visita" className="input" />
        <div className="flex flex-wrap gap-2">
          <input type="date" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="input w-auto" />
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Endereço (opcional)" className="input flex-1 min-w-[160px]" />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" disabled={pending || !title.trim()} className="btn-primary px-4 py-1.5 text-sm"
            onClick={() => startTransition(async () => {
              await createVisitForSolicitation({
                solicitationId: solicitation.id, clientId: solicitation.clientId, architectId: solicitation.architectId,
                title, scheduledAt: scheduledAt || null, address: address || null,
              })
              onClose()
            })}
          >Salvar</button>
          <button type="button" onClick={onClose} className="btn-secondary px-4 py-1.5 text-sm">Cancelar</button>
        </div>
      </div>
    </Card>
  )
}

function VisitRow({ visit: v, solicitationId, team }: { visit: any; solicitationId: string; team: Team }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(v.title ?? '')
  const [scheduledAt, setScheduledAt] = useState(v.scheduled_at ? String(v.scheduled_at).slice(0, 10) : '')
  const [address, setAddress] = useState(v.address ?? '')
  const [pending, startTransition] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()
  const color = VISIT_STATUS_COLOR[v.status] ?? VISIT_STATUS_COLOR.to_schedule

  async function handleDelete() {
    const yes = await confirm(`Excluir a visita "${v.title || 'Visita'}"? Essa ação não pode ser desfeita.`, 'Excluir')
    if (!yes) return
    startTransition(async () => { await deleteVisitForSolicitation(v.id, solicitationId, v.title || 'Visita') })
  }
  function save() {
    startTransition(async () => {
      await updateVisitForSolicitation(v.id, solicitationId, { title, scheduledAt: scheduledAt || null, address: address || null })
      setEditing(false)
    })
  }
  function changeStatus(status: string) {
    startTransition(async () => { await updateVisitForSolicitation(v.id, solicitationId, { title: v.title ?? undefined, status: status as any }) })
  }

  return (
    <>
      <RecordRow
        accent={color.accent} icon={Calendar} title={v.title || 'Visita'} date={v.scheduled_at}
        finished={v.status === 'done' || v.status === 'not_needed'}
        meta={metaLine(team, v.created_by, 'Visita')}
        status={<StatusSelect value={v.status ?? 'to_schedule'} options={VISIT_STATUS_LABEL} colors={VISIT_STATUS_COLOR} onChange={changeStatus} disabled={pending} />}
        onEdit={() => setEditing(true)} onDelete={handleDelete} pending={pending}
      >
        {(v.address || v.scheduled_time) && (
          <div className="text-xs text-gray-500 mt-1">{v.scheduled_time ? `${v.scheduled_time}` : ''}{v.scheduled_time && v.address ? ' · ' : ''}{v.address ?? ''}</div>
        )}
        {v.notes && <div className="text-sm mt-1.5 text-gray-700">{v.notes}</div>}
        {editing && (
          <InlineEdit>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título da visita" className="input" />
            <div className="flex flex-wrap gap-2">
              <input type="date" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="input w-auto" />
              <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Endereço" className="input flex-1 min-w-[160px]" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={save} disabled={pending} className="btn-primary px-4 py-1.5 text-sm">Salvar</button>
              <button type="button" onClick={() => setEditing(false)} disabled={pending} className="btn-secondary px-4 py-1.5 text-sm">Cancelar</button>
            </div>
          </InlineEdit>
        )}
      </RecordRow>
      {ConfirmDialog}
    </>
  )
}

// ── Projeto ───────────────────────────────────────────────────────────────

function AddProjectForm({ solicitation, onClose }: { solicitation: SolicitationView; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<'elaboracao' | 'alocacao_pontos'>('elaboracao')
  const [pending, startTransition] = useTransition()
  return (
    <Card>
      <FormHeading icon={Ruler}>Novo projeto</FormHeading>
      <div className="space-y-2">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título do projeto" className="input" />
        <div className="flex flex-wrap gap-2">
          <select value={kind} onChange={e => setKind(e.target.value as any)} className="select w-auto">
            <option value="elaboracao">Elaboração</option>
            <option value="alocacao_pontos">Alocação de pontos</option>
          </select>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição (opcional)" className="input flex-1 min-w-[160px]" />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" disabled={pending || !title.trim()} className="btn-primary px-4 py-1.5 text-sm"
            onClick={() => startTransition(async () => {
              await createDesignProjectForSolicitation({
                solicitationId: solicitation.id, clientId: solicitation.clientId, architectId: solicitation.architectId,
                title, description: description || null, kind,
              })
              onClose()
            })}
          >Salvar</button>
          <button type="button" onClick={onClose} className="btn-secondary px-4 py-1.5 text-sm">Cancelar</button>
        </div>
      </div>
    </Card>
  )
}

function ProjectRow({ project: p, solicitationId, team }: { project: any; solicitationId: string; team: Team }) {
  const [editingDescription, setEditingDescription] = useState(false)
  const [description, setDescription] = useState(p.description ?? '')
  const [pending, startTransition] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()
  const statusColor = PROJECT_STATUS_COLOR[p.status] ?? PROJECT_STATUS_COLOR.fila
  const kindColor = PROJECT_KIND_COLOR[p.kind] ?? PROJECT_KIND_COLOR.elaboracao

  function saveDescription() {
    startTransition(async () => {
      await updateDesignProjectDescriptionForSolicitation(p.id, solicitationId, description)
      setEditingDescription(false)
    })
  }
  async function handleDelete() {
    const yes = await confirm(`Excluir o projeto "${p.title}"? Essa ação não pode ser desfeita.`, 'Excluir')
    if (!yes) return
    startTransition(async () => { await deleteDesignProjectForSolicitation(p.id, solicitationId, p.title) })
  }

  return (
    <>
      <RecordRow
        accent={statusColor.accent} icon={Ruler} title={p.title} date={p.created_at}
        finished={p.status === 'concluido'}
        meta={metaLine(team, p.created_by, 'Projeto')}
        status={<>
          <StatusSelect value={p.kind} options={PROJECT_KIND_LABEL} colors={PROJECT_KIND_COLOR} disabled={pending}
            onChange={k => startTransition(async () => { await updateDesignProjectKindForSolicitation(p.id, solicitationId, k as any) })} />
          <StatusSelect value={p.status} options={PROJECT_STATUS_LABEL} colors={PROJECT_STATUS_COLOR} disabled={pending}
            onChange={st => startTransition(async () => { await updateDesignProjectStatusForSolicitation(p.id, solicitationId, st as any) })} />
        </>}
        onEdit={() => setEditingDescription(true)} onDelete={handleDelete} pending={pending}
      >
        <div className="bg-gray-50 rounded-card p-2.5 mt-2">
          {editingDescription ? (
            <div className="space-y-2">
              <RichTextEditor value={description} onChange={setDescription} placeholder="Notas do projeto…" />
              <div className="flex gap-2">
                <button type="button" onClick={saveDescription} disabled={pending} className="btn-primary px-4 py-1.5 text-sm">Salvar</button>
                <button type="button" onClick={() => { setEditingDescription(false); setDescription(p.description ?? '') }} disabled={pending} className="btn-secondary px-4 py-1.5 text-sm">Cancelar</button>
              </div>
            </div>
          ) : p.description ? (
            <RichTextView html={p.description} onCheckToggle={html => startTransition(async () => { await updateDesignProjectDescriptionForSolicitation(p.id, solicitationId, html) })} />
          ) : (
            <span className="text-sm text-gray-400 italic">Sem notas ainda.</span>
          )}
        </div>
      </RecordRow>
      {ConfirmDialog}
    </>
  )
}

// ── Compra de material ────────────────────────────────────────────────────

function AddPurchaseForm({ solicitationId, suppliers, onClose }: { solicitationId: string; suppliers: { id: string; name: string }[]; onClose: () => void }) {
  const [description, setDescription] = useState('')
  const [supplier, setSupplier] = useState('')
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('')
  const [pending, startTransition] = useTransition()
  function add() {
    if (!description.trim()) return
    startTransition(async () => {
      await savePurchaseChecklistItem({ solicitationId, description, supplier, expectedDeliveryDate: expectedDeliveryDate || null })
      onClose()
    })
  }
  return (
    <Card>
      <FormHeading icon={ShoppingCart}>Novo item de compra</FormHeading>
      <div className="flex flex-wrap gap-2">
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição do item" className="input flex-1 min-w-[180px]" />
        <select value={supplier} onChange={e => setSupplier(e.target.value)} className="select min-w-[140px] w-auto">
          <option value="">Fornecedor (opcional)</option>
          {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
        <input type="date" value={expectedDeliveryDate} onChange={e => setExpectedDeliveryDate(e.target.value)} title="Previsão de entrega informada ao cliente" className="input w-auto" />
        <button type="button" onClick={add} disabled={pending} className="btn-primary px-4 py-1.5 text-sm"><Plus className="w-4 h-4" /> Adicionar</button>
      </div>
    </Card>
  )
}

function PurchaseRow({ item, solicitationId, team, suppliers }: { item: any; solicitationId: string; team: Team; suppliers: { id: string; name: string }[] }) {
  const [editing, setEditing] = useState(false)
  const [description, setDescription] = useState(item.description ?? '')
  const [supplier, setSupplier] = useState(item.supplier ?? '')
  const [date, setDate] = useState(item.expected_delivery_date ? String(item.expected_delivery_date).slice(0, 10) : '')
  const [pending, startTransition] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()
  const color = PURCHASE_STATUS_COLOR[item.status] ?? PURCHASE_STATUS_COLOR.a_pedir

  async function handleDelete() {
    const yes = await confirm(`Remover o item "${item.description}"?`, 'Excluir')
    if (!yes) return
    startTransition(async () => { await deletePurchaseChecklistItem(item.id, solicitationId, item.description) })
  }
  function save() {
    startTransition(async () => {
      await savePurchaseChecklistItem({ id: item.id, solicitationId, description, supplier, status: item.status, expectedDeliveryDate: date || null })
      setEditing(false)
    })
  }

  return (
    <>
      <RecordRow
        accent={color.accent} icon={ShoppingCart} title={item.description} date={item.expected_delivery_date ?? item.created_at}
        finished={item.status === 'recebido'}
        meta={metaLine(team, item.created_by, 'Compra de material')}
        status={<StatusSelect value={item.status} options={PURCHASE_STATUS_LABEL} colors={PURCHASE_STATUS_COLOR} disabled={pending}
          onChange={st => startTransition(async () => { await updatePurchaseChecklistItemStatus(item.id, solicitationId, st as any, item.description) })} />}
        onEdit={() => setEditing(true)} onDelete={handleDelete} pending={pending}
      >
        {(item.supplier || item.expected_delivery_date) && (
          <div className="text-xs text-gray-500 mt-1">
            {item.supplier}{item.supplier && item.expected_delivery_date ? ' · ' : ''}
            {item.expected_delivery_date ? `Previsão ao cliente: ${formatDate(item.expected_delivery_date)}` : ''}
          </div>
        )}
        {editing && (
          <InlineEdit>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição do item" className="input" />
            <div className="flex flex-wrap gap-2">
              <select value={supplier} onChange={e => setSupplier(e.target.value)} className="select min-w-[140px] w-auto">
                <option value="">Fornecedor (opcional)</option>
                {item.supplier && !suppliers.some(s => s.name === item.supplier) && <option value={item.supplier}>{item.supplier}</option>}
                {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input w-auto" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={save} disabled={pending} className="btn-primary px-4 py-1.5 text-sm">Salvar</button>
              <button type="button" onClick={() => setEditing(false)} disabled={pending} className="btn-secondary px-4 py-1.5 text-sm">Cancelar</button>
            </div>
          </InlineEdit>
        )}
      </RecordRow>
      {ConfirmDialog}
    </>
  )
}

// ── Separação e entrega (shipments) ───────────────────────────────────────

function ShipmentRow({ shipment: s, team }: { shipment: any; team: Team }) {
  const [editing, setEditing] = useState(false)
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>(s.delivery_type ?? 'delivery')
  const [deliveryDate, setDeliveryDate] = useState(s.delivery_date ?? '')
  const [status, setStatus] = useState<string>(s.separation_status ?? 'queued')
  const [priority, setPriority] = useState<string>(s.priority ?? 'mid')
  const [pending, startTransition] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()
  const accent = SHIPMENT_STATUS_ACCENT[s.separation_status as string] ?? SHIPMENT_STATUS_ACCENT.queued
  const priorityColor = SHIPMENT_PRIORITY_COLOR[s.priority as keyof typeof SHIPMENT_PRIORITY_COLOR]
  const finished = !!s.is_completed || s.separation_status === 'completed' || s.separation_status === 'delivered'
  const statusColors = SHIPMENT_STATUS_COLOR as Record<string, { bg: string; text: string }>
  const priorityColors = SHIPMENT_PRIORITY_COLOR as Record<string, { bg: string; text: string }>

  async function handleDelete() {
    const yes = await confirm('Excluir esta separação/entrega? O registro também será removido da fila de Expedição.', 'Excluir')
    if (!yes) return
    startTransition(async () => { await deleteShipmentForSolicitation(s.id, s.solicitation_id) })
  }

  function save() {
    startTransition(async () => {
      await updateShipmentForSolicitation(s.id, s.solicitation_id, {
        delivery_type: deliveryType, separation_status: status as any, priority: priority as any,
        ...(deliveryDate ? { delivery_date: deliveryDate } : {}),
      })
      setEditing(false)
    })
  }
  function cancel() {
    setDeliveryType(s.delivery_type ?? 'delivery'); setDeliveryDate(s.delivery_date ?? '')
    setStatus(s.separation_status ?? 'queued'); setPriority(s.priority ?? 'mid'); setEditing(false)
  }

  return (
    <>
    <RecordRow
      accent={accent} icon={Truck}
      title={s.delivery_type ? SHIPMENT_DELIVERY_TYPE_LABEL[s.delivery_type as keyof typeof SHIPMENT_DELIVERY_TYPE_LABEL] : 'Separação e entrega'}
      date={s.delivery_date ?? s.created_at} finished={finished}
      meta={metaLine(team, s.created_by, 'Separação e entrega')}
      status={<>
        <StatusSelect value={s.separation_status ?? 'queued'} options={SHIPMENT_STATUS_LABEL as Record<string, string>} colors={statusColors} disabled={pending}
          onChange={st => startTransition(async () => { await updateShipmentForSolicitation(s.id, s.solicitation_id, { separation_status: st as any }) })} />
        {priorityColor && <span className={cn('badge text-xs font-semibold', priorityColor.bg, priorityColor.text)}>{SHIPMENT_PRIORITY_LABEL[s.priority as keyof typeof SHIPMENT_PRIORITY_LABEL] ?? s.priority}</span>}
      </>}
      onEdit={() => setEditing(true)} onDelete={handleDelete} pending={pending}
    >
      {!editing && (
        <div className="text-xs text-gray-500 mt-1 space-y-0.5">
          {s.received_by && <div>Recebido por {s.received_by}{s.received_at ? ` em ${formatDate(s.received_at)}` : ''}</div>}
          {s.completed_at && <div>Entregue em {formatDate(s.completed_at)}</div>}
          <div className="flex gap-3 flex-wrap">
            {s.delivery_photo_url && <a href={s.delivery_photo_url} target="_blank" rel="noreferrer" className="text-brand-700 underline">Foto da entrega</a>}
            {s.drive_link && <a href={s.drive_link} target="_blank" rel="noreferrer" className="text-brand-600 hover:text-brand-700 font-medium">Pasta de separação</a>}
          </div>
        </div>
      )}
      {editing && (
        <InlineEdit>
          <div className="flex flex-wrap gap-2">
            <StatusSelect value={status} options={SHIPMENT_STATUS_LABEL as Record<string, string>} colors={statusColors} onChange={setStatus} />
            <StatusSelect value={priority} options={SHIPMENT_PRIORITY_LABEL as Record<string, string>} colors={priorityColors} onChange={setPriority} />
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={deliveryType} onChange={e => setDeliveryType(e.target.value as any)} className="select w-auto">
              <option value="delivery">Entrega</option>
              <option value="pickup">Retirada</option>
            </select>
            <input type="date" value={deliveryDate ? String(deliveryDate).slice(0, 10) : ''} onChange={e => setDeliveryDate(e.target.value)} className="input w-auto" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={pending} className="btn-primary px-4 py-1.5 text-sm">Salvar</button>
            <button type="button" onClick={cancel} disabled={pending} className="btn-secondary px-4 py-1.5 text-sm">Cancelar</button>
          </div>
        </InlineEdit>
      )}
    </RecordRow>
    {ConfirmDialog}
    </>
  )
}

// ── Instalação ────────────────────────────────────────────────────────────

function AddInstallationForm({ solicitationId, onClose }: { solicitationId: string; onClose: () => void }) {
  const [team, setTeam] = useState('')
  const [date, setDate] = useState('')
  const [status, setStatus] = useState<'agendada' | 'em_andamento' | 'concluida' | 'com_pendencia'>('agendada')
  const [notes, setNotes] = useState('')
  const [pending, startTransition] = useTransition()
  return (
    <Card>
      <FormHeading icon={Wrench}>Nova instalação</FormHeading>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <input value={team} onChange={e => setTeam(e.target.value)} placeholder="Equipe" className="input flex-1 min-w-[160px]" />
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input w-auto" />
          <select value={status} onChange={e => setStatus(e.target.value as any)} className="select w-auto">
            {Object.entries(INSTALLATION_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas (opcional)" className="input" />
        <div className="flex gap-2 pt-1">
          <button type="button" disabled={pending} className="btn-primary px-4 py-1.5 text-sm"
            onClick={() => startTransition(async () => {
              await saveInstallationTracking({ solicitationId, team, scheduledDate: date || null, status, notes: notes || null })
              onClose()
            })}
          ><Plus className="w-4 h-4" /> Agendar</button>
          <button type="button" onClick={onClose} className="btn-secondary px-4 py-1.5 text-sm">Cancelar</button>
        </div>
      </div>
    </Card>
  )
}

function InstallationRow({ item, solicitationId, team }: { item: any; solicitationId: string; team: Team }) {
  const [editing, setEditing] = useState(false)
  const [crew, setCrew] = useState(item.team ?? '')
  const [date, setDate] = useState(item.scheduled_date ? String(item.scheduled_date).slice(0, 10) : '')
  const [notes, setNotes] = useState(item.notes ?? '')
  const [pending, startTransition] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()
  const color = INSTALLATION_STATUS_COLOR[item.status] ?? INSTALLATION_STATUS_COLOR.agendada

  async function handleDelete() {
    const yes = await confirm('Excluir esta instalação? Essa ação não pode ser desfeita.', 'Excluir')
    if (!yes) return
    startTransition(async () => { await deleteInstallationTracking(item.id, solicitationId, item.team || undefined) })
  }
  function save(next?: string) {
    startTransition(async () => {
      await saveInstallationTracking({
        id: item.id, solicitationId,
        team: next ? item.team : crew, scheduledDate: next ? item.scheduled_date : (date || null),
        status: (next ?? item.status) as any, notes: next ? item.notes : (notes || null),
      })
      setEditing(false)
    })
  }

  return (
    <>
      <RecordRow
        accent={color.accent} icon={Wrench} title={item.team || 'Equipe a definir'} date={item.scheduled_date ?? item.created_at}
        finished={item.status === 'concluida'}
        meta={metaLine(team, item.created_by, 'Instalação')}
        status={<StatusSelect value={item.status} options={INSTALLATION_STATUS_LABEL} colors={INSTALLATION_STATUS_COLOR} disabled={pending} onChange={st => save(st)} />}
        onEdit={() => setEditing(true)} onDelete={handleDelete} pending={pending}
      >
        {item.notes && !editing && <div className="text-sm mt-1.5 text-gray-700">{item.notes}</div>}
        {editing && (
          <InlineEdit>
            <div className="flex flex-wrap gap-2">
              <input value={crew} onChange={e => setCrew(e.target.value)} placeholder="Equipe" className="input flex-1 min-w-[160px]" />
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input w-auto" />
            </div>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas (opcional)" className="input" />
            <div className="flex gap-2">
              <button type="button" onClick={() => save()} disabled={pending} className="btn-primary px-4 py-1.5 text-sm">Salvar</button>
              <button type="button" onClick={() => setEditing(false)} disabled={pending} className="btn-secondary px-4 py-1.5 text-sm">Cancelar</button>
            </div>
          </InlineEdit>
        )}
      </RecordRow>
      {ConfirmDialog}
    </>
  )
}

// ── Pós-venda ─────────────────────────────────────────────────────────────

function StarRating({ value, onChange, readOnly }: { value: number; onChange?: (n: number) => void; readOnly?: boolean }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" disabled={readOnly} onClick={() => onChange?.(n)}
          className={cn(readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110 transition-transform')}
          aria-label={`${n} estrela${n > 1 ? 's' : ''}`}>
          <Star className={cn('w-4 h-4', n <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300')} />
        </button>
      ))}
    </div>
  )
}

function AddPostSaleForm({ solicitationId, onClose }: { solicitationId: string; onClose: () => void }) {
  const [satisfaction, setSatisfaction] = useState(0)
  const [issue, setIssue] = useState('')
  const [resolution, setResolution] = useState('')
  const [pending, startTransition] = useTransition()
  return (
    <Card>
      <FormHeading icon={HeartHandshake}>Novo contato de pós-venda</FormHeading>
      <div className="space-y-3">
        <div>
          <label className="label">Satisfação do cliente</label>
          <StarRating value={satisfaction} onChange={setSatisfaction} />
        </div>
        <input value={issue} onChange={e => setIssue(e.target.value)} placeholder="Problema relatado (opcional)" className="input" />
        <input value={resolution} onChange={e => setResolution(e.target.value)} placeholder="Encaminhamento / resolução (opcional)" className="input" />
        <div className="flex gap-2">
          <button type="button" disabled={pending} className="btn-primary px-4 py-1.5 text-sm"
            onClick={() => startTransition(async () => {
              await savePostSaleFollowup({
                solicitationId, satisfaction: satisfaction > 0 ? String(satisfaction) : null,
                issueReported: issue || null, resolution: resolution || null, contactedAt: new Date().toISOString(),
              })
              onClose()
            })}
          ><Plus className="w-4 h-4" /> Registrar contato</button>
          <button type="button" onClick={onClose} className="btn-secondary px-4 py-1.5 text-sm">Cancelar</button>
        </div>
      </div>
    </Card>
  )
}

function PostSaleRow({ item, solicitationId, team }: { item: any; solicitationId: string; team: Team }) {
  const [editing, setEditing] = useState(false)
  const [stars, setStars] = useState(Number(item.satisfaction) > 0 ? Number(item.satisfaction) : 0)
  const [issue, setIssue] = useState(item.issue_reported ?? '')
  const [resolution, setResolution] = useState(item.resolution ?? '')
  const [pending, startTransition] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()
  const accent = item.resolution ? '#22c55e' : item.issue_reported ? '#f59e0b' : '#9ca3af'
  const shown = Number(item.satisfaction)

  async function handleDelete() {
    const yes = await confirm('Excluir este contato de pós-venda? Essa ação não pode ser desfeita.', 'Excluir')
    if (!yes) return
    startTransition(async () => { await deletePostSaleFollowup(item.id, solicitationId) })
  }
  function save() {
    startTransition(async () => {
      await savePostSaleFollowup({
        id: item.id, solicitationId, contactedAt: item.contacted_at,
        satisfaction: stars > 0 ? String(stars) : (item.satisfaction ?? null),
        issueReported: issue || null, resolution: resolution || null,
      })
      setEditing(false)
    })
  }

  return (
    <>
      <RecordRow
        accent={accent} icon={HeartHandshake} title={item.issue_reported || 'Contato de pós-venda'} date={item.contacted_at ?? item.created_at}
        finished={!!item.resolution}
        meta={metaLine(team, item.created_by, 'Pós-venda')}
        status={Number.isFinite(shown) && shown > 0 ? <StarRating value={shown} readOnly /> : item.satisfaction ? <span className="text-sm font-medium">{item.satisfaction}</span> : undefined}
        onEdit={() => setEditing(true)} onDelete={handleDelete} pending={pending}
      >
        {item.resolution && !editing && <div className="text-sm mt-1.5"><span className="text-gray-500">Encaminhamento:</span> {item.resolution}</div>}
        {editing && (
          <InlineEdit>
            <StarRating value={stars} onChange={setStars} />
            <input value={issue} onChange={e => setIssue(e.target.value)} placeholder="Problema relatado" className="input" />
            <input value={resolution} onChange={e => setResolution(e.target.value)} placeholder="Encaminhamento / resolução" className="input" />
            <div className="flex gap-2">
              <button type="button" onClick={save} disabled={pending} className="btn-primary px-4 py-1.5 text-sm">Salvar</button>
              <button type="button" onClick={() => setEditing(false)} disabled={pending} className="btn-secondary px-4 py-1.5 text-sm">Cancelar</button>
            </div>
          </InlineEdit>
        )}
      </RecordRow>
      {ConfirmDialog}
    </>
  )
}
