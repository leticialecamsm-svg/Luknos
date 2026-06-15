'use client'

import { useState, useTransition } from 'react'
import { createContact, updateContact, deleteContact } from '@/lib/actions'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/useConfirm'
import { Search, Plus, Trash2, X, User2, Building2, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

const TYPE_LABEL: Record<string, string> = {
  architect: 'Arquiteto',
  engineer: 'Engenheiro',
  designer: 'Designer',
  electrician: 'Eletricista',
  plasterer: 'Gesseiro',
  carpenter: 'Marceneiro',
  client: 'Cliente',
  other: 'Outro',
}
const TYPE_COLOR: Record<string, string> = {
  architect: 'bg-blue-50 text-blue-700',
  engineer: 'bg-amber-50 text-amber-700',
  designer: 'bg-purple-50 text-purple-700',
  electrician: 'bg-yellow-50 text-yellow-700',
  plasterer: 'bg-pink-50 text-pink-700',
  carpenter: 'bg-orange-50 text-orange-700',
  client: 'bg-green-50 text-green-700',
  other: 'bg-gray-100 text-gray-600',
}

const TYPES = ['all','architect','engineer','designer','electrician','plasterer','carpenter','client','other']

interface Contact {
  id: string
  name: string
  phone?: string
  email?: string
  type: string
  company?: string
  new_prospection?: boolean
  prospection_date?: string
  created_by?: string
}

function ContactForm({
  initial,
  onSave,
  onCancel,
  pending,
  title,
}: {
  initial: Partial<Contact>
  onSave: (data: Omit<Contact, 'id'>) => void
  onCancel: () => void
  pending: boolean
  title: string
}) {
  const [name, setName]             = useState(initial.name ?? '')
  const [phone, setPhone]           = useState(initial.phone ?? '')
  const [email, setEmail]           = useState(initial.email ?? '')
  const [type, setType]             = useState(initial.type ?? 'architect')
  const [company, setCompany]       = useState(initial.company ?? '')
  const [prospection, setProspection] = useState(initial.new_prospection ?? false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      phone: phone || undefined,
      email: email || undefined,
      type,
      company: company || undefined,
      new_prospection: prospection,
    })
  }

  return (
    <div className="card p-5 border-brand-200 border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Nome *</label>
            <input value={name} onChange={e => setName(e.target.value)} required placeholder="Ex: Arq. Mariana Silva" className="input" />
          </div>
          <div>
            <label className="label">Tipo</label>
            <select value={type} onChange={e => setType(e.target.value)} className="select">
              <option value="architect">Arquiteto</option>
              <option value="engineer">Engenheiro</option>
              <option value="designer">Designer</option>
              <option value="electrician">Eletricista</option>
              <option value="plasterer">Gesseiro</option>
              <option value="carpenter">Marceneiro</option>
              <option value="client">Cliente</option>
              <option value="other">Outro</option>
            </select>
          </div>
          <div>
            <label className="label">Telefone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(82) 99999-9999" className="input" />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" className="input" />
          </div>
          <div className="col-span-2">
            <label className="label">Empresa / Escritório</label>
            <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Nome do escritório (opcional)" className="input" />
          </div>
          <div className="col-span-2">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <button
                type="button"
                onClick={() => setProspection(p => !p)}
                className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0',
                  prospection ? 'bg-brand-500' : 'bg-gray-200'
                )}
              >
                <span className={cn(
                  'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                  prospection ? 'translate-x-4' : 'translate-x-0.5'
                )} />
              </button>
              <span className="text-sm font-medium text-gray-700">Nova prospecção</span>
            </label>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={pending} className="btn-primary">
            Salvar contato
          </button>
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}

