'use client'

// Tela de detalhe da Solicitação (Lote 1). Compõe o Tabs genérico com:
// - Orçamento: o QuoteDetail de sempre, reaproveitado 100% como está (não
//   forkado/duplicado) — inclusive o Histórico que já vive dentro dele —
//   mas com showNegotiation=false: a sub-seção de Negociação que o
//   QuoteDetail mostra quando o orçamento está concluído passa a viver só
//   na aba Negociação dedicada abaixo, pra não duplicar/confundir.
// - Negociação: reaproveita o mesmo NegotiationSection que o QuoteDetail usa
//   internamente (extraído dele), alimentado pelo primaryQuote — é o mesmo
//   registro de negociação, só exibido na aba certa.
// - As demais abas: resumos leves das tabelas já linkadas por
//   solicitation_id, mostrando o essencial de visita/projeto/expedição sem
//   duplicar as telas cheias de /negotiations, /shipping etc. (isso fica
//   pro Lote 2, junto da página-índice de /solicitacoes).

import { useState, useTransition } from 'react'
import {
  ChevronLeft, Truck, MapPin, Calendar, ExternalLink, Check, CalendarDays, Ruler,
  ShoppingCart, Wrench, HeartHandshake, Pencil, Star, Trash2, Plus,
} from 'lucide-react'
import Link from 'next/link'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { QuoteDetail } from '@/components/quotes/QuoteDetail'
import { NegotiationSection } from '@/components/quotes/NegotiationSection'
import { formatDate, formatCurrency, cn } from '@/lib/utils'
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
  updateShipmentForSolicitation,
} from '@/lib/solicitations/actions'

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-gray-400 italic py-6 text-center">{children}</div>
}

// Card padrão do app (ver globals.css: fundo com leve degradê, borda
// surface-border, sombra em camadas, raio generoso) — mesma recipe usada em
// QuoteDetail/NegotiationSection, em vez do bare `border + rounded-lg` que
// as abas novas tinham antes.
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('card p-4', className)}>{children}</div>
}

// Cabeçalho padrão dos formulários "Nova etapa" das abas leves — ícone
// temático + eyebrow, pra ficar claro que é um mini-formulário de cadastro
// e não um bloco solto.
function FormHeading({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3 text-brand-700">
      <Icon className="w-4 h-4" />
      <h3 className="eyebrow !text-brand-700">{children}</h3>
    </div>
  )
}

// Badge de status genérico (mesmo padrão de cores de STATUS_COLOR/
// SHIPMENT_STATUS_COLOR em src/types) pras tabelas novas que não têm uma
// paleta própria ainda.
function StatusBadge({ color, children }: { color: { bg: string; text: string }; children: React.ReactNode }) {
  return <span className={cn('badge font-semibold', color.bg, color.text)}>{children}</span>
}

// Status de visits (visits.status: 'to_schedule' | 'scheduled' | 'done',
// ver createVisitForSolicitation acima) e design_projects (enum
// design_project_status: 'fila' | 'em_andamento' | 'concluido') — mesma
// paleta usada em STATUS_COLOR/SHIPMENT_STATUS_COLOR (src/types).
const VISIT_STATUS_LABEL: Record<string, string> = { to_schedule: 'A agendar', scheduled: 'Agendada', done: 'Concluída' }
const VISIT_STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  to_schedule: { bg: 'bg-gray-100', text: 'text-gray-600' },
  scheduled: { bg: 'bg-blue-50', text: 'text-blue-700' },
  done: { bg: 'bg-green-50', text: 'text-green-700' },
}
const PROJECT_STATUS_LABEL: Record<string, string> = { fila: 'Na fila', em_andamento: 'Em andamento', concluido: 'Concluído' }
const PROJECT_STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  fila: { bg: 'bg-gray-100', text: 'text-gray-600' },
  em_andamento: { bg: 'bg-amber-50', text: 'text-amber-700' },
  concluido: { bg: 'bg-green-50', text: 'text-green-700' },
}

