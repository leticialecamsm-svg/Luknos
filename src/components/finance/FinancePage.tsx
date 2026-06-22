'use client'

import { useState, useMemo } from 'react'
import { createFinanceEntry, setFinancePaid, deleteFinanceEntry, getFinanceEntries } from '@/lib/actions'
import { formatCurrency, cn } from '@/lib/utils'
import { Plus, X, Check, Trash2, Loader2, AlertTriangle, ArrowDownCircle, ArrowUpCircle, CalendarDays } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/useConfirm'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function todayISO() {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function parseISO(s: string) { return new Date(s + 'T00:00:00') }

export function FinancePage({ initialEntries }: { initialEntries: any[] }) {
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [entries, setEntries] = useState<any[]>(initialEntries)
  const [showForm, setShowForm] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'paid'>('pending')
  const [filterType, setFilterType] = useState<'all' | 'payable' | 'receivable'>('payable')

  async function reload() {
    const data = await getFinanceEntries()
    setEntries(data as any[])
  }

  const today = todayISO()
  const now = parseISO(today)

  // janelas de tempo
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay())
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

  const payablesPending = entries.filter(e => e.type === 'payable' && e.status === 'pending')

  const kpi = useMemo(() => {
    const sumIn = (from: string, to: string) =>
      payablesPending.filter(e => e.due_date >= from && e.due_date <= to).reduce((s, e) => s + Number(e.amount), 0)
    return {
      today: payablesPending.filter(e => e.due_date === today).reduce((s, e) => s + Number(e.amount), 0),
      week: sumIn(iso(weekStart), iso(weekEnd)),
      month: sumIn(iso(monthStart), iso(monthEnd)),
      overdue: payablesPending.filter(e => e.due_date < today).reduce((s, e) => s + Number(e.amount), 0),
      total: payablesPending.reduce((s, e) => s + Number(e.amount), 0),
    }
  }, [entries])

  // breakdown por dia da semana atual
  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i)
    const dISO = iso(d)
    const total = payablesPending.filter(e => e.due_date === dISO).reduce((s, e) => s + Number(e.amount), 0)
    return { date: d, iso: dISO, total, isToday: dISO === today }
  })
  const maxDay = Math.max(1, ...weekDays.map(d => d.total))

  const filtered = entries.filter(e =>
    (filterType === 'all' || e.type === filterType) &&
    (filterStatus === 'all' || e.status === filterStatus)
  )

  async function togglePaid(e: any) {
    const next = e.status !== 'paid'
    setEntries(prev => prev.map(x => x.id === e.id ? { ...x, status: next ? 'paid' : 'pending', paid_at: next ? today : null } : x))
    const res = await setFinancePaid(e.id, next)
    if (res?.error) { toast.error('OCORREU UM ERRO', res.error); reload() }
  }

  async function remove(e: any) {
    const isGroup = !!e.group_id
    const ok = await confirm(isGroup ? 'Excluir todas as parcelas deste lançamento?' : 'Excluir este lançamento?', 'Sim, excluir')
    if (!ok) return
    const res = await deleteFinanceEntry(e.id, isGroup ? e.group_id : null)
    if (res?.error) { toast.error('OCORREU UM ERRO', res.error); return }
    reload()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
          <p className="text-sm text-gray-500 mt-0.5">Contas a pagar e a receber</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary"><Plus className="w-4 h-4" /> Novo lançamento</button>
      </div>

      {/* KPIs (a pagar) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Vence hoje" value={kpi.today} color="blue" />
        <KpiCard label="Esta semana" value={kpi.week} color="indigo" />
        <KpiCard label="Este mês" value={kpi.month} color="violet" />
        <KpiCard label="Em atraso" value={kpi.overdue} color="red" alert={kpi.overdue > 0} />
        <KpiCard label="Total a pagar" value={kpi.total} color="gray" />
      </div>

      {/* Semana atual */}
      <div className="rounded-xl border border-surface-border bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <CalendarDays className="w-4 h-4 text-brand-500" /> A pagar nesta semana
        </h3>
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((d, i) => (
            <div key={d.iso} className="flex flex-col items-center gap-1">
              <div className="w-full h-24 flex items-end">
                <div className="w-full rounded-t-md transition-all"
                  style={{ height: `${d.total > 0 ? Math.max(6, (d.total / maxDay) * 100) : 2}%`,
                           backgroundColor: d.isToday ? '#185FA5' : '#CBD5E1' }} />
              </div>
              <p className={cn('text-[10px] font-semibold', d.isToday ? 'text-brand-600' : 'text-gray-400')}>{WEEKDAYS[i]} {d.date.getDate()}</p>
              <p className="text-[10px] text-gray-600">{d.total > 0 ? formatCurrency(d.total) : '—'}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {([['payable','A pagar'],['receivable','A receber'],['all','Tudo']] as const).map(([v,l]) => (
          <button key={v} onClick={() => setFilterType(v)}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border', filterType === v ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-500 border-surface-border')}>{l}</button>
        ))}
        <span className="w-px h-5 bg-gray-200 mx-1" />
        {([['pending','Pendentes'],['paid','Pagas'],['all','Todas']] as const).map(([v,l]) => (
          <button key={v} onClick={() => setFilterStatus(v)}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border', filterStatus === v ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-surface-border')}>{l}</button>
        ))}
      </div>

      {/* Lista */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-border bg-surface text-left">
              <th className="px-4 py-3 text-xs font-semibold text-gray-600 w-10"></th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Descrição</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Vencimento</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-right">Valor</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">Nenhum lançamento</td></tr>
            )}
            {filtered.map(e => {
              const overdue = e.status === 'pending' && e.due_date < today
              const isReceivable = e.type === 'receivable'
              return (
                <tr key={e.id} className="border-b border-surface-border last:border-0 hover:bg-surface">
                  <td className="px-4 py-3">
                    <button onClick={() => togglePaid(e)} title={e.status === 'paid' ? 'Marcar pendente' : 'Confirmar pagamento'}
                      className={cn('w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors',
                        e.status === 'paid' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 hover:border-emerald-400')}>
                      {e.status === 'paid' && <Check className="w-3.5 h-3.5" />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {isReceivable ? <ArrowDownCircle className="w-4 h-4 text-emerald-500 shrink-0" /> : <ArrowUpCircle className="w-4 h-4 text-red-400 shrink-0" />}
                      <div className="min-w-0">
                        <p className={cn('text-sm font-medium', e.status === 'paid' ? 'text-gray-400 line-through' : 'text-gray-800')}>
                          {e.description}
                          {e.installments_total ? <span className="text-xs text-gray-400 ml-1">({e.installment_number}/{e.installments_total})</span> : null}
                        </p>
                        {e.counterparty && <p className="text-xs text-gray-400">{e.counterparty}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('text-sm', overdue ? 'text-red-600 font-semibold' : 'text-gray-600')}>
                      {parseISO(e.due_date).toLocaleDateString('pt-BR')}
                      {overdue && <span className="inline-flex items-center gap-0.5 ml-1 text-[10px]"><AlertTriangle className="w-3 h-3" /> atraso</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn('text-sm font-semibold', isReceivable ? 'text-emerald-600' : 'text-gray-800')}>
                      {formatCurrency(Number(e.amount))}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(e)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showForm && <FinanceForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); reload() }} />}
      {ConfirmDialog}
    </div>
  )
}

function KpiCard({ label, value, color, alert }: { label: string; value: number; color: string; alert?: boolean }) {
  const colors: Record<string, string> = {
    blue: 'text-blue-700 border-blue-100 from-blue-50',
    indigo: 'text-indigo-700 border-indigo-100 from-indigo-50',
    violet: 'text-violet-700 border-violet-100 from-violet-50',
    red: 'text-red-700 border-red-100 from-red-50',
    gray: 'text-gray-700 border-gray-200 from-gray-50',
  }
  return (
    <div className={cn('rounded-xl border bg-gradient-to-br to-white p-4', colors[color])}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80 flex items-center gap-1">
        {alert && <AlertTriangle className="w-3 h-3" />} {label}
      </p>
      <p className="text-xl font-bold mt-1">{formatCurrency(value)}</p>
    </div>
  )
}

function FinanceForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [type, setType] = useState<'payable' | 'receivable'>('payable')
  const [description, setDescription] = useState('')
  const [counterparty, setCounterparty] = useState('')
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState(todayISO())
  const [installmentsOn, setInstallmentsOn] = useState(false)
  const [installments, setInstallments] = useState('3')
  const [intervalDays, setIntervalDays] = useState('30')
  const [splitAmount, setSplitAmount] = useState(true)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (!description.trim()) { setError('Informe a descrição'); return }
    if (!amt || amt <= 0) { setError('Informe o valor'); return }
    setError(''); setSaving(true)
    const res = await createFinanceEntry({
      description: description.trim(), type, category: category || null, counterparty: counterparty || null,
      amount: amt, due_date: dueDate,
      installments: installmentsOn ? parseInt(installments) || 1 : 1,
      interval_days: parseInt(intervalDays) || 30,
      split_amount: splitAmount,
    })
    setSaving(false)
    if (res?.error) { setError(res.error); toast.error('OCORREU UM ERRO', res.error); return }
    toast.success('TUDO CERTO!', 'Lançamento criado.')
    onSaved()
  }

  const n = installmentsOn ? Math.max(1, parseInt(installments) || 1) : 1
  const amt = parseFloat(amount) || 0
  const perParcel = splitAmount ? amt / n : amt

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-surface-border px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-base font-semibold text-gray-900">Novo lançamento</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

          <div className="flex gap-2">
            {([['payable','A pagar'],['receivable','A receber']] as const).map(([v,l]) => (
              <button key={v} type="button" onClick={() => setType(v)}
                className={cn('flex-1 px-3 py-2 rounded-lg text-sm font-medium border', type === v ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-surface-border')}>{l}</button>
            ))}
          </div>

          <div>
            <label className="label">Descrição *</label>
            <input value={description} onChange={e => setDescription(e.target.value)} className="input mt-1" placeholder="Ex: Boleto fornecedor X" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{type === 'payable' ? 'Fornecedor' : 'Cliente'}</label>
              <input value={counterparty} onChange={e => setCounterparty(e.target.value)} className="input mt-1" placeholder="Opcional" />
            </div>
            <div>
              <label className="label">Categoria</label>
              <input value={category} onChange={e => setCategory(e.target.value)} className="input mt-1" placeholder="Opcional" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Valor (R$) *</label>
              <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} className="input mt-1" placeholder="0,00" />
            </div>
            <div>
              <label className="label">{installmentsOn ? '1º vencimento' : 'Vencimento'} *</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input mt-1" />
            </div>
          </div>

          {/* Parcelamento */}
          <div className="rounded-lg border border-surface-border p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={installmentsOn} onChange={e => setInstallmentsOn(e.target.checked)} className="w-4 h-4" />
              <span className="text-sm font-medium text-gray-700">Parcelado / recorrente (ex: 30/60/90 dias)</span>
            </label>
            {installmentsOn && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Nº de parcelas</label>
                    <input type="number" min="1" value={installments} onChange={e => setInstallments(e.target.value)} className="input mt-1" />
                  </div>
                  <div>
                    <label className="label">Intervalo (dias)</label>
                    <input type="number" min="1" value={intervalDays} onChange={e => setIntervalDays(e.target.value)} className="input mt-1" />
                  </div>
                </div>
                <div className="flex gap-2">
                  {([['true','Dividir o valor'],['false','Valor por parcela']] as const).map(([v,l]) => (
                    <button key={v} type="button" onClick={() => setSplitAmount(v === 'true')}
                      className={cn('flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border', (splitAmount === (v === 'true')) ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-surface-border text-gray-500')}>{l}</button>
                  ))}
                </div>
                {amt > 0 && (
                  <p className="text-xs text-gray-500">
                    {n} parcela(s) de <strong>{formatCurrency(perParcel)}</strong>, a cada {intervalDays} dias.
                    Total: <strong>{formatCurrency(splitAmount ? amt : amt * n)}</strong>
                  </p>
                )}
              </>
            )}
          </div>

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
