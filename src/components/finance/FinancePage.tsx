'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import {
  createFinanceEntry, updateFinanceEntry, setFinancePaid,
  deleteFinanceEntry, getFinanceEntries,
  createFinanceSupplier, createFinanceCategory,
  updateFinanceAccount, createFinanceAccount,
} from '@/lib/actions'
import { formatCurrency, cn } from '@/lib/utils'
import {
  Plus, X, Check, Trash2, Loader2, AlertTriangle,
  ArrowDownCircle, ArrowUpCircle, ChevronLeft, ChevronRight,
  RefreshCw, Layers, Landmark, Clock, CheckCircle2, Pencil,
  Search, MoreVertical, FileText, Receipt, Building2,
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/useConfirm'
import Link from 'next/link'

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function parseISO(s: string) { return new Date(s + 'T00:00:00') }
function fmtDate(s: string | null) {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}
function fmtDateLong(s: string | null) {
  if (!s) return '—'
  const dt = parseISO(s)
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}
function getEntryStatus(e: any, today: string): 'paid' | 'overdue' | 'pending' {
  if (e.status === 'paid') return 'paid'
  if (e.due_date < today) return 'overdue'
  return 'pending'
}
function parseBR(s: string) {
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
}

// ── Componentes pequenos ───────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'paid' | 'overdue' | 'pending' }) {
  const map = {
    paid:    { label: 'Pago',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    overdue: { label: 'Vencido',  cls: 'bg-red-50 text-red-700 border-red-200' },
    pending: { label: 'Pendente', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  }
  const { label, cls } = map[status]
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border', cls)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', status === 'paid' ? 'bg-emerald-500' : status === 'overdue' ? 'bg-red-500' : 'bg-amber-400')} />
      {label}
    </span>
  )
}

function OrigemBadge({ entry }: { entry: any }) {
  if (entry.purchase_invoice) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-blue-600">
        <FileText className="w-3 h-3" />
        NF-e {entry.purchase_invoice.numero_nota || ''}
      </span>
    )
  }
  if (entry.quote_id) {
    return (
      <Link href={`/quotes/${entry.quote_id}`} className="inline-flex items-center gap-1 text-[11px] text-brand-600 hover:underline" onClick={e => e.stopPropagation()}>
        <Receipt className="w-3 h-3" />
        Orçamento
      </Link>
    )
  }
  return <span className="text-[11px] text-gray-400">Manual</span>
}

function KpiTile({ icon: Icon, label, value, count, color, alert }: {
  icon: React.ElementType; label: string; value: number; count: number
  color: 'gray' | 'red' | 'green'; alert?: boolean
}) {
  const colors = {
    gray:  { card: 'border-surface-border bg-gradient-to-br from-gray-50 to-white', icon: 'text-gray-400', val: 'text-gray-800', sub: 'text-gray-500' },
    red:   { card: 'border-red-100 bg-gradient-to-br from-red-50 to-white', icon: 'text-red-400', val: 'text-red-700', sub: 'text-red-500' },
    green: { card: 'border-emerald-100 bg-gradient-to-br from-emerald-50 to-white', icon: 'text-emerald-400', val: 'text-emerald-700', sub: 'text-emerald-500' },
  }
  const c = colors[color]
  return (
    <div className={cn('rounded-xl border shadow-card p-4', c.card)}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn('w-4 h-4', c.icon)} />
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
        {alert && value > 0 && <AlertTriangle className="w-3 h-3 text-red-400" />}
      </div>
      <p className={cn('text-2xl font-bold', c.val)}>{formatCurrency(value)}</p>
      <p className={cn('text-xs mt-0.5', c.sub)}>{count} lançamento{count !== 1 ? 's' : ''}</p>
    </div>
  )
}

// ── Modal: Dar Baixa ──────────────────────────────────────────────────────────