// ── Regra de "etapa concluída" por aba (Bug #9) ───────────────────────────
// Mesma semântica do protótipo aprovado: uma etapa é "concluída" quando já
// tem um desfecho registrado na tabela daquele setor — não apenas "tem
// registro". Usado pro prefixo ✓ na aba e pro contador do título.
function isStageDone(id: string, s: SolicitationView): boolean {
  switch (id) {
    case 'visita':
      return s.visits.some(v => v.status === 'done')
    case 'projeto':
      return s.designProjects.some(p => p.status === 'concluido')
    case 'orcamento':
      return s.quotes.some(q => q.status === 'done')
    case 'negociacao':
      return s.negotiations.some(n => n.temperature === 'closed' || n.temperature === 'lost')
    case 'compra':
      return s.purchaseChecklistItems.length > 0 && s.purchaseChecklistItems.every(i => i.status === 'recebido')
    case 'expedicao':
      return s.shipments.some(sh => sh.is_completed || sh.separation_status === 'delivered')
    case 'instalacao':
      return s.installationTrackings.some(i => i.status === 'concluida')
    case 'posVenda':
      return s.postSaleFollowups.some(f => !!f.resolution)
    default:
      return false
  }
}

export function SolicitationDetail({
  solicitation,
  primaryQuote,
  primaryQuoteActivities,
}: {
  solicitation: SolicitationView
  primaryQuote: any | null
  primaryQuoteActivities: any[]
}) {
  const STAGE_IDS = ['visita', 'projeto', 'orcamento', 'negociacao', 'compra', 'expedicao', 'instalacao', 'posVenda']
  const doneMap = Object.fromEntries(STAGE_IDS.map(id => [id, isStageDone(id, solicitation)]))
  const doneCount = Object.values(doneMap).filter(Boolean).length
  // Denominador do contador do título = só as etapas que já têm pelo menos
  // um registro vinculado a esta Solicitação (solicitation.tabs, já
  // calculado em getSolicitation), não o total fixo de etapas possíveis —
  // senão uma Solicitação sem Visita/Projeto aparece artificialmente
  // "atrasada" (pedido da Letícia: #558 tem só 6 das 8 etapas iniciadas e
  // deveria mostrar "2 de 6", não "2 de 8").
  const startedCount = STAGE_IDS.filter(id => solicitation.tabs[id as keyof typeof solicitation.tabs]).length

  function label(id: string, text: string) {
    return doneMap[id] ? `✓ ${text}` : text
  }

  const items: TabItem[] = [
    {
      id: 'visita',
      label: label('visita', 'Visita'),
      badge: solicitation.visits.length,
      content: (
        <div className="space-y-3">
          <AddVisitForm solicitation={solicitation} hasVisits={solicitation.visits.length > 0} />
          {solicitation.visits.map(v => (
            <Card key={v.id}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <div className="font-medium">{v.title || 'Visita'}</div>
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
                    <Calendar className="w-3.5 h-3.5 text-brand-500 shrink-0" />
                    {v.scheduled_at ? formatDate(v.scheduled_at) : 'Sem data agendada'} {v.scheduled_time ? `· ${v.scheduled_time}` : ''}
                  </div>
                  {v.address && (
                    <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-brand-500 shrink-0" />
                      {v.address}
                    </div>
                  )}
                </div>
                <StatusBadge color={VISIT_STATUS_COLOR[v.status] ?? VISIT_STATUS_COLOR.to_schedule}>
                  {VISIT_STATUS_LABEL[v.status] ?? v.status}
                </StatusBadge>
              </div>
              {v.notes && <div className="text-sm mt-2 text-gray-700">{v.notes}</div>}
            </Card>
          ))}
        </div>
      ),
    },
    {
      id: 'projeto',
      label: label('projeto', 'Projeto'),
      badge: solicitation.designProjects.length,
      content: (
        <div className="space-y-3">
          <AddProjectForm solicitation={solicitation} hasProjects={solicitation.designProjects.length > 0} />
          {solicitation.designProjects.map(p => (
            <Card key={p.id}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <div className="font-medium">#{p.number} · {p.title}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {p.kind === 'alocacao_pontos' ? 'Alocação de pontos' : 'Elaboração'}
                  </div>
                </div>
                <StatusBadge color={PROJECT_STATUS_COLOR[p.status] ?? PROJECT_STATUS_COLOR.fila}>
                  {PROJECT_STATUS_LABEL[p.status] ?? p.status}
                </StatusBadge>
              </div>
              {p.description && <div className="text-sm mt-2 text-gray-700">{p.description}</div>}
            </Card>
          ))}
        </div>
      ),
    },
    {
      id: 'orcamento',
      label: label('orcamento', 'Orçamento'),
      badge: solicitation.quotes.length,
      content: primaryQuote ? (
        <QuoteDetail quote={primaryQuote} activities={primaryQuoteActivities} showNegotiation={false} />
      ) : (
        <Empty>Nenhum orçamento vinculado a esta solicitação.</Empty>
      ),
    },
    {
      id: 'negociacao',
      label: label('negociacao', 'Negociação'),
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
      badge: solicitation.purchaseChecklistItems.length,
      content: (
        <PurchaseChecklistTab
          solicitationId={solicitation.id}
          items={solicitation.purchaseChecklistItems}
          suppliers={solicitation.suppliers}
        />
      ),
    },
    {
      id: 'expedicao',
      label: label('expedicao', 'Separação e entrega'),
      badge: solicitation.shipments.length,
      content: (
        <div className="space-y-3">
          {solicitation.shipments.length === 0 && <Empty>Nenhuma expedição vinculada a esta solicitação.</Empty>}
          {solicitation.shipments.map(s => <ShipmentCard key={s.id} shipment={s} />)}
        </div>
      ),
    },
    {
      id: 'instalacao',
      label: label('instalacao', 'Instalação'),
      badge: solicitation.installationTrackings.length,
      content: <InstallationTab solicitationId={solicitation.id} items={solicitation.installationTrackings} />,
    },
    {
      id: 'posVenda',
      label: label('posVenda', 'Pós-venda'),
      badge: solicitation.postSaleFollowups.length,
      content: <PostSaleTab solicitationId={solicitation.id} items={solicitation.postSaleFollowups} />,
    },
  ]

  return (
    <div>
      <Link href="/solicitacoes" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ChevronLeft className="w-4 h-4" /> Solicitações
      </Link>
      <div className="flex items-center gap-3 flex-wrap mb-1">
        <h1 className="text-xl font-semibold">Solicitação #{solicitation.number}</h1>
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-700"
          title='Etapa concluída = já tem um desfecho registrado (orçamento concluído, negociação fechada/perdida, compra toda recebida, etc.). O total considera só as etapas já iniciadas (com algum registro) nesta Solicitação.'
        >
          {doneCount} de {startedCount} etapas concluídas
        </span>
      </div>
      <div className="text-sm text-gray-500 mb-6">
        {solicitation.clientName ?? 'Cliente'} {solicitation.architectName ? `· Arquiteto(a): ${solicitation.architectName}` : ''} · Criada em {formatDate(solicitation.createdAt)}
      </div>
      <Tabs items={items} />
    </div>
  )
}

