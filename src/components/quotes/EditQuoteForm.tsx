'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { searchContacts, createContact, updateQuote } from '@/lib/actions'
import { useToast } from '@/components/ui/Toast'
import { Search, X, Plus, Loader2 } from 'lucide-react'

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
  label, required, placeholder, type, initialValue, onSelect
}: {
  label: string
  required?: boolean
  placeholder: string
  type?: string
  initialValue?: { id: string; name: string } | null
  onSelect: (c: any | null) => void
}) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(initialValue ?? null)
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
    setSelected(c); onSelect(c)
    setSearch(''); setResults([]); setOpen(false)
  }

  function handleClear() {
    setSelected(null); onSelect(null); setSearch('')
  }

  return (
    <div className="space-y-2">
      <label className="label">
        {label} {required && <span className="text-red-400">*</span>}
        {!required && <span className="text-gray-400 font-normal"> (opcional)</span>}
      </label>
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
          <button type="button" onClick={handleClear}><X className="w-4 h-4 text-gray-400 hover:text-gray-600" /></button>
        </div>
      ) : (
        <div className="relative" ref={ref}>
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => handleSearch(e.target.value)}
            onFocus={() => search.length >= 2 && setOpen(true)}
            placeholder={placeholder} className="input pl-9" autoFocus={!selected} />
          {open && search.length >= 2 && (
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

export function EditQuoteForm({ quote, users, currentUserId }: any) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [selectedClient, setSelectedClient] = useState<any>({ id: quote.client_id, name: quote.client_name })
  const [selectedArch, setSelectedArch] = useState<any>(
    quote.architect_id ? { id: quote.architect_id, name: quote.architect_name } : null
  )

  const currentPrimary = quote.owners?.find((o: any) => o.role === 'primary')?.user_id ?? null
  const [primaryOwner, setPrimaryOwner] = useState<string | null>(currentPrimary)
  const [collaborators, setCollaborators] = useState<string[]>(
    quote.owners?.filter((o: any) => o.role === 'collaborator').map((o: any) => o.user_id) ?? []
  )

  function toggleCollab(uid: string) {
    setCollaborators(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid])
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)

    startTransition(async () => {
      const res = await updateQuote(quote.id, {
        client_id:        selectedClient?.id,
        architect_id:     selectedArch?.id || null,
        origin:           fd.get('origin') as string,
        category:         fd.get('category') as string,
        size:             fd.get('size') as string || null,
        work_stage:       fd.get('work_stage') as string || null,
        priority:         fd.get('priority') as string,
        deadline:         fd.get('deadline') as string || null,
        quote_date:       fd.get('quote_date') as string || null,
        quoted_value:     fd.get('quoted_value') ? Number(fd.get('quoted_value')) : null,
        notes:            fd.get('notes') as string || null,
        drive_link:       fd.get('drive_link') as string || null,
        primary_owner_id: primaryOwner,
        collaborator_ids: collaborators,
      })
      if (res.error) { setError(res.error); toast.error('OCORREU UM ERRO', 'Não foi possível salvar o orçamento.'); return }
      toast.success('TUDO CERTO!', 'Orçamento atualizado com sucesso.')
      router.push(`/quotes/${quote.id}`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Cliente + Arquiteto */}
      <div className="card p-4 space-y-4">
        <ContactSearch label="Cliente" required placeholder="Buscar ou criar cliente..."
          initialValue={{ id: quote.client_id, name: quote.client_name }}
          onSelect={setSelectedClient} />
        <ContactSearch label="Parceiro" placeholder="Buscar ou criar parceiro..."
          type="architect"
          initialValue={quote.architect_id ? { id: quote.architect_id, name: quote.architect_name } : null}
          onSelect={setSelectedArch} />
      </div>

      {/* Detalhes */}
      <div className="card p-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Detalhes</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { name: 'origin',     label: 'Origem',    def: quote.origin,      opts: [['store','Loja'],['whatsapp','WhatsApp'],['visit','Visita'],['referral','Indicação'],['other','Outro']] },
            { name: 'category',   label: 'Categoria', def: quote.category,    opts: [['lighting','Iluminação'],['automation','Automação'],['both','Ilum. + Auto.']] },
            { name: 'size',       label: 'Tamanho',   def: quote.size ?? '',  opts: [['','— selecione —'],['small','Pequeno'],['medium','Médio'],['large','Grande']] },
            { name: 'work_stage', label: 'Etapa',     def: quote.work_stage ?? '', opts: [['','— selecione —'],['project','Projeto'],['execution','Em execução'],['finishing','Acabamento'],['delivered','Entregue']] },
            { name: 'priority',   label: 'Prioridade',def: quote.priority,    opts: [['normal','Normal'],['high','Alta'],['urgent','Urgente']] },
          ].map(f => (
            <div key={f.name}>
              <label className="label">{f.label}</label>
              <select name={f.name} defaultValue={f.def} className="select">
                {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ))}
          <div>
            <label className="label">Prazo</label>
            <input type="date" name="deadline" defaultValue={quote.deadline ?? ''} className="input" />
          </div>
          <div>
            <label className="label">Data do orçamento</label>
            <input type="date" name="quote_date"
              defaultValue={quote.quote_date ?? quote.created_at?.split('T')[0] ?? ''}
              className="input" />
          </div>
        </div>
        <div>
          <label className="label">Valor orçado (R$)</label>
          <input type="number" name="quoted_value" step="0.01" min="0"
            defaultValue={quote.quoted_value ?? ''} className="input" />
        </div>
        <div>
          <label className="label">Observações</label>
          <textarea name="notes" rows={2} defaultValue={quote.notes ?? ''} className="input resize-none" />
        </div>
      </div>

      {/* Pasta Google Drive */}
      <div className="card p-4 space-y-2">
        <label className="label">Pasta Google Drive <span className="text-gray-400 font-normal">(opcional)</span></label>
        <input type="url" name="drive_link" placeholder="https://drive.google.com/drive/folders/..."
          defaultValue={quote.drive_link ?? ''} className="input" />
        {quote.drive_link && (
          <a href={quote.drive_link} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700 mt-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4c-1.48 0-2.85.43-4.01 1.17l1.46 1.46C10.21 5.23 11.08 5 12 5c3.04 0 5.5 2.46 5.5 5.5v.5H19c2.05 0 3.71 1.66 3.71 3.71 0 1.71-1.04 2.86-2.34 3.24-.01-.1-.04-.21-.04-.32zM3 5.5v13h18V9.5h-1v9H4v-9H3z"/>
            </svg>
            Abrir pasta
          </a>
        )}
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
            {users.map((u: any) => (
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
              {users.filter((u: any) => u.id !== primaryOwner).map((u: any) => (
                <button key={u.id} type="button" onClick={() => toggleCollab(u.id)}
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
          {pending ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>
    </form>
  )
}
