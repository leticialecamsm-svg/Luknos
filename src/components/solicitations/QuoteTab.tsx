'use client'

// Aba Orçamento dentro de uma Solicitação.
// - Sem orçamento: botão "Criar orçamento".
// - Com orçamento: header (status + prioridade), Propostas CRUD,
//   Agendamentos (somente reunião/follow-up/lembrete), Arquivos.
// Sem histórico (já existe global), sem dados do cliente (já em Detalhes),
// sem visitas (têm aba própria), sem fornecedor.

import { useState, useEffect, useTransition } from 'react'
import { Plus, Trash2, Pencil, Check, X, FileText, Loader2, CalendarClock, Paperclip } from 'lucide-react'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import {
  QUOTE_STATUS_LABEL, STATUS_COLOR, PRIORITY_LABEL, PRIORITY_COLOR,
} from '@/types'
import {
  getQuoteProposals, createQuoteProposal, updateQuoteProposal, deleteQuoteProposal,
  updateQuoteStatus,
} from '@/lib/actions'
import { createQuoteForSolicitation, deleteQuoteFromSolicitation } from '@/lib/solicitations/actions'
import type { SolicitationView } from '@/lib/solicitations/actions'
import { useConfirm } from '@/components/ui/useConfirm'
import { QuoteSchedules } from '@/components/quotes/QuoteSchedules'
import { QuoteAttachments } from '@/components/quotes/QuoteAttachments'

const QUOTE_STATUS_OPTIONS = Object.entries(QUOTE_STATUS_LABEL) as [string, string][]
const PRIORITY_OPTIONS = Object.entries(PRIORITY_LABEL) as [string, string][]

function SectionHeading({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-brand-600" />
      <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">{children}</h3>
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

  return (
    <div>
      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-300" /></div>
      ) : proposals.length === 0 && !showForm ? (
        <p className="text-sm text-gray-400 italic text-center py-3">Nenhuma proposta ainda.</p>
      ) : (
        <div className="space-y-2 mb-3">
          {proposals.map(p => (
            <div key={p.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
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
                  <span className="font-semibold text-sm text-gray-800">{formatCurrency(p.value)}</span>
                  {p.date && <span className="text-xs text-gray-400">{formatDate(p.date)}</span>}
                  {p.info && <span className="text-xs text-gray-500 truncate flex-1">{p.info}</span>}
                  <div className="flex gap-1 ml-auto">
                    <button type="button" onClick={() => startEdit(p)} className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button type="button" onClick={() => handleDelete(p.id, formatCurrency(p.value))} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <div className="rounded-lg border border-dashed border-brand-300 bg-brand-50/40 p-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input value={value} onChange={e => setValue(e.target.value)} placeholder="Valor (R$)" className="input w-32" />
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
          className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium">
          <Plus className="w-3.5 h-3.5" /> Nova proposta
        </button>
      )}
      {ConfirmDialog}
    </div>
  )
}

// ── QuoteHeader ──────────────────────────────────────────────────────────────

function QuoteHeader({
  quote,
  solicitationId,
  onDeleted,
}: {
  quote: any
  solicitationId: string
  onDeleted: () => void
}) {
  const [pending, startTransition] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()

  const statusC = STATUS_COLOR[quote.status as keyof typeof STATUS_COLOR] ?? { bg: 'bg-gray-100', text: 'text-gray-600' }
  const priorityC = PRIORITY_COLOR[quote.priority as keyof typeof PRIORITY_COLOR] ?? { bg: 'bg-gray-100', text: 'text-gray-600' }

  async function handleDelete() {
    const yes = await confirm('Excluir este orçamento? Essa ação não pode ser desfeita e também removerá a negociação vinculada.', 'Excluir')
    if (!yes) return
    startTransition(async () => {
      await deleteQuoteFromSolicitation(quote.id, solicitationId)
      onDeleted()
    })
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {quote.number && <span className="text-xs text-gray-400 font-mono">#{quote.number}</span>}
        <select
          value={quote.status}
          disabled={pending}
          onChange={e => startTransition(async () => { await updateQuoteStatus(quote.id, e.target.value as any) })}
          className={cn('badge border-0 text-xs font-semibold cursor-pointer pr-1', statusC.bg, statusC.text)}
        >
          {QUOTE_STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className={cn('badge text-xs font-semibold', priorityC.bg, priorityC.text)}>
          {PRIORITY_LABEL[quote.priority as keyof typeof PRIORITY_LABEL] ?? quote.priority}
        </span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className="ml-auto flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" /> Excluir orçamento
        </button>
      </div>
      {ConfirmDialog}
    </>
  )
}

// ── QuoteTab ─────────────────────────────────────────────────────────────────

export function QuoteTab({
  solicitation,
  quote,
}: {
  solicitation: SolicitationView
  quote: any | null
}) {
  const [pending, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)
  const [localQuote, setLocalQuote] = useState<any | null>(quote)

  // sync when parent refreshes
  useEffect(() => { setLocalQuote(quote) }, [quote])

  function handleCreate() {
    if (creating) return
    setCreating(true)
    startTransition(async () => {
      const res = await createQuoteForSolicitation(solicitation.id, { clientId: solicitation.clientId })
      if (!res.ok) { setCreating(false); return }
      // router.refresh() will happen via revalidatePath — component receives new prop
      setCreating(false)
    })
  }

  if (!localQuote) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-4">
        <FileText className="w-8 h-8 text-gray-300" />
        <p className="text-sm text-gray-400">Nenhum orçamento vinculado a esta solicitação.</p>
        <button
          type="button"
          onClick={handleCreate}
          disabled={pending || creating}
          className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Criar orçamento
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <QuoteHeader
        quote={localQuote}
        solicitationId={solicitation.id}
        onDeleted={() => setLocalQuote(null)}
      />

      <div>
        <SectionHeading icon={FileText}>Propostas</SectionHeading>
        <ProposalList quoteId={localQuote.id} />
      </div>

      <div>
        <SectionHeading icon={CalendarClock}>Agendamentos</SectionHeading>
        <QuoteSchedules
          quoteId={localQuote.id}
          quoteLabel={`Orçamento #${localQuote.number ?? ''}`}
          allowedTypes={['reuniao', 'follow_up', 'lembrete']}
        />
      </div>

      <div>
        <SectionHeading icon={Paperclip}>Arquivos</SectionHeading>
        <QuoteAttachments quoteId={localQuote.id} />
      </div>
    </div>
  )
}