// ── Entrar em Visita/Projeto a partir da Solicitação (Bug #8) ───────────

function AddVisitForm({ solicitation, hasVisits }: { solicitation: SolicitationView; hasVisits: boolean }) {
  const [open, setOpen] = useState(!hasVisits)
  const [title, setTitle] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [address, setAddress] = useState('')
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="btn-secondary text-sm w-full justify-center border-dashed">
        <Plus className="w-4 h-4" /> Adicionar visita
      </button>
    )
  }

  return (
    <Card>
      <FormHeading icon={CalendarDays}>Nova visita</FormHeading>
      {!hasVisits && <Empty>Nenhuma visita registrada nesta solicitação ainda.</Empty>}
      <div className="space-y-2">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título da visita"
          className="input" />
        <div className="flex flex-wrap gap-2">
          <input type="date" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
            className="input w-auto" />
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Endereço (opcional)"
            className="input flex-1 min-w-[160px]" />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" disabled={pending || !title.trim()} className="btn-primary px-4 py-1.5 text-sm"
            onClick={() => startTransition(async () => {
              await createVisitForSolicitation({
                solicitationId: solicitation.id,
                clientId: solicitation.clientId,
                architectId: solicitation.architectId,
                title,
                scheduledAt: scheduledAt || null,
                address: address || null,
              })
              setOpen(false); setTitle(''); setScheduledAt(''); setAddress('')
            })}
          >Salvar</button>
          {hasVisits && <button type="button" onClick={() => setOpen(false)} className="btn-secondary px-4 py-1.5 text-sm">Cancelar</button>}
        </div>
      </div>
    </Card>
  )
}

