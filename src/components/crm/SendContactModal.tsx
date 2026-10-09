'use client'

import { useEffect, useState } from 'react'
import { searchContactsForCrm, sendContactCards } from '@/lib/crm-actions'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { prettyPhone } from '@/lib/crm-contact-card'
import { Check, Loader2, Search, Send, X } from 'lucide-react'

interface Found { id: string; name: string; phone: string | null; type: string; company: string | null }

// Envia contatos cadastrados no sistema como cartão de contato do WhatsApp (até 5 de uma vez).
export function SendContactModal({ conversationId, onClose, onSent }: { conversationId: string; onClose: () => void; onSent: () => void }) {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Found[]>([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState<Found[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setResults([]); setSearching(false); return }
    setSearching(true)
    let alive = true
    const t = setTimeout(() => {
      searchContactsForCrm(term).then((r) => { if (alive) { setResults(r as Found[]); setSearching(false) } })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [q])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggle = (c: Found) => setPicked((p) => (p.some((x) => x.id === c.id) ? p.filter((x) => x.id !== c.id) : p.length >= 5 ? p : [...p, c]))

  async function send() {
    if (!picked.length || busy) return
    setBusy(true)
    const r = await sendContactCards(conversationId, picked.map((c) => c.id))
    setBusy(false)
    if ('error' in r && r.error) { toast.error('NÃO FOI POSSÍVEL ENVIAR', r.error); return }
    toast.success('CONTATO ENVIADO', picked.map((c) => c.name).join(', '))
    onSent()
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Enviar contato" className="bg-white rounded-xl w-full max-w-md mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div>
            <h3 className="font-bold text-gray-900">Enviar contato</h3>
            <p className="text-xs text-gray-500 mt-0.5">Escolha contatos do sistema; o cliente recebe o cartão de contato no WhatsApp.</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 pb-3 relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-8 top-1/2 -translate-y-[60%]" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-100 rounded-full outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>

        {picked.length > 0 && (
          <div className="px-5 pb-2 flex flex-wrap gap-1.5">
            {picked.map((c) => (
              <button key={c.id} onClick={() => toggle(c)} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-medium" title="Tirar da seleção">
                {c.name} <X className="w-3 h-3" />
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2 pb-2 border-t border-gray-100 min-h-[120px]">
          {searching && <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto my-6" />}
          {!searching && q.trim().length >= 2 && results.length === 0 && <p className="text-sm text-gray-500 text-center py-6">Nenhum contato encontrado.</p>}
          {!searching && q.trim().length < 2 && <p className="text-sm text-gray-400 text-center py-6">Digite ao menos 2 letras.</p>}
          {results.map((c) => {
            const on = picked.some((x) => x.id === c.id)
            const noPhone = !c.phone || c.phone.replace(/\D/g, '').length < 8
            return (
              <button
                key={c.id}
                disabled={noPhone}
                onClick={() => toggle(c)}
                className={cn('w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg', on ? 'bg-emerald-50' : 'hover:bg-gray-50', noPhone && 'opacity-50 cursor-not-allowed')}
              >
                <span className={cn('w-5 h-5 shrink-0 rounded-full border flex items-center justify-center', on ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300')}>
                  {on && <Check className="w-3 h-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-900 truncate">{c.name}</span>
                  <span className="block text-xs text-gray-500 truncate">{noPhone ? 'Sem telefone cadastrado' : prettyPhone(`+${(c.phone ?? '').replace(/\D/g, '').replace(/^(?!55)(\d{10,11})$/, '55$1')}`)}{c.company ? ` · ${c.company}` : ''}</span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="p-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-500">{picked.length ? `${picked.length} selecionado${picked.length > 1 ? 's' : ''} (máx. 5)` : 'Nenhum selecionado'}</span>
          <button
            onClick={send}
            disabled={!picked.length || busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar
          </button>
        </div>
      </div>
    </div>
  )
}
