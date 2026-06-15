'use client'

import { useState, useTransition } from 'react'
import { getCommissions, updateCommissionStatus } from '@/lib/actions'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Check, Clock, AlertCircle } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const STATUS_CONFIG = {
  scheduled: { label: 'Agendada', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Clock },
  paid:      { label: 'Paga',     color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Check },
  overdue:   { label: 'Atrasada', color: 'bg-red-50 text-red-700 border-red-200', icon: AlertCircle },
}

function daysDiff(dateStr: string) {
  const today = new Date(); today.setHours(0,0,0,0)
  const d = new Date(dateStr + 'T00:00:00')
  return Math.floor((today.getTime() - d.getTime()) / 86400000)
}

function fmtDate(dateStr: string) {
  const [y,m,d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

export function CommissionsPage({ initialCommissions, initialYear, initialMonth }: {
  initialCommissions: any[]
  initialYear: number
  initialMonth: number
}) {
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [year, setYear]       = useState(initialYear)
  const [month, setMonth]     = useState(initialMonth)
  const [commissions, setCommissions] = useState<any[]>(initialCommissions)

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); load(year - 1, 12) }
    else { setMonth(m => m - 1); load(year, month - 1) }
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); load(year + 1, 1) }
    else { setMonth(m => m + 1); load(year, month + 1) }
  }

  function load(y: number, m: number) {
    startTransition(async () => {
      const data = await getCommissions(y, m)
      setCommissions(data as any[])
    })
  }

  function markPaid(id: string) {
    startTransition(async () => {
      const res = await updateCommissionStatus(id, 'paid')
      if (res.error) { toast.error('ERRO', res.error); return }
      setCommissions(prev => prev.map(c => c.id === id ? { ...c, status: 'paid', paid_at: new Date().toISOString() } : c))
      toast.success('TUDO CERTO!', 'Comissão marcada como paga.')
    })
  }

  // Summary
  const today = new Date().toISOString().split('T')[0]
  const totalMonth   = commissions.reduce((s, c) => s + Number(c.amount ?? 0), 0)
  const totalPaid    = commissions.filter(c => c.status === 'paid').reduce((s, c) => s + Number(c.amount ?? 0), 0)
  const totalPending = commissions.filter(c => c.status !== 'paid').reduce((s, c) => s + Number(c.amount ?? 0), 0)
  const dueToday     = commissions.filter(c => c.due_date === today && c.status !== 'paid').reduce((s, c) => s + Number(c.amount ?? 0), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Comissões</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gerenciamento de comissões de parceiros</p>
        </div>

        {/* Seletor de mês */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-2 py-1.5">
          <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-gray-700 px-2 min-w-[140px] text-center">
            {MONTHS_PT[month - 1]} de {year}
          </span>
          <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gray-400" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total do mês</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(totalMonth)}</p>
          <p className="text-xs text-gray-400 mt-1">{commissions.length} comissões</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">A pagar</p>
          <p className="text-2xl font-bold text-blue-600 mt-2">{formatCurrency(totalPending)}</p>
          <p className="text-xs text-gray-400 mt-1">em aberto</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pagas</p>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{formatCurrency(totalPaid)}</p>
          <p className="text-xs text-gray-400 mt-1">{commissions.filter(c => c.status === 'paid').length} registros</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vence hoje</p>
          <p className="text-2xl font-bold text-amber-600 mt-2">{formatCurrency(dueToday)}</p>
          <p className="text-xs text-gray-400 mt-1">vencimento em {new Date().toLocaleDateString('pt-BR')}</p>
        </div>
      </div>

      {/* Tabela */}
      {commissions.length === 0 ? (
        <div className="card p-12 text-center">
          <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">Nenhuma comissão neste mês</p>
          <p className="text-xs text-gray-400 mt-1">As comissões aparecem automaticamente quando uma venda é fechada</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-border bg-surface">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Parceiro</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Orçamento</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Valor venda</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Taxa</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Comissão</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Vencimento</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Ação</th>
              </tr>
            </thead>
            <tbody>
              {commissions.map((c, idx) => {
                const cfg = STATUS_CONFIG[c.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.scheduled
                const Icon = cfg.icon
                const overdueDays = c.status === 'overdue' ? daysDiff(c.due_date) : 0
                return (
                  <tr key={c.id} className={cn('border-b border-surface-border hover:bg-surface transition-colors', idx === commissions.length - 1 ? 'border-0' : '')}>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{c.contact?.name ?? '—'}</p>
                      <p className="text-xs text-gray-400">{c.contact?.commission_rate}% comissão</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      #{c.quote?.number ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-700">{formatCurrency(c.quote_value)}</td>
                    <td className="px-4 py-3 text-right text-sm text-gray-500">{c.rate}%</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{formatCurrency(c.amount)}</td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600">{fmtDate(c.due_date)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border', cfg.color)}>
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                        {c.status === 'overdue' && overdueDays > 0 && ` · ${overdueDays}d`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.status !== 'paid' && (
                        <button
                          onClick={() => markPaid(c.id)}
                          disabled={pending}
                          className="text-xs px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium transition-colors border border-emerald-200"
                        >
                          Marcar paga
                        </button>
                      )}
                      {c.status === 'paid' && c.paid_at && (
                        <span className="text-xs text-gray-400">
                          Pago em {new Date(c.paid_at).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
