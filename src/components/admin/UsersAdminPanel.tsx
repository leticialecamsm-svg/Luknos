'use client'

import { useState, useTransition, useRef } from 'react'
import {
  createRole, updateRolePages, deleteRole, updateRoleCollaborator,
  createUserAccount, updateUserRole, updateUserProjetista, updateUserActive,
} from '@/lib/actions'
import { PAGE_CATALOG } from '@/lib/pages-catalog'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Loader2, Shield, UserPlus } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'

interface Role {
  name: string
  label: string
  is_admin: boolean
  is_collaborator: boolean
  allowed_pages: string[]
}
interface UserRow {
  id: string
  name: string
  email: string
  role: string
  is_projetista: boolean
  active: boolean
  avatar_color: string
  avatar_url?: string | null
}

export function UsersAdminPanel({ initialRoles, initialUsers }: { initialRoles: Role[]; initialUsers: UserRow[] }) {
  const toast = useToast()
  const [roles, setRoles] = useState<Role[]>(initialRoles)
  const [users, setUsers] = useState<UserRow[]>(initialUsers)
  const [pending, startTransition] = useTransition()
  const [showNewRole, setShowNewRole] = useState(false)
  const [showNewUser, setShowNewUser] = useState(false)

  function togglePageForRole(roleName: string, page: string) {
    setRoles(prev => prev.map(r => {
      if (r.name !== roleName) return r
      const has = r.allowed_pages.includes(page)
      const next = has ? r.allowed_pages.filter(p => p !== page) : [...r.allowed_pages, page]
      return { ...r, allowed_pages: next }
    }))
  }

  function saveRolePages(role: Role) {
    startTransition(async () => {
      const res = await updateRolePages(role.name, role.allowed_pages)
      if (res?.error) toast.error('Erro', res.error)
      else toast.success('Salvo', `Páginas de "${role.label}" atualizadas.`)
    })
  }

  function handleDeleteRole(name: string) {
    startTransition(async () => {
      const res = await deleteRole(name)
      if (res?.error) { toast.error('Não foi possível excluir', res.error); return }
      setRoles(prev => prev.filter(r => r.name !== name))
      toast.success('Excluído', 'Papel removido.')
    })
  }

  function toggleCollaborator(role: Role) {
    const next = !role.is_collaborator
    setRoles(prev => prev.map(r => r.name === role.name ? { ...r, is_collaborator: next } : r))
    startTransition(async () => {
      const res = await updateRoleCollaborator(role.name, next)
      if (res?.error) {
        toast.error('Erro', res.error)
        setRoles(prev => prev.map(r => r.name === role.name ? { ...r, is_collaborator: !next } : r))
      }
    })
  }

  return (
    <div className="space-y-8">
      {/* Papéis / tipos de usuário */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-brand-600" />
            <h2 className="text-sm font-semibold text-gray-900">Tipos de usuário</h2>
          </div>
          <button onClick={() => setShowNewRole(v => !v)} className="btn-secondary text-xs py-1.5 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Novo tipo
          </button>
        </div>

        {showNewRole && (
          <NewRoleForm
            onCreated={role => { setRoles(prev => [...prev, role]); setShowNewRole(false) }}
            onCancel={() => setShowNewRole(false)}
          />
        )}

        <div className="divide-y divide-gray-100">
          {roles.map(role => (
            <div key={role.name} className="px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{role.label}</p>
                  <p className="text-xs text-gray-400">{role.name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={role.is_admin || role.is_collaborator}
                      disabled={role.is_admin || pending}
                      onChange={() => toggleCollaborator(role)}
                      className="w-3.5 h-3.5 rounded"
                    />
                    Conta como colaborador
                  </label>
                  {role.is_admin ? (
                    <span className="text-xs font-medium text-brand-600 bg-brand-50 px-2 py-1 rounded-full">Acesso total</span>
                  ) : (
                    !['seller', 'marketing', 'logistics'].includes(role.name) && (
                      <button onClick={() => handleDeleteRole(role.name)} disabled={pending}
                        className="text-gray-400 hover:text-red-500 p-1.5">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )
                  )}
                </div>
              </div>
              {!role.is_admin && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {PAGE_CATALOG.map(p => (
                      <button
                        key={p.href}
                        onClick={() => togglePageForRole(role.name, p.href)}
                        className={cn('px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                          role.allowed_pages.includes(p.href)
                            ? 'bg-brand-50 text-brand-700 border-brand-200'
                            : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300')}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => saveRolePages(role)} disabled={pending}
                    className="mt-3 btn-primary text-xs py-1.5 flex items-center gap-1.5">
                    {pending && <Loader2 className="w-3 h-3 animate-spin" />} Salvar páginas
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Usuários */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Usuários</h2>
          <button onClick={() => setShowNewUser(v => !v)} className="btn-primary text-xs py-1.5 flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5" /> Criar usuário
          </button>
        </div>

        {showNewUser && (
          <NewUserForm
            roles={roles}
            onCreated={u => { setUsers(prev => [...prev, u]); setShowNewUser(false) }}
            onCancel={() => setShowNewUser(false)}
          />
        )}

        <div className="divide-y divide-gray-100">
          {users.map(u => (
            <div key={u.id} className={cn('flex items-center gap-3 px-5 py-3', !u.active && 'opacity-50')}>
              <Avatar user={u} size={32} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                <p className="text-xs text-gray-400 truncate">{u.email}</p>
              </div>
              <select
                value={u.role}
                onChange={e => {
                  const role = e.target.value
                  setUsers(prev => prev.map(x => x.id === u.id ? { ...x, role } : x))
                  startTransition(async () => {
                    const res = await updateUserRole(u.id, role)
                    if (res?.error) toast.error('Erro', res.error)
                  })
                }}
                className="select text-xs w-40"
              >
                {roles.map(r => <option key={r.name} value={r.name}>{r.label}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-gray-500 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={u.is_projetista}
                  onChange={e => {
                    const checked = e.target.checked
                    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_projetista: checked } : x))
                    startTransition(async () => {
                      const res = await updateUserProjetista(u.id, checked)
                      if (res?.error) toast.error('Erro', res.error)
                    })
                  }}
                  className="w-3.5 h-3.5 rounded"
                />
                Projetista
              </label>
              <button
                onClick={() => {
                  const next = !u.active
                  setUsers(prev => prev.map(x => x.id === u.id ? { ...x, active: next } : x))
                  startTransition(async () => {
                    const res = await updateUserActive(u.id, next)
                    if (res?.error) toast.error('Erro', res.error)
                  })
                }}
                className={cn('text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap',
                  u.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500')}
              >
                {u.active ? 'Ativo' : 'Inativo'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function NewRoleForm({ onCreated, onCancel }: { onCreated: (r: Role) => void; onCancel: () => void }) {
  const toast = useToast()
  const [label, setLabel] = useState('')
  const [pages, setPages] = useState<string[]>([])
  const [isCollaborator, setIsCollaborator] = useState(false)
  const [pending, startTransition] = useTransition()

  const togglePage = (href: string) =>
    setPages(prev => prev.includes(href) ? prev.filter(p => p !== href) : [...prev, href])

  const handleCreate = () => {
    if (!label.trim()) { toast.error('Erro', 'Dê um nome pro tipo de usuário.'); return }
    startTransition(async () => {
      const res = await createRole(label, label, pages, isCollaborator)
      if (res?.error) { toast.error('Erro', res.error); return }
      const key = label.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_')
      onCreated({ name: key, label: label.trim(), is_admin: false, is_collaborator: isCollaborator, allowed_pages: pages })
      toast.success('Criado', 'Tipo de usuário criado.')
    })
  }

  return (
    <div className="px-5 py-4 bg-brand-50/50 border-b border-brand-100 space-y-3">
      <input value={label} onChange={e => setLabel(e.target.value)}
        placeholder="Nome do tipo (ex: Financeiro Terceirizado)" className="input text-sm" />
      <div className="flex flex-wrap gap-2">
        {PAGE_CATALOG.map(p => (
          <button key={p.href} onClick={() => togglePage(p.href)}
            className={cn('px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
              pages.includes(p.href) ? 'bg-brand-100 text-brand-700 border-brand-300' : 'bg-white text-gray-400 border-gray-200')}>
            {p.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5 text-xs text-gray-600">
        <input type="checkbox" checked={isCollaborator} onChange={e => setIsCollaborator(e.target.checked)} className="w-3.5 h-3.5 rounded" />
        Conta como colaborador (aparece em rankings e metas) — deixe desmarcado pra terceirizados
      </label>
      <div className="flex gap-2">
        <button onClick={handleCreate} disabled={pending} className="btn-primary text-xs py-1.5">
          {pending && <Loader2 className="w-3 h-3 animate-spin" />} Criar tipo
        </button>
        <button onClick={onCancel} className="btn-secondary text-xs py-1.5">Cancelar</button>
      </div>
    </div>
  )
}

function NewUserForm({ roles, onCreated, onCancel }: {
  roles: Role[]
  onCreated: (u: UserRow) => void
  onCancel: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(roles.find(r => !r.is_admin)?.name ?? roles[0]?.name ?? '')
  const [isProjetista, setIsProjetista] = useState(false)
  const [pending, startTransition] = useTransition()
  const submittingRef = useRef(false)

  const handleCreate = () => {
    // Trava síncrona contra duplo-clique — `pending` do useTransition só vira
    // true depois de um tick, tempo suficiente pra um segundo clique passar
    if (submittingRef.current) return
    submittingRef.current = true
    startTransition(async () => {
      try {
        const res = await createUserAccount({ name, email, password, role, is_projetista: isProjetista })
        if (res?.error) { toast.error('Erro', res.error); return }
        onCreated({
          id: crypto.randomUUID(), name, email, role, is_projetista: isProjetista,
          active: true, avatar_color: '#185FA5',
        })
        toast.success('Criado', 'Usuário criado. Já pode fazer login com o email e senha definidos.')
      } finally {
        submittingRef.current = false
      }
    })
  }

  return (
    <div className="px-5 py-4 bg-brand-50/50 border-b border-brand-100 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome" className="input text-sm" />
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" className="input text-sm" />
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Senha (mín. 6 caracteres)" type="password" className="input text-sm" />
        <select value={role} onChange={e => setRole(e.target.value)} className="select text-sm">
          {roles.map(r => <option key={r.name} value={r.name}>{r.label}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-1.5 text-xs text-gray-600">
        <input type="checkbox" checked={isProjetista} onChange={e => setIsProjetista(e.target.checked)} className="w-3.5 h-3.5 rounded" />
        É projetista
      </label>
      <div className="flex gap-2">
        <button onClick={handleCreate} disabled={pending} className="btn-primary text-xs py-1.5">
          {pending && <Loader2 className="w-3 h-3 animate-spin" />} Criar usuário
        </button>
        <button onClick={onCancel} className="btn-secondary text-xs py-1.5">Cancelar</button>
      </div>
    </div>
  )
}
