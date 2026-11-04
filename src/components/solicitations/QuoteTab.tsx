'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Pencil, Check, FileText, Loader2, CalendarDays, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { cn, formatCurrency, formatDate, isOverdue } from '@/lib/utils'
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_HINT, STATUS_COLOR } from '@/types'
import {
  getQuoteProposals, createQuoteProposal, updateQuoteProposal, deleteQuoteProposal,
} from '@/lib/actions'
import {
  createQuoteForSolicitation, deleteQuoteFromSolicitation,
  updateQuoteStatusWithCompletion, updateQuoteDeadline,
} from '@/lib/solicitations/actions'
import type { SolicitationView } from '@/lib/solicitations/actions'
import { useConfirm } from '@/components/ui/useConfirm'
import { QuoteSchedules } from '@/components/quotes/QuoteSchedules'
import { StageFilesColumn } from '@/components/solicitations/StageFiles'

// Fluxo principal (linear) e estados especiais (laterais)
const MAIN_FLOW = ['queue', 'in_progress', 'review', 'done'] as const
const SIDE_STATES = ['paused', 'revision'] as const
type QuoteStatusKey = 'queue' | 'in_progress' | 'paused' | 'review' | 'done' | 'revision'

// ── Status stepper ────────────────────────────────────────────────────────────

function StatusStepper({ status, onChange, disabled }: {
  status: QuoteStatusKey; onChange: (s: QuoteStatusKey) => void; disabled?: boolean
}) {
  const isSide = (SIDE_STATES as readonly string[]).includes(status)
  const activeIdx = MAIN_FLOW.indexOf(status as any)

  return (
    <div className="space-y-3">
      {/* Fluxo principal */}
      <div className="flex items-center gap-0">
        {MAIN_FLOW.map((s, i) => {
          const sc = STATUS_COLOR[s]
          const isActive = status === s
          const isPast = !isSide && activeIdx > i
          const isNext = !isSide && activeIdx === i - 1
          return (
            <div key={s} className="flex items-center flex-1 min-w-0">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(s)}
                title={QUOTE_STATUS_HINT[s]}
                className={cn(
                  'flex-1 min-w-0 px-2 py-2 text-xs font-semibold rounded-lg transition-all text-center',
                  isActive
                    ? cn(sc.bg, sc.text, 'ring-2 ring-offset-1 ring-current shadow-sm')
                    : isPast
                      ? 'bg-green-50 text-green-600 opacity-60'
                      : isNext
                        ? 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                )}
              >
                {QUOTE_STATUS_LABEL[s]}
              </button>
              {i < MAIN_FLOW.length - 1 && (
                <ChevronRight className="w-3 h-3 text-gray-300 shrink-0 mx-0.5" />
              )}
            </div>
          )
        })}
      </div>
      {/* Estados laterais */}
      <div className="flex gap-2">
        {SIDE_STATES.map(s => {
          const sc = STATUS_COLOR[s]
          const isActive = status === s
          return (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => onChange(s)}
              title={QUOTE_STATUS_HINT[s]}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-full border transition-all',
                isActive
                  ? cn(sc.bg, sc.text, 'border-transparent shadow-sm')
                  : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600 bg-white'
              )}
            >
              {QUOTE_STATUS_LABEL[s]}
            </button>
          )
        })}
      </div>
      {/* Descrição do status atual */}
      <p className="text-xs text-gray-400 italic leading-relaxed">
        {QUOTE_STATUS_HINT[status]}
      </p>
    </div>
  )
}

// ── Prazo ─────────────────────────────────────────────────────────────────────

