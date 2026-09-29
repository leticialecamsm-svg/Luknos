'use client'

// Tela de detalhe da Solicitação (Lote 1). Compõe o Tabs genérico com:
// - Orçamento: o QuoteDetail de sempre, reaproveitado 100% como está (não
//   forkado/duplicado) — inclusive o Histórico que já vive dentro dele.
// - As demais abas: resumos leves das tabelas já linkadas por
//   solicitation_id, reaproveitando os displays de negociação existentes
//   (NegotiationTracker) e mostrando o essencial de visita/projeto/
//   expedição sem duplicar as telas cheias de /negotiations, /shipping etc.
//   (isso fica pro Lote 2, junto da página-índice de /solicitacoes).

import { useState, useTransition } from 'react'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { QuoteDetail } from '@/components/quotes/QuoteDetail'
import { NegotiationTracker } from '@/components/negotiations/NegotiationTracker'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { SolicitationView } from '@/lib/solicitations/actions'
import {
  savePurchaseChecklistItem, deletePurchaseChecklistItem,
  saveInstallationTracking, deleteInstallationTracking,
  savePostSaleFollowup, deletePostSaleFollowup,
} from '@/lib/solicitations/actions'

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-gray-400 italic py-6 text-center">{children}</div>
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white border border-surface-border rounded-lg p-4">{children}</div>
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
  const items: TabItem[] = [
    {
      id: 'visita',
      label: 'Visita',
      badge: solicitation.visits.length,
      content: (
        <div className="space-y-3">
          {solicitation.visits.length === 0 && <Empty>Nenhuma visita registrada nesta solicitação.</Empty>}
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
      label: 'Projeto',
      badge: solicitation.designProjects.length,
      content: (
        <div className="space-y-3">
          {solicitation.designProjects.length === 0 && <Empty>Nenhum projeto vinculado a esta solicitação.</Empty>}
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
      label: 'Orçamento',
      badge: solicitation.quotes.length,
      content: primaryQuote ? (
        <QuoteDetail quote={primaryQuote} activities={primaryQuoteActivities} />
      ) : (
        <Empty>Nenhum orçamento vinculado a esta solicitação.</Empty>
      ),
    },
    {
      id: 'negociacao',
      label: 'Negociação',
      badge: solicitation.negotiations.length,
      content: (
        <div className="space-y-3">
          {solicitation.negotiations.length === 0 && <Empty>Nenhuma negociação vinculada a esta solicitação.</Empty>}
          {solicitation.negotiations.map(n => (
            <Card key={n.quote_id}>
              <NegotiationTracker quoteId={n.quote_id} temperature={n.temperature} />
            </Card>
          ))}
        </div>
      ),
    },
    {
      id: 'compra',
      label: 'Compra de material',
      badge: solicitation.purchaseChecklistItems.length,
      content: <PurchaseChecklistTab solicitationId={solicitation.id} items={solicitation.purchaseChecklistItems} />,
    },
    {
      id: 'expedicao',
      label: 'Separação e entrega',
      badge: solicitation.shipments.length,
      content: (
        <div className="space-y-3">
          {solicitation.shipments.length === 0 && <Empty>Nenhuma expedição vinculada a esta solicitação.</Empty>}
          {solicitation.shipments.map(s => (
            <Card key={s.id}>
              <div className="font-medium">Expedição {s.delivery_type === 'pickup' ? '(retirada)' : '(entrega)'}</div>
              <div className="text-xs text-gray-400 mt-1">Separação: {s.separation_status} {s.is_completed ? '· Concluída' : ''}</div>
              {s.delivery_date && <div className="text-sm text-gray-500">Data prevista: {formatDate(s.delivery_date)}</div>}
              {s.received_by && (
                <div className="text-sm text-gray-500 mt-1">
                  Recebido por {s.received_by}{s.received_at ? ` em ${formatDate(s.received_at)}` : ''}
                </div>
              )}
              {s.delivery_photo_url && (
                <a href={s.delivery_photo_url} target="_blank" rel="noreferrer" className="text-sm text-brand-700 underline">
                  Foto da entrega
                </a>
              )}
            </Card>
          ))}
        </div>
      ),
    },
    {
      id: 'instalacao',
      label: 'Instalação',
      badge: solicitation.installationTrackings.length,
      content: <InstallationTab solicitationId={solicitation.id} items={solicitation.installationTrackings} />,
    },
    {
      id: 'posVenda',
      label: 'Pós-venda',
      badge: solicitation.postSaleFollowups.length,
      content: <PostSaleTab solicitationId={solicitation.id} items={solicitation.postSaleFollowups} />,
    },
  ]

  return (
    <div>
      <Link href="/solicitacoes" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ChevronLeft className="w-4 h-4" /> Solicitações
      </Link>
      <h1 className="text-xl font-semibold mb-1">Solicitação #{solicitation.number}</h1>
      <div className="text-sm text-gray-500 mb-6">
        {solicitation.clientName ?? 'Cliente'} {solicitation.architectName ? `· Arquiteto(a): ${solicitation.architectName}` : ''} · Criada em {formatDate(solicitation.createdAt)}
      </div>
      <Tabs items={items} />
    </div>
  )
}

// ── Compra de material ─────────────────────────────────────────────────

const PURCHASE_STATUS_LABEL: Record<string, string> = { a_pedir: 'A pedir', pedido: 'Pedido', recebido: 'Recebido' }

function PurchaseChecklistTab({ solicitationId, items }: { solicitationId: string; items: any[] }) {
  const [description, setDescription] = useState('')
  const [supplier, setSupplier] = useState('')
  const [pending, startTransition] = useTransition()

  function add() {
    if (!description.trim()) return
    startTransition(async () => {
      await savePurchaseChecklistItem({ solicitationId, description, supplier })
      setDescription('')
      setSupplier('')
    })
  }

  function cycleStatus(item: any) {
    const next = item.status === 'a_pedir' ? 'pedido' : item.status === 'pedido' ? 'recebido' : 'a_pedir'
    startTransition(async () => {
      await savePurchaseChecklistItem({ id: item.id, solicitationId, description: item.description, supplier: item.supplier, status: next })
    })
  }

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap gap-2">
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição do item"
            className="flex-1 min-w-[180px] border border-surface-border rounded-md px-3 py-1.5 text-sm" />
          <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Fornecedor (opcional)"
            className="flex-1 min-w-[140px] border border-surface-border rounded-md px-3 py-1.5 text-sm" />
          <button type="button" onClick={add} disabled={pending} className="btn-primary px-4 py-1.5 text-sm">Adicionar</button>
        </div>
      </Card>
      {items.length === 0 && <Empty>Nenhum item de compra ainda.</Empty>}
      {items.map(item => (
        <Card key={item.id}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-medium">{item.description}</div>
              {item.supplier && <div className="text-sm text-gray-500">{item.supplier}</div>}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => cycleStatus(item)} disabled={pending}
                className="text-xs rounded-full px-2.5 py-1 bg-brand-500/10 text-brand-700 font-medium">
                {PURCHASE_STATUS_LABEL[item.status] ?? item.status}
              </button>
              <button type="button" onClick={() => startTransition(async () => { await deletePurchaseChecklistItem(item.id, solicitationId) })}
                disabled={pending} className="text-xs text-gray-400 hover:text-red-500">Remover</button>
            </div>
          </div>
        </Card>
      ))}
    </div>
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
