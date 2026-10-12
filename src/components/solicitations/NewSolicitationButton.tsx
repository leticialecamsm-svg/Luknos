'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Loader2, Search } from 'lucide-react'
import { createSolicitation } from '@/lib/solicitations/actions'
import { searchContacts } from '@/lib/actions'

export function NewSolicitationButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [clientId, setClientId] = useState<string | null>(null)
  const [clientLabel, setClientLabel] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [listOpen, setListOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

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

  function reset() {
    setClientId(null); setClientLabel(''); setQuery(''); setResults([])
    setListOpen(false); setError(null)
  }

  function close() { setOpen(false); reset() }

  function submit() {
    if (!clientId) { setError('Selecione um cliente'); return }
    setError(null)
    startTransition(async () => {
      const res = await createSolicitation({ clientId })
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

            <div ref={boxRef} className="relative">
              <label className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold block mb-1">Cliente</label>
              {clientId ? (
                <div className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2 text-sm">
                  <span className="font-medium text-gray-800 flex-1">{clientLabel}</span>
                  <button type="button" onClick={reset} className="text-brand-600 hover:text-brand-800 text-xs">Trocar</button>
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
                      autoFocus
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
                    <p className="text-xs text-gray-400 italic mt-1 px-1">Nenhum contato encontrado.</p>
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
