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
import { ChevronLeft, Truck, MapPin, Calendar, ExternalLink, Check } from 'lucide-react'
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
} from '@/lib/solicitations/actions'

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-gray-400 italic py-6 text-center">{children}</div>
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white border border-surface-border rounded-lg p-4">{children}</div>
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
          {solicitation.visits.length === 0 && (
            <AddVisitForm solicitation={solicitation} />
          )}
          {solicitation.visits.map(v => (
            <Card key={v.id}>
              <div className="font-medium">{v.title || 'Visita'}</div>
              <div className="text-sm text-gray-500">
                {v.scheduled_at ? formatDate(v.scheduled_at) : 'Sem data agendada'} {v.scheduled_time ? `· ${v.scheduled_time}` : ''}
              </div>
              {v.address && <div className="text-sm text-gray-500">{v.address}</div>}
              <div className="text-xs text-gray-400 mt-1">Status: {v.status}</div>
              {v.notes && <div className="text-sm mt-2">{v.notes}</div>}
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
          {solicitation.designProjects.length === 0 && (
            <AddProjectForm solicitation={solicitation} />
          )}
          {solicitation.designProjects.map(p => (
            <Card key={p.id}>
              <div className="font-medium">#{p.number} · {p.title}</div>
              <div className="text-xs text-gray-400 mt-1">
                {p.kind === 'alocacao_pontos' ? 'Alocação de pontos' : 'Elaboração'} · Status: {p.status}
              </div>
              {p.description && <div className="text-sm mt-2">{p.description}</div>}
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
          title='Etapa concluída = já tem um desfecho registrado (orçamento concluído, negociação fechada/perdida, compra toda recebida, etc.)'
        >
          {doneCount} de {STAGE_IDS.length} etapas concluídas
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

function AddVisitForm({ solicitation }: { solicitation: SolicitationView }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [address, setAddress] = useState('')
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
      <div className="text-center py-6">
        <Empty>Nenhuma visita registrada nesta solicitação.</Empty>
        <button type="button" onClick={() => setOpen(true)} className="btn-secondary text-sm">+ Adicionar etapa</button>
      </div>
    )
  }

  return (
    <Card>
      <div className="space-y-2">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título da visita"
          className="w-full border border-surface-border rounded-md px-3 py-1.5 text-sm" />
        <div className="flex flex-wrap gap-2">
          <input type="date" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
            className="border border-surface-border rounded-md px-3 py-1.5 text-sm" />
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Endereço (opcional)"
            className="flex-1 min-w-[160px] border border-surface-border rounded-md px-3 py-1.5 text-sm" />
        </div>
        <div className="flex gap-2">
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
          <button type="button" onClick={() => setOpen(false)} className="btn-secondary px-4 py-1.5 text-sm">Cancelar</button>
        </div>
      </div>
    </Card>
  )
}

function AddProjectForm({ solicitation }: { solicitation: SolicitationView }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<'elaboracao' | 'alocacao_pontos'>('elaboracao')
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
      <div className="text-center py-6">
        <Empty>Nenhum projeto vinculado a esta solicitação.</Empty>
        <button type="button" onClick={() => setOpen(true)} className="btn-secondary text-sm">+ Adicionar etapa</button>
      </div>
    )
  }

  return (
    <Card>
      <div className="space-y-2">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título do projeto"
          className="w-full border border-surface-border rounded-md px-3 py-1.5 text-sm" />
        <div className="flex flex-wrap gap-2">
          <select value={kind} onChange={e => setKind(e.target.value as any)}
            className="border border-surface-border rounded-md px-3 py-1.5 text-sm">
            <option value="elaboracao">Elaboração</option>
            <option value="alocacao_pontos">Alocação de pontos</option>
          </select>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição (opcional)"
            className="flex-1 min-w-[160px] border border-surface-border rounded-md px-3 py-1.5 text-sm" />
        </div>
        <div className="flex gap-2">
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
          <button type="button" onClick={() => setOpen(false)} className="btn-secondary px-4 py-1.5 text-sm">Cancelar</button>
        </div>
      </div>
    </Card>
  )
}

// ── Compra de material ─────────────────────────────────────────────────

const PURCHASE_STATUS_LABEL: Record<string, string> = { a_pedir: 'A pedir', pedido: 'Pedido', recebido: 'Recebido' }

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
        <div className="flex flex-wrap gap-2">
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição do item"
            className="flex-1 min-w-[180px] border border-surface-border rounded-md px-3 py-1.5 text-sm" />
          <select value={supplier} onChange={e => setSupplier(e.target.value)}
            className="min-w-[140px] border border-surface-border rounded-md px-3 py-1.5 text-sm">
            <option value="">Fornecedor (opcional)</option>
            {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
          <input type="date" value={expectedDeliveryDate} onChange={e => setExpectedDeliveryDate(e.target.value)}
            title="Previsão de entrega informada ao cliente"
            className="border border-surface-border rounded-md px-3 py-1.5 text-sm" />
          <button type="button" onClick={add} disabled={pending} className="btn-primary px-4 py-1.5 text-sm">Adicionar</button>
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
                className="text-xs rounded-full px-2.5 py-1 bg-brand-500/10 text-brand-700 font-medium border-0"
              >
                {Object.entries(PURCHASE_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button type="button" onClick={() => startTransition(async () => { await deletePurchaseChecklistItem(item.id, solicitationId) })}
                disabled={pending} className="text-xs text-gray-400 hover:text-red-500">Remover</button>
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
  const statusColor = SHIPMENT_STATUS_COLOR[s.separation_status as keyof typeof SHIPMENT_STATUS_COLOR]
  const priorityColor = SHIPMENT_PRIORITY_COLOR[s.priority as keyof typeof SHIPMENT_PRIORITY_COLOR]
  return (
    <Card>
      <div className="flex items-center gap-2 flex-wrap mb-3">
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

function InstallationTab({ solicitationId, items }: { solicitationId: string; items: any[] }) {
  const [team, setTeam] = useState('')
  const [date, setDate] = useState('')
  const [pending, startTransition] = useTransition()

  function add() {
    startTransition(async () => {
      await saveInstallationTracking({ solicitationId, team, scheduledDate: date || null })
      setTeam('')
      setDate('')
    })
  }

  function cycleStatus(item: any) {
    const order = ['agendada', 'em_andamento', 'concluida', 'com_pendencia']
    const next = order[(order.indexOf(item.status) + 1) % order.length]
    startTransition(async () => {
      await saveInstallationTracking({ id: item.id, solicitationId, team: item.team, scheduledDate: item.scheduled_date, status: next as any, notes: item.notes })
    })
  }

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap gap-2">
          <input value={team} onChange={e => setTeam(e.target.value)} placeholder="Equipe"
            className="flex-1 min-w-[140px] border border-surface-border rounded-md px-3 py-1.5 text-sm" />
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="border border-surface-border rounded-md px-3 py-1.5 text-sm" />
          <button type="button" onClick={add} disabled={pending} className="btn-primary px-4 py-1.5 text-sm">Agendar</button>
        </div>
      </Card>
      {items.length === 0 && <Empty>Nenhuma instalação agendada ainda.</Empty>}
      {items.map(item => (
        <Card key={item.id}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-medium">{item.team || 'Equipe a definir'}</div>
              <div className="text-sm text-gray-500">{item.scheduled_date ? formatDate(item.scheduled_date) : 'Sem data'}</div>
              {item.notes && <div className="text-sm mt-1">{item.notes}</div>}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => cycleStatus(item)} disabled={pending}
                className="text-xs rounded-full px-2.5 py-1 bg-brand-500/10 text-brand-700 font-medium">
                {INSTALLATION_STATUS_LABEL[item.status] ?? item.status}
              </button>
              <button type="button" onClick={() => startTransition(async () => { await deleteInstallationTracking(item.id, solicitationId) })}
                disabled={pending} className="text-xs text-gray-400 hover:text-red-500">Remover</button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

// ── Pós-venda ─────────────────────────────────────────────────────────────

function PostSaleTab({ solicitationId, items }: { solicitationId: string; items: any[] }) {
  const [satisfaction, setSatisfaction] = useState('')
  const [issue, setIssue] = useState('')
  const [pending, startTransition] = useTransition()

  function add() {
    startTransition(async () => {
      await savePostSaleFollowup({ solicitationId, satisfaction, issueReported: issue, contactedAt: new Date().toISOString() })
      setSatisfaction('')
      setIssue('')
    })
  }

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap gap-2">
          <input value={satisfaction} onChange={e => setSatisfaction(e.target.value)} placeholder="Satisfação do cliente"
            className="flex-1 min-w-[160px] border border-surface-border rounded-md px-3 py-1.5 text-sm" />
          <input value={issue} onChange={e => setIssue(e.target.value)} placeholder="Problema relatado (opcional)"
            className="flex-1 min-w-[160px] border border-surface-border rounded-md px-3 py-1.5 text-sm" />
          <button type="button" onClick={add} disabled={pending} className="btn-primary px-4 py-1.5 text-sm">Registrar contato</button>
        </div>
      </Card>
      {items.length === 0 && <Empty>Nenhum contato de pós-venda registrado ainda.</Empty>}
      {items.map(item => (
        <Card key={item.id}>
          <div className="text-sm text-gray-500">{item.contacted_at ? formatDate(item.contacted_at) : ''}</div>
          <div className="font-medium">{item.satisfaction || '—'}</div>
          {item.issue_reported && <div className="text-sm mt-1">Problema: {item.issue_reported}</div>}
          {item.resolution && <div className="text-sm mt-1">Resolução: {item.resolution}</div>}
          <button type="button" onClick={() => startTransition(async () => { await deletePostSaleFollowup(item.id, solicitationId) })}
            disabled={pending} className="text-xs text-gray-400 hover:text-red-500 mt-2">Remover</button>
        </Card>
      ))}
    </div>
  )
}
