'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateQuoteStatus, updateTemperature, toggleAlertFlag,
  markAsLost, addActivity,
  getQuoteProposals, createQuoteProposal, updateQuoteProposal, deleteQuoteProposal, cancelSale
} from '@/lib/actions'
import {
  QUOTE_STATUS_LABEL, QUOTE_STATUS_HINT, STATUS_COLOR,
  TEMPERATURE_LABEL, TEMPERATURE_COLOR,
  CATEGORY_LABEL, SIZE_LABEL, ORIGIN_LABEL,
  LOSS_REASON_LABEL, getContactTypeLabel,
} from '@/types'
import {
  formatCurrency, formatDate, formatRelative, formatRelativeWithTime,
  getInitials, isOverdue, cn
} from '@/lib/utils'
import {
  ChevronLeft, Flame, CheckCircle2, XCircle,
  Phone, MessageSquare, MapPin, Clock, Loader2,
  Pencil, Trash2, StickyNote, PhoneCall, Send, CalendarDays, Folder, ExternalLink, Percent, PlusCircle, Flag
} from 'lucide-react'
import { deleteQuote } from '@/lib/actions'
import { useConfirm } from '@/components/ui/useConfirm'
import { Avatar } from '@/components/ui/Avatar'
import { QuoteTasks } from './QuoteTasks'
import { QuoteSchedules } from './QuoteSchedules'
import { NegotiationTracker } from '@/components/negotiations/NegotiationTracker'
import { OptionTag, CATEGORY_OPTS, SIZE_OPTS, ORIGIN_OPTS, STAGE_OPTS, PRIORITY_OPTS } from './OptionPills'
import { CloseSaleForm } from './CloseSaleForm'
import { DiscountTable } from './DiscountTable'
import { EditPaymentForm } from './EditPaymentForm'
import { DEFAULT_PAYMENT_RATES } from '@/lib/payment-rates'

const STATUS_PT: Record<string, string> = {
  queue: 'Na fila', in_progress: 'Em andamento', done: 'Concluído',
  paused: 'Pausado', review: 'Em revisão', revision: 'Revisão',
}
const TEMP_PT: Record<string, string> = {
  cold: 'Frio', warm: 'Morno', hot: 'Quente', no_forecast: 'Sem previsão',
  closed: 'Fechada', lost: 'Perdida',
}

function translateActivityDescription(desc: string): string {
  if (!desc) return desc
  // "Status alterado de X para Y"
  let out = desc.replace(/Status alterado de (\w+) para (\w+)/g, (_, from, to) =>
    `Status alterado de ${STATUS_PT[from] ?? from} para ${STATUS_PT[to] ?? to}`
  )
  // "Negociação X → Y"
  out = out.replace(/Negociação (\w+) → (\w+)/g, (_, from, to) =>
    `Negociação ${TEMP_PT[from] ?? from} → ${TEMP_PT[to] ?? to}`
  )
  // Remove campos técnicos como "architect_id: — → uuid"
  out = out.replace(/architect_id:[^·]+(?:·\s*)?/g, '')
  out = out.replace(/paid_traffic_type: — → (\w+)/g, (_, val) => {
    const PT: Record<string,string> = { final_client: 'Cliente final', new_partner: 'Novo parceiro' }
    return `Tipo tráfego pago: — → ${PT[val] ?? val}`
  })
  // Limpa "Editado —  ·" se ficar sem campos após remoção
  out = out.replace(/✏️ Editado — \s*·?\s*$/, '✏️ Editado')
  out = out.replace(/✏️ Editado — \s*·\s*/, '✏️ Editado — ')
  return out.trim()
}

