'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, Check, X, CircleDollarSign } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/useConfirm'
import type { BankAccount, Category, Supplier, CostCenter } from '@/lib/financeiro-ia/actions'
import { type Transaction, type Direction, createTransaction, markTransactionPaid, deleteTransaction } from '@/lib/financeiro-ia/transactions-actions'
import { STATUS_LABEL, STATUS_CLASS, canMarkPaid } from '@/lib/financeiro-ia/status'

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dateFmt = (v: string) => new Date(v + 'T00:00:00').toLocaleDateString('pt-BR')

const inputCls = 'w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300'

export function LancamentosClient({
  direction,
  initialTransactions,
  categories,
  suppliers,
  costCenters,
  bankAccounts,
}: {
  direction: Direction
  initialTransactions: Transaction[]
  categories: Category[]
  suppliers: Supplier[]
  costCenters: CostCenter[]
  bankAccounts: BankAccount[]
}) {
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [pending, startTransition] = useTransition()
  const [items, setItems] = useState(initialTransactions)
  const [adding, setAdding] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    description: '', amount: '', due_date: today,
    category_id: '', supplier_id: '', cost_center_id: '', bank_account_id: '',
    total_installments: '1',
  })

  const title = direction === 'a_pagar' ? 'Contas a pagar' : 'Contas a receber'
  const emptyMsg = direction === 'a_pagar' ? 'Nenhuma conta a pagar cadastrada.' : 'Nenhuma conta a receber cadastrada.'
  const categoryOptions = categories.filter(c => c.kind === (direction === 'a_pagar' ? 'despesa' : 'receita'))

  const resetForm = () => setForm({ description: '', amount: '', due_date: today, category_id: '', supplier_id: '', cost_center_id: '', bank_account_id: '', total_installments: '1' })

  const save = () => {
    const amount = Number(form.amount.replace(',', '.'))
    if (!form.description.trim()) return toast.error('Informe a descrição')
    if (!amount || amount <= 0) return toast.error('Informe um valor válido')
    const installments = Math.max(1, parseInt(form.total_installments) || 1)
    startTransition(async () => {
      const res = await createTransaction({
        direction,
        description: form.description,
        amount,
        due_date: form.due_date,
        category_id: form.category_id || null,
        supplier_id: form.supplier_id || null,
        cost_center_id: form.cost_center_id || null,
        bank_account_id: form.bank_account_id || null,
        total_installments: installments,
      })
      if ('error' in res) return toast.error('Erro ao salvar', res.error)
      toast.success('Lançamento criado', installments > 1 ? `${installments} parcelas geradas.` : undefined)
      setAdding(false)
      resetForm()
      const cat = categories.find(c => c.id === form.category_id) ?? null
      const sup = suppliers.find(s => s.id === form.supplier_id) ?? null
      const cc = costCenters.find(c => c.id === form.cost_center_id) ?? null
      const ba = bankAccounts.find(b => b.id === form.bank_account_id) ?? null
      setItems([...items, {
        id: res.id!, direction, description: form.description, amount, due_date: form.due_date, paid_date: null,
        status: (cat && cc && ba) ? 'pendente' : 'incompleto', is_complete: !!(cat && cc && ba),
        category_id: form.category_id || null, supplier_id: form.supplier_id || null,
        cost_center_id: form.cost_center_id || null, bank_account_id: form.bank_account_id || null,
        category: cat ? { name: cat.name } : null, supplier: sup ? { name: sup.name } : null,
        cost_center: cc ? { name: cc.name } : null, bank_account: ba ? { name: ba.name } : null,
      }].sort((a, b) => a.due_date.localeCompare(b.due_date)))
    })
  }

  const markPaid = (t: Transaction) => {
    startTransition(async () => {
      const res = await markTransactionPaid(t.id)
      if ('error' in res) return toast.error('Erro ao marcar como pago', res.error)
      toast.success('Lançamento marcado como pago')
      setItems(items.map(i => (i.id === t.id ? { ...i, status: 'pago', paid_date: today } : i)))
    })
  }

  const remove = async (t: Transaction) => {
    const ok = await confirm(`Excluir o lançamento "${t.description}"?`)
    if (!ok) return
    startTransition(async () => {
      const res = await deleteTransaction(t.id)
      if ('error' in res) return toast.error('Erro ao excluir', res.error)
      setItems(items.filter(i => i.id !== t.id))
      toast.success('Lançamento excluído')
    })
  }

  const total = items.filter(i => i.status !== 'pago').reduce((s, i) => s + i.amount, 0)

  return (
    <div>
      {ConfirmDialog}
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{title}</h1>
      <p className="text-gray-500 mb-6">
        Em aberto: <span className="font-semibold text-gray-700">{money(total)}</span>
      </p>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2.5">Descrição</th>
              <th className="px-4 py-2.5">Vencimento</th>
              <th className="px-4 py-2.5">Categoria</th>
              <th className="px-4 py-2.5">{direction === 'a_pagar' ? 'Fornecedor' : 'Centro de custo'}</th>
              <th className="px-4 py-2.5">Conta</th>
              <th className="px-4 py-2.5">Valor</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {items.length > 0 ? items.map(t => (
              <tr key={t.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2.5 text-gray-700">{t.description}</td>
                <td className="px-4 py-2.5 text-gray-700">{dateFmt(t.due_date)}</td>
                <td className="px-4 py-2.5 text-gray-700">{t.category?.name || '—'}</td>
                <td className="px-4 py-2.5 text-gray-700">{(direction === 'a_pagar' ? t.supplier?.name : t.cost_center?.name) || '—'}</td>
                <td className="px-4 py-2.5 text-gray-700">{t.bank_account?.name || '—'}</td>
                <td className="px-4 py-2.5 text-gray-700">{money(t.amount)}</td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[t.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABEL[t.status] ?? t.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  {canMarkPaid(t.status) && (
                    <button onClick={() => markPaid(t)} disabled={pending} className="p-1.5 text-gray-400 hover:text-green-600 transition-colors disabled:opacity-50" title="Marcar como pago">
                      <CircleDollarSign className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => remove(t)} disabled={pending} className="p-1.5 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50" title="Excluir">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">{emptyMsg}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {adding ? (
        <div className="mt-3 bg-gray-50/50 border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Descrição" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} autoFocus />
            <input className={inputCls} placeholder="Valor (ex: 350,00)" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Vencimento</label>
              <input type="date" className={inputCls} value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Categoria</label>
              <select className={inputCls} value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                <option value="">—</option>
                {categoryOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Conta bancária</label>
              <select className={inputCls} value={form.bank_account_id} onChange={e => setForm({ ...form, bank_account_id: e.target.value })}>
                <option value="">—</option>
                {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {direction === 'a_pagar' ? (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Fornecedor</label>
                <select className={inputCls} value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                  <option value="">—</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            ) : <div />}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Centro de custo</label>
              <select className={inputCls} value={form.cost_center_id} onChange={e => setForm({ ...form, cost_center_id: e.target.value })}>
                <option value="">—</option>
                {costCenters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Parcelas</label>
              <input type="number" min={1} className={inputCls} value={form.total_installments} onChange={e => setForm({ ...form, total_installments: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={save} disabled={pending} className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50">
              <Check className="w-4 h-4" /> Salvar
            </button>
            <button onClick={() => { setAdding(false); resetForm() }} className="flex items-center gap-1.5 px-4 py-2 text-gray-500 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors">
              <X className="w-4 h-4" /> Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-3 flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-dashed border-gray-300 hover:border-gray-400 rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" />
          {direction === 'a_pagar' ? 'Nova conta a pagar' : 'Nova conta a receber'}
        </button>
      )}
    </div>
  )
}
