'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, Pencil, X, Check, Landmark, Tag, Truck, Layers, ShieldCheck, Inbox } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/useConfirm'
import {
  type BankAccount, type Category, type Supplier, type CostCenter,
  createBankAccount, updateBankAccount, deleteBankAccount,
  createCategory, updateCategory, deleteCategory,
  createSupplier, updateSupplier, deleteSupplier,
  createCostCenter, updateCostCenter, deleteCostCenter,
} from '@/lib/financeiro-ia/actions'
import { setApprovalThreshold } from '@/lib/financeiro-ia/approval-actions'

type Tab = 'contas' | 'categorias' | 'fornecedores' | 'centros' | 'aprovacao'

const TABS: { key: Tab; label: string; icon: typeof Landmark }[] = [
  { key: 'contas', label: 'Contas bancárias', icon: Landmark },
  { key: 'categorias', label: 'Categorias', icon: Tag },
  { key: 'fornecedores', label: 'Fornecedores', icon: Truck },
  { key: 'centros', label: 'Centros de custo', icon: Layers },
  { key: 'aprovacao', label: 'Aprovação', icon: ShieldCheck },
]

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function ConfiguracoesClient({
  initialBankAccounts,
  initialCategories,
  initialSuppliers,
  initialCostCenters,
  initialApprovalThreshold,
}: {
  initialBankAccounts: BankAccount[]
  initialCategories: Category[]
  initialSuppliers: Supplier[]
  initialCostCenters: CostCenter[]
  initialApprovalThreshold: number
}) {
  const [tab, setTab] = useState<Tab>('contas')
  const [bankAccounts, setBankAccounts] = useState(initialBankAccounts)
  const [categories, setCategories] = useState(initialCategories)
  const [suppliers, setSuppliers] = useState(initialSuppliers)
  const [costCenters, setCostCenters] = useState(initialCostCenters)

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Configurações</h1>
      <p className="text-gray-500 mb-6">Cadastros de apoio do Luknos Financeiro.</p>

      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'contas' && <BankAccountsTab items={bankAccounts} setItems={setBankAccounts} />}
      {tab === 'categorias' && <CategoriesTab items={categories} setItems={setCategories} />}
      {tab === 'fornecedores' && <SuppliersTab items={suppliers} setItems={setSuppliers} />}
      {tab === 'centros' && <CostCentersTab items={costCenters} setItems={setCostCenters} />}
      {tab === 'aprovacao' && <AprovacaoTab initialThreshold={initialApprovalThreshold} />}
    </div>
  )
}

function AprovacaoTab({ initialThreshold }: { initialThreshold: number }) {
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [value, setValue] = useState(initialThreshold > 0 ? String(initialThreshold) : '')

  const save = () => {
    const threshold = value.trim() === '' ? 0 : Number(value.replace(',', '.'))
    if (Number.isNaN(threshold) || threshold < 0) return toast.error('Informe um valor válido')
    startTransition(async () => {
      const res = await setApprovalThreshold(threshold)
      if ('error' in res) return toast.error('Erro ao salvar', res.error)
      toast.success(threshold > 0 ? 'Valor de corte atualizado' : 'Aprovação desativada')
    })
  }

  return (
    <div className="bg-white border border-surface-border rounded-card shadow-card p-5 max-w-md">
      <h2 className="text-sm font-semibold text-gray-700 mb-1">Valor de corte para aprovação</h2>
      <p className="text-sm text-gray-500 mb-4">
        Lançamentos completos acima deste valor entram na fila de <strong>Aprovações</strong> antes de contar no fluxo de caixa. Deixe em branco ou 0 para desativar.
      </p>
      <div className="flex items-center gap-2">
        <input
          className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
          placeholder="Ex: 2000,00"
          value={value}
          onChange={e => setValue(e.target.value)}
        />
        <button onClick={save} disabled={pending} className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50">
          <Check className="w-4 h-4" /> Salvar
        </button>
      </div>
    </div>
  )
}

// ── Contas bancárias ──────────────────────────────────────────────────────

