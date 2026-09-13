'use client'

import { useState, useTransition } from 'react'
import { CircleDollarSign, TrendingDown, TrendingUp, Wallet, PartyPopper } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import type { DailyCashPanel } from '@/lib/financeiro-ia/panels-actions'
import { markTransactionPaid } from '@/lib/financeiro-ia/transactions-actions'
import { STATUS_LABEL, STATUS_CLASS, canMarkPaid } from '@/lib/financeiro-ia/status'

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function CaixaDoDiaClient({ firstName, panel }: { firstName: string; panel: DailyCashPanel }) {
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [items, setItems] = useState(panel.items)

  const markPaid = (id: string) => {
    startTransition(async () => {
      const res = await markTransactionPaid(id)
      if ('error' in res) return toast.error('Erro ao marcar como pago', res.error)
      toast.success('Lançamento marcado como pago')
      setItems(items.map(i => (i.transaction_id === id ? { ...i, status: 'pago' } : i)))
    })
  }

  const remaining = panel.remaining
  const remainingLabel = remaining >= 0 ? 'Sobra' : 'Falta'

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Bom dia, {firstName}</h1>
      <p className="text-gray-500 mb-6">Painel de caixa de hoje.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card icon={Wallet} label="Saldo consolidado" value={money(panel.consolidated_balance)} />
        <Card icon={TrendingDown} label="Vence hoje" value={money(panel.total_due_today)} tone="text-red-600" />
        <Card icon={TrendingUp} label="A receber hoje" value={money(panel.total_receivable_today)} tone="text-green-600" />
        <Card icon={CircleDollarSign} label={remainingLabel} value={money(Math.abs(remaining))} tone={remaining >= 0 ? 'text-green-600' : 'text-red-600'} />
      </div>

      <div className="bg-white border border-surface-border rounded-card shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-secondary text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2.5">Descrição</th>
              <th className="px-4 py-2.5">Tipo</th>
              <th className="px-4 py-2.5">Categoria</th>
              <th className="px-4 py-2.5">Conta</th>
              <th className="px-4 py-2.5">Valor</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {items.length > 0 ? items.map(i => (
              <tr key={i.transaction_id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2.5 text-gray-700">{i.description}</td>
                <td className="px-4 py-2.5 text-gray-700">{i.direction === 'a_pagar' ? 'A pagar' : 'A receber'}</td>
                <td className="px-4 py-2.5 text-gray-700">{i.category || '—'}</td>
                <td className="px-4 py-2.5 text-gray-700">{i.bank_account || '—'}</td>
                <td className="px-4 py-2.5 text-gray-700">{money(i.amount)}</td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[i.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABEL[i.status] ?? i.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {canMarkPaid(i.status) && (
                    <button onClick={() => markPaid(i.transaction_id)} disabled={pending} className="p-1.5 text-gray-400 hover:text-green-600 transition-colors disabled:opacity-50" title="Marcar como pago">
                      <CircleDollarSign className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            )) : (
              <tr><td colSpan={7} className="px-4 py-10">
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
                    <PartyPopper className="w-4 h-4 text-green-600" />
                  </div>
                  <p className="text-sm text-gray-500">Nada vencendo hoje. Dia tranquilo.</p>
                </div>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Card({ icon: Icon, label, value, tone }: { icon: typeof Wallet; label: string; value: string; tone?: string }) {
  return (
    <div className="bg-white border border-surface-border rounded-card shadow-card p-4">
      <div className="flex items-center gap-2 text-gray-400 mb-2">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-xl font-bold ${tone || 'text-gray-900'}`}>{value}</div>
    </div>
  )
}