function DarBaixaModal({ entry, accounts, onClose, onDone }: {
  entry: any; accounts: any[]; onClose: () => void; onDone: () => void
}) {
  const toast = useToast()
  const today = todayISO()
  const [paidAmount, setPaidAmount] = useState(String(entry.amount))
  const [paidAt, setPaidAt] = useState(today)
  const [interest, setInterest] = useState('0')
  const [fine, setFine] = useState('0')
  const [discount, setDiscount] = useState('0')
  const [accountId, setAccountId] = useState<string>('')
  const [saving, setSaving] = useState(false)

  // Recalcula paid_amount quando juros/multa/desconto mudam
  useEffect(() => {
    const base = parseFloat(paidAmount) || entry.amount
    const int = parseBR(interest)
    const fi = parseBR(fine)
    const dis = parseBR(discount)
    const total = entry.amount + int + fi - dis
    if (int !== 0 || fi !== 0 || dis !== 0) {
      setPaidAmount(total.toFixed(2))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interest, fine, discount])

  async function handleSubmit() {
    setSaving(true)
    const res = await setFinancePaid(entry.id, true, {
      paidAt,
      paidAmount: parseFloat(paidAmount) || entry.amount,
      interestAmount: parseBR(interest),
      fineAmount: parseBR(fine),
      discountAmount: parseBR(discount),
      accountId: accountId || null,
    })
    setSaving(false)
    if (res?.error) { toast.error('OCORREU UM ERRO', res.error); return }
    toast.success('TUDO CERTO!', 'Baixa registrada com sucesso.')
    onDone()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-surface-border flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">Dar baixa</h2>
            <p className="text-sm text-gray-500 mt-0.5">{entry.description} · {formatCurrency(entry.amount)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Valor pago *</label>
              <input
                type="number" step="0.01" value={paidAmount}
                onChange={e => setPaidAmount(e.target.value)}
                className="input mt-1"
              />
            </div>
            <div>
              <label className="label">Data</label>
              <input type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} className="input mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Juros</label>
              <input type="number" step="0.01" min="0" value={interest} onChange={e => setInterest(e.target.value)} className="input mt-1" />
            </div>
            <div>
              <label className="label">Multa</label>
              <input type="number" step="0.01" min="0" value={fine} onChange={e => setFine(e.target.value)} className="input mt-1" />
            </div>
            <div>
              <label className="label">Desconto</label>
              <input type="number" step="0.01" min="0" value={discount} onChange={e => setDiscount(e.target.value)} className="input mt-1" />
            </div>
          </div>
          <div>
            <label className="label">Conta bancária</label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)} className="select mt-1">
              <option value="">Sem conta atribuída</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {!accountId && (
              <p className="text-[11px] text-amber-600 mt-1">
                Sem conta atribuída, este lançamento não entra na conferência de saldo com o banco.
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="btn-secondary flex-1">Fechar</button>
          <button onClick={handleSubmit} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Registrar baixa
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: Detalhe do lançamento ──────────────────────────────────────────────

function EntryDetailModal({ entry: initialEntry, accounts, onClose, onEdit, onReload }: {
  entry: any; accounts: any[]; onClose: () => void; onEdit: () => void; onReload: () => void
}) {
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [entry, setEntry] = useState(initialEntry)
  const [showDarBaixa, setShowDarBaixa] = useState(false)
  const [reverting, setReverting] = useState(false)
  const today = todayISO()
  const status = getEntryStatus(entry, today)
  const isPayable = entry.type === 'payable'
  const account = accounts.find(a => a.id === entry.account_id)

  async function handleEstornar() {
    const ok = await confirm('Estornar este pagamento e marcar como pendente?', 'Estornar')
    if (!ok) return
    setReverting(true)
    const res = await setFinancePaid(entry.id, false)
    setReverting(false)
    if (res?.error) { toast.error('OCORREU UM ERRO', res.error); return }
    toast.success('TUDO CERTO!', 'Pagamento estornado.')
    onReload()
    onClose()
  }

  async function handleDelete() {
    const isGroup = !!entry.group_id
    const ok = await confirm(
      isGroup ? 'Excluir todas as parcelas deste lançamento?' : 'Excluir este lançamento?',
      'Sim, excluir'
    )
    if (!ok) return
    const res = await deleteFinanceEntry(entry.id, isGroup ? entry.group_id : null)
    if (res?.error) { toast.error('OCORREU UM ERRO', res.error); return }
    toast.success('TUDO CERTO!', 'Lançamento excluído.')
    onReload()
    onClose()
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className={cn(
                'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border',
                isPayable ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              )}>
                {isPayable ? 'A PAGAR' : 'A RECEBER'}
              </span>
              <StatusBadge status={status} />
            </div>
            <div className="flex items-center gap-1">
              <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-brand-600 rounded-lg hover:bg-surface-secondary"><Pencil className="w-4 h-4" /></button>
              <button onClick={handleDelete} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
              <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-surface-secondary"><X className="w-4 h-4" /></button>
            </div>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mt-3">{entry.description}</h2>
          <p className="text-3xl font-black text-gray-900 mt-1">
            {formatCurrency(entry.amount)}
          </p>
          {entry.installment_number && (
            <p className="text-xs text-gray-400 mt-1">
              Parcela {entry.installment_number} de {entry.installments_total}
            </p>
          )}
        </div>

        {/* Details grid */}
        <div className="px-6 pb-4">
          <div className="rounded-xl border border-surface-border divide-y divide-surface-border overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-surface-border">
              <div className="px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Vencimento</p>
                <p className={cn('text-sm font-semibold', status === 'overdue' ? 'text-red-600' : 'text-gray-800')}>
                  {fmtDateLong(entry.due_date)}
                </p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">{isPayable ? 'Fornecedor' : 'Cliente'}</p>
                <p className="text-sm font-semibold text-gray-800">{entry.counterparty || '—'}</p>
              </div>
            </div>
            {entry.category && (
              <div className="px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Categoria</p>
                <p className="text-sm text-gray-700">{entry.category}</p>
              </div>
            )}
            <div className="grid grid-cols-2 divide-x divide-surface-border">
              <div className="px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Origem</p>
                <OrigemBadge entry={entry} />
              </div>
              {entry.numero_duplicata && (
                <div className="px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Duplicata</p>
                  <p className="text-sm text-gray-700">#{entry.numero_duplicata}</p>
                </div>
              )}
            </div>
            {entry.status === 'paid' && (
              <div className="grid grid-cols-2 divide-x divide-surface-border bg-emerald-50/30">
                <div className="px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Pago em</p>
                  <p className="text-sm font-semibold text-emerald-700">{fmtDateLong(entry.paid_at)}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Valor pago</p>
                  <p className="text-sm font-semibold text-emerald-700">
                    {formatCurrency(entry.paid_amount ?? entry.amount)}
                    {account && <span className="text-xs text-emerald-600 ml-1">· {account.name}</span>}
                  </p>
                </div>
              </div>
            )}
            {entry.notes && (
              <div className="px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Observações</p>
                <p className="text-sm text-gray-600 whitespace-pre-line">{entry.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-6">
          {entry.status === 'pending' ? (
            <button
              onClick={() => setShowDarBaixa(true)}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" /> Dar Baixa
            </button>
          ) : (
            <button
              onClick={handleEstornar}
              disabled={reverting}
              className="btn-secondary flex-1 flex items-center justify-center gap-2"
            >
              {reverting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Estornar
            </button>
          )}
        </div>
      </div>
    </div>
    {showDarBaixa && (
      <DarBaixaModal
        entry={entry}
        accounts={accounts}
        onClose={() => setShowDarBaixa(false)}
        onDone={() => { setShowDarBaixa(false); onReload(); onClose() }}
      />
    )}
    {ConfirmDialog}
    </>
  )
}

// ── Combobox com criação inline ────────────────────────────────────────────────

function ComboboxField({ label, value, onChange, options, onCreateNew, placeholder }: {
  label: string; value: string; onChange: (v: string) => void
  options: { id: string; name: string; sub?: string }[]
  onCreateNew: (name: string) => Promise<{ id: string; name: string } | null>
  placeholder?: string
}) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value) }, [value])
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()))
  const exactMatch = options.find(o => o.name.toLowerCase() === query.toLowerCase())
  const showCreate = query.trim() && !exactMatch

  async function handleCreate() {
    setCreating(true)
    const result = await onCreateNew(query.trim())
    setCreating(false)
    if (result) { onChange(result.name); setQuery(result.name); setOpen(false) }
  }

  return (
    <div ref={ref} className="relative">
      <label className="label">{label}</label>
      <input
        className="input mt-1" placeholder={placeholder ?? 'Buscar ou criar...'}
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(''); setOpen(true) }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-surface-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
          {filtered.length === 0 && !showCreate && <p className="px-3 py-2 text-xs text-gray-400">Nenhum resultado</p>}
          {filtered.map(o => (
            <button key={o.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-surface-secondary"
              onClick={() => { onChange(o.name); setQuery(o.name); setOpen(false) }}>
              <span className="font-medium">{o.name}</span>
              {o.sub && <span className="text-xs text-gray-400 ml-2">{o.sub}</span>}
            </button>
          ))}
          {showCreate && (
            <button type="button" onClick={handleCreate} disabled={creating}
              className="w-full text-left px-3 py-2 text-sm text-brand-600 hover:bg-brand-50 font-medium flex items-center gap-1.5 border-t border-surface-border">
              {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Criar "{query.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Modal: Formulário (Criar / Editar) ────────────────────────────────────────

function FinanceForm({ entry, suppliers, categories, onClose, onSaved, onNewSupplier, onNewCategory }: {
  entry?: any; suppliers: any[]; categories: any[]
  onClose: () => void; onSaved: () => void
  onNewSupplier: (s: any) => void; onNewCategory: (c: any) => void
}) {
  const toast = useToast()
  const isEdit = !!entry
  const [saving, setSaving] = useState(false)
  const [type, setType] = useState<'payable' | 'receivable'>(entry?.type ?? 'payable')
  const [description, setDescription] = useState(entry?.description ?? '')
  const [counterparty, setCounterparty] = useState(entry?.counterparty ?? '')
  const [category, setCategory] = useState(entry?.category ?? '')
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '')
  const [dueDate, setDueDate] = useState(entry?.due_date ?? todayISO())
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [recurrence, setRecurrence] = useState<null | 'recurring' | 'installment'>(null)
  const [installments, setInstallments] = useState('3')
  const [intervalDays, setIntervalDays] = useState('30')
  const [splitAmount, setSplitAmount] = useState(true)
  const [recurringLimit, setRecurringLimit] = useState<'none' | 'date'>('none')
  const [recurringEndDate, setRecurringEndDate] = useState('')
  const [error, setError] = useState('')

  const n = recurrence === 'installment' ? Math.max(1, parseInt(installments) || 1) : 1
  const amt = parseFloat(amount) || 0
  const perParcel = splitAmount ? amt / n : amt

  const projectedInstallments = useMemo(() => {
    if (recurrence !== 'installment' || !amt || n < 2) return []
    const base = new Date(dueDate + 'T00:00:00')
    const interval = parseInt(intervalDays) || 30
    return Array.from({ length: n }).map((_, i) => {
      const d = new Date(base); d.setDate(base.getDate() + i * interval)
      return { date: isoDate(d), value: splitAmount ? amt / n : amt }
    })
  }, [recurrence, amt, n, dueDate, intervalDays, splitAmount])

  const projectedRecurring = useMemo(() => {
    if (recurrence !== 'recurring' || !amt || !dueDate) return []
    const items: string[] = []
    const base = new Date(dueDate + 'T00:00:00')
    const endDate = recurringLimit === 'date' && recurringEndDate ? new Date(recurringEndDate + 'T00:00:00') : null
    let current = new Date(base)
    for (let i = 0; i < 24; i++) {
      if (endDate && current > endDate) break
      items.push(isoDate(current))
      current = new Date(current); current.setMonth(current.getMonth() + 1)
    }
    return items
  }, [recurrence, amt, dueDate, recurringLimit, recurringEndDate])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const a = parseFloat(amount)
    if (!description.trim()) { setError('Informe a descrição'); return }
    if (!a || a <= 0) { setError('Informe o valor'); return }
    setError(''); setSaving(true)
    let res
    if (isEdit) {
      res = await updateFinanceEntry(entry.id, {
        description: description.trim(), type,
        category: category || null, counterparty: counterparty || null,
        amount: a, due_date: dueDate, notes: notes || null,
      })
    } else {
      res = await createFinanceEntry({
        description: description.trim(), type,
        category: category || null, counterparty: counterparty || null,
        amount: a, due_date: dueDate, notes: notes || null,
        installments: recurrence === 'installment' ? n : recurrence === 'recurring' ? (projectedRecurring.length || 12) : 1,
        interval_days: parseInt(intervalDays) || 30,
        split_amount: splitAmount,
      })
    }
    setSaving(false)
    if (res?.error) { setError(res.error); toast.error('OCORREU UM ERRO', res.error); return }
    toast.success('TUDO CERTO!', isEdit ? 'Lançamento atualizado.' : 'Lançamento criado.')
    onSaved()
  }

  async function handleNewSupplier(name: string) {
    const res = await createFinanceSupplier(name)
    if (res?.error || !res?.data) return null
    onNewSupplier(res.data)
    return res.data as { id: string; name: string }
  }

  async function handleNewCategory(name: string) {
    const res = await createFinanceCategory(name)
    if (res?.error || !res?.data) return null
    onNewCategory(res.data)
    return res.data as { id: string; name: string }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-surface-border px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-base font-semibold text-gray-900">{isEdit ? 'Editar lançamento' : 'Novo lançamento'}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-surface-secondary"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

          <div className="flex gap-2">
            {([['payable','A pagar'],['receivable','A receber']] as const).map(([v,l]) => (
              <button key={v} type="button" onClick={() => setType(v)}
                className={cn('flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors', type === v ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-surface-border hover:border-gray-300')}>
                {l}
              </button>
            ))}
          </div>

          <div>
            <label className="label">Descrição *</label>
            <input value={description} onChange={e => setDescription(e.target.value)} className="input mt-1" placeholder="Ex: Boleto fornecedor X" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ComboboxField
              label={type === 'payable' ? 'Fornecedor' : 'Cliente'} value={counterparty}
              onChange={setCounterparty}
              options={suppliers.map(s => ({ id: s.id, name: s.name, sub: s.supply_area }))}
              onCreateNew={handleNewSupplier}
            />
            <ComboboxField
              label="Categoria" value={category} onChange={setCategory}
              options={categories.map(c => ({ id: c.id, name: c.name }))}
              onCreateNew={handleNewCategory}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Valor (R$) *</label>
              <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} className="input mt-1" placeholder="0,00" />
            </div>
            <div>
              <label className="label">{recurrence === 'installment' ? '1º vencimento' : 'Vencimento'} *</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input mt-1" />
            </div>
          </div>

          <div>
            <label className="label">Observações</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className="input mt-1 resize-none" rows={2} placeholder="Opcional..." />
          </div>

          {/* Recorrência / Parcelamento */}
          {!isEdit && (
            <div className="rounded-xl border border-surface-border p-4 space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Repetição</p>
              <div className="flex gap-2">
                {([['recurring','Recorrente'],['installment','Parcelado']] as const).map(([v,l]) => (
                  <button key={v} type="button"
                    onClick={() => setRecurrence(prev => prev === v ? null : v)}
                    className={cn('flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all',
                      recurrence === v ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white text-gray-500 border-surface-border hover:border-gray-300')}>
                    {v === 'recurring' ? <RefreshCw className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
                    {l}
                  </button>
                ))}
              </div>

              {recurrence === 'recurring' && (
                <div className="space-y-3">
                  <div>
                    <label className="label">Limite</label>
                    <div className="flex gap-2 mt-1">
                      {([['none','Sem data limite'],['date','Até uma data']] as const).map(([v,l]) => (
                        <button key={v} type="button" onClick={() => setRecurringLimit(v)}
                          className={cn('flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border',
                            recurringLimit === v ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-surface-border text-gray-500')}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  {recurringLimit === 'date' && (
                    <div>
                      <label className="label">Data final</label>
                      <input type="date" value={recurringEndDate} onChange={e => setRecurringEndDate(e.target.value)} className="input mt-1" />
                    </div>
                  )}
                  {projectedRecurring.length > 0 && (
                    <div className="bg-surface-secondary rounded-lg p-3">
                      <p className="text-xs font-medium text-gray-600 mb-2">{projectedRecurring.length} ocorrência(s) projetada(s)</p>
                      <div className="flex flex-wrap gap-1">
                        {projectedRecurring.slice(0, 6).map((d, i) => (
                          <span key={i} className="text-[10px] bg-white border border-surface-border rounded px-1.5 py-0.5 text-gray-600">
                            {parseISO(d).toLocaleDateString('pt-BR')}
                          </span>
                        ))}
                        {projectedRecurring.length > 6 && <span className="text-[10px] text-gray-400">+{projectedRecurring.length - 6} mais</span>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {recurrence === 'installment' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Nº de parcelas</label>
                      <input type="number" min="2" value={installments} onChange={e => setInstallments(e.target.value)} className="input mt-1" />
                    </div>
                    <div>
                      <label className="label">Intervalo (dias)</label>
                      <input type="number" min="1" value={intervalDays} onChange={e => setIntervalDays(e.target.value)} className="input mt-1" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {([['true','Dividir o valor'],['false','Valor por parcela']] as const).map(([v,l]) => (
                      <button key={v} type="button" onClick={() => setSplitAmount(v === 'true')}
                        className={cn('flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border',
                          (splitAmount === (v === 'true')) ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-surface-border text-gray-500')}>
                        {l}
                      </button>
                    ))}
                  </div>
                  {projectedInstallments.length > 0 && (
                    <div className="bg-surface-secondary rounded-lg p-3 space-y-1">
                      <p className="text-xs font-medium text-gray-600 mb-2">
                        Parcelas · Total: <strong>{formatCurrency(splitAmount ? amt : amt * n)}</strong>
                      </p>
                      {projectedInstallments.map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">{i+1}/{n} — {parseISO(p.date).toLocaleDateString('pt-BR')}</span>
                          <span className="font-medium text-gray-700">{formatCurrency(p.value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Componente de conta bancária ────────────────────────────────────────────────

function AccountCard({ account, onSave }: { account: any; onSave: (id: string, val: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState(String(account.balance))
  const [saving, setSaving] = useState(false)

  async function save() {
    const val = parseFloat(input.replace(',', '.'))
    if (isNaN(val)) return
    setSaving(true)
    await onSave(account.id, val)
    setSaving(false)
    setEditing(false)
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-secondary p-3 flex flex-col gap-1">
      <p className="text-xs font-semibold text-gray-500">{account.name}</p>
      {editing ? (
        <div className="flex items-center gap-1 mt-1">
          <input
            type="number" step="0.01" value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
            className="input text-sm py-1 px-2 flex-1 min-w-0" autoFocus
          />
          <button onClick={save} disabled={saving} className="p-1 text-emerald-600 hover:text-emerald-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          </button>
          <button onClick={() => setEditing(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <button onClick={() => { setInput(String(account.balance)); setEditing(true) }}
          className="text-left group flex items-center justify-between mt-1">
          <span className={cn('text-base font-bold', Number(account.balance) < 0 ? 'text-red-600' : 'text-gray-800')}>
            {formatCurrency(Number(account.balance))}
          </span>
          <Pencil className="w-3 h-3 text-gray-300 group-hover:text-brand-500 transition-colors" />
        </button>
      )}
    </div>
  )
}

function NewAccountCard({ onCreate }: { onCreate: (name: string, balance: number) => Promise<{ error?: string } | undefined> }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [balance, setBalance] = useState('0')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim()) { setError('Informe o nome'); return }
    setSaving(true); setError('')
    const res = await onCreate(name.trim(), parseFloat(balance.replace(',', '.')) || 0)
    setSaving(false)
    if (res?.error) { setError(res.error); return }
    setName(''); setBalance('0'); setAdding(false)
  }

  if (!adding) {
    return (
      <button onClick={() => setAdding(true)}
        className="rounded-xl border border-dashed border-surface-border bg-surface-secondary/60 p-3 flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-brand-600 hover:border-brand-300 transition-colors min-h-[76px]">
        <Plus className="w-5 h-5" />
        <span className="text-xs font-semibold">Nova conta</span>
      </button>
    )
  }

  return (
    <div className="rounded-xl shadow-card border border-brand-200 bg-white p-3 flex flex-col gap-1.5">
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome da conta"
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setAdding(false) }}
        className="input text-sm py-1 px-2" autoFocus />
      <input type="number" step="0.01" value={balance} onChange={e => setBalance(e.target.value)}
        placeholder="Saldo inicial"
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setAdding(false) }}
        className="input text-sm py-1 px-2" />
      {error && <p className="text-[10px] text-red-600">{error}</p>}
      <div className="flex items-center gap-1">
        <button onClick={save} disabled={saving} className="btn-primary text-xs py-1 px-2 flex-1 flex items-center justify-center gap-1">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Salvar
        </button>
        <button onClick={() => { setAdding(false); setError('') }} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────────────

export function FinancePage({ initialEntries, suppliers: initialSuppliers, categories: initialCategories, accounts: initialAccounts }: {
  initialEntries: any[]; suppliers: any[]; categories: any[]; accounts: any[]
}) {
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()

  const [entries, setEntries] = useState<any[]>(initialEntries)
  const [suppliers, setSuppliers] = useState<any[]>(initialSuppliers)
  const [categories, setCategories] = useState<any[]>(initialCategories)
  const [accounts, setAccounts] = useState<any[]>(initialAccounts)

  // Navegação e filtros
  const now = new Date()
  const [tab, setTab] = useState<'payable' | 'receivable'>('payable')
  const [statusFilter, setStatusFilter] = useState<'pending' | 'overdue' | 'paid' | 'all'>('pending')
  const [filterMonth, setFilterMonth] = useState(now.getMonth())
  const [filterYear, setFilterYear] = useState(now.getFullYear())
  const [search, setSearch] = useState('')
  const [showAccounts, setShowAccounts] = useState(false)

  // Modals
  const [selected, setSelected] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)

  const today = todayISO()

  async function reload() {
    const data = await getFinanceEntries()
    setEntries(data as any[])
  }

  // KPIs (global, sem filtro de mês)
  const kpi = useMemo(() => {
    const byType = (type: string) => entries.filter(e => e.type === type)
    const payables = byType('payable')
    const receivables = byType('receivable')

    const monthStart = isoDate(new Date(filterYear, filterMonth, 1))
    const monthEnd = isoDate(new Date(filterYear, filterMonth + 1, 0))

    const vencer = payables.filter(e => e.status === 'pending' && e.due_date >= today)
    const vencido = payables.filter(e => e.status === 'pending' && e.due_date < today)
    const pagoMes = entries.filter(e => e.status === 'paid' && e.paid_at && e.paid_at >= monthStart && e.paid_at <= monthEnd)
    const aReceberMes = receivables.filter(e => e.status === 'pending' && e.due_date >= monthStart && e.due_date <= monthEnd)

    return {
      vencer: { value: vencer.reduce((s, e) => s + Number(e.amount), 0), count: vencer.length },
      vencido: { value: vencido.reduce((s, e) => s + Number(e.amount), 0), count: vencido.length },
      pagoMes: { value: pagoMes.reduce((s, e) => s + Number(e.paid_amount ?? e.amount), 0), count: pagoMes.length },
      aReceberMes: { value: aReceberMes.reduce((s, e) => s + Number(e.amount), 0), count: aReceberMes.length },
    }
  }, [entries, today, filterMonth, filterYear])

  // Entradas filtradas
  const filtered = useMemo(() => {
    const monthStart = isoDate(new Date(filterYear, filterMonth, 1))
    const monthEnd = isoDate(new Date(filterYear, filterMonth + 1, 0))

    return entries.filter(e => {
      if (e.type !== tab) return false
      if (search) {
        const q = search.toLowerCase()
        if (!e.description?.toLowerCase().includes(q) && !e.counterparty?.toLowerCase().includes(q)) return false
      }
      const status = getEntryStatus(e, today)
      if (statusFilter === 'pending') return status === 'pending'
      if (statusFilter === 'overdue') return status === 'overdue'
      if (statusFilter === 'paid') return status === 'paid'
      // 'all' → filtra pelo mês
      return e.due_date >= monthStart && e.due_date <= monthEnd
    })
  }, [entries, tab, statusFilter, filterMonth, filterYear, search, today])

  function prevMonth() {
    if (filterMonth === 0) { setFilterMonth(11); setFilterYear(y => y - 1) }
    else setFilterMonth(m => m - 1)
  }
  function nextMonth() {
    if (filterMonth === 11) { setFilterMonth(0); setFilterYear(y => y + 1) }
    else setFilterMonth(m => m + 1)
  }

  const totalSelecionado = filtered.reduce((s, e) => s + Number(e.amount), 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
          <p className="text-sm text-gray-500 mt-0.5">Contas a pagar e a receber</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Novo lançamento
        </button>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile icon={Clock} label="A vencer" value={kpi.vencer.value} count={kpi.vencer.count} color="gray" />
        <KpiTile icon={AlertTriangle} label="Vencido" value={kpi.vencido.value} count={kpi.vencido.count} color="red" alert />
        <KpiTile icon={CheckCircle2} label={`Pago em ${MONTHS_PT[filterMonth]}`} value={kpi.pagoMes.value} count={kpi.pagoMes.count} color="green" />
        <KpiTile icon={ArrowDownCircle} label={`A receber em ${MONTHS_PT[filterMonth]}`} value={kpi.aReceberMes.value} count={kpi.aReceberMes.count} color="gray" />
      </div>

      {/* Contas bancárias */}
      <div className="rounded-card shadow-card border border-surface-border bg-gradient-card p-4">
        <button
          onClick={() => setShowAccounts(v => !v)}
          className="flex items-center justify-between w-full"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Landmark className="w-4 h-4 text-brand-500" />
            Saldo nas contas
            <span className="text-sm font-bold text-gray-600 ml-2">
              {formatCurrency(accounts.reduce((s, a) => s + Number(a.balance), 0))}
            </span>
          </span>
          <ChevronRight className={cn('w-4 h-4 text-gray-400 transition-transform', showAccounts && 'rotate-90')} />
        </button>
        {showAccounts && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
            {accounts.map(a => (
              <AccountCard key={a.id} account={a} onSave={async (id, val) => {
                const res = await updateFinanceAccount(id, val)
                if (!res?.error) setAccounts(prev => prev.map(x => x.id === id ? { ...x, balance: val } : x))
              }} />
            ))}
            <NewAccountCard onCreate={async (name, balance) => {
              const res = await createFinanceAccount(name, balance)
              if (!res?.error && res?.data) setAccounts(prev => [...prev, res.data])
              return res
            }} />
          </div>
        )}
      </div>

      {/* Tabs: A Pagar / A Receber */}
      <div className="flex gap-4 border-b border-surface-border">
        {([['payable','A Pagar'],['receivable','A Receber']] as const).map(([v,l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={cn('pb-3 px-1 text-sm font-semibold border-b-2 transition-colors',
              tab === v ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700')}>
            {l}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {([
            ['pending','Pendentes'],
            ['overdue','Vencidos'],
            ['paid','Pagos'],
            ['all','Todos'],
          ] as const).map(([v,l]) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                statusFilter === v
                  ? v === 'overdue' ? 'bg-red-600 text-white border-red-600'
                    : v === 'paid' ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-500 border-surface-border hover:border-gray-300')}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {statusFilter === 'all' && (
            <div className="flex items-center gap-1 bg-white border border-surface-border rounded-lg px-2 py-1.5">
              <button onClick={prevMonth} className="text-gray-400 hover:text-gray-600"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-xs font-medium text-gray-700 w-32 text-center">{MONTHS_PT[filterMonth]} {filterYear}</span>
              <button onClick={nextMonth} className="text-gray-400 hover:text-gray-600"><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="input pl-8 py-1.5 text-sm w-48"
            />
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-border bg-surface text-left">
              <th className="px-4 py-3 text-xs font-semibold text-gray-500">{tab === 'payable' ? 'Fornecedor' : 'Cliente'}</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500">Descrição</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 hidden sm:table-cell">Vencimento</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 text-right">Valor</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500">Status</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 hidden lg:table-cell">Origem</th>
              <th className="px-4 py-3 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                  Nenhum lançamento{search ? ` para "${search}"` : ''}
                </td>
              </tr>
            )}
            {filtered.map(e => {
              const status = getEntryStatus(e, today)
              return (
                <tr
                  key={e.id}
                  onClick={() => setSelected(e)}
                  className="border-b border-surface-border last:border-0 hover:bg-surface cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-700 font-medium truncate max-w-[140px]">{e.counterparty || '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className={cn('text-sm font-medium truncate max-w-[200px]', e.status === 'paid' ? 'text-gray-400 line-through' : 'text-gray-800')}>
                      {e.description}
                    </p>
                    {e.installment_number && (
                      <p className="text-[11px] text-gray-400">{e.installment_number}/{e.installments_total}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={cn('text-sm', status === 'overdue' ? 'text-red-600 font-semibold' : 'text-gray-600')}>
                      {fmtDate(e.due_date)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn('text-sm font-semibold tabular-nums',
                      tab === 'receivable' ? 'text-emerald-700' : status === 'overdue' ? 'text-red-700' : 'text-gray-800')}>
                      {formatCurrency(Number(e.amount))}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={status} />
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <OrigemBadge entry={e} />
                  </td>
                  <td className="px-4 py-3" onClick={ev => ev.stopPropagation()}>
                    <RowMenu
                      status={e.status}
                      onDarBaixa={() => setSelected(e)}
                      onEdit={() => { setEditing(e) }}
                      onDelete={async () => {
                        const isGroup = !!e.group_id
                        const ok = await confirm(isGroup ? 'Excluir todas as parcelas?' : 'Excluir este lançamento?', 'Sim, excluir')
                        if (!ok) return
                        const res = await deleteFinanceEntry(e.id, isGroup ? e.group_id : null)
                        if (res?.error) { toast.error('OCORREU UM ERRO', res.error); return }
                        reload()
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-surface-border flex items-center justify-between">
            <p className="text-xs text-gray-400">{filtered.length} lançamento{filtered.length !== 1 ? 's' : ''}</p>
            <p className="text-xs font-semibold text-gray-700">
              Total: {formatCurrency(totalSelecionado)}
            </p>
          </div>
        )}
      </div>

      {/* Modals */}
      {selected && !editing && (
        <EntryDetailModal
          entry={selected}
          accounts={accounts}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing(selected); setSelected(null) }}
          onReload={async () => { await reload(); setSelected(null) }}
        />
      )}
      {(showForm || editing) && (
        <FinanceForm
          entry={editing}
          suppliers={suppliers}
          categories={categories}
          onClose={() => { setShowForm(false); setEditing(null) }}
          onSaved={() => { setShowForm(false); setEditing(null); reload() }}
          onNewSupplier={s => setSuppliers(p => [...p, s])}
          onNewCategory={c => setCategories(p => [...p, c])}
        />
      )}
      {ConfirmDialog}
    </div>
  )
}

// ── RowMenu ────────────────────────────────────────────────────────────────────

function RowMenu({ status, onDarBaixa, onEdit, onDelete }: {
  status: string; onDarBaixa: () => void; onEdit: () => void; onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)} className="p-1 text-gray-300 hover:text-gray-600 rounded">
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-surface-border rounded-xl shadow-lg py-1 z-20 min-w-[140px]">
          {status === 'pending' && (
            <button onClick={() => { setOpen(false); onDarBaixa() }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-surface-secondary flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-emerald-500" /> Dar baixa
            </button>
          )}
          <button onClick={() => { setOpen(false); onEdit() }}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-surface-secondary flex items-center gap-2">
            <Pencil className="w-3.5 h-3.5 text-gray-400" /> Editar
          </button>
          <button onClick={() => { setOpen(false); onDelete() }}
            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
            <Trash2 className="w-3.5 h-3.5" /> Excluir
          </button>
        </div>
      )}
    </div>
  )
}