function BankAccountsTab({ items, setItems }: { items: BankAccount[]; setItems: (v: BankAccount[]) => void }) {
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [pending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', bank_code: '', account_type: 'corrente', status: 'ativa' })

  const resetForm = () => setForm({ name: '', bank_code: '', account_type: 'corrente', status: 'ativa' })

  const startEdit = (item: BankAccount) => {
    setEditingId(item.id)
    setAdding(false)
    setForm({ name: item.name, bank_code: item.bank_code ?? '', account_type: item.account_type, status: item.status })
  }

  const save = () => {
    if (!form.name.trim()) return toast.error('Informe o nome da conta')
    startTransition(async () => {
      const res = editingId
        ? await updateBankAccount(editingId, form)
        : await createBankAccount(form)
      if ('error' in res) return toast.error('Erro ao salvar', res.error)
      if (editingId) {
        setItems(items.map(i => (i.id === editingId ? { ...i, ...form, current_balance: i.current_balance } : i)))
      } else {
        setItems([...items, { id: crypto.randomUUID(), current_balance: 0, ...form }].sort((a, b) => a.name.localeCompare(b.name)))
      }
      toast.success(editingId ? 'Conta atualizada' : 'Conta cadastrada')
      setAdding(false)
      setEditingId(null)
      resetForm()
    })
  }

  const remove = async (item: BankAccount) => {
    const ok = await confirm(`Excluir a conta "${item.name}"?`)
    if (!ok) return
    startTransition(async () => {
      const res = await deleteBankAccount(item.id)
      if ('error' in res) return toast.error('Erro ao excluir', res.error)
      setItems(items.filter(i => i.id !== item.id))
      toast.success('Conta excluída')
    })
  }

  return (
    <div>
      {ConfirmDialog}
      <Table
        headers={['Nome', 'Banco', 'Tipo', 'Saldo atual', 'Status', '']}
        rows={items.map(item => (
          editingId === item.id ? (
            <EditRow key={item.id} colSpan={6} onCancel={() => setEditingId(null)} onSave={save} pending={pending}>
              <input className={inputCls} placeholder="Nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <input className={inputCls} placeholder="Código do banco" value={form.bank_code} onChange={e => setForm({ ...form, bank_code: e.target.value })} />
              <select className={inputCls} value={form.account_type} onChange={e => setForm({ ...form, account_type: e.target.value })}>
                <option value="corrente">Corrente</option>
                <option value="caixa">Caixa</option>
                <option value="poupanca">Poupança</option>
              </select>
              <select className={inputCls} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="ativa">Ativa</option>
                <option value="em_desativacao">Em desativação</option>
                <option value="inativa">Inativa</option>
              </select>
            </EditRow>
          ) : (
            <tr key={item.id} className="border-b border-gray-100 last:border-0">
              <Td>{item.name}</Td>
              <Td>{item.bank_code || '—'}</Td>
              <Td className="capitalize">{item.account_type}</Td>
              <Td>{money(item.current_balance)}</Td>
              <Td><StatusBadge status={item.status} /></Td>
              <RowActions onEdit={() => startEdit(item)} onDelete={() => remove(item)} />
            </tr>
          )
        ))}
        empty="Nenhuma conta bancária cadastrada."
      />
      {adding ? (
        <table className="w-full"><tbody>
          <EditRow colSpan={6} onCancel={() => { setAdding(false); resetForm() }} onSave={save} pending={pending}>
            <input className={inputCls} placeholder="Nome (ex: Bradesco)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
            <input className={inputCls} placeholder="Código do banco" value={form.bank_code} onChange={e => setForm({ ...form, bank_code: e.target.value })} />
            <select className={inputCls} value={form.account_type} onChange={e => setForm({ ...form, account_type: e.target.value })}>
              <option value="corrente">Corrente</option>
              <option value="caixa">Caixa</option>
              <option value="poupanca">Poupança</option>
            </select>
            <select className={inputCls} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="ativa">Ativa</option>
              <option value="em_desativacao">Em desativação</option>
              <option value="inativa">Inativa</option>
            </select>
          </EditRow>
        </tbody></table>
      ) : (
        <AddButton label="Nova conta bancária" onClick={() => { setAdding(true); setEditingId(null); resetForm() }} />
      )}
    </div>
  )
}

// ── Categorias ────────────────────────────────────────────────────────────

function CategoriesTab({ items, setItems }: { items: Category[]; setItems: (v: Category[]) => void }) {
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [pending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', kind: 'despesa', is_active: true })

  const resetForm = () => setForm({ name: '', kind: 'despesa', is_active: true })
  const startEdit = (item: Category) => { setEditingId(item.id); setAdding(false); setForm(item) }

  const save = () => {
    if (!form.name.trim()) return toast.error('Informe o nome da categoria')
    startTransition(async () => {
      const res = editingId ? await updateCategory(editingId, form) : await createCategory(form)
      if ('error' in res) return toast.error('Erro ao salvar', res.error)
      if (editingId) setItems(items.map(i => (i.id === editingId ? { ...i, ...form } : i)))
      else setItems([...items, { id: crypto.randomUUID(), ...form }].sort((a, b) => a.name.localeCompare(b.name)))
      toast.success(editingId ? 'Categoria atualizada' : 'Categoria cadastrada')
      setAdding(false); setEditingId(null); resetForm()
    })
  }

  const remove = async (item: Category) => {
    const ok = await confirm(`Excluir a categoria "${item.name}"?`)
    if (!ok) return
    startTransition(async () => {
      const res = await deleteCategory(item.id)
      if ('error' in res) return toast.error('Erro ao excluir', res.error)
      setItems(items.filter(i => i.id !== item.id))
      toast.success('Categoria excluída')
    })
  }

  return (
    <div>
      {ConfirmDialog}
      <Table
        headers={['Nome', 'Tipo', 'Status', '']}
        rows={items.map(item => (
          editingId === item.id ? (
            <EditRow key={item.id} colSpan={4} onCancel={() => setEditingId(null)} onSave={save} pending={pending}>
              <input className={inputCls} placeholder="Nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <select className={inputCls} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
                <option value="despesa">Despesa</option>
                <option value="receita">Receita</option>
              </select>
              <select className={inputCls} value={form.is_active ? '1' : '0'} onChange={e => setForm({ ...form, is_active: e.target.value === '1' })}>
                <option value="1">Ativa</option>
                <option value="0">Inativa</option>
              </select>
            </EditRow>
          ) : (
            <tr key={item.id} className="border-b border-gray-100 last:border-0">
              <Td>{item.name}</Td>
              <Td className="capitalize">{item.kind}</Td>
              <Td><StatusBadge status={item.is_active ? 'ativa' : 'inativa'} /></Td>
              <RowActions onEdit={() => startEdit(item)} onDelete={() => remove(item)} />
            </tr>
          )
        ))}
        empty="Nenhuma categoria cadastrada."
      />
      {adding ? (
        <table className="w-full"><tbody>
          <EditRow colSpan={4} onCancel={() => { setAdding(false); resetForm() }} onSave={save} pending={pending}>
            <input className={inputCls} placeholder="Nome (ex: Frete)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
            <select className={inputCls} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
              <option value="despesa">Despesa</option>
              <option value="receita">Receita</option>
            </select>
            <span />
          </EditRow>
        </tbody></table>
      ) : (
        <AddButton label="Nova categoria" onClick={() => { setAdding(true); setEditingId(null); resetForm() }} />
      )}
    </div>
  )
}

// ── Fornecedores ──────────────────────────────────────────────────────────

function SuppliersTab({ items, setItems }: { items: Supplier[]; setItems: (v: Supplier[]) => void }) {
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [pending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', document: '', is_active: true })

  const resetForm = () => setForm({ name: '', document: '', is_active: true })
  const startEdit = (item: Supplier) => { setEditingId(item.id); setAdding(false); setForm({ name: item.name, document: item.document ?? '', is_active: item.is_active }) }

  const save = () => {
    if (!form.name.trim()) return toast.error('Informe o nome do fornecedor')
    startTransition(async () => {
      const res = editingId ? await updateSupplier(editingId, form) : await createSupplier(form)
      if ('error' in res) return toast.error('Erro ao salvar', res.error)
      if (editingId) setItems(items.map(i => (i.id === editingId ? { ...i, ...form } : i)))
      else setItems([...items, { id: crypto.randomUUID(), ...form }].sort((a, b) => a.name.localeCompare(b.name)))
      toast.success(editingId ? 'Fornecedor atualizado' : 'Fornecedor cadastrado')
      setAdding(false); setEditingId(null); resetForm()
    })
  }

  const remove = async (item: Supplier) => {
    const ok = await confirm(`Excluir o fornecedor "${item.name}"?`)
    if (!ok) return
    startTransition(async () => {
      const res = await deleteSupplier(item.id)
      if ('error' in res) return toast.error('Erro ao excluir', res.error)
      setItems(items.filter(i => i.id !== item.id))
      toast.success('Fornecedor excluído')
    })
  }

  return (
    <div>
      {ConfirmDialog}
      <Table
        headers={['Nome', 'Documento', 'Status', '']}
        rows={items.map(item => (
          editingId === item.id ? (
            <EditRow key={item.id} colSpan={4} onCancel={() => setEditingId(null)} onSave={save} pending={pending}>
              <input className={inputCls} placeholder="Nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <input className={inputCls} placeholder="CNPJ/CPF" value={form.document} onChange={e => setForm({ ...form, document: e.target.value })} />
              <select className={inputCls} value={form.is_active ? '1' : '0'} onChange={e => setForm({ ...form, is_active: e.target.value === '1' })}>
                <option value="1">Ativo</option>
                <option value="0">Inativo</option>
              </select>
            </EditRow>
          ) : (
            <tr key={item.id} className="border-b border-gray-100 last:border-0">
              <Td>{item.name}</Td>
              <Td>{item.document || '—'}</Td>
              <Td><StatusBadge status={item.is_active ? 'ativa' : 'inativa'} /></Td>
              <RowActions onEdit={() => startEdit(item)} onDelete={() => remove(item)} />
            </tr>
          )
        ))}
        empty="Nenhum fornecedor cadastrado."
      />
      {adding ? (
        <table className="w-full"><tbody>
          <EditRow colSpan={4} onCancel={() => { setAdding(false); resetForm() }} onSave={save} pending={pending}>
            <input className={inputCls} placeholder="Nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
            <input className={inputCls} placeholder="CNPJ/CPF" value={form.document} onChange={e => setForm({ ...form, document: e.target.value })} />
            <span />
          </EditRow>
        </tbody></table>
      ) : (
        <AddButton label="Novo fornecedor" onClick={() => { setAdding(true); setEditingId(null); resetForm() }} />
      )}
    </div>
  )
}

// ── Centros de custo ────────────────────────────────────────────────────

function CostCentersTab({ items, setItems }: { items: CostCenter[]; setItems: (v: CostCenter[]) => void }) {
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [pending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', is_active: true })

  const resetForm = () => setForm({ name: '', is_active: true })
  const startEdit = (item: CostCenter) => { setEditingId(item.id); setAdding(false); setForm(item) }

  const save = () => {
    if (!form.name.trim()) return toast.error('Informe o nome do centro de custo')
    startTransition(async () => {
      const res = editingId ? await updateCostCenter(editingId, form) : await createCostCenter(form)
      if ('error' in res) return toast.error('Erro ao salvar', res.error)
      if (editingId) setItems(items.map(i => (i.id === editingId ? { ...i, ...form } : i)))
      else setItems([...items, { id: crypto.randomUUID(), ...form }].sort((a, b) => a.name.localeCompare(b.name)))
      toast.success(editingId ? 'Centro de custo atualizado' : 'Centro de custo cadastrado')
      setAdding(false); setEditingId(null); resetForm()
    })
  }

  const remove = async (item: CostCenter) => {
    const ok = await confirm(`Excluir o centro de custo "${item.name}"?`)
    if (!ok) return
    startTransition(async () => {
      const res = await deleteCostCenter(item.id)
      if ('error' in res) return toast.error('Erro ao excluir', res.error)
      setItems(items.filter(i => i.id !== item.id))
      toast.success('Centro de custo excluído')
    })
  }

  return (
    <div>
      {ConfirmDialog}
      <Table
        headers={['Nome', 'Status', '']}
        rows={items.map(item => (
          editingId === item.id ? (
            <EditRow key={item.id} colSpan={3} onCancel={() => setEditingId(null)} onSave={save} pending={pending}>
              <input className={inputCls} placeholder="Nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <select className={inputCls} value={form.is_active ? '1' : '0'} onChange={e => setForm({ ...form, is_active: e.target.value === '1' })}>
                <option value="1">Ativo</option>
                <option value="0">Inativo</option>
              </select>
            </EditRow>
          ) : (
            <tr key={item.id} className="border-b border-gray-100 last:border-0">
              <Td>{item.name}</Td>
              <Td><StatusBadge status={item.is_active ? 'ativa' : 'inativa'} /></Td>
              <RowActions onEdit={() => startEdit(item)} onDelete={() => remove(item)} />
            </tr>
          )
        ))}
        empty="Nenhum centro de custo cadastrado."
      />
      {adding ? (
        <table className="w-full"><tbody>
          <EditRow colSpan={3} onCancel={() => { setAdding(false); resetForm() }} onSave={save} pending={pending}>
            <input className={inputCls} placeholder="Nome (ex: Loja física)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
            <span />
          </EditRow>
        </tbody></table>
      ) : (
        <AddButton label="Novo centro de custo" onClick={() => { setAdding(true); setEditingId(null); resetForm() }} />
      )}
    </div>
  )
}

// ── Bits compartilhados ───────────────────────────────────────────────────

const inputCls = 'w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-300'

function Table({ headers, rows, empty }: { headers: string[]; rows: React.ReactNode[]; empty: string }) {
  return (
    <div className="bg-white border border-surface-border rounded-card shadow-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-secondary text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {headers.map(h => <th key={h} className="px-4 py-2.5">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? rows : (
            <tr><td colSpan={headers.length} className="px-4 py-10">
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="w-10 h-10 rounded-full bg-surface-secondary flex items-center justify-center">
                  <Inbox className="w-4 h-4 text-gray-400" />
                </div>
                <p className="text-sm text-gray-400">{empty}</p>
              </div>
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 text-gray-700 ${className}`}>{children}</td>
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ativa: 'bg-green-50 text-green-700',
    em_desativacao: 'bg-amber-50 text-amber-700',
    inativa: 'bg-gray-100 text-gray-500',
  }
  const label: Record<string, string> = {
    ativa: 'Ativa',
    em_desativacao: 'Em desativação',
    inativa: 'Inativa',
  }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? map.inativa}`}>{label[status] ?? status}</span>
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <td className="px-4 py-2.5 text-right whitespace-nowrap">
      <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors" title="Editar">
        <Pencil className="w-4 h-4" />
      </button>
      <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 transition-colors" title="Excluir">
        <Trash2 className="w-4 h-4" />
      </button>
    </td>
  )
}

function EditRow({ children, colSpan, onSave, onCancel, pending }: { children: React.ReactNode; colSpan: number; onSave: () => void; onCancel: () => void; pending: boolean }) {
  return (
    <tr className="border-b border-surface-border last:border-0 bg-surface-secondary/60">
      <td colSpan={colSpan} className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex-1 grid gap-2" style={{ gridTemplateColumns: `repeat(${Array.isArray(children) ? children.length : 1}, minmax(0, 1fr))` }}>
            {children}
          </div>
          <button onClick={onSave} disabled={pending} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50" title="Salvar">
            <Check className="w-4 h-4" />
          </button>
          <button onClick={onCancel} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors" title="Cancelar">
            <X className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  )
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-3 flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-dashed border-gray-300 hover:border-gray-400 rounded-xl transition-colors"
    >
      <Plus className="w-4 h-4" />
      {label}
    </button>
  )
}
