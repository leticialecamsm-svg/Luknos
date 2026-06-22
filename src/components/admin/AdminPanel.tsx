'use client'

import { useState, useEffect, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, getInitials } from '@/lib/utils'
import { Loader2, UserPlus, Plus, Trash2, Search, Pencil, Check, X as XIcon, KeyRound, Camera } from 'lucide-react'
import { searchContacts, createContact, updateUser, updateUserPassword, deleteUser, createUserAdmin, getPaymentRates, updatePaymentRate } from '@/lib/actions'
import { DEFAULT_PAYMENT_RATES } from '@/lib/payment-rates'
import { useConfirm } from '@/components/ui/useConfirm'
import { useToast } from '@/components/ui/Toast'
import { Avatar } from '@/components/ui/Avatar'
import type { User, MonthlyGoal } from '@/types'

interface Props {
  users: User[]
  goals: MonthlyGoal[]
}

export function AdminPanel({ users, goals }: Props) {
  const [pending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState<'users' | 'contacts' | 'goals' | 'rates'>('users')

  // ── Criar usuário ─────────────────────────────────────────
  const [showNewUser, setShowNewUser] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'seller' | 'logistics'>('seller')
  const [newPassword, setNewPassword] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState(false)

  const COLORS = ['#185FA5','#065F46','#92400E','#7F1D1D','#3C3489','#712B13','#444441']

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    setCreateSuccess(false)
    startTransition(async () => {
      const color = COLORS[users.length % COLORS.length]
      const res = await createUserAdmin({
        name: newName,
        email: newEmail,
        password: newPassword,
        role: newRole,
        avatar_color: color,
      })
      if (res.error) { setCreateError(res.error); return }
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
          { key: 'rates',    label: 'Taxas' },
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
                    <option value="logistics">Logística</option>
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
      {/* ── ABA: TAXAS ─────────────────────────────────────── */}
      {activeTab === 'rates' && <PaymentRatesPanel />}
    </div>
  )
}

function UserRow({ user: u }: { user: User }) {
  const { confirm, ConfirmDialog } = useConfirm()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(u.name)
  const [role, setRole] = useState(u.role)
  const [saving, setSaving] = useState(false)

  const [showPwd, setShowPwd] = useState(false)
  const [newPwd, setNewPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwdSaving, setPwdSaving] = useState(false)

  const [deleting, setDeleting] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  async function handleSave() {
    setSaving(true)
    await updateUser(u.id, { name, role })
    setSaving(false)
    setEditing(false)
    window.location.reload()
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    const { uploadUserAvatar } = await import('@/lib/actions')
    const fd = new FormData()
    fd.append('file', file)
    const res = await uploadUserAvatar(u.id, fd)
    setUploadingAvatar(false)
    e.target.value = ''
    if (res.error) { toast.error('OCORREU UM ERRO', res.error); return }
    toast.success('TUDO CERTO!', 'Foto atualizada.')
    window.location.reload()
  }

  async function handleDelete() {
    const ok = await confirm(`Tem certeza que deseja deletar "${u.name}"? Esta ação é irreversível.`, 'Sim, deletar')
    if (!ok) return
    setDeleting(true)
    const res = await deleteUser(u.id)
    setDeleting(false)
    if (res.error) {
      toast.error('OCORREU UM ERRO', `Erro ao deletar: ${res.error}`)
      return
    }
    toast.success('TUDO CERTO!', `${u.name} removido do sistema.`)
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
        <label className="relative shrink-0 cursor-pointer group" title="Alterar foto">
          <Avatar user={u} size={32} />
          <div className="absolute inset-0 rounded-full bg-black/45 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            {uploadingAvatar ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <Camera className="w-3.5 h-3.5 text-white" />}
          </div>
          <input type="file" accept="image/*" onChange={handleAvatarChange} disabled={uploadingAvatar} className="hidden" />
        </label>

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
              <option value="logistics">Logística</option>
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
            <span className={`badge text-xs ${u.role === 'admin' ? 'bg-brand-50 text-brand-500' : u.role === 'logistics' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
              {u.role === 'admin' ? 'Admin' : u.role === 'logistics' ? 'Logística' : 'Vendedor'}
            </span>
            {!u.active && <span className="badge text-xs bg-red-50 text-red-500">Inativo</span>}
            <button onClick={() => { setShowPwd(!showPwd); setPwdMsg(null) }} className="p-1.5 text-gray-300 hover:text-amber-500 hover:bg-amber-50 rounded transition-colors" title="Alterar senha">
              <KeyRound className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setEditing(true)} className="p-1.5 text-gray-300 hover:text-brand-500 hover:bg-brand-50 rounded transition-colors" title="Editar">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={handleDelete} disabled={deleting} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="Deletar usuário">
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
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
      {ConfirmDialog}
    </div>
  )
}

function PaymentRatesPanel() {
  const [rates, setRates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  useEffect(() => {
    getPaymentRates().then(r => { setRates(r.length ? r : DEFAULT_PAYMENT_RATES as any); setLoading(false) })
  }, [])

  const handleSave = async (rate: any, fee: number, maxDisc: number) => {
    try {
      if (rate.id && !rate.id.startsWith('default')) {
        await updatePaymentRate(rate.id, { machine_fee_pct: fee, max_discount_pct: maxDisc })
      }
      setRates(prev => prev.map(r => r.method_key === rate.method_key ? { ...r, machine_fee_pct: fee, max_discount_pct: maxDisc } : r))
      toast.success('TUDO CERTO!', 'Taxa atualizada.')
    } catch {
      toast.error('ERRO', 'Não foi possível salvar.')
    }
  }

  if (loading) return <div className="card p-4 text-sm text-gray-400">Carregando...</div>

  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-1">Taxas da maquininha</h2>
      <p className="text-xs text-gray-400 mb-4">Edite as taxas e o desconto máximo por forma de pagamento. Clique no valor para editar.</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-border">
            <th className="py-2 pr-4 text-left text-xs font-semibold text-gray-500">Forma</th>
            <th className="py-2 pr-4 text-right text-xs font-semibold text-gray-500">Taxa maq.</th>
            <th className="py-2 text-right text-xs font-semibold text-gray-500">Desc. máximo</th>
          </tr>
        </thead>
        <tbody>
          {rates.map(r => (
            <tr key={r.method_key} className="border-b border-surface-border last:border-0">
              <td className="py-2 pr-4 text-gray-800 font-medium">{r.label}</td>
              <td className="py-2 pr-4 text-right">
                <RateInput value={Number(r.machine_fee_pct)} suffix="%" onSave={v => handleSave(r, v, Number(r.max_discount_pct))} />
              </td>
              <td className="py-2 text-right">
                <RateInput value={Number(r.max_discount_pct)} suffix="%" onSave={v => handleSave(r, Number(r.machine_fee_pct), v)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RateInput({ value, suffix, onSave }: { value: number; suffix: string; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(value))
  if (editing) return (
    <div className="inline-flex items-center gap-1 justify-end">
      <input type="number" step="0.01" min="0" max="100"
        value={val} onChange={e => setVal(e.target.value)}
        className="input w-20 text-xs py-0.5 text-right" autoFocus />
      <button onClick={() => { onSave(parseFloat(val) || 0); setEditing(false) }} className="btn-primary text-xs py-0.5 px-2">OK</button>
    </div>
  )
  return (
    <button onClick={() => { setVal(String(value)); setEditing(true) }}
      className="text-sm font-semibold text-brand-600 hover:underline tabular-nums">
      {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}{suffix}
    </button>
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
