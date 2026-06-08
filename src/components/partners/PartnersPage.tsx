'use client'

import { useState, useTransition } from 'react'
import { createContact, deleteContact, searchContacts } from '@/lib/actions'
import { Search, Plus, Trash2, X, User2, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const TYPE_LABEL: Record<string, string> = {
  architect: 'Arquiteto', designer: 'Designer',
  engineer: 'Engenheiro', client: 'Cliente', other: 'Outro',
}
const TYPE_COLOR: Record<string, string> = {
  architect: 'bg-blue-50 text-blue-700',
  designer:  'bg-purple-50 text-purple-700',
  engineer:  'bg-amber-50 text-amber-700',
  client:    'bg-green-50 text-green-700',
  other:     'bg-gray-100 text-gray-600',
}

export function PartnersPage({ initialContacts }: { initialContacts: any[] }) {
  const [pending, startTransition] = useTransition()
  const [contacts, setContacts] = useState(initialContacts)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Form state
  const [name, setName]       = useState('')
  const [phone, setPhone]     = useState('')
  const [email, setEmail]     = useState('')
  const [type, setType]       = useState('architect')
  const [company, setCompany] = useState('')

  const filtered = contacts.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone ?? '').includes(search) || (c.company ?? '').toLowerCase().includes(search.toLowerCase())
    const matchType = filterType === 'all' || c.type === filterType
    return matchSearch && matchType
  })

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    startTransition(async () => {
      const res = await createContact({ name: name.trim(), phone: phone || undefined, email: email || undefined, type, company: company || undefined })
      if (res.error) { setMsg({ type: 'err', text: res.error }); return }
      setContacts(prev => [...prev, res.data].sort((a,b) => a.name.localeCompare(b.name)))
      setMsg({ type: 'ok', text: `${name} adicionado(a) com sucesso!` })
      setName(''); setPhone(''); setEmail(''); setCompany(''); setShowForm(false)
      setTimeout(() => setMsg(null), 3000)
    })
  }

  async function handleDelete(id: string, contactName: string) {
    if (!confirm(`Excluir "${contactName}"?`)) return
    startTransition(async () => {
      const res = await deleteContact(id)
      if (res.error) { setMsg({ type: 'err', text: res.error }); return }
      setContacts(prev => prev.filter(c => c.id !== id))
    })
  }

  const TYPES = ['all','architect','designer','engineer','client','other']

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Parceiros & Contatos</h1>
          <p className="text-sm text-gray-500 mt-0.5">{contacts.length} contatos cadastrados</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
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
      {showForm && (
        <div className="card p-5 border-brand-200 border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Novo contato</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Nome *</label>
                <input value={name} onChange={e => setName(e.target.value)} required placeholder="Ex: Arq. Mariana Silva" className="input" />
              </div>
              <div>
                <label className="label">Tipo</label>
                <select value={type} onChange={e => setType(e.target.value)} className="select">
                  <option value="architect">Arquiteto</option>
                  <option value="designer">Designer</option>
                  <option value="engineer">Engenheiro</option>
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
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={pending} className="btn-primary">
                Salvar contato
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                Cancelar
              </button>
            </div>
          </form>
        </div>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(c => (
            <div key={c.id} className="card p-4 hover:shadow-md transition-shadow group">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-surface-secondary flex items-center justify-center shrink-0">
                    <span className="text-sm font-semibold text-gray-600">
                      {c.name.split(' ').slice(0,2).map((w: string) => w[0]).join('').toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                    {c.company && (
                      <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                        <Building2 className="w-3 h-3 shrink-0" />{c.company}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(c.id, c.name)}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className={cn('badge text-xs', TYPE_COLOR[c.type] ?? 'bg-gray-100 text-gray-600')}>
                  {TYPE_LABEL[c.type] ?? c.type}
                </span>
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="text-xs text-gray-400 hover:text-brand-500 transition-colors">
                    {c.phone}
                  </a>
                )}
              </div>
              {c.email && (
                <p className="text-xs text-gray-400 mt-1.5 truncate">{c.email}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
