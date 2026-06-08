'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, getInitials } from '@/lib/utils'
import { Loader2, UserPlus, Plus, Trash2, Search, Pencil, Check, X as XIcon, KeyRound } from 'lucide-react'
import { searchContacts, createContact, updateUser, updateUserPassword } from '@/lib/actions'
import type { User, MonthlyGoal } from '@/types'

interface Props {
  users: User[]
  goals: MonthlyGoal[]
}

export function AdminPanel({ users, goals }: Props) {
  const [pending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState<'users' | 'contacts' | 'goals'>('users')

  // ── Criar usuário ─────────────────────────────────────────
  const [showNewUser, setShowNewUser] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'seller'>('seller')
  const [newPassword, setNewPassword] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState(false)

  const COLORS = ['#185FA5','#065F46','#92400E','#7F1D1D','#3C3489','#712B13','#444441']

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    setCreateSuccess(false)
    startTransition(async () => {
      const supabase = createClient()
      const color = COLORS[users.length % COLORS.length]
      const { error } = await supabase.auth.signUp({
        email: newEmail,
        password: newPassword,
        options: { data: { name: newName, role: newRole, avatar_color: color } }
      })
      if (error) { setCreateError(error.message); return }
      setCreateSuccess(true)
      setNewName(''); setNewEmail(''); setNewPassword('')
      setShowNewUser(false)
      window.location.reload()
    })
  }

  // ── Contatos ──────────────────────────────────────────────
  const [contactSearch, setContactSearch] = useState('')
  const [contactResults, setContactResults] = useState<any[]>([])
  const [newContactName, setNewContactName] = useState('')
  const [newContactPhone, setNewContactPhone] = useState('')
  const [newContactType, setNewContactType] = useState('architect')
  const [contactMsg, setContactMsg] = useState<string | null>(null)

  async function handleContactSearch(q: string) {
    setContactSearch(q)
    if (q.length < 2) { setContactResults([]); return }
    const r = await searchContacts(q)
    setContactResults(r)
  }

  async function handleCreateContact(e: React.FormEvent) {
    e.preventDefault()
    if (!newContactName.trim()) return
    const res = await createContact({
      name: newContactName.trim(),
      phone: newContactPhone || undefined,
      type: newContactType as any,
    })
    if (res.error) { setContactMsg('Erro: ' + res.error); return }
    setContactMsg('✅ Contato criado com sucesso!')
    setNewContactName(''); setNewContactPhone('')
    handleContactSearch(contactSearch)
    setTimeout(() => setContactMsg(null), 3000)
  }

  // ── Metas ─────────────────────────────────────────────────
  async function handleGoalUpdate(userId: string | null, value: number) {
    const supabase = createClient()
    const now = new Date()
    await supabase.from('monthly_goals').upsert({
      user_id: userId,
      year:    now.getFullYear(),
      month:   now.getMonth() + 1,
      target:  value,
    }, { onConflict: 'user_id,year,month' })
  }

  const getGoal = (userId: string | null) =>
    goals.find(g => g.user_id === userId)?.target ?? 70000

  const TYPE_LABEL: Record<string, string> = {
    client: 'Cliente', architect: 'Arquiteto',
    designer: 'Designer', engineer: 'Engenheiro', other: 'Outro',
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-gray-900">Administração</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-secondary rounded-lg p-1">
        {[
          { key: 'users',    label: 'Colaboradores' },
          { key: 'contacts', label: 'Contatos' },
          { key: 'goals',    label: 'Metas' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeTab === t.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ABA: COLABORADORES ─────────────────────────────── */}
      {activeTab === 'users' && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Colaboradores</h2>
            <button onClick={() => setShowNewUser(!showNewUser)} className="btn-primary text-xs py-1.5">
              <UserPlus className="w-3.5 h-3.5" /> Novo colaborador
            </button>
          </div>

          {showNewUser && (
            <form onSubmit={handleCreateUser} className="bg-surface rounded-lg p-4 mb-4 space-y-3">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Criar acesso</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Nome *</label>
                  <input value={newName} onChange={e => setNewName(e.target.value)} required className="input" />
                </div>
                <div>
                  <label className="label">Email *</label>
                  <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required className="input" />
                </div>
                <div>
                  <label className="label">Senha temporária *</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} className="input" />
                </div>
                <div>
                  <label className="label">Perfil</label>
                  <select value={newRole} onChange={e => setNewRole(e.target.value as any)} className="select">
                    <option value="seller">Vendedor</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
              </div>
              {createError && <p className="text-xs text-red-600">{createError}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={pending} className="btn-primary text-xs py-1.5">
                  {pending && <Loader2 className="w-3 h-3 animate-spin" />} Criar
                </button>
                <button type="button" onClick={() => setShowNewUser(false)} className="btn-secondary text-xs py-1.5">
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {createSuccess && (
            <p className="text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg mb-3">
              ✅ Colaborador criado. Pode fazer login com o email e senha definidos.
            </p>
          )}

          <div className="space-y-2">
            {users.map(u => (
              <UserRow key={u.id} user={u} />
            ))}
          </div>
        </div>
      )}

      {/* ── ABA: CONTATOS ──────────────────────────────────── */}
      {activeTab === 'contacts' && (
        <div className="space-y-4">

          {/* Criar novo contato */}
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Novo contato
            </h2>
            <form onSubmit={handleCreateContact} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Nome *</label>
                  <input
                    value={newContactName}
                    onChange={e => setNewContactName(e.target.value)}
                    placeholder="Ex: Arq. Mariana Silva"
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="label">Tipo</label>
                  <select value={newContactType} onChange={e => setNewContactType(e.target.value)} className="select">
                    <option value="architect">Arquiteto</option>
                    <option value="designer">Designer</option>
                    <option value="engineer">Engenheiro</option>
                    <option value="client">Cliente</option>
                    <option value="other">Outro</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="label">Telefone</label>
                  <input
                    value={newContactPhone}
                    onChange={e => setNewContactPhone(e.target.value)}
                    placeholder="(82) 99999-9999"
                    className="input"
                  />
                </div>
              </div>
              {contactMsg && (
                <p className={`text-xs px-3 py-2 rounded-lg ${contactMsg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                  {contactMsg}
                </p>
              )}
              <button type="submit" className="btn-primary text-xs py-1.5">
                <Plus className="w-3 h-3" /> Salvar contato
              </button>
            </form>
          </div>

          {/* Buscar contatos existentes */}
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Search className="w-4 h-4" /> Buscar contatos
            </h2>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                value={contactSearch}
                onChange={e => handleContactSearch(e.target.value)}
                placeholder="Digite o nome..."
                className="input pl-9"
              />
            </div>
            {contactResults.length > 0 && (
              <div className="mt-3 space-y-1">
                {contactResults.map(c => (
                  <div key={c.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-surface">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{c.name}</p>
                      {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                    </div>
                    <span className="badge bg-gray-100 text-gray-500 text-xs">
                      {TYPE_LABEL[c.type] ?? c.type}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {contactSearch.length >= 2 && contactResults.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Nenhum contato encontrado</p>
            )}
          </div>
        </div>
      )}

      {/* ── ABA: METAS ─────────────────────────────────────── */}
      {activeTab === 'goals' && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Metas do mês atual</h2>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-brand-50 border border-brand-100 mb-3">
            <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">L</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Meta da loja</p>
              <p className="text-xs text-gray-400">Soma de todas as vendas</p>
            </div>
            <GoalInput defaultValue={getGoal(null)} onSave={v => handleGoalUpdate(null, v)} />
          </div>

          <div className="space-y-2">
            {users.filter(u => u.active).map(u => (
              <div key={u.id} className="flex items-center gap-3 p-3 rounded-lg bg-surface">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                  style={{ backgroundColor: u.avatar_color }}
                >
                  {getInitials(u.name)}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{u.name}</p>
                </div>
                <GoalInput defaultValue={getGoal(u.id)} onSave={v => handleGoalUpdate(u.id, v)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function UserRow({ user: u }: { user: User }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(u.name)
  const [role, setRole] = useState(u.role)
  const [saving, setSaving] = useState(false)

  const [showPwd, setShowPwd] = useState(false)
  const [newPwd, setNewPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwdSaving, setPwdSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await updateUser(u.id, { name, role })
    setSaving(false)
    setEditing(false)
    window.location.reload()
  }

  async function handleToggleActive() {
    if (!confirm(u.active
      ? `Desativar "${u.name}"? Ele não aparecerá mais no sistema.`
      : `Reativar "${u.name}"?`
    )) return
    await updateUser(u.id, { active: !u.active })
    window.location.reload()
  }

  async function handlePasswordSave() {
    if (newPwd.length < 6) { setPwdMsg({ ok: false, text: 'Mínimo 6 caracteres' }); return }
    setPwdSaving(true)
    const res = await updateUserPassword(u.id, newPwd)
    setPwdSaving(false)
    if (res.error) { setPwdMsg({ ok: false, text: res.error }); return }
    setPwdMsg({ ok: true, text: 'Senha alterada com sucesso!' })
    setNewPwd('')
    setTimeout(() => { setPwdMsg(null); setShowPwd(false) }, 2000)
  }

  return (
    <div className={`rounded-lg ${u.active ? 'bg-surface' : 'bg-gray-50 opacity-60'}`}>
      <div className="flex items-center gap-3 p-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
          style={{ backgroundColor: u.avatar_color }}
        >
          {getInitials(u.name)}
        </div>

        {editing ? (
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="input text-sm py-1 flex-1"
              autoFocus
            />
            <select value={role} onChange={e => setRole(e.target.value as any)} className="select text-sm py-1 w-32">
              <option value="seller">Vendedor</option>
              <option value="admin">Admin</option>
            </select>
            <button onClick={handleSave} disabled={saving} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Salvar">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </button>
            <button onClick={() => { setEditing(false); setName(u.name); setRole(u.role) }} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded" title="Cancelar">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{u.name}</p>
              <p className="text-xs text-gray-400">{u.email}</p>
            </div>
            <span className={`badge text-xs ${u.role === 'admin' ? 'bg-brand-50 text-brand-500' : 'bg-gray-100 text-gray-500'}`}>
              {u.role === 'admin' ? 'Admin' : 'Vendedor'}
            </span>
            {!u.active && <span className="badge text-xs bg-red-50 text-red-500">Inativo</span>}
            <button onClick={() => { setShowPwd(!showPwd); setPwdMsg(null) }} className="p-1.5 text-gray-300 hover:text-amber-500 hover:bg-amber-50 rounded transition-colors" title="Alterar senha">
              <KeyRound className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setEditing(true)} className="p-1.5 text-gray-300 hover:text-brand-500 hover:bg-brand-50 rounded transition-colors" title="Editar">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={handleToggleActive} className={`p-1.5 rounded transition-colors ${u.active ? 'text-gray-300 hover:text-red-500 hover:bg-red-50' : 'text-gray-300 hover:text-green-600 hover:bg-green-50'}`}
              title={u.active ? 'Desativar' : 'Reativar'}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {showPwd && !editing && (
        <div className="px-3 pb-3 pt-0">
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <input
              type="password"
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              placeholder="Nova senha (mín. 6 caracteres)"
              className="flex-1 bg-transparent text-sm outline-none placeholder-amber-400"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handlePasswordSave()}
            />
            <button onClick={handlePasswordSave} disabled={pwdSaving} className="btn-primary text-xs py-1">
              {pwdSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Salvar'}
            </button>
            <button onClick={() => { setShowPwd(false); setNewPwd(''); setPwdMsg(null) }} className="text-amber-400 hover:text-amber-600">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
          {pwdMsg && (
            <p className={`text-xs mt-1.5 px-1 ${pwdMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{pwdMsg.text}</p>
          )}
        </div>
      )}
    </div>
  )
}

function GoalInput({ defaultValue, onSave }: { defaultValue: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(defaultValue))

  return editing ? (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-400">R$</span>
      <input
        type="number"
        value={value}
        onChange={e => setValue(e.target.value)}
        className="input w-28 text-sm py-1"
        autoFocus
      />
      <button onClick={() => { onSave(Number(value)); setEditing(false) }} className="btn-primary text-xs py-1">
        OK
      </button>
    </div>
  ) : (
    <button onClick={() => setEditing(true)} className="text-sm font-semibold text-brand-500 hover:underline">
      {formatCurrency(Number(value))}
    </button>
  )
}
