'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { createFinanceEntry, updateFinanceEntry, setFinancePaid, deleteFinanceEntry, getFinanceEntries, createFinanceSupplier, createFinanceCategory } from '@/lib/actions'
import { formatCurrency, cn } from '@/lib/utils'
import { Plus, X, Check, Trash2, Loader2, AlertTriangle, ArrowDownCircle, ArrowUpCircle, CalendarDays, Pencil, ChevronLeft, ChevronRight, RefreshCw, Layers, Building2, Tag } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/useConfirm'
import Link from 'next/link'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function todayISO() {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function parseISO(s: string) { return new Date(s + 'T00:00:00') }
function isoDate(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

const PIE_COLORS = ['#185FA5','#CBA455','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#EC4899','#6B7280','#84CC16']

export function FinancePage({ initialEntries, suppliers: initialSuppliers, categories: initialCategories }: {
  initialEntries: any[]
  suppliers: any[]
  categories: any[]
}) {
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [entries, setEntries] = useState<any[]>(initialEntries)
  const [suppliers, setSuppliers] = useState<any[]>(initialSuppliers)
  const [categories, setCategories] = useState<any[]>(initialCategories)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'paid'>('pending')
  const [filterType, setFilterType] = useState<'all' | 'payable' | 'receivable'>('payable')
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())

  // Navegação de semana
  const [weekOffset, setWeekOffset] = useState(0)

  // Filtro de mês
  const now = new Date()
  const [filterMonth, setFilterMonth] = useState(now.getMonth())
  const [filterYear, setFilterYear] = useState(now.getFullYear())
  const [showCalendar, setShowCalendar] = useState(false)
  const [customRange, setCustomRange] = useState<{from:string;to:string}|null>(null)

  async function reload() {
    const data = await getFinanceEntries()
    setEntries(data as any[])
  }

  const today = todayISO()
  const baseNow = parseISO(today)

  // Semana com offset
  const weekStart = new Date(baseNow)
  weekStart.setDate(baseNow.getDate() - baseNow.getDay() + weekOffset * 7)
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6)

  // Mês selecionado
  const monthStart = new Date(filterYear, filterMonth, 1)
  const monthEnd = new Date(filterYear, filterMonth + 1, 0)

  const payablesPending = entries.filter(e => e.type === 'payable' && e.status === 'pending')

  const kpi = useMemo(() => {
    const active = payablesPending.filter(e => !excludedIds.has(e.id))
    const sumIn = (from: string, to: string) =>
      active.filter(e => e.due_date >= from && e.due_date <= to).reduce((s, e) => s + Number(e.amount), 0)
    return {
      today: active.filter(e => e.due_date === today).reduce((s, e) => s + Number(e.amount), 0),
      week: sumIn(isoDate(weekStart), isoDate(weekEnd)),
      month: sumIn(isoDate(monthStart), isoDate(monthEnd)),
      overdue: active.filter(e => e.due_date < today).reduce((s, e) => s + Number(e.amount), 0),
      total: active.reduce((s, e) => s + Number(e.amount), 0),
    }
  }, [entries, weekOffset, filterMonth, filterYear, excludedIds])

  // Dias da semana atual
  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i)
    const dISO = isoDate(d)
    const total = payablesPending.filter(e => e.due_date === dISO && !excludedIds.has(e.id)).reduce((s, e) => s + Number(e.amount), 0)
    return { date: d, iso: dISO, total, isToday: dISO === today }
  })
  const maxDay = Math.max(1, ...weekDays.map(d => d.total))

  // Gráfico pizza por categoria
  const pieData = useMemo(() => {
    const byCategory: Record<string, number> = {}
    payablesPending.filter(e => !excludedIds.has(e.id)).forEach(e => {
      const cat = e.category || 'Sem categoria'
      byCategory[cat] = (byCategory[cat] || 0) + Number(e.amount)
    })
    const total = Object.values(byCategory).reduce((s, v) => s + v, 0)
    return Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, pct: total > 0 ? value / total : 0, color: PIE_COLORS[i % PIE_COLORS.length] }))
  }, [entries, excludedIds])

  const filtered = useMemo(() => {
    let list = entries.filter(e =>
      (filterType === 'all' || e.type === filterType) &&
      (filterStatus === 'all' || e.status === filterStatus)
    )
    if (customRange) {
      list = list.filter(e => e.due_date >= customRange.from && e.due_date <= customRange.to)
    } else {
      const from = isoDate(monthStart)
      const to = isoDate(monthEnd)
      list = list.filter(e => e.due_date >= from && e.due_date <= to)
    }
    return list
  }, [entries, filterType, filterStatus, filterMonth, filterYear, customRange])

  function toggleExclude(id: string) {
    setExcludedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

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

  function prevMonth() {
    if (filterMonth === 0) { setFilterMonth(11); setFilterYear(y => y - 1) }
    else setFilterMonth(m => m - 1)
    setCustomRange(null)
  }
  function nextMonth() {
    if (filterMonth === 11) { setFilterMonth(0); setFilterYear(y => y + 1) }
    else setFilterMonth(m => m + 1)
    setCustomRange(null)
  }

  // SVG pizza
  function buildPieSlices() {
    if (pieData.length === 0) return null
    let cumAngle = -Math.PI / 2
    const cx = 80, cy = 80, r = 70
    return pieData.map((seg, i) => {
      const angle = seg.pct * 2 * Math.PI
      const x1 = cx + r * Math.cos(cumAngle)
      const y1 = cy + r * Math.sin(cumAngle)
      cumAngle += angle
      const x2 = cx + r * Math.cos(cumAngle)
      const y2 = cy + r * Math.sin(cumAngle)
      const large = angle > Math.PI ? 1 : 0
      return <path key={i} d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`} fill={seg.color} />
    })
  }

  const weekLabel = weekOffset === 0 ? 'Esta semana'
    : weekOffset === -1 ? 'Semana passada'
    : weekOffset === 1 ? 'Próxima semana'
    : `${weekStart.getDate()}/${weekStart.getMonth()+1} – ${weekEnd.getDate()}/${weekEnd.getMonth()+1}`

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
          <p className="text-sm text-gray-500 mt-0.5">Contas a pagar e a receber</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Filtro de mês */}
          <div className="relative">
            <div className="flex items-center gap-1 bg-white border border-surface-border rounded-lg px-3 py-2">
              <button onClick={prevMonth} className="text-gray-400 hover:text-gray-600"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => setShowCalendar(v => !v)} className="text-sm font-medium text-gray-700 min-w-[110px] text-center">
                {customRange ? `${parseISO(customRange.from).toLocaleDateString('pt-BR')} – ${parseISO(customRange.to).toLocaleDateString('pt-BR')}` : `${MONTHS_PT[filterMonth]} ${filterYear}`}
              </button>
              <button onClick={nextMonth} className="text-gray-400 hover:text-gray-600"><ChevronRight className="w-4 h-4" /></button>
            </div>
            {showCalendar && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-surface-border rounded-xl shadow-lg p-4 z-20 min-w-[280px]">
                <p className="text-xs font-semibold text-gray-500 mb-3">Selecionar período</p>
                <div className="space-y-2">
                  <div>
                    <label className="label text-[11px]">De</label>
                    <input type="date" className="input mt-0.5 text-sm" onChange={e => setCustomRange(prev => ({ from: e.target.value, to: prev?.to || e.target.value }))} />
                  </div>
                  <div>
                    <label className="label text-[11px]">Até</label>
                    <input type="date" className="input mt-0.5 text-sm" onChange={e => setCustomRange(prev => ({ from: prev?.from || e.target.value, to: e.target.value }))} />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setCustomRange(null); setShowCalendar(false) }} className="btn-secondary flex-1 text-xs">Limpar</button>
                    <button onClick={() => setShowCalendar(false)} className="btn-primary flex-1 text-xs">Aplicar</button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary"><Plus className="w-4 h-4" /> Novo lançamento</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="Vence hoje" value={kpi.today} color="blue" />
        <KpiCard label={weekLabel} value={kpi.week} color="indigo" />
        <KpiCard label={`${MONTHS_PT[filterMonth]}`} value={kpi.month} color="violet" />
        <KpiCard label="Em atraso" value={kpi.overdue} color="red" alert={kpi.overdue > 0} />
        <KpiCard label="Total a pagar" value={kpi.total} color="gray" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Semana */}
        <div className="lg:col-span-2 rounded-xl border border-surface-border bg-white p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-brand-500" /> A pagar — {weekLabel}
            </h3>
            <div className="flex items-center gap-1">
              <button onClick={() => setWeekOffset(o => o - 1)} className="p-1 text-gray-400 hover:text-gray-700 rounded"><ChevronLeft className="w-4 h-4" /></button>
              {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} className="text-[10px] text-brand-600 hover:underline">Hoje</button>}
              <button onClick={() => setWeekOffset(o => o + 1)} className="p-1 text-gray-400 hover:text-gray-700 rounded"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((d, i) => (
              <div key={d.iso} className="flex flex-col items-center gap-1">
                <div className="w-full h-20 flex items-end">
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

        {/* Pizza por categoria */}
        <div className="rounded-xl border border-surface-border bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Por categoria</h3>
          {pieData.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">Sem dados</p>
          ) : (
            <div className="flex flex-col gap-3">
              <svg viewBox="0 0 160 160" className="w-32 h-32 mx-auto">
                {buildPieSlices()}
              </svg>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {pieData.map((seg, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                    <span className="text-[11px] text-gray-600 truncate flex-1">{seg.name}</span>
                    <span className="text-[11px] font-medium text-gray-700">{Math.round(seg.pct * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Links rápidos submenus */}
      <div className="flex gap-2">
        <Link href="/finance/suppliers" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-border bg-white text-xs text-gray-500 hover:text-brand-600 hover:border-brand-200">
          <Building2 className="w-3.5 h-3.5" /> Fornecedores
        </Link>
        <Link href="/finance/categories" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-border bg-white text-xs text-gray-500 hover:text-brand-600 hover:border-brand-200">
          <Tag className="w-3.5 h-3.5" /> Categorias
        </Link>
        {excludedIds.size > 0 && (
          <button onClick={() => setExcludedIds(new Set())} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50 text-xs text-orange-700">
            <X className="w-3.5 h-3.5" /> {excludedIds.size} excluído(s) do total — restaurar
          </button>
        )}
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
              <th className="px-4 py-3 text-xs font-semibold text-gray-600 w-16 text-center" title="Excluir do total">Excluir</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">Nenhum lançamento</td></tr>
            )}
            {filtered.map(e => {
              const overdue = e.status === 'pending' && e.due_date < today
              const isReceivable = e.type === 'receivable'
              const excluded = excludedIds.has(e.id)
              return (
                <tr key={e.id} className={cn('border-b border-surface-border last:border-0 hover:bg-surface', excluded && 'opacity-50')}>
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
                        <div className="flex items-center gap-2">
                          {e.counterparty && <p className="text-xs text-gray-400">{e.counterparty}</p>}
                          {e.category && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{e.category}</span>}
                        </div>
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
                    <span className={cn('text-sm font-semibold', isReceivable ? 'text-emerald-600' : excluded ? 'text-gray-300 line-through' : 'text-gray-800')}>
                      {formatCurrency(Number(e.amount))}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleExclude(e.id)} title={excluded ? 'Incluir no total' : 'Excluir do total'}
                      className={cn('w-5 h-5 rounded border-2 mx-auto flex items-center justify-center transition-colors',
                        excluded ? 'bg-orange-400 border-orange-400 text-white' : 'border-gray-300 hover:border-orange-400')}>
                      {excluded && <X className="w-3 h-3" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditing(e)} className="text-gray-300 hover:text-brand-500"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => remove(e)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showForm && <FinanceForm suppliers={suppliers} categories={categories} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); reload() }} onNewSupplier={s => setSuppliers(p => [...p, s])} onNewCategory={c => setCategories(p => [...p, c])} />}
      {editing && <FinanceForm entry={editing} suppliers={suppliers} categories={categories} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} onNewSupplier={s => setSuppliers(p => [...p, s])} onNewCategory={c => setCategories(p => [...p, c])} />}
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

// Combobox com criação inline
function ComboboxField({ label, value, onChange, options, onCreateNew, placeholder }: {
  label: string
  value: string
  onChange: (v: string) => void
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
        className="input mt-1"
        placeholder={placeholder ?? 'Digite para buscar...'}
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(''); setOpen(true) }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-surface-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
          {filtered.length === 0 && !showCreate && (
            <p className="px-3 py-2 text-xs text-gray-400">Nenhum resultado</p>
          )}
          {filtered.map(o => (
            <button key={o.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
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

function FinanceForm({ entry, suppliers, categories, onClose, onSaved, onNewSupplier, onNewCategory }: {
  entry?: any
  suppliers: any[]
  categories: any[]
  onClose: () => void
  onSaved: () => void
  onNewSupplier: (s: any) => void
  onNewCategory: (c: any) => void
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
  const [recurrence, setRecurrence] = useState<null | 'recurring' | 'installment'>(null)
  // Parcelado
  const [installments, setInstallments] = useState('3')
  const [intervalDays, setIntervalDays] = useState('30')
  const [splitAmount, setSplitAmount] = useState(true)
  // Recorrente
  const [recurringInterval, setRecurringInterval] = useState<'monthly'>('monthly')
  const [recurringLimit, setRecurringLimit] = useState<'none' | 'date'>('none')
  const [recurringEndDate, setRecurringEndDate] = useState('')
  const [error, setError] = useState('')

  const n = recurrence === 'installment' ? Math.max(1, parseInt(installments) || 1) : 1
  const amt = parseFloat(amount) || 0
  const perParcel = splitAmount ? amt / n : amt

  // Parcelas projetadas
  const projectedInstallments = useMemo(() => {
    if (recurrence !== 'installment' || !amt || n < 2) return []
    const base = new Date(dueDate + 'T00:00:00')
    const interval = parseInt(intervalDays) || 30
    return Array.from({ length: n }).map((_, i) => {
      const d = new Date(base); d.setDate(base.getDate() + i * interval)
      return { date: isoDate(d), value: splitAmount ? amt / n : amt }
    })
  }, [recurrence, amt, n, dueDate, intervalDays, splitAmount])

  // Recorrências projetadas
  const projectedRecurring = useMemo(() => {
    if (recurrence !== 'recurring' || !amt || !dueDate) return []
    const items = []
    const base = new Date(dueDate + 'T00:00:00')
    const endDate = recurringLimit === 'date' && recurringEndDate ? new Date(recurringEndDate + 'T00:00:00') : null
    let current = new Date(base)
    for (let i = 0; i < 24; i++) {
      if (endDate && current > endDate) break
      items.push(isoDate(current))
      current = new Date(current)
      current.setMonth(current.getMonth() + 1)
    }
    return items
  }, [recurrence, amt, dueDate, recurringInterval, recurringLimit, recurringEndDate])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const a = parseFloat(amount)
    if (!description.trim()) { setError('Informe a descrição'); return }
    if (!a || a <= 0) { setError('Informe o valor'); return }
    setError(''); setSaving(true)

    let res
    if (isEdit) {
      res = await updateFinanceEntry(entry.id, {
        description: description.trim(), type, category: category || null,
        counterparty: counterparty || null, amount: a, due_date: dueDate,
      })
    } else if (recurrence === 'recurring') {
      const endDate = recurringLimit === 'date' && recurringEndDate ? recurringEndDate : null
      res = await createFinanceEntry({
        description: description.trim(), type, category: category || null, counterparty: counterparty || null,
        amount: a, due_date: dueDate,
        installments: projectedRecurring.length || 12,
        interval_days: 30,
        split_amount: false,
      })
    } else {
      res = await createFinanceEntry({
        description: description.trim(), type, category: category || null, counterparty: counterparty || null,
        amount: a, due_date: dueDate,
        installments: recurrence === 'installment' ? n : 1,
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
            <ComboboxField
              label={type === 'payable' ? 'Fornecedor' : 'Cliente'}
              value={counterparty}
              onChange={setCounterparty}
              options={suppliers.map(s => ({ id: s.id, name: s.name, sub: s.supply_area }))}
              onCreateNew={handleNewSupplier}
              placeholder="Buscar ou criar..."
            />
            <ComboboxField
              label="Categoria"
              value={category}
              onChange={setCategory}
              options={categories.map(c => ({ id: c.id, name: c.name }))}
              onCreateNew={handleNewCategory}
              placeholder="Buscar ou criar..."
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

          {/* Recorrente / Parcelado */}
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
                    <label className="label">Repetição</label>
                    <select value={recurringInterval} onChange={e => setRecurringInterval(e.target.value as any)} className="select mt-1">
                      <option value="monthly">Mensalmente</option>
                    </select>
                  </div>
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
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs font-medium text-gray-600 mb-2">{projectedRecurring.length} ocorrência(s) projetada(s)</p>
                      <div className="flex flex-wrap gap-1">
                        {projectedRecurring.slice(0, 6).map((d, i) => (
                          <span key={i} className="text-[10px] bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-600">
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
                          (splitAmount === (v === 'true')) ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-surface-border text-gray-500')}>{l}</button>
                    ))}
                  </div>
                  {projectedInstallments.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                      <p className="text-xs font-medium text-gray-600 mb-2">Parcelas projetadas · Total: <strong>{formatCurrency(splitAmount ? amt : amt * n)}</strong></p>
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
