'use client'

// Modal de nova solicitação: título opcional + cliente (typeahead).
// Se o cliente não existir, abre um sub-formulário para criá-lo na hora
// (createContact com type='client') e já seleciona ele.

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Loader2, Search, UserPlus } from 'lucide-react'
import { createSolicitation } from '@/lib/solicitations/actions'
import { searchContacts, createContact } from '@/lib/actions'

export function NewSolicitationButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const [clientId, setClientId] = useState<string | null>(null)
  const [clientLabel, setClientLabel] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [listOpen, setListOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  // Sub-form de criação de contato
  const [showNewContact, setShowNewContact] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [creatingContact, setCreatingContact] = useState(false)

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    let active = true
    searchContacts(query).then(r => { if (active) setResults(r as any[]) })
    return () => { active = false }
  }, [query])

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setListOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  function resetAll() {
    setTitle(''); setClientId(null); setClientLabel(''); setQuery(''); setResults([])
    setListOpen(false); setError(null); setShowNewContact(false)
    setNewName(''); setNewPhone(''); setNewEmail('')
  }

  function close() { setOpen(false); resetAll() }

  async function createNewContact() {
    if (!newName.trim()) { setError('Informe o nome do cliente'); return }
    setError(null); setCreatingContact(true)
    const res = await createContact({
      name: newName.trim(),
      phone: newPhone.trim() || undefined,
      email: newEmail.trim() || undefined,
      type: 'client',
    })
    setCreatingContact(false)
    if ('error' in res && res.error) { setError(res.error); return }
    const c = (res as any).data
    if (c?.id) {
      setClientId(c.id); setClientLabel(c.name)
      setShowNewContact(false); setListOpen(false); setQuery('')
    }
  }

  function openNewContactForm() {
    setShowNewContact(true)
    // Pré-preenche o nome com o que já foi digitado na busca
    setNewName(query.trim())
    setListOpen(false)
  }

  function submit() {
    if (!clientId) { setError('Selecione um cliente'); return }
    setError(null)
    startTransition(async () => {
      const res = await createSolicitation({ clientId, title: title.trim() || null })
      if (!res.ok) { setError(res.error ?? 'Erro ao criar'); return }
      close()
      if (res.solicitationId) router.push(`/solicitacoes/${res.solicitationId}`)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 shadow-sm transition-colors"
      >
        <Plus className="w-4 h-4" /> Nova solicitação
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={close}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-800">Nova solicitação</h2>
              <button type="button" onClick={close} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>

            {/* Título */}
            <div className="mb-3">
              <label className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold block mb-1">Título <span className="text-gray-300 font-normal normal-case">(opcional)</span></label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ex.: Reforma Apê 708 — Iluminação"
                className="input w-full text-sm"
              />
            </div>

            {/* Cliente */}
            <div ref={boxRef} className="relative">
              <label className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold block mb-1">Cliente</label>
              {clientId ? (
                <div className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2 text-sm">
                  <span className="font-medium text-gray-800 flex-1">{clientLabel}</span>
                  <button type="button" onClick={() => { setClientId(null); setClientLabel(''); setQuery('') }} className="text-brand-600 hover:text-brand-800 text-xs">Trocar</button>
                </div>
              ) : showNewContact ? (
                <div className="space-y-2 rounded-lg border border-dashed border-brand-300 bg-brand-50/40 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-700">
                    <UserPlus className="w-3.5 h-3.5" /> Novo contato
                  </div>
                  <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome *" className="input w-full text-sm" autoFocus />
                  <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Telefone (opcional)" className="input w-full text-sm" />
                  <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="E-mail (opcional)" className="input w-full text-sm" />
                  <div className="flex gap-2">
                    <button type="button" onClick={createNewContact} disabled={creatingContact || !newName.trim()} className="btn-primary px-3 py-1 text-xs inline-flex items-center gap-1">
                      {creatingContact ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Salvar contato
                    </button>
                    <button type="button" onClick={() => setShowNewContact(false)} className="btn-secondary px-3 py-1 text-xs">Cancelar</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={query}
                      onChange={e => { setQuery(e.target.value); setListOpen(true) }}
                      onFocus={() => setListOpen(true)}
                      placeholder="Buscar cliente pelo nome…"
                      className="input w-full pl-9 text-sm"
                    />
                  </div>
                  {listOpen && results.length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                      {results.map((c: any) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setClientId(c.id); setClientLabel(c.name); setListOpen(false) }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                        >
                          <span className="font-medium">{c.name}</span>
                          {c.phone && <span className="text-xs text-gray-400 ml-2">{c.phone}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {listOpen && query.length >= 2 && results.length === 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-400 italic mb-1.5">Nenhum contato encontrado.</p>
                      <button
                        type="button"
                        onClick={openNewContactForm}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100"
                      >
                        <UserPlus className="w-3 h-3" /> Criar "{query.trim()}" como novo cliente
                      </button>
                    </div>
                  )}
                  {!listOpen && query.length < 2 && (
                    <button
                      type="button"
                      onClick={openNewContactForm}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium"
                    >
                      <UserPlus className="w-3 h-3" /> Criar novo cliente
                    </button>
                  )}
                </>
              )}
            </div>

            {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

            <div className="flex gap-2 justify-end mt-5">
              <button type="button" onClick={close} className="btn-secondary px-4 py-1.5 text-sm">Cancelar</button>
              <button
                type="button"
                onClick={submit}
                disabled={pending || !clientId}
                className="btn-primary px-4 py-1.5 text-sm inline-flex items-center gap-1.5"
              >
                {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Criar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
