'use client'

import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, X, Loader2, Search } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/useConfirm'
import {
  createBotCollaborator,
  updateBotCollaborator,
  setBotCollaboratorActive,
  deleteBotCollaborator,
  getBotCollaborators,
  type CollaboratorInput,
} from '@/lib/bot-actions'

type Collaborator = {
  id: string
  phone_e164: string
  display_name: string
  system_user_id: string | null
  is_active: boolean
  created_at: string
}
type SystemUser = { id: string; name: string; role: string; active: boolean }

export function BotCollaboratorsPage({
  initialCollaborators,
  systemUsers,
}: {
  initialCollaborators: Collaborator[]
  systemUsers: SystemUser[]
}) {
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [rows, setRows] = useState<Collaborator[]>(initialCollaborators)
  const [modal, setModal] = useState<null | 'new' | Collaborator>(null)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  const userName = useMemo(
    () => new Map(systemUsers.map((u) => [u.id, u.name])),
    [systemUsers],
  )

  async function reload() {
    setRows((await getBotCollaborators()) as Collaborator[])
  }

  const filtered = rows.filter((r) => {
    if (statusFilter === 'active' && !r.is_active) return false
    if (statusFilter === 'inactive' && r.is_active) return false
    if (!q.trim()) return true
    const needle = q.trim().toLowerCase()
    return (
      r.display_name.toLowerCase().includes(needle) ||
      r.phone_e164.toLowerCase().includes(needle)
    )
  })

  const activeCount = rows.filter((r) => r.is_active).length

  async function handleSave(input: CollaboratorInput, id?: string) {
    const res = id
      ? await updateBotCollaborator(id, input)
      : await createBotCollaborator(input)
    if (res?.error) {
      toast.error('Erro', res.error)
      return false
    }
    toast.success('Salvo!', id ? 'Colaborador atualizado.' : 'Colaborador adicionado à whitelist.')
    setModal(null)
    await reload()
    return true
  }

  async function handleToggle(row: Collaborator) {
    const res = await setBotCollaboratorActive(row.id, !row.is_active)
    if (res?.error) {
      toast.error('Erro', res.error)
      return
    }
    toast.success(!row.is_active ? 'Ativado' : 'Desativado', row.display_name)
    await reload()
  }

  async function handleDelete(row: Collaborator) {
    const ok = await confirm(
      `Remover "${row.display_name}" da whitelist?`,
      'Sim, remover',
    )
    if (!ok) return
    const res = await deleteBotCollaborator(row.id)
    if (res?.error) {
      toast.error('Erro', res.error)
      return
    }
    toast.success('Removido', '')
    await reload()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Colaboradores do Robô</h1>
          <p className="text-gray-500 mt-1">
            Whitelist de números autorizados a encaminhar projetos. Só quem está aqui e
            ativo consegue cadastrar orçamentos pelo robô.
          </p>
        </div>
        <button onClick={() => setModal('new')} className="btn-primary flex items-center gap-2 shrink-0">
          <Plus className="w-4 h-4" /> Adicionar
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="input pl-9 w-64"
            placeholder="Buscar por nome ou telefone"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="input w-40"
        >
          <option value="all">Todos</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>
        <span className="text-sm text-gray-400">{activeCount} ativo(s)</span>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-border bg-surface text-left">
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Nome</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Telefone (E.164)</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Vendedor vinculado</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3 w-24" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center">
                  <p className="text-sm text-gray-500">Nenhum colaborador cadastrado ainda.</p>
                  <button
                    onClick={() => setModal('new')}
                    className="btn-primary mt-3 inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Adicionar primeiro colaborador
                  </button>
                </td>
              </tr>
            )}
            {rows.length > 0 && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  Nenhum resultado para os filtros atuais.
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-surface-border last:border-0 hover:bg-surface">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{r.display_name}</td>
                <td className="px-4 py-3 text-sm text-gray-600 font-mono">{r.phone_e164}</td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {r.system_user_id
                    ? userName.get(r.system_user_id) ?? (
                        <span className="text-amber-600">usuário não encontrado</span>
                      )
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggle(r)}
                    className={
                      'text-xs font-medium px-2 py-1 rounded-full ' +
                      (r.is_active
                        ? 'bg-green-50 text-green-700 hover:bg-green-100'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200')
                    }
                  >
                    {r.is_active ? 'Ativo' : 'Inativo'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => setModal(r)}
                      className="text-gray-300 hover:text-brand-500"
                      aria-label="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(r)}
                      className="text-gray-300 hover:text-red-500"
                      aria-label="Remover"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <CollaboratorModal
          collaborator={modal === 'new' ? null : modal}
          systemUsers={systemUsers}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
      {ConfirmDialog}
    </div>
  )
}

function CollaboratorModal({
  collaborator,
  systemUsers,
  onClose,
  onSave,
}: {
  collaborator: Collaborator | null
  systemUsers: SystemUser[]
  onClose: () => void
  onSave: (input: CollaboratorInput, id?: string) => Promise<boolean>
}) {
  const [phone, setPhone] = useState(collaborator?.phone_e164 ?? '+55')
  const [name, setName] = useState(collaborator?.display_name ?? '')
  const [systemUserId, setSystemUserId] = useState(collaborator?.system_user_id ?? '')
  const [isActive, setIsActive] = useState(collaborator?.is_active ?? true)
  const [saving, setSaving] = useState(false)

  const phoneValid = /^\+[1-9]\d{6,14}$/.test(phone.trim())

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!phoneValid || !name.trim()) return
    setSaving(true)
    await onSave(
      {
        phone_e164: phone.trim(),
        display_name: name.trim(),
        system_user_id: systemUserId || null,
        is_active: isActive,
      },
      collaborator?.id,
    )
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <h2 className="font-semibold text-gray-900">
            {collaborator ? 'Editar colaborador' : 'Novo colaborador'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="label">Nome de exibição *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input mt-1"
              placeholder="Ex: Ana (loja)"
              autoFocus
            />
          </div>
          <div>
            <label className="label">Telefone em E.164 *</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input mt-1 font-mono"
              placeholder="+5541999998888"
            />
            {!phoneValid && phone.trim() !== '+55' && (
              <p className="text-xs text-red-500 mt-1">
                Use o formato internacional: + seguido de DDI, DDD e número.
              </p>
            )}
          </div>
          <div>
            <label className="label">Vendedor vinculado (opcional)</label>
            <select
              value={systemUserId}
              onChange={(e) => setSystemUserId(e.target.value)}
              className="input mt-1"
            >
              <option value="">— não vincular —</option>
              {systemUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Usado como &quot;vendedor responsável&quot; do orçamento cadastrado por este número.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Ativo (pode cadastrar pelo robô)
          </label>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !phoneValid || !name.trim()}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