export function QuoteDetail({ quote, activities, onFlagChange }: { quote: any; activities: any[]; onFlagChange?: () => void }) {
  const router = useRouter()
  const { confirm, ConfirmDialog } = useConfirm()
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState('')
  const [noteType, setNoteType] = useState<'note'|'call'|'whatsapp'|'visit'>('note')
  const [showCloseSale, setShowCloseSale] = useState(false)
  const [showMarkLost, setShowMarkLost] = useState(false)
  const [showEditPayment, setShowEditPayment] = useState(false)
  const [showDiscounts, setShowDiscounts] = useState(false)
  const [lossReason, setLossReason] = useState('price')
  const [localFinalValue, setLocalFinalValue] = useState<number | null>(quote.final_value ?? null)
  const [localSplits, setLocalSplits] = useState<any[]>(quote.payment_splits ?? [])
  const [proposals, setProposals] = useState<any[]>([])
  const [showProposalForm, setShowProposalForm] = useState(false)
  const [proposalValue, setProposalValue] = useState('')
  const [proposalDate, setProposalDate] = useState('')
  const [proposalInfo, setProposalInfo] = useState('')
  const [savingProposal, setSavingProposal] = useState(false)
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null)
  // edição de proposta existente
  const [editingProposalId, setEditingProposalId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editInfo, setEditInfo] = useState('')
  const [expandedProposalId, setExpandedProposalId] = useState<string | null>(null)
  const [isFlaggedAlert, setIsFlaggedAlert] = useState(quote.is_flagged_alert ?? false)

  useEffect(() => {
    getQuoteProposals(quote.id).then(setProposals)
  }, [quote.id])

  useEffect(() => {
    setIsFlaggedAlert(quote.is_flagged_alert ?? false)
  }, [quote.is_flagged_alert])

  const statusC = STATUS_COLOR[quote.status as keyof typeof STATUS_COLOR]
  const tempC   = quote.temperature ? TEMPERATURE_COLOR[quote.temperature as keyof typeof TEMPERATURE_COLOR] : null
  const overdue = isOverdue(quote.deadline) && quote.status !== 'done'

  function act(fn: () => Promise<any>) {
    startTransition(async () => { await fn(); router.refresh() })
  }

  const TEMPS = ['no_forecast','cold','warm','hot','closed','lost'] as const

  return (
    <div className="max-w-6xl">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="w-4 h-4" />
          Orçamentos
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setIsFlaggedAlert(!isFlaggedAlert); act(async () => { await toggleAlertFlag(quote.id); onFlagChange?.() }) }}
            className={cn('btn-secondary text-xs py-1.5 gap-1.5', isFlaggedAlert && 'bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100')}
            title={isFlaggedAlert ? 'Remover do Radar de Alertas' : 'Adicionar ao Radar de Alertas'}
          >
            <Flag className="w-3.5 h-3.5" /> {isFlaggedAlert ? 'Alerta ativo' : 'Marcar alerta'}
          </button>
          <button
            onClick={() => router.push(`/quotes/${quote.id}/edit`)}
            className="btn-secondary text-xs py-1.5 gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" /> Editar
          </button>
          <button
            onClick={async () => {
              const ok = await confirm(`Excluir orçamento de "${quote.client_name}"?`, 'Sim, excluir')
              if (!ok) return
              act(async () => { await deleteQuote(quote.id); router.push('/quotes') })
            }}
            className="btn-secondary text-xs py-1.5 gap-1.5 text-red-500 hover:bg-red-50 hover:border-red-200"
          >
            <Trash2 className="w-3.5 h-3.5" /> Excluir
          </button>
        </div>
      </div>

      {/* Grid: conteúdo esquerda + tarefas direita */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
      <div className="space-y-4">
      {/* Header card */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-gray-400">
                #{String(quote.number).padStart(3,'0')}
              </span>
              <span className={cn('badge', statusC.bg, statusC.text)}>
                {QUOTE_STATUS_LABEL[quote.status as keyof typeof QUOTE_STATUS_LABEL]}
              </span>
              {overdue && (
                <span className="badge bg-red-50 text-red-600">⚠️ Prazo vencido</span>
              )}
              {quote.temperature === 'closed' && localSplits.some((s: any) => s.status === 'open') && (
                <span className="badge bg-amber-100 text-amber-800">⏳ Pagamento Pendente</span>
              )}
              {quote.temperature === 'closed' && (
                <span className="badge bg-emerald-100 text-emerald-800 font-semibold">
                  ✓ Vendida{quote.closed_at ? ` · ${formatDate(quote.closed_at)}` : ''}
                </span>
              )}
              {quote.temperature === 'lost' && (
                <span className="badge bg-red-100 text-red-800 font-semibold">
                  ✕ Perdida{quote.temperature_updated_at ? ` · ${formatDate(quote.temperature_updated_at)}` : ''}
                </span>
              )}
            </div>
            <h1 className="text-xl font-semibold text-gray-900">{quote.client_name}</h1>
            {quote.client_phone && (
              <p className="text-sm text-gray-500 mt-0.5">{quote.client_phone}</p>
            )}
            {quote.architect_name && (
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-gray-600">{quote.architect_name}</p>
                {getContactTypeLabel(quote.architect_type) && (
                  <span className="text-xs font-medium px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-full">
                    {getContactTypeLabel(quote.architect_type)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Donos */}
          <div className="flex items-center gap-1.5 shrink-0">
            {quote.owners?.map((o: any) => (
              <Avatar key={o.user_id} user={o} size={32}
                title={`${o.name} (${o.role === 'primary' ? 'primário' : 'colaborador'})`} />
            ))}
          </div>
        </div>

        {/* Detalhes rápidos */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-surface-border">
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Categoria</p>
            <div className="mt-1"><OptionTag options={CATEGORY_OPTS} value={quote.category} /></div>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Tamanho</p>
            <div className="mt-1"><OptionTag options={SIZE_OPTS} value={quote.size} /></div>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Origem</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <OptionTag options={ORIGIN_OPTS} value={quote.origin} />
              {quote.origin === 'visit' && quote.paid_traffic_type === 'final_client' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-red-50 text-red-700 border-red-200">Cliente Final</span>
              )}
              {quote.origin === 'visit' && quote.paid_traffic_type === 'new_partner' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-red-50 text-red-700 border-red-200">Novo Parceiro</span>
              )}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Prioridade</p>
            <div className="mt-1"><OptionTag options={PRIORITY_OPTS} value={quote.priority} /></div>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Etapa da obra</p>
            <div className="mt-1"><OptionTag options={STAGE_OPTS} value={quote.work_stage} /></div>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Prazo</p>
            <p className="text-sm font-medium mt-0.5">{formatDate(quote.deadline)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Valor orçado</p>
            <p className="text-sm font-medium mt-0.5">{formatCurrency(quote.quoted_value)}</p>
          </div>
        </div>

        {/* Propostas registradas + botão nova proposta */}
        <div className="mt-3 pt-3 border-t border-surface-border space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">Propostas</span>
            <button
              type="button"
              onClick={() => {
                const opening = !showProposalForm
                setShowProposalForm(opening)
                setEditingProposalId(null)
                // Ao abrir, já preenche com a data de hoje (data local, sem erro de fuso)
                if (opening && !proposalDate) {
                  const d = new Date()
                  setProposalDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
                }
              }}
              className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 font-medium"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Nova proposta
            </button>
          </div>

          {/* Proposta 1 = valor orçado */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
            <div className="flex-1 min-w-0">
              <span className="text-xs font-bold text-gray-700">Proposta 1</span>
              <span className="text-xs text-gray-500"> (valor orçado) · {formatCurrency(quote.quoted_value)}</span>
            </div>
          </div>

          {/* Propostas adicionais */}
          {proposals.map((p, i) => {
            const fmtDate = p.date ? new Date(p.date + 'T00:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' }) : null
            const isEditing = editingProposalId === p.id
            const isExpanded = expandedProposalId === p.id
            return (
              <div key={p.id} className="rounded-xl border border-brand-200 bg-brand-50 overflow-hidden">
                {/* linha principal */}
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setExpandedProposalId(isExpanded ? null : p.id)}
                    className="flex-1 text-left min-w-0"
                  >
                    <span className="text-xs font-bold text-brand-700">Proposta {i + 2}</span>
                    <span className="text-xs text-brand-600"> · {formatCurrency(p.value)}</span>
                    {fmtDate && <span className="text-xs text-brand-400"> · {fmtDate}</span>}
                    {p.info && <span className="text-xs text-brand-400"> · {isExpanded ? '▲' : '▼'}</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingProposalId(p.id)
                      setEditValue(String(p.value))
                      setEditDate(p.date ?? '')
                      setEditInfo(p.info ?? '')
                      setShowProposalForm(false)
                      setExpandedProposalId(null)
                    }}
                    className="p-1 text-brand-400 hover:text-brand-700 transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(`Excluir Proposta ${i + 2}?`)) return
                      await deleteQuoteProposal(p.id, quote.id)
                      setProposals(await getQuoteProposals(quote.id))
                    }}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                {/* info expandida */}
                {isExpanded && p.info && (
                  <div className="px-3 pb-2 border-t border-brand-200">
                    <p className="text-xs text-brand-700 mt-1.5 whitespace-pre-wrap">{p.info}</p>
                  </div>
                )}

                {/* form de edição inline */}
                {isEditing && (
                  <div className="px-3 pb-3 pt-2 border-t border-brand-200 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="label text-[10px]">Valor (R$) *</label>
                        <input type="number" step="0.01" min="0" value={editValue}
                          onChange={e => setEditValue(e.target.value)} className="input mt-0.5 text-sm" />
                      </div>
                      <div>
                        <label className="label text-[10px]">Data</label>
                        <input type="date" value={editDate}
                          onChange={e => setEditDate(e.target.value)} className="input mt-0.5 text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="label text-[10px]">Informações</label>
                      <textarea rows={2} value={editInfo} onChange={e => setEditInfo(e.target.value)}
                        className="input mt-0.5 text-sm resize-none" />
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={!editValue}
                        onClick={async () => {
                          await updateQuoteProposal(p.id, quote.id, {
                            value: Number(editValue),
                            date: editDate || undefined,
                            info: editInfo || undefined,
                          })
                          setProposals(await getQuoteProposals(quote.id))
                          setEditingProposalId(null)
                        }}
                        className="btn-primary text-xs py-1"
                      >Salvar</button>
                      <button onClick={() => setEditingProposalId(null)} className="btn-secondary text-xs py-1">Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Form de nova proposta */}
          {showProposalForm && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
              <p className="text-sm font-semibold text-blue-800">Proposta {proposals.length + 2}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Valor (R$) *</label>
                  <input type="number" step="0.01" min="0" placeholder="0,00"
                    value={proposalValue} onChange={e => setProposalValue(e.target.value)}
                    className="input mt-1" />
                </div>
                <div>
                  <label className="label">Data</label>
                  <input type="date" value={proposalDate} onChange={e => setProposalDate(e.target.value)}
                    className="input mt-1" />
                </div>
              </div>
              <div>
                <label className="label">Informações</label>
                <textarea rows={2} placeholder="Detalhes desta proposta, justificativa de valor..."
                  value={proposalInfo} onChange={e => setProposalInfo(e.target.value)}
                  className="input mt-1 resize-none" />
              </div>
              <div className="flex gap-2">
                <button
                  disabled={savingProposal || !proposalValue}
                  onClick={async () => {
                    setSavingProposal(true)
                    const res = await createQuoteProposal(quote.id, {
                      value: Number(proposalValue),
                      date: proposalDate || undefined,
                      info: proposalInfo || undefined,
                    })
                    if (!res.error) {
                      const updated = await getQuoteProposals(quote.id)
                      setProposals(updated)
                      setProposalValue(''); setProposalDate(''); setProposalInfo('')
                      setShowProposalForm(false)
                    }
                    setSavingProposal(false)
                  }}
                  className="btn-primary text-xs py-1.5"
                >
                  {savingProposal ? 'Salvando...' : 'Salvar proposta'}
                </button>
                <button onClick={() => setShowProposalForm(false)} className="btn-secondary text-xs py-1.5">Cancelar</button>
              </div>
            </div>
          )}
        </div>

        {/* Datas e tempo */}
        {(() => {
          const createdDate = quote.quote_date ?? quote.created_at
          const daysOpen = createdDate
            ? Math.floor((Date.now() - new Date(createdDate.includes('T') ? createdDate : createdDate + 'T00:00:00').getTime()) / 86400000)
            : null
          const deadlineMs = quote.deadline ? new Date(quote.deadline + 'T23:59:59').getTime() : null
          const daysOverdue = deadlineMs && quote.status !== 'done'
            ? Math.floor((Date.now() - deadlineMs) / 86400000)
            : null
          // Se concluído com atraso: calcula usando closed_at ou updated_at
          const closedAt = quote.closed_at ?? quote.updated_at
          const daysLate = quote.status === 'done' && deadlineMs && closedAt
            ? Math.floor((new Date(closedAt).getTime() - deadlineMs) / 86400000)
            : null
          const lastActivity = activities?.[0]?.created_at ?? quote.updated_at ?? quote.created_at
          const daysSinceUpdate = lastActivity
            ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000)
            : null
          return (
            <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-surface-border text-xs">
              <span className="flex items-center gap-1 text-gray-400">
                <CalendarDays className="w-3.5 h-3.5" />
                Aberto em {formatDate(createdDate)}
                {daysOpen !== null && <span className="ml-1 text-gray-400">({daysOpen}d aberto)</span>}
              </span>
              {daysOverdue !== null && daysOverdue > 0 && (
                <span className="flex items-center gap-1 text-red-500 font-semibold bg-red-50 px-2 py-0.5 rounded-full">
                  ⚠️ {daysOverdue} dia{daysOverdue !== 1 ? 's' : ''} em atraso
                </span>
              )}
              {daysLate !== null && daysLate > 0 && (
                <span className="text-[11px] text-gray-400">
                  concluído com {daysLate} dia{daysLate !== 1 ? 's' : ''} de atraso
                </span>
              )}
              {daysSinceUpdate !== null && (
                <span className={cn('flex items-center gap-1', daysSinceUpdate > 7 ? 'text-amber-500 font-medium' : 'text-gray-400')}>
                  <Clock className="w-3.5 h-3.5" />
                  {daysSinceUpdate === 0 ? 'Atualizado hoje' : `Sem atualização há ${daysSinceUpdate}d`}
                </span>
              )}
            </div>
          )
        })()}

        {/* Status actions */}
        <div className="mt-4 pt-4 border-t border-surface-border space-y-2">
          <span className="text-xs text-gray-400">Status:</span>
          <div className="flex flex-wrap gap-2">
            {(['queue','in_progress','paused','review','done','revision'] as const).map(s => (
              <button
                key={s}
                disabled={pending || quote.status === s}
                onClick={() => act(() => updateQuoteStatus(quote.id, s))}
                title={QUOTE_STATUS_HINT[s]}
                className={cn(
                  'badge cursor-pointer transition-all',
                  quote.status === s
                    ? cn(STATUS_COLOR[s].bg, STATUS_COLOR[s].text, 'ring-1 ring-current')
                    : 'bg-surface-secondary text-gray-500 hover:bg-surface-border'
                )}
              >
                {QUOTE_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          {/* Hint do status atual */}
          <p className="text-xs text-gray-400 italic">{QUOTE_STATUS_HINT[quote.status as keyof typeof QUOTE_STATUS_HINT]}</p>
        </div>
      </div>

      {/* Negociação + descontos — concluído ou elaborando nova versão */}
      {(quote.status === 'done' || quote.status === 'revision') && (<>
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Negociação</h2>

        {/* Temperatura */}
        <div className="flex flex-wrap gap-2 mb-2">
          {TEMPS.filter(t => t !== 'closed' && t !== 'lost').map(t => {
            const c = TEMPERATURE_COLOR[t]
            const active = quote.temperature === t
            return (
              <button
                key={t}
                disabled={pending}
                onClick={() => act(() => updateTemperature(quote.id, t))}
                className={cn(
                  'badge cursor-pointer border transition-all',
                  active ? cn(c.bg, c.text, c.border, 'ring-1 ring-current') : 'bg-white border-surface-border text-gray-500 hover:border-gray-300'
                )}
              >
                {t === 'hot' && <Flame className="w-3 h-3 mr-1 inline" />}
                {TEMPERATURE_LABEL[t]}
              </button>
            )
          })}
        </div>

        {/* Badges de movimento */}
        {(() => {
          const demotedAt = quote.last_auto_demoted_at ? new Date(quote.last_auto_demoted_at) : null
          const promotedAt = quote.last_promoted_at ? new Date(quote.last_promoted_at) : null
          const now = Date.now()
          const showDemoted = demotedAt && (now - demotedAt.getTime()) < 48 * 60 * 60 * 1000
          const showPromoted = promotedAt && (now - promotedAt.getTime()) < 24 * 60 * 60 * 1000
          if (!showDemoted && !showPromoted) return null
          return (
            <div className="flex gap-2 mb-3">
              {showDemoted && <span className="text-xs font-medium text-orange-500 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">⬇ Rebaixado</span>}
              {showPromoted && <span className="text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">⬆ Subiu</span>}
            </div>
          )
        })()}

        {/* CTA: fechar ou perder */}
        {quote.temperature !== 'closed' && quote.temperature !== 'lost' && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowCloseSale(true)}
              className="btn-primary text-xs py-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Fechar venda
            </button>
            <button
              onClick={() => setShowMarkLost(true)}
              className="btn-secondary text-xs py-1.5"
            >
              <XCircle className="w-3.5 h-3.5" />
              Marcar como perdida
            </button>
          </div>
        )}

        {/* Venda fechada */}
        {quote.temperature === 'closed' && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-800">Venda fechada</p>
                  <p className="text-xs text-green-700">
                    {formatCurrency(localFinalValue ?? quote.final_value)}
                    {' · '}{formatDate(quote.closed_at)}
                  </p>
                  {localSplits.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {localSplits.map((s: any, idx: number) => {
                        const r = DEFAULT_PAYMENT_RATES.find(x => x.method_key === s.method_key)
                        const isOpen = s.status === 'open'
                        return (
                          <span key={idx} className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border',
                            isOpen ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200')}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', isOpen ? 'bg-amber-500' : 'bg-emerald-500')} />
                            {r?.label ?? s.method_key} R${Number(s.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            <span className="opacity-70">· {isOpen ? 'em aberto' : 'pago'}</span>
                          </span>
                        )
                      })}
                    </div>
                  )}
                  {(() => {
                    const recebido = localSplits.filter((s: any) => s.status !== 'open').reduce((a: number, s: any) => a + Number(s.amount ?? 0), 0)
                    const aberto = localSplits.filter((s: any) => s.status === 'open').reduce((a: number, s: any) => a + Number(s.amount ?? 0), 0)
                    if (aberto <= 0) return null
                    return (
                      <p className="text-[11px] mt-1 text-green-800">
                        Recebido <strong>{formatCurrency(recebido)}</strong> · Em aberto <strong className="text-amber-700">{formatCurrency(aberto)}</strong>
                      </p>
                    )
                  })()}
                </div>
              </div>
              <button onClick={() => setShowEditPayment(v => !v)}
                className="p-1.5 hover:bg-green-100 rounded-lg transition-colors text-green-600" title="Editar pagamento">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={async () => {
                  if (!confirm('Cancelar a venda fechada? Isso irá reverter a negociação para status "Quente".')) return
                  await cancelSale(quote.id)
                  router.refresh()
                }}
                className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-red-400 hover:text-red-600"
                title="Cancelar venda"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {showEditPayment && (
              <EditPaymentForm
                quoteId={quote.id}
                currentFinalValue={localFinalValue ?? quote.final_value ?? 0}
                currentSplits={localSplits}
                currentClosedDate={quote.closed_at}
                onSaved={(fv, splits) => {
                  setLocalFinalValue(fv)
                  setLocalSplits(splits)
                  setShowEditPayment(false)
                }}
                onCancel={() => setShowEditPayment(false)}
              />
            )}
          </div>
        )}

        {/* Perdida */}
        {quote.temperature === 'lost' && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center gap-3">
            <XCircle className="w-5 h-5 text-gray-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-gray-700">
                Negociação perdida
                {quote.temperature_updated_at && (
                  <span className="font-normal text-gray-500"> · {formatDate(quote.temperature_updated_at)}</span>
                )}
              </p>
              {quote.loss_reason && (
                <p className="text-xs text-gray-500">
                  Motivo: {LOSS_REASON_LABEL[quote.loss_reason as keyof typeof LOSS_REASON_LABEL]}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Fechar venda */}
        {showCloseSale && (
          <CloseSaleForm
            quoteId={quote.id}
            quotedValue={quote.quoted_value ?? null}
            proposals={proposals}
            onConfirm={() => { setShowCloseSale(false); router.refresh() }}
            onCancel={() => setShowCloseSale(false)}
          />
        )}

        {/* Modal marcar perdida */}
        {showMarkLost && (
          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Motivo da perda</h3>
            <select value={lossReason} onChange={e => setLossReason(e.target.value)} className="select">
              {Object.entries(LOSS_REASON_LABEL).map(([k,v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                disabled={pending}
                onClick={() => act(() => markAsLost(quote.id, lossReason))}
                className="btn-secondary text-xs py-1.5"
              >
                Confirmar
              </button>
              <button onClick={() => setShowMarkLost(false)} className="btn-secondary text-xs py-1.5">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabela de descontos */}
      <div className="card p-4">
        <button
          onClick={() => setShowDiscounts(v => !v)}
          className="w-full flex items-center justify-between text-sm font-semibold text-gray-700"
        >
          <span className="flex items-center gap-2"><Percent className="w-4 h-4" /> Tabela de descontos</span>
          <span className="text-xs text-gray-400">{showDiscounts ? 'Ocultar' : 'Ver'}</span>
        </button>
        {showDiscounts && (
          <div className="mt-3 space-y-3">
            {/* Tabs de propostas */}
            {proposals.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSelectedProposalId(null)}
                  className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                    selectedProposalId === null
                      ? 'bg-brand-50 text-brand-700 border-brand-300'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  )}
                >
                  Proposta 1 (orçado) · {formatCurrency(quote.quoted_value)}
                </button>
                {proposals.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProposalId(p.id)}
                    className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                      selectedProposalId === p.id
                        ? 'bg-brand-50 text-brand-700 border-brand-300'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    )}
                    title={p.info ?? undefined}
                  >
                    Proposta {i + 2} · {formatCurrency(p.value)}
                  </button>
                ))}
              </div>
            )}
            <DiscountTable
              quotedValue={
                selectedProposalId
                  ? (proposals.find(p => p.id === selectedProposalId)?.value ?? quote.quoted_value ?? null)
                  : (quote.quoted_value ?? null)
              }
            />
          </div>
        )}
      </div>
      </>)}

      {/* Visita */}
      {(quote.visit_status || quote.visit_address) && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Visita
          </h2>
          <div className="flex items-center gap-3">
            <span className="badge bg-surface-secondary text-gray-600">
              {quote.visit_status?.replace('_', ' ')}
            </span>
            {quote.visit_date && (
              <span className="text-sm text-gray-500">{formatDate(quote.visit_date)}</span>
            )}
          </div>
          {quote.visit_address && (
            <p className="text-sm text-gray-500 mt-2">{quote.visit_address}</p>
          )}
        </div>
      )}

      {/* Observações */}
      {quote.notes && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Observações</h2>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{quote.notes}</p>
        </div>
      )}

      {/* Timeline / Atividades */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Histórico
        </h2>

        {/* Adicionar anotação */}
        <div className="mb-4 space-y-2">
          <div className="flex gap-2">
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Anotação, feedback do cliente, arquiteto..."
              className="input flex-1"
              onKeyDown={e => {
                if (e.key === 'Enter' && note.trim()) {
                  act(() => addActivity(quote.id, note, 'note'))
                  setNote('')
                }
              }}
            />
            <button
              disabled={pending || !note.trim()}
              onClick={() => { act(() => addActivity(quote.id, note, 'note')); setNote('') }}
              className="btn-primary text-xs"
            >
              {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Salvar'}
            </button>
          </div>
        </div>

        {/* Lista de atividades */}
        <div className="space-y-3">
          {activities.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Nenhuma atividade ainda</p>
          )}
          {activities.map((a: any) => {
            const isNote = a.type === 'note' && !a.description?.startsWith('✏️ Editado')
            const isSystem = a.is_system || a.type === 'system' || !a.user_id
            return (
              <div key={a.id} className={cn('flex gap-3 rounded-xl p-3',
                isNote ? 'bg-amber-50 border border-amber-100' :
                isSystem ? 'bg-blue-50 border border-blue-100' :
                'bg-gray-50 border border-gray-100'
              )}>
                <div className="mt-0.5 shrink-0">
                  {isSystem ? (
                    <div className="w-7 h-7 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-sm">🤖</div>
                  ) : (
                    <Avatar user={a.user ?? { name: 'U' }} size={28} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-700">
                      {isSystem ? 'Sistema' : (a.user?.name ?? 'Sistema')}
                    </span>
                    {isNote && <span className="text-[10px] font-medium text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">Nota</span>}
                    {isSystem && <span className="text-[10px] font-medium text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">Automático</span>}
                    <span className="text-[10px] text-gray-400 ml-auto">{formatRelativeWithTime(a.created_at)}</span>
                  </div>
                  <p className={cn('text-sm mt-0.5',
                    isNote ? 'text-amber-900' :
                    isSystem ? 'text-blue-700 italic' :
                    'text-gray-500 italic'
                  )}>{translateActivityDescription(a.description)}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      </div>{/* fim col esquerda */}

      {/* Coluna direita: Tarefas + Agendamentos + Arquivos */}
      <div className="sticky top-4 space-y-4">
        <NegotiationTracker quoteId={quote.id} temperature={quote.temperature} />
        <QuoteTasks quoteId={quote.id} quoteLabel={`#${quote.number} · ${quote.client_name}`} />
        <QuoteSchedules quoteId={quote.id} quoteLabel={`#${quote.number} · ${quote.client_name}`} />
        {quote.drive_link && (
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Folder className="w-4 h-4" /> Arquivos
            </h2>
            <a href={quote.drive_link} target="_blank" rel="noopener noreferrer"
              className="block p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Folder className="w-5 h-5 text-blue-600 group-hover:text-blue-700" />
                  <div>
                    <p className="text-sm font-medium text-blue-900">Pasta no Google Drive</p>
                    <p className="text-xs text-blue-600">Clique para abrir</p>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-blue-400 group-hover:text-blue-600" />
              </div>
            </a>
          </div>
        )}
      </div>

      </div>{/* fim grid */}
      {ConfirmDialog}
    </div>
  )
}