function AddProjectForm({ solicitation, hasProjects }: { solicitation: SolicitationView; hasProjects: boolean }) {
  const [open, setOpen] = useState(!hasProjects)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<'elaboracao' | 'alocacao_pontos'>('elaboracao')
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="btn-secondary text-sm w-full justify-center border-dashed">
        <Plus className="w-4 h-4" /> Adicionar projeto
      </button>
    )
  }

  return (
    <Card>
      <FormHeading icon={Ruler}>Novo projeto</FormHeading>
      {!hasProjects && <Empty>Nenhum projeto vinculado a esta solicitação ainda.</Empty>}
      <div className="space-y-2">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título do projeto"
          className="input" />
        <div className="flex flex-wrap gap-2">
          <select value={kind} onChange={e => setKind(e.target.value as any)}
            className="select w-auto">
            <option value="elaboracao">Elaboração</option>
            <option value="alocacao_pontos">Alocação de pontos</option>
          </select>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição (opcional)"
            className="input flex-1 min-w-[160px]" />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" disabled={pending || !title.trim()} className="btn-primary px-4 py-1.5 text-sm"
            onClick={() => startTransition(async () => {
              await createDesignProjectForSolicitation({
                solicitationId: solicitation.id,
                clientId: solicitation.clientId,
                architectId: solicitation.architectId,
                title, description: description || null, kind,
              })
              setOpen(false); setTitle(''); setDescription('')
            })}
          >Salvar</button>
          {hasProjects && <button type="button" onClick={() => setOpen(false)} className="btn-secondary px-4 py-1.5 text-sm">Cancelar</button>}
        </div>
      </div>
    </Card>
  )
}

// ── Compra de material ─────────────────────────────────────────────────

const PURCHASE_STATUS_LABEL: Record<string, string> = { a_pedir: 'A pedir', pedido: 'Pedido', recebido: 'Recebido' }
const PURCHASE_STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  a_pedir: { bg: 'bg-gray-100', text: 'text-gray-600' },
  pedido: { bg: 'bg-amber-50', text: 'text-amber-700' },
  recebido: { bg: 'bg-green-50', text: 'text-green-700' },
}

