'use client'

import { useState, useTransition } from 'react'
import { createFinanceSupplier, updateFinanceSupplier, deleteFinanceSupplier } from '@/lib/actions'
import { Plus, Pencil, Trash2, X, Loader2, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useConfirm } from '@/components/ui/useConfirm'
import { useToast } from '@/components/ui/Toast'

export function FinanceSuppliersPage({ initialSuppliers }: { initialSuppliers: any[] }) {
  const [suppliers, setSuppliers] = useState<any[]>(initialSuppliers)
  const [modal, setModal] = useState<null | 'new' | any>(null)
  const [pending, start] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()
  const toast = useToast()

  async function reload() {
    const { getFinanceSuppliers } = await import('@/lib/actions')
    setSuppliers(await getFinanceSuppliers())
  }

  async function handleSave(name: string, supply_area: string, id?: string) {
    const res = id
      ? await updateFinanceSupplier(id, name, supply_area)
      : await createFinanceSupplier(name, supply_area)
    if (res?.error) { toast.error('Erro', res.error); return }
    toast.success('Salvo!', id ? 'Fornecedor atualizado.' : 'Fornecedor criado.')
    setModal(null)
    await reload()
  }

  async function handleDelete(s: any) {
    const ok = await confirm(`Excluir "${s.name}"?`, 'Sim, excluir')
    if (!ok) return
    const res = await deleteFinanceSupplier(s.id)
    if (res?.error) { toast.error('Erro', res.error); return }
    toast.success('Excluído!', '')
    await reload()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/finance" className="text-gray-400 hover:text-gray-600"><ChevronLeft className="w-5 h-5" /></Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Fornecedores</h1>
            <p className="text-sm text-gray-400">Gerencie os fornecedores financeiros</p>
          </div>
        </div>
        <button onClick={() => setModal('new')} className="btn-primary"><Plus className="w-4 h-4" /> Novo fornecedor</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-border bg-surface text-left">
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Nome</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Área de fornecimento</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-400">Nenhum fornecedor cadastrado</td></tr>
            )}
            {suppliers.map(s => (
              <tr key={s.id} className="border-b border-surface-border last:border-0 hover:bg-surface">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{s.name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{s.supply_area || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setModal(s)} className="text-gray-300 hover:text-brand-500"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(s)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <SupplierModal
          supplier={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
      {ConfirmDialog}
    </div>
  )
}

function SupplierModal({ supplier, onClose, onSave }: { supplier: any; onClose: () => void; onSave: (name: string, area: string, id?: string) => Promise<void> }) {
  const [name, setName] = useState(supplier?.name ?? '')
  const [area, setArea] = useState(supplier?.supply_area ?? '')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    await onSave(name.trim(), area.trim(), supplier?.id)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <h2 className="font-semibold text-gray-900">{supplier ? 'Editar fornecedor' : 'Novo fornecedor'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="label">Nome *</label>
            <input value={name} onChange={e => setName(e.target.value)} className="input mt-1" placeholder="Ex: Elgin Distribuidora" autoFocus />
          </div>
          <div>
            <label className="label">Área de fornecimento</label>
            <input value={area} onChange={e => setArea(e.target.value)} className="input mt-1" placeholder="Ex: Material elétrico, Iluminação..." />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={saving || !name.trim()} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