export function PartnersPage({ initialContacts }: { initialContacts: any[] }) {
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [pending, startTransition] = useTransition()
  const [contacts, setContacts] = useState<Contact[]>(initialContacts)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const filtered = contacts.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone ?? '').includes(search) || (c.company ?? '').toLowerCase().includes(search.toLowerCase())
    const matchType = filterType === 'all' || c.type === filterType
    return matchSearch && matchType
  })

  function handleCreate(data: Omit<Contact, 'id'>) {
    startTransition(async () => {
      const res = await createContact(data as any)
      if (res.error) { setMsg({ type: 'err', text: res.error }); toast.error('OCORREU UM ERRO', res.error); return }
      setContacts(prev => [...prev, res.data as Contact].sort((a, b) => a.name.localeCompare(b.name)))
      toast.success('TUDO CERTO!', `${data.name} adicionado(a) com sucesso!`)
      setShowForm(false)
    })
  }

  function handleUpdate(id: string, data: Omit<Contact, 'id'>) {
    startTransition(async () => {
      const res = await updateContact(id, data as any)
      if (res.error) { setMsg({ type: 'err', text: res.error }); toast.error('OCORREU UM ERRO', res.error); return }
      setContacts(prev => prev.map(c => c.id === id ? (res.data as Contact) : c).sort((a, b) => a.name.localeCompare(b.name)))
      toast.success('TUDO CERTO!', `${data.name} atualizado(a) com sucesso!`)
      setEditingId(null)
    })
  }

  async function handleDelete(id: string, contactName: string) {
    const ok = await confirm(`Excluir "${contactName}"?`, 'Sim, excluir')
    if (!ok) return
    startTransition(async () => {
      const res = await deleteContact(id)
      if (res.error) { setMsg({ type: 'err', text: res.error }); toast.error('OCORREU UM ERRO', res.error); return }
      toast.success('TUDO CERTO!', `${contactName} excluído(a).`)
      setContacts(prev => prev.filter(c => c.id !== id))
    })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Parceiros & Contatos</h1>
          <p className="text-sm text-gray-500 mt-0.5">{contacts.length} contatos cadastrados</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditingId(null) }} className="btn-primary">
          <Plus className="w-4 h-4" /> Novo contato
        </button>
      </div>

      {/* Feedback */}
      {msg && (
        <div className={cn('px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between',
          msg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600')}>
          {msg.text}
          <button onClick={() => setMsg(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Form novo contato */}
      {showForm && !editingId && (
        <ContactForm
          title="Novo contato"
          initial={{}}
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
          pending={pending}
        />
      )}

      {/* Filtros e busca */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone ou empresa..."
            className="input pl-9"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {TYPES.map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                filterType === t
                  ? 'bg-brand-500 text-white border-brand-500'
                  : 'bg-white text-gray-500 border-surface-border hover:border-gray-300'
              )}
            >
              {t === 'all' ? 'Todos' : TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <User2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">Nenhum contato encontrado</p>
          <p className="text-xs text-gray-400 mt-1">Tente outro termo ou adicione um novo contato</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border bg-surface">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Nome</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Empresa</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Telefone</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Email</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, idx) => (
                  <>
                    <tr
                      key={c.id}
                      className={cn(
                        'border-b border-surface-border hover:bg-surface transition-colors group',
                        editingId === c.id ? 'bg-surface' : '',
                        idx === filtered.length - 1 && editingId !== c.id ? 'border-0' : ''
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-surface-secondary flex items-center justify-center shrink-0">
                            <span className="text-xs font-semibold text-gray-600">
                              {c.name.split(' ').slice(0,2).map((w: string) => w[0]).join('').toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{c.name}</p>
                            {c.new_prospection && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full mt-0.5">
                                ✦ Nova prospecção
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-block badge text-xs', TYPE_COLOR[c.type] ?? 'bg-gray-100 text-gray-600')}>
                          {TYPE_LABEL[c.type] ?? c.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {c.company ? (
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <Building2 className="w-3 h-3 shrink-0" />
                            <span>{c.company}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {c.phone ? (
                          <a href={`tel:${c.phone}`} className="text-sm text-brand-600 hover:text-brand-700 transition-colors">
                            {c.phone}
                          </a>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {c.email ? (
                          <a href={`mailto:${c.email}`} className="text-sm text-brand-600 hover:text-brand-700 transition-colors">
                            {c.email}
                          </a>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={() => { setEditingId(editingId === c.id ? null : c.id); setShowForm(false) }}
                            className="text-gray-300 hover:text-brand-500 transition-colors"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(c.id, c.name)}
                            className="text-gray-300 hover:text-red-500 transition-colors"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {editingId === c.id && (
                      <tr key={`edit-${c.id}`} className={cn('border-b border-surface-border', idx === filtered.length - 1 ? 'border-0' : '')}>
                        <td colSpan={6} className="px-4 py-3">
                          <ContactForm
                            title="Editar contato"
                            initial={c}
                            onSave={(data) => handleUpdate(c.id, data)}
                            onCancel={() => setEditingId(null)}
                            pending={pending}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {ConfirmDialog}
    </div>
  )
}
