'use client'

import { useState, useTransition } from 'react'
import { Check, X, ShieldCheck } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import type { Transaction } from '@/lib/financeiro-ia/transactions-actions'
import { approveTransaction } from '@/lib/financeiro-ia/approval-actions'

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dateFmt = (v: string) => new Date(v + 'T00:00:00').toLocaleDateString('pt-BR')

export function AprovacoesClient({ initialItems }: { initialItems: Transaction[] }) {
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [items, setItems] = useState(initialItems)

  const decide = (t: Transaction, approved: boolean) => {
    startTransition(async () => {
      const res = await approveTransaction(t.id, approved)
      if ('error' in res) return toast.error('Erro ao decidir', res.error)
      toast.success(approved ? 'Lançamento aprovado' : 'Lançamento rejeitado')
      setItems(items.filter(i => i.id !== t.id))
    })
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Aprovações</h1>
      <p className="text-gray-500 mb-6">Lançamentos acima do valor de corte, aguardando decisão.</p>

      <div className="bg-white border border-surface-border rounded-card shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-secondary text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2.5">Descrição</th>
              <th className="px-4 py-2.5">Tipo</th>
              <th className="px-4 py-2.5">Vencimento</th>
              <th className="px-4 py-2.5">Categoria</th>
              <th className="px-4 py-2.5">Valor</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {items.length > 0 ? items.map(t => (
              <tr key={t.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2.5 text-gray-700">{t.description}</td>
                <td className="px-4 py-2.5 text-gray-700">{t.direction === 'a_pagar' ? 'A pagar' : 'A receber'}</td>
                <td className="px-4 py-2.5 text-gray-700">{dateFmt(t.due_date)}</td>
                <td className="px-4 py-2.5 text-gray-700">{t.category?.name || '—'}</td>
                <td className="px-4 py-2.5 text-gray-700 font-medium">{money(t.amount)}</td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <button onClick={() => decide(t, true)} disabled={pending} className="p-1.5 text-gray-400 hover:text-green-600 transition-colors disabled:opacity-50" title="Aprovar">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => decide(t, false)} disabled={pending} className="p-1.5 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50" title="Rejeitar">
                    <X className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={6} className="px-4 py-10">
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4 text-green-600" />
                  </div>
                  <p className="text-sm text-gray-500">Nada aguardando aprovação no momento.</p>
                </div>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
