'use client'

import { useState } from 'react'
import { createFinanceCategory, updateFinanceCategory, deleteFinanceCategory } from '@/lib/actions'
import { Plus, Pencil, Trash2, X, Loader2, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useConfirm } from '@/components/ui/useConfirm'
import { useToast } from '@/components/ui/Toast'

export function FinanceCategoriesPage({ initialCategories }: { initialCategories: any[] }) {
  const [categories, setCategories] = useState<any[]>(initialCategories)
  const [modal, setModal] = useState<null | 'new' | any>(null)
  const { confirm, ConfirmDialog } = useConfirm()
  const toast = useToast()

  async function reload() {
    const { getFinanceCategories } = await import('@/lib/actions')
    setCategories(await getFinanceCategories())
  }

  async function handleSave(name: string, id?: string) {
    const res = id ? await updateFinanceCategory(id, name) : await createFinanceCategory(name)
    if (res?.error) { toast.error('Erro', res.error); return }
    toast.success('Salvo!', id ? 'Categoria atualizada.' : 'Categoria criada.')
    setModal(null)
    await reload()
  }

  async function handleDelete(c: any) {
    const ok = await confirm(`Excluir "${c.name}"?`, 'Sim, excluir')
    if (!ok) return
    const res = await deleteFinanceCategory(c.id)
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
            <h1 className="text-xl font-bold text-gray-900">Categorias</h1>
            <p className="text-sm text-gray-400">Categorias para organizar seus lançamentos</p>
          </div>
        </div>
        <button onClick={() => setModal('new')} className="btn-primary"><Plus className="w-4 h-4" /> Nova categoria</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-border bg-surface text-left">
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Nome</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr><td colSpan={2} className="px-4 py-8 text-center text-sm text-gray-400">Nenhuma categoria cadastrada</td></tr>
            )}
            {categories.map(c => (
              <tr key={c.id} className="border-b border-surface-border last:border-0 hover:bg-surface">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{c.name}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setModal(c)} className="text-gray-300 hover:text-brand-500"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(c)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <CategoryModal
          category={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
      {ConfirmDialog}
    </div>
  )
}

function CategoryModal({ category, onClose, onSave }: { category: any; onClose: () => void; onSave: (name: string, id?: string) => Promise<void> }) {
  const [name, setName] = useState(category?.name ?? '')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    await onSave(name.trim(), category?.id)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <h2 className="font-semibold text-gray-900">{category ? 'Editar categoria' : 'Nova categoria'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="label">Nome *</label>
            <input value={name} onChange={e => setName(e.target.value)} className="input mt-1" placeholder="Ex: Impostos, Aluguel, Material..." autoFocus />
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