function PurchaseChecklistTab({ solicitationId, items, suppliers }: { solicitationId: string; items: any[]; suppliers: { id: string; name: string }[] }) {
  const [description, setDescription] = useState('')
  const [supplier, setSupplier] = useState('')
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('')
  const [pending, startTransition] = useTransition()

  function add() {
    if (!description.trim()) return
    startTransition(async () => {
      await savePurchaseChecklistItem({ solicitationId, description, supplier, expectedDeliveryDate: expectedDeliveryDate || null })
      setDescription('')
      setSupplier('')
      setExpectedDeliveryDate('')
    })
  }

  return (
    <div className="space-y-3">
      <Card>
        <FormHeading icon={ShoppingCart}>Novo item de compra</FormHeading>
        <div className="flex flex-wrap gap-2">
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição do item"
            className="input flex-1 min-w-[180px]" />
          <select value={supplier} onChange={e => setSupplier(e.target.value)}
            className="select min-w-[140px] w-auto">
            <option value="">Fornecedor (opcional)</option>
            {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
          <input type="date" value={expectedDeliveryDate} onChange={e => setExpectedDeliveryDate(e.target.value)}
            title="Previsão de entrega informada ao cliente"
            className="input w-auto" />
          <button type="button" onClick={add} disabled={pending} className="btn-primary px-4 py-1.5 text-sm">
            <Plus className="w-4 h-4" /> Adicionar
          </button>
        </div>
      </Card>
      {items.length === 0 && <Empty>Nenhum item de compra ainda.</Empty>}
      {items.map(item => (
        <Card key={item.id}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="font-medium">{item.description}</div>
              {item.supplier && <div className="text-sm text-gray-500">{item.supplier}</div>}
              {item.expected_delivery_date && (
                <div className="text-xs text-gray-400 mt-0.5">Previsão de entrega ao cliente: {formatDate(item.expected_delivery_date)}</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={item.status}
                disabled={pending}
                onChange={e => startTransition(async () => {
                  await updatePurchaseChecklistItemStatus(item.id, solicitationId, e.target.value as any)
                })}
                className={cn('badge font-semibold border-0 cursor-pointer', (PURCHASE_STATUS_COLOR[item.status] ?? PURCHASE_STATUS_COLOR.a_pedir).bg, (PURCHASE_STATUS_COLOR[item.status] ?? PURCHASE_STATUS_COLOR.a_pedir).text)}
              >
                {Object.entries(PURCHASE_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button type="button" onClick={() => startTransition(async () => { await deletePurchaseChecklistItem(item.id, solicitationId) })}
                disabled={pending} className="text-gray-400 hover:text-red-500 p-1" title="Remover">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

// ── Separação e entrega (shipments) ──────────────────────────────────────
// Mesmas labels/cores de src/types (SHIPMENT_*) e o mesmo conjunto de campos
// mostrado em src/components/shipping/ShippingViewModal.tsx (status,
// prioridade, tipo/data de entrega, recebimento, foto, link de separação),
// só que inline na aba em vez de modal — reaproveita o padrão visual sem
// tocar nos componentes de /shipping.

function ShipmentCard({ shipment: s }: { shipment: any }) {
  const [editing, setEditing] = useState(false)
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>(s.delivery_type ?? 'delivery')
  const [deliveryDate, setDeliveryDate] = useState(s.delivery_date ?? '')
  const [pending, startTransition] = useTransition()
  const statusColor = SHIPMENT_STATUS_COLOR[s.separation_status as keyof typeof SHIPMENT_STATUS_COLOR]
  const priorityColor = SHIPMENT_PRIORITY_COLOR[s.priority as keyof typeof SHIPMENT_PRIORITY_COLOR]

  function save() {
    startTransition(async () => {
      await updateShipmentForSolicitation(s.id, s.solicitation_id, {
        delivery_type: deliveryType,
        ...(deliveryDate ? { delivery_date: deliveryDate } : {}),
      })
      setEditing(false)
    })
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          {statusColor && (
            <span className={cn('badge text-xs font-semibold', statusColor.bg, statusColor.text)}>
              {SHIPMENT_STATUS_LABEL[s.separation_status as keyof typeof SHIPMENT_STATUS_LABEL] ?? s.separation_status}
            </span>
          )}
          {priorityColor && (
            <span className={cn('badge text-xs font-semibold', priorityColor.bg, priorityColor.text)}>
              {SHIPMENT_PRIORITY_LABEL[s.priority as keyof typeof SHIPMENT_PRIORITY_LABEL] ?? s.priority}
            </span>
          )}
          {s.is_completed && (
            <span className="inline-flex items-center gap-1 badge text-xs font-semibold bg-emerald-50 text-emerald-700">
              <Check className="w-3 h-3" /> Entregue
            </span>
          )}
        </div>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="btn-ghost text-xs">
            <Pencil className="w-3.5 h-3.5" /> Editar
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2 bg-surface-secondary/60 rounded-card p-3 mb-2">
          <div className="flex flex-wrap gap-2">
            <select value={deliveryType} onChange={e => setDeliveryType(e.target.value as any)} className="select w-auto">
              <option value="delivery">Entrega</option>
              <option value="pickup">Retirada</option>
            </select>
            <input type="date" value={deliveryDate ? String(deliveryDate).slice(0, 10) : ''} onChange={e => setDeliveryDate(e.target.value)}
              className="input w-auto" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={pending} className="btn-primary px-4 py-1.5 text-sm">Salvar</button>
            <button type="button" onClick={() => setEditing(false)} disabled={pending} className="btn-secondary px-4 py-1.5 text-sm">Cancelar</button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-gray-700">
          {s.delivery_type === 'delivery' ? <Truck className="w-4 h-4 text-brand-500 shrink-0" /> : <MapPin className="w-4 h-4 text-brand-500 shrink-0" />}
          <span>{s.delivery_type ? SHIPMENT_DELIVERY_TYPE_LABEL[s.delivery_type as keyof typeof SHIPMENT_DELIVERY_TYPE_LABEL] : <span className="text-gray-400">Tipo não definido</span>}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-700">
          <Calendar className="w-4 h-4 text-brand-500 shrink-0" />
          <span>{s.delivery_date ? formatDate(s.delivery_date) : <span className="text-gray-400">Data não definida</span>}</span>
        </div>
        {s.received_by && (
          <div className="text-gray-500">
            Recebido por {s.received_by}{s.received_at ? ` em ${formatDate(s.received_at)}` : ''}
          </div>
        )}
        {s.completed_at && (
          <div className="text-gray-400 text-xs">Entregue em {formatDate(s.completed_at)}</div>
        )}
        {s.delivery_photo_url && (
          <a href={s.delivery_photo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 underline">
            Foto da entrega
          </a>
        )}
        {s.drive_link && (
          <a href={s.drive_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-brand-600 hover:text-brand-700 font-medium">
            <ExternalLink className="w-3.5 h-3.5" /> Pasta de separação
          </a>
        )}
      </div>
    </Card>
  )
}

// ── Acompanhamento de instalação ─────────────────────────────────────────

const INSTALLATION_STATUS_LABEL: Record<string, string> = {
  agendada: 'Agendada', em_andamento: 'Em andamento', concluida: 'Concluída', com_pendencia: 'Com pendência',
}
// Mesma lógica de cor dos outros status pills do app (agendada=azul,
// em_andamento=âmbar, concluida=verde, com_pendencia=vermelho — pedido
// explícito da Letícia pra ficar consistente com o resto do sistema).
const INSTALLATION_STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  agendada: { bg: 'bg-blue-50', text: 'text-blue-700' },
  em_andamento: { bg: 'bg-amber-50', text: 'text-amber-700' },
  concluida: { bg: 'bg-green-50', text: 'text-green-700' },
  com_pendencia: { bg: 'bg-red-50', text: 'text-red-700' },
}

function InstallationTab({ solicitationId, items }: { solicitationId: string; items: any[] }) {
  const [team, setTeam] = useState('')
  const [date, setDate] = useState('')
  const [status, setStatus] = useState<'agendada' | 'em_andamento' | 'concluida' | 'com_pendencia'>('agendada')
  const [notes, setNotes] = useState('')
  const [pending, startTransition] = useTransition()

  function add() {
    startTransition(async () => {
      await saveInstallationTracking({ solicitationId, team, scheduledDate: date || null, status, notes: notes || null })
      setTeam('')
      setDate('')
      setStatus('agendada')
      setNotes('')
    })
  }

  function changeStatus(item: any, next: string) {
    startTransition(async () => {
      await saveInstallationTracking({ id: item.id, solicitationId, team: item.team, scheduledDate: item.scheduled_date, status: next as any, notes: item.notes })
    })
  }

  return (
    <div className="space-y-3">
      <Card>
        <FormHeading icon={Wrench}>Nova instalação</FormHeading>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <input value={team} onChange={e => setTeam(e.target.value)} placeholder="Equipe"
              className="input flex-1 min-w-[160px]" />
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="input w-auto" />
            <select value={status} onChange={e => setStatus(e.target.value as any)} className="select w-auto">
              {Object.entries(INSTALLATION_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas (opcional)" className="input" />
          <div className="pt-1">
            <button type="button" onClick={add} disabled={pending} className="btn-primary px-4 py-1.5 text-sm">
              <Plus className="w-4 h-4" /> Agendar
            </button>
          </div>
        </div>
      </Card>
      {items.length === 0 && <Empty>Nenhuma instalação agendada ainda.</Empty>}
      {items.map(item => {
        const color = INSTALLATION_STATUS_COLOR[item.status] ?? INSTALLATION_STATUS_COLOR.agendada
        return (
          <Card key={item.id}>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <div className="font-medium flex items-center gap-1.5">
                  <Wrench className="w-4 h-4 text-brand-500 shrink-0" />
                  {item.team || 'Equipe a definir'}
                </div>
                <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
                  <Calendar className="w-3.5 h-3.5 text-brand-500 shrink-0" />
                  {item.scheduled_date ? formatDate(item.scheduled_date) : 'Sem data'}
                </div>
                {item.notes && <div className="text-sm mt-2 text-gray-700">{item.notes}</div>}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={item.status}
                  disabled={pending}
                  onChange={e => changeStatus(item, e.target.value)}
                  className={cn('badge font-semibold border-0 cursor-pointer', color.bg, color.text)}
                >
                  {Object.entries(INSTALLATION_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button type="button" onClick={() => startTransition(async () => { await deleteInstallationTracking(item.id, solicitationId) })}
                  disabled={pending} className="text-gray-400 hover:text-red-500 p-1" title="Remover">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ── Pós-venda ─────────────────────────────────────────────────────────────
// satisfaction continua sendo text no banco (post_sale_followups.satisfaction
// — sem migration necessária), só a UI vira um seletor de 1 a 5 estrelas que
// grava o número como string (ex. "5"); registros antigos que porventura
// tenham texto livre nesse campo caem no fallback de StarRating abaixo.

function StarRating({ value, onChange, readOnly }: { value: number; onChange?: (n: number) => void; readOnly?: boolean }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          className={cn(readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110 transition-transform')}
          aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
        >
          <Star className={cn('w-4 h-4', n <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300')} />
        </button>
      ))}
    </div>
  )
}

function PostSaleTab({ solicitationId, items }: { solicitationId: string; items: any[] }) {
  const [satisfaction, setSatisfaction] = useState(0)
  const [issue, setIssue] = useState('')
  const [resolution, setResolution] = useState('')
  const [pending, startTransition] = useTransition()

  function add() {
    startTransition(async () => {
      await savePostSaleFollowup({
        solicitationId,
        satisfaction: satisfaction > 0 ? String(satisfaction) : null,
        issueReported: issue || null,
        resolution: resolution || null,
        contactedAt: new Date().toISOString(),
      })
      setSatisfaction(0)
      setIssue('')
      setResolution('')
    })
  }

  return (
    <div className="space-y-3">
      <Card>
        <FormHeading icon={HeartHandshake}>Novo contato de pós-venda</FormHeading>
        <div className="space-y-3">
          <div>
            <label className="label">Satisfação do cliente</label>
            <StarRating value={satisfaction} onChange={setSatisfaction} />
          </div>
          <input value={issue} onChange={e => setIssue(e.target.value)} placeholder="Problema relatado (opcional)"
            className="input" />
          <input value={resolution} onChange={e => setResolution(e.target.value)} placeholder="Encaminhamento / resolução (opcional)"
            className="input" />
          <button type="button" onClick={add} disabled={pending} className="btn-primary px-4 py-1.5 text-sm">
            <Plus className="w-4 h-4" /> Registrar contato
          </button>
        </div>
      </Card>
      {items.length === 0 && <Empty>Nenhum contato de pós-venda registrado ainda.</Empty>}
      {items.map(item => {
        const stars = Number(item.satisfaction)
        return (
          <Card key={item.id}>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="text-sm text-gray-500">{item.contacted_at ? formatDate(item.contacted_at) : ''}</div>
              {Number.isFinite(stars) && stars > 0 ? (
                <StarRating value={stars} readOnly />
              ) : item.satisfaction ? (
                <span className="text-sm font-medium">{item.satisfaction}</span>
              ) : null}
            </div>
            {item.issue_reported && <div className="text-sm mt-2"><span className="text-gray-500">Problema:</span> {item.issue_reported}</div>}
            {item.resolution && <div className="text-sm mt-1"><span className="text-gray-500">Encaminhamento:</span> {item.resolution}</div>}
            <button type="button" onClick={() => startTransition(async () => { await deletePostSaleFollowup(item.id, solicitationId) })}
              disabled={pending} className="text-gray-400 hover:text-red-500 mt-2 p-1" title="Remover">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </Card>
        )
      })}
    </div>
  )
}