function DeadlineRow({ quote, solicitationId }: { quote: any; solicitationId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [deadline, setDeadline] = useState(quote.deadline ? String(quote.deadline).slice(0, 10) : '')

  const isDone = quote.status === 'done'
  const overdue = quote.deadline && !isDone && isOverdue(quote.deadline)

  function save() {
    startTransition(async () => {
      await updateQuoteDeadline(quote.id, solicitationId, deadline || null)
      setEditing(false)
      router.refresh()
    })
  }

  return (
    <div className={cn(
      'flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm transition-colors',
      overdue ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-100',
    )}>
      <CalendarDays className={cn('w-4 h-4 shrink-0', overdue ? 'text-red-500' : 'text-gray-400')} />
      <span className={cn('text-xs font-medium', overdue ? 'text-red-700' : 'text-gray-500')}>
        Prazo para o cliente
      </span>
      {editing ? (
        <>
          <input
            type="date" value={deadline}
            onChange={e => setDeadline(e.target.value)}
            className="input ml-auto text-xs !py-1 w-auto"
            autoFocus
          />
          <button type="button" onClick={save} disabled={pending} className="btn-primary px-2 py-1 text-xs">
            {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Salvar'}
          </button>
          <button type="button" onClick={() => { setDeadline(quote.deadline ? String(quote.deadline).slice(0, 10) : ''); setEditing(false) }}
            className="btn-secondary px-2 py-1 text-xs">Cancelar</button>
        </>
      ) : (
        <>
          {quote.deadline ? (
            <span className={cn('font-semibold text-sm ml-1', overdue ? 'text-red-700' : 'text-gray-700')}>
              {formatDate(quote.deadline)}
              {overdue && <AlertCircle className="w-3.5 h-3.5 inline ml-1.5 text-red-500" />}
              {overdue && <span className="text-xs font-normal text-red-500 ml-1">vencido</span>}
            </span>
          ) : (
            <span className="text-gray-400 italic text-xs ml-1">não definido</span>
          )}
          {isDone && quote.completed_at && (
            <span className="ml-auto flex items-center gap-1 text-xs text-green-600 font-medium">
              <Check className="w-3 h-3" /> Concluído em {formatDate(quote.completed_at)}
            </span>
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-auto p-1 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-brand-600 transition-colors"
            title="Editar prazo"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  )
}

// ── Propostas ────────────────────────────────────────────────────────────────

function ProposalList({ quoteId }: { quoteId: string }) {
  const [proposals, setProposals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [value, setValue] = useState('')
  const [date, setDate] = useState('')
  const [info, setInfo] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editInfo, setEditInfo] = useState('')
  const { confirm, ConfirmDialog } = useConfirm()

  async function load() {
    setLoading(true)
    setProposals(await getQuoteProposals(quoteId))
    setLoading(false)
  }
  useEffect(() => { load() }, [quoteId])

  async function handleCreate() {
    const v = parseFloat(value.replace(/\./g, '').replace(',', '.'))
    if (!v || isNaN(v)) return
    setSaving(true)
    await createQuoteProposal(quoteId, { value: v, date: date || undefined, info: info || undefined })
    setProposals(await getQuoteProposals(quoteId))
    setValue(''); setDate(''); setInfo('')
    setShowForm(false); setSaving(false)
  }

  async function handleDelete(id: string, label: string) {
    const yes = await confirm(`Excluir a proposta de ${label}?`, 'Excluir')
    if (!yes) return
    await deleteQuoteProposal(id, quoteId)
    setProposals(await getQuoteProposals(quoteId))
  }

  function startEdit(p: any) {
    setEditingId(p.id)
    setEditValue(formatCurrency(p.value).replace('R$\xa0', ''))
    setEditDate(p.date ? String(p.date).slice(0, 10) : '')
    setEditInfo(p.info ?? '')
  }

  async function handleSaveEdit() {
    if (!editingId) return
    const v = parseFloat(editValue.replace(/\./g, '').replace(',', '.'))
    if (!v || isNaN(v)) return
    setSaving(true)
    await updateQuoteProposal(editingId, quoteId, { value: v, date: editDate || undefined, info: editInfo || undefined })
    setProposals(await getQuoteProposals(quoteId))
    setEditingId(null); setSaving(false)
  }

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-300" /></div>

  // Proposta mais recente = destaque
  const latest = proposals[0]

  return (
    <div>
      {/* Destaque: valor da última proposta */}
      {latest && (
        <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-white border border-brand-100 px-4 py-3.5 mb-3">
          <p className="text-[11px] uppercase tracking-wide text-brand-600/70 font-semibold mb-0.5">Valor proposto</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(latest.value)}</p>
          {(latest.date || latest.info) && (
            <p className="text-xs text-gray-500 mt-0.5">
              {latest.date && formatDate(latest.date)}
              {latest.date && latest.info && ' · '}
              {latest.info}
            </p>
          )}
        </div>
      )}

      {/* Versões anteriores */}
      {proposals.length > 1 && (
        <div className="space-y-1.5 mb-3">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Versões anteriores</p>
          {proposals.slice(1).map(p => (
            <div key={p.id} className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2">
              {editingId === p.id ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <input value={editValue} onChange={e => setEditValue(e.target.value)} placeholder="Valor (R$)" className="input w-32" />
                    <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="input w-auto" />
                    <input value={editInfo} onChange={e => setEditInfo(e.target.value)} placeholder="Informações (opcional)" className="input flex-1 min-w-[160px]" />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={handleSaveEdit} disabled={saving} className="btn-primary px-3 py-1 text-xs">
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Salvar
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="btn-secondary px-3 py-1 text-xs">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-gray-600">{formatCurrency(p.value)}</span>
                  {p.date && <span className="text-xs text-gray-400">{formatDate(p.date)}</span>}
                  {p.info && <span className="text-xs text-gray-400 truncate flex-1">{p.info}</span>}
                  <div className="flex gap-1 ml-auto">
                    <button type="button" onClick={() => startEdit(p)} className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"><Pencil className="w-3 h-3" /></button>
                    <button type="button" onClick={() => handleDelete(p.id, formatCurrency(p.value))} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Editar a proposta em destaque */}
      {latest && editingId === latest.id && (
        <div className="rounded-lg border border-dashed border-brand-300 bg-brand-50/40 p-3 space-y-2 mb-3">
          <div className="flex flex-wrap gap-2">
            <input value={editValue} onChange={e => setEditValue(e.target.value)} placeholder="Valor (R$)" className="input w-32" />
            <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="input w-auto" />
            <input value={editInfo} onChange={e => setEditInfo(e.target.value)} placeholder="Informações (opcional)" className="input flex-1 min-w-[160px]" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleSaveEdit} disabled={saving} className="btn-primary px-3 py-1 text-xs">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Salvar
            </button>
            <button type="button" onClick={() => setEditingId(null)} className="btn-secondary px-3 py-1 text-xs">Cancelar</button>
          </div>
        </div>
      )}

      {/* Ações sobre proposta em destaque */}
      {latest && editingId !== latest.id && (
        <div className="flex items-center gap-2 mb-3">
          <button type="button" onClick={() => startEdit(latest)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600 transition-colors">
            <Pencil className="w-3 h-3" /> Editar valor
          </button>
          <span className="text-gray-200">·</span>
          <button type="button" onClick={() => handleDelete(latest.id, formatCurrency(latest.value))}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 className="w-3 h-3" /> Excluir
          </button>
        </div>
      )}

      {/* Formulário nova proposta */}
      {showForm ? (
        <div className="rounded-lg border border-dashed border-brand-300 bg-brand-50/40 p-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input value={value} onChange={e => setValue(e.target.value)} placeholder="Valor (R$)" className="input w-32" autoFocus />
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input w-auto" />
            <input value={info} onChange={e => setInfo(e.target.value)} placeholder="Informações (opcional)" className="input flex-1 min-w-[160px]" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleCreate} disabled={saving || !value.trim()} className="btn-primary px-3 py-1 text-xs">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Adicionar
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary px-3 py-1 text-xs">Cancelar</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors">
          <Plus className="w-3.5 h-3.5" />
          {proposals.length === 0 ? 'Registrar valor proposto' : 'Nova versão do valor'}
        </button>
      )}
      {ConfirmDialog}
    </div>
  )
}

// ── Agendamentos collapsible ──────────────────────────────────────────────────

function AgendamentosSection({ quoteId, quoteLabel }: { quoteId: string; quoteLabel: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Agendamentos</span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 ml-auto transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <QuoteSchedules
            quoteId={quoteId}
            quoteLabel={quoteLabel}
            allowedTypes={['reuniao', 'follow_up', 'lembrete']}
          />
        </div>
      )}
    </div>
  )
}

// ── QuoteTab ──────────────────────────────────────────────────────────────────

export function QuoteTab({
  solicitation, quote,
}: { solicitation: SolicitationView; quote: any | null }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [localQuote, setLocalQuote] = useState<any | null>(quote)
  const { confirm, ConfirmDialog } = useConfirm()

  useEffect(() => { setLocalQuote(quote) }, [quote])

  function handleCreate() {
    if (creating) return
    setCreating(true); setCreateError(null)
    startTransition(async () => {
      const res = await createQuoteForSolicitation(solicitation.id, { clientId: solicitation.clientId })
      setCreating(false)
      if (!res.ok) { setCreateError(res.error ?? 'Erro ao criar orçamento'); return }
      router.refresh()
    })
  }

  function changeStatus(s: QuoteStatusKey) {
    if (!localQuote || localQuote.status === s) return
    startTransition(async () => {
      await updateQuoteStatusWithCompletion(localQuote.id, solicitation.id, s)
      router.refresh()
    })
  }

  async function handleDelete() {
    if (!localQuote) return
    const yes = await confirm('Excluir este orçamento? Essa ação também removerá a negociação vinculada.', 'Excluir')
    if (!yes) return
    startTransition(async () => {
      await deleteQuoteFromSolicitation(localQuote.id, solicitation.id)
      setLocalQuote(null)
    })
  }

  if (!localQuote) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center">
            <FileText className="w-6 h-6 text-brand-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700 mb-1">Sem orçamento vinculado</p>
            <p className="text-xs text-gray-400">Crie o orçamento para registrar o valor e acompanhar o status.</p>
          </div>
          <button type="button" onClick={handleCreate} disabled={pending || creating}
            className="btn-primary flex items-center gap-2 px-5 py-2 text-sm">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Criar orçamento
          </button>
          {createError && <p className="text-xs text-red-600">{createError}</p>}
        </div>
        <StageFilesColumn solicitationId={solicitation.id} stage="orcamento" />
      </div>
    )
  }

  const sc = STATUS_COLOR[localQuote.status as QuoteStatusKey]

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-4">

        {/* Identificação + status atual */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 font-mono">#{localQuote.number}</span>
          <span className={cn('badge text-xs font-semibold', sc.bg, sc.text)}>
            {QUOTE_STATUS_LABEL[localQuote.status as QuoteStatusKey]}
          </span>
        </div>

        {/* Prazo */}
        <DeadlineRow quote={localQuote} solicitationId={solicitation.id} />

        {/* Stepper de status */}
        <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3.5 space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-2">Atualizar status</p>
          <StatusStepper
            status={localQuote.status as QuoteStatusKey}
            onChange={changeStatus}
            disabled={pending}
          />
        </div>

        {/* Propostas */}
        <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3.5">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-3">Proposta de valor</p>
          <ProposalList quoteId={localQuote.id} />
        </div>

        {/* Zona de perigo */}
        <div className="pt-1">
          <button type="button" onClick={handleDelete} disabled={pending}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Excluir orçamento
          </button>
        </div>
      </div>

      <div className="min-w-0">
        <StageFilesColumn solicitationId={solicitation.id} stage="orcamento" />
      </div>

      {ConfirmDialog}
    </div>
  )
}
