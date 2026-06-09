'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createQuote, searchContacts, createContact } from '@/lib/actions'
import { Loader2, Search, X, Plus } from 'lucide-react'
import type { User } from '@/types'

interface Props {
  currentUserId: string
  users: Pick<User, 'id' | 'name' | 'avatar_color'>[]
}

const TYPE_LABELS: Record<string, string> = {
  client: 'Cliente',
  architect: 'Arquiteto',
  engineer: 'Engenheiro',
  designer: 'Designer',
  electrician: 'Eletricista',
  plasterer: 'Gesseiro',
  carpenter: 'Marceneiro',
  other: 'Outro',
}

function ContactSearch({
  label, required, placeholder, type, onSelect
}: {
  label: string
  required?: boolean
  placeholder: string
  type?: string
  onSelect: (c: any | null) => void
}) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [creating, setCreating] = useState(false)
  const [creatingMode, setCreatingMode] = useState(false)
  const [phone, setPhone] = useState('')
  const [contactType, setContactType] = useState(type ?? 'client')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleSearch(q: string) {
    setSearch(q)
    if (q.length < 2) { setResults([]); setOpen(false); return }
    const r = await searchContacts(q, type)
    setResults(r)
    setOpen(true)
  }

  function enterCreateMode() {
    setCreatingMode(true)
    setOpen(false)
  }

  async function handleCreate() {
    if (!search.trim()) return
    setCreating(true)
    const res = await createContact({
      name: search.trim(),
      phone: phone.trim() || undefined,
      type: contactType
    })
    setCreating(false)
    if (res.data) {
      setSelected(res.data)
      onSelect(res.data)
      setSearch('')
      setPhone('')
      setContactType(type ?? 'client')
      setResults([])
      setCreatingMode(false)
      setOpen(false)
    }
  }

  function cancelCreate() {
    setCreatingMode(false)
    setPhone('')
    setOpen(true)
  }

  function handleSelect(c: any) {
    setSelected(c)
    onSelect(c)
    setSearch('')
    setResults([])
    setOpen(false)
  }

  function handleClear() {
    setSelected(null)
    onSelect(null)
    setSearch('')
  }

  return (
    <div className="card p-4 space-y-2">
      <h2 className="text-sm font-semibold text-gray-700">
        {label} {required && <span className="text-red-400">*</span>}
        {!required && <span className="text-gray-400 font-normal"> (opcional)</span>}
      </h2>

      {creatingMode ? (
        <div className="space-y-2 bg-brand-50 border border-brand-200 rounded-lg p-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Nome</label>
            <input type="text" disabled value={search.trim()}
              className="input mt-1 opacity-70 cursor-not-allowed" />
          </div>
          {type && (
            <div>
              <label className="text-xs font-medium text-gray-600">Tipo</label>
              <select value={contactType} onChange={e => setContactType(e.target.value)} className="input mt-1">
                <option value="architect">Arquiteto</option>
                <option value="engineer">Engenheiro</option>
                <option value="designer">Designer</option>
                <option value="electrician">Eletricista</option>
                <option value="plasterer">Gesseiro</option>
                <option value="carpenter">Marceneiro</option>
                <option value="other">Outro</option>
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600">Telefone <span className="text-gray-400">(opcional)</span></label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="(11) 99999-9999" className="input mt-1" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={cancelCreate}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="button" onClick={handleCreate} disabled={creating}
              className="flex-1 px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {creating && <Loader2 className="w-3 h-3 animate-spin" />}
              Criar
            </button>
          </div>
        </div>
      ) : selected ? (
        <div className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">
          <span className="text-sm font-medium flex-1">{selected.name}</span>
          {selected.type && <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">{TYPE_LABELS[selected.type] || selected.type}</span>}
          {selected.phone && <span className="text-xs text-gray-400">{selected.phone}</span>}
          <button type="button" onClick={handleClear}><X className="w-4 h-4 text-gray-400 hover:text-gray-600" /></button>
        </div>
      ) : (
        <div className="relative" ref={ref}>
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => handleSearch(e.target.value)}
            onFocus={() => search.length >= 2 && setOpen(true)}
            placeholder={placeholder}
            className="input pl-9"
          />
          {open && (search.length >= 2) && (
            <div className="absolute top-full left-0 right-0 bg-white border border-surface-border rounded-lg shadow-lg z-20 mt-1 max-h-52 overflow-y-auto">
              {results.map(c => (
                <button key={c.id} type="button" onClick={() => handleSelect(c)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-surface flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1">
                    <span>{c.name}</span>
                    {c.type && <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{TYPE_LABELS[c.type] || c.type}</span>}
                  </div>
                  {c.phone && <span className="text-xs text-gray-400">{c.phone}</span>}
                </button>
              ))}
              <button type="button" onClick={enterCreateMode}
                className="w-full text-left px-3 py-2 text-sm text-brand-600 hover:bg-brand-50 flex items-center gap-2 border-t border-surface-border">
                <Plus className="w-3.5 h-3.5" />
                Criar "{search.trim()}"
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function NewQuoteForm({ currentUserId, users }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selectedClient, setSelectedClient] = useState<any>(null)
  const [selectedArch, setSelectedArch] = useState<any>(null)
  const [primaryOwner, setPrimaryOwner] = useState<string | null>(currentUserId)
  const [collaborators, setCollaborators] = useState<string[]>([])

  function toggleCollaborator(uid: string) {
    setCollaborators(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid])
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    if (!selectedClient) { setError('Selecione ou crie um cliente'); return }

    startTransition(async () => {
      const result = await createQuote({
        client_id:        selectedClient.id,
        architect_id:     selectedArch?.id,
        origin:           fd.get('origin') as string,
        category:         fd.get('category') as string,
        size:             fd.get('size') as string || undefined,
        work_stage:       fd.get('work_stage') as string || undefined,
        priority:         fd.get('priority') as string,
        deadline:         fd.get('deadline') as string || undefined,
        quote_date:       fd.get('quote_date') as string || undefined,
        quoted_value:     fd.get('quoted_value') ? Number(fd.get('quoted_value')) : undefined,
        notes:            fd.get('notes') as string || undefined,
        drive_link:       fd.get('drive_link') as string || undefined,
        primary_owner_id: primaryOwner ?? undefined,
        collaborator_ids: collaborators,
      })
      if (result.error) { setError(result.error); return }
      window.location.href = '/quotes'
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      <ContactSearch label="Cliente" required placeholder="Buscar ou criar cliente..." onSelect={setSelectedClient} />
      <ContactSearch label="Parceiro" placeholder="Buscar ou criar parceiro..." type="architect" onSelect={setSelectedArch} />

      {/* Detalhes */}
      <div className="card p-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Detalhes</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Origem *</label>
            <select name="origin" required className="select">
              <option value="store">Loja</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="visit">Visita</option>
              <option value="referral">Indicação</option>
              <option value="other">Outro</option>
            </select>
          </div>
          <div>
            <label className="label">Categoria *</label>
            <select name="category" required className="select">
              <option value="lighting">Iluminação</option>
              <option value="automation">Automação</option>
              <option value="both">Iluminação + Automação</option>
            </select>
          </div>
          <div>
            <label className="label">Tamanho</label>
            <select name="size" className="select">
              <option value="">— selecione —</option>
              <option value="small">Pequeno</option>
              <option value="medium">Médio</option>
              <option value="large">Grande</option>
            </select>
          </div>
          <div>
            <label className="label">Etapa da obra</label>
            <select name="work_stage" className="select">
              <option value="">— selecione —</option>
              <option value="project">Projeto</option>
              <option value="execution">Em execução</option>
              <option value="finishing">Acabamento</option>
              <option value="delivered">Entregue</option>
            </select>
          </div>
          <div>
            <label className="label">Prioridade</label>
            <select name="priority" className="select" defaultValue="normal">
              <option value="normal">Normal</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>
          </div>
          <div>
            <label className="label">Prazo</label>
            <input type="date" name="deadline" className="input" />
          </div>
          <div>
            <label className="label">Data do orçamento</label>
            <input type="date" name="quote_date" className="input"
              defaultValue={new Date().toISOString().split('T')[0]} />
          </div>
        </div>
        <div>
          <label className="label">Valor orçado (R$)</label>
          <input type="number" name="quoted_value" step="0.01" min="0" placeholder="Ex: 12500" className="input" />
        </div>
        <div>
          <label className="label">Observações</label>
          <textarea name="notes" rows={2} className="input resize-none" placeholder="..." />
        </div>
      </div>

      {/* Pasta Google Drive */}
      <div className="card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <label className="label">Pasta Google Drive <span className="text-gray-400 font-normal">(opcional)</span></label>
          <a href="https://drive.google.com/drive/folders/1RXRcW9DGvYGqee2IpbVwT_yxQupUZ9WY" target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:text-blue-700 hover:underline">
            ainda não criou a pasta? Crie agora!
          </a>
        </div>
        <input type="url" name="drive_link" placeholder="https://drive.google.com/drive/folders/..."
          className="input" />
      </div>

      {/* Responsáveis */}
      <div className="card p-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Responsáveis</h2>

        <div>
          <label className="label">Responsável primário <span className="text-gray-400 font-normal">(opcional)</span></label>
          <div className="flex flex-wrap gap-2 mt-1">
            <button type="button" onClick={() => setPrimaryOwner(null)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                primaryOwner === null ? 'bg-gray-500 text-white border-gray-500' : 'bg-white text-gray-500 border-surface-border hover:border-gray-400'
              }`}>
              Nenhum
            </button>
            {users.map(u => (
              <button key={u.id} type="button"
                onClick={() => { setPrimaryOwner(u.id); setCollaborators(prev => prev.filter(id => id !== u.id)) }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-all ${
                  primaryOwner === u.id ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-surface-border hover:border-brand-300'
                }`}>
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                  style={{ backgroundColor: u.avatar_color }}>{u.name[0]}</div>
                {u.name.split(' ')[0]}
                {u.id === currentUserId && <span className="text-[10px] opacity-70">(você)</span>}
              </button>
            ))}
          </div>
        </div>

        {primaryOwner && (
          <div>
            <label className="label">Colaboradores <span className="text-gray-400 font-normal">(opcional)</span></label>
            <div className="flex flex-wrap gap-2 mt-1">
              {users.filter(u => u.id !== primaryOwner).map(u => (
                <button key={u.id} type="button" onClick={() => toggleCollaborator(u.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-all ${
                    collaborators.includes(u.id) ? 'bg-gray-600 text-white border-gray-600' : 'bg-white text-gray-600 border-surface-border hover:border-gray-400'
                  }`}>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                    style={{ backgroundColor: u.avatar_color }}>{u.name[0]}</div>
                  {u.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">{error}</p>}

      <div className="flex gap-3">
        <button type="button" onClick={() => router.back()} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={pending} className="btn-primary flex-1 justify-center">
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {pending ? 'Salvando...' : 'Salvar orçamento'}
        </button>
      </div>
    </form>
  )
}
