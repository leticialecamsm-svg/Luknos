'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Search, Loader2, Phone, Forward, MessageSquarePlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { ConvAvatar } from './ConvAvatar'
import { prettyPhone } from '@/lib/crm-contact-card'
import { startCrmConversation, forwardCrmMessage, searchContactsForCrm } from '@/lib/crm-actions'

interface InstanceOpt { id: string; label: string }
interface ContactHit { id: string; name: string; phone: string | null; type?: string; company?: string | null }

// ── Nova conversa: por número digitado ou buscando nos contatos do sistema ──
export function NewConversationModal({ instances, defaultInstanceId, onClose, onStarted }: {
  instances: InstanceOpt[]
  defaultInstanceId: string | null
  onClose: () => void
  onStarted: (conversationId: string) => void
}) {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [instanceId, setInstanceId] = useState(defaultInstanceId ?? instances[0]?.id ?? '')
  const [results, setResults] = useState<ContactHit[]>([])
  const [busy, setBusy] = useState(false)

  const digits = q.replace(/\D/g, '')
  const looksLikeNumber = digits.length >= 8 && /^[\d\s()+-]+$/.test(q.trim())

  useEffect(() => {
    if (!q.trim()) { setResults([]); return }
    const t = setTimeout(() => { searchContactsForCrm(q).then((r) => setResults(r as ContactHit[])) }, 250)
    return () => clearTimeout(t)
  }, [q])

  async function start(phone: string, contactId?: string | null) {
    if (!instanceId) { toast.error('ESCOLHA O WHATSAPP'); return }
    setBusy(true)
    const r = await startCrmConversation({ phone, instanceId, contactId: contactId ?? null })
    setBusy(false)
    if ('error' in r && r.error) { toast.error('NÃO FOI POSSÍVEL', r.error); return }
    if ('conversationId' in r && r.conversationId) onStarted(r.conversationId)
  }

  return (
    <Overlay onClose={onClose} title="Nova conversa" icon={<MessageSquarePlus className="w-5 h-5 text-emerald-600" />}>
      {instances.length > 1 && (
        <label className="block mb-3 text-sm">
          <span className="text-gray-500">Enviar pelo WhatsApp</span>
          <select value={instanceId} onChange={(e) => setInstanceId(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
            {instances.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
          </select>
        </label>
      )}
      <div className="relative mb-3">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nome do contato ou número (DDD + número)"
          className="w-full pl-9 pr-3 py-2.5 text-sm bg-gray-100 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
      </div>
      <div className="max-h-80 overflow-y-auto -mx-1 px-1">
        {looksLikeNumber && (
          <button disabled={busy} onClick={() => start(q)} className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-gray-50 text-left">
            <span className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0"><Phone className="w-5 h-5" /></span>
            <span className="min-w-0">
              <span className="block font-medium text-gray-900">Iniciar conversa</span>
              <span className="block text-xs text-gray-500">{prettyPhone('55' + digits.replace(/^55/, '')) || q}</span>
            </span>
            {busy && <Loader2 className="w-4 h-4 animate-spin text-gray-400 ml-auto" />}
          </button>
        )}
        {results.map((c) => (
          <button key={c.id} disabled={busy || !c.phone} onClick={() => c.phone && start(c.phone, c.id)} className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-gray-50 text-left disabled:opacity-50">
            <ConvAvatar id={c.id} name={c.name} photo={null} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-gray-900 truncate">{c.name}</span>
              <span className="block text-xs text-gray-500 truncate">{c.phone ? prettyPhone(c.phone) : 'sem telefone'}{c.company ? ` · ${c.company}` : ''}</span>
            </span>
          </button>
        ))}
        {q.trim() && !looksLikeNumber && results.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">Nenhum contato encontrado. Digite o número com DDD para iniciar.</p>
        )}
        {!q.trim() && <p className="text-sm text-gray-400 text-center py-6">Busque pelo nome ou digite o número do contato.</p>}
      </div>
    </Overlay>
  )
}

// ── Encaminhar: escolhe conversas existentes e/ou contatos do sistema ──
export interface ForwardConv { id: string; name: string; photo: string | null; isGroup: boolean; instanceLabel: string }

export function ForwardModal({ previewText, conversations, sourceInstanceId, onForward, onClose }: {
  previewText: string
  conversations: ForwardConv[]
  sourceInstanceId: string | null
  onForward: (conversationIds: string[], contacts: { id: string; phone: string }[]) => Promise<void>
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [pickedContacts, setPickedContacts] = useState<Record<string, string>>({}) // contactId -> phone
  const [contactHits, setContactHits] = useState<ContactHit[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!q.trim()) { setContactHits([]); return }
    const t = setTimeout(() => { searchContactsForCrm(q).then((r) => setContactHits((r as ContactHit[]).filter((c) => c.phone))) }, 250)
    return () => clearTimeout(t)
  }, [q])

  const filteredConvs = useMemo(() => {
    const term = q.trim().toLocaleLowerCase('pt-BR')
    if (!term) return conversations.slice(0, 50)
    return conversations.filter((c) => c.name.toLocaleLowerCase('pt-BR').includes(term)).slice(0, 50)
  }, [conversations, q])

  const total = picked.size + Object.keys(pickedContacts).length

  function toggleConv(id: string) {
    setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleContact(c: ContactHit) {
    setPickedContacts((m) => {
      const n = { ...m }
      if (n[c.id]) delete n[c.id]; else n[c.id] = c.phone as string
      return n
    })
  }

  async function confirm() {
    if (!total || busy) return
    setBusy(true)
    await onForward(Array.from(picked), Object.entries(pickedContacts).map(([id, phone]) => ({ id, phone })))
    setBusy(false)
  }

  return (
    <Overlay onClose={onClose} title="Encaminhar" icon={<Forward className="w-5 h-5 text-emerald-600" />}>
      <div className="mb-3 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-600 line-clamp-2">{previewText}</div>
      <div className="relative mb-3">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar conversa ou contato" className="w-full pl-9 pr-3 py-2.5 text-sm bg-gray-100 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-gray-300" />
      </div>
      <div className="max-h-72 overflow-y-auto -mx-1 px-1 space-y-0.5">
        {filteredConvs.map((c) => (
          <button key={c.id} onClick={() => toggleConv(c.id)} className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 text-left">
            <ConvAvatar id={c.id} name={c.name} photo={c.photo} isGroup={c.isGroup} size={38} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-gray-900 truncate">{c.name}</span>
              <span className="block text-[11px] text-gray-400 truncate">{c.instanceLabel}</span>
            </span>
            <Check on={picked.has(c.id)} />
          </button>
        ))}
        {contactHits.filter((c) => !conversations.some((cv) => cv.name === c.name)).map((c) => (
          <button key={'ct-' + c.id} onClick={() => toggleContact(c)} className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 text-left">
            <ConvAvatar id={c.id} name={c.name} photo={null} size={38} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-gray-900 truncate">{c.name}</span>
              <span className="block text-[11px] text-gray-400 truncate">{prettyPhone(c.phone)} · contato do sistema</span>
            </span>
            <Check on={!!pickedContacts[c.id]} />
          </button>
        ))}
        {!filteredConvs.length && !contactHits.length && <p className="text-sm text-gray-400 text-center py-6">Nada encontrado.</p>}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200">Cancelar</button>
        <button disabled={!total || busy} onClick={confirm} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Forward className="w-4 h-4" />} Encaminhar{total ? ` (${total})` : ''}
        </button>
      </div>
      {!sourceInstanceId && Object.keys(pickedContacts).length > 0 && (
        <p className="mt-2 text-[11px] text-amber-700">Contatos novos abrem conversa no mesmo WhatsApp da mensagem.</p>
      )}
    </Overlay>
  )
}

function Check({ on }: { on: boolean }) {
  return (
    <span className={cn('w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center', on ? 'bg-emerald-600 border-emerald-600' : 'border-gray-300')}>
      {on && <svg viewBox="0 0 24 24" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>}
    </span>
  )
}

function Overlay({ children, title, icon, onClose }: { children: React.ReactNode; title: string; icon: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="flex items-center gap-2 font-semibold text-gray-900">{icon}{title}</h3>
          <button onClick={onClose} aria-label="Fechar" className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
