'use client'

// "Contatos e conversas" de uma etapa: vincula pessoas do cadastro e conversas
// do CRM a qualquer etapa da solicitação (ex.: o eletricista na Instalação, a
// conversa do arquiteto no Projeto). A conversa abre direto no CRM.

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Link2, MessageCircle, Plus, Search, User, X, Loader2 } from 'lucide-react'
import { cn, formatRelativeWithTime } from '@/lib/utils'
import {
  addStageLink, removeStageLink, searchStageLinkTargets, getCrmConversationsForClient,
  type CrmConversationOption, type StageLink,
} from '@/lib/solicitations/actions'

type Targets = Awaited<ReturnType<typeof searchStageLinkTargets>>

export function StageLinks({
  solicitationId, stage, stageLabel, clientId, links,
}: { solicitationId: string; stage: string; stageLabel: string; clientId: string; links: StageLink[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [targets, setTargets] = useState<Targets>({ contacts: [], conversations: [] })
  const [suggested, setSuggested] = useState<CrmConversationOption[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  const linked = new Set(links.map(l => `${l.kind}:${l.refId}`))

  useEffect(() => {
    if (!open || suggested !== null) return
    getCrmConversationsForClient(clientId).then(setSuggested).catch(() => setSuggested([]))
  }, [open, suggested, clientId])

  useEffect(() => {
    if (query.trim().length < 2) { setTargets({ contacts: [], conversations: [] }); return }
    let alive = true
    setSearching(true)
    const t = setTimeout(() => {
      searchStageLinkTargets(query).then(r => { if (alive) setTargets(r) }).finally(() => { if (alive) setSearching(false) })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [query])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  function add(kind: 'contact' | 'conversation', refId: string) {
    setError(null)
    startTransition(async () => {
      const res = await addStageLink(solicitationId, stage, kind, refId)
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }
  function remove(id: string) {
    startTransition(async () => {
      await removeStageLink(id, solicitationId)
      router.refresh()
    })
  }

  const suggestions = (suggested ?? []).filter(c => !linked.has(`conversation:${c.id}`))
  const contacts = targets.contacts.filter(c => !linked.has(`contact:${c.id}`))
  const conversations = targets.conversations.filter(c => !linked.has(`conversation:${c.id}`))

  return (
    <div ref={boxRef} className="relative flex items-center gap-1.5 flex-wrap min-w-0">
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        <Link2 className="w-3 h-3" /> Contatos e conversas
      </span>

      {links.map(l => {
        const body = (
          <>
            {l.kind === 'conversation' ? <MessageCircle className="w-3 h-3 text-emerald-600 shrink-0" /> : <User className="w-3 h-3 text-gray-500 shrink-0" />}
            <span className="truncate max-w-[140px] font-medium">{l.label}</span>
            {l.sublabel && <span className="text-gray-400 truncate max-w-[110px]">· {l.sublabel}</span>}
          </>
        )
        return (
          <span key={l.id} className="group inline-flex items-center gap-1 rounded-full border border-surface-border bg-white pl-2 pr-1 py-0.5 text-[11px] text-gray-700">
            {l.href ? (
              <Link href={l.href} className="inline-flex items-center gap-1 min-w-0 hover:text-brand-700" title="Abrir a conversa no CRM">{body}</Link>
            ) : (
              <span className="inline-flex items-center gap-1 min-w-0" title={l.phone ?? undefined}>{body}</span>
            )}
            <button
              type="button"
              onClick={() => remove(l.id)}
              disabled={pending}
              aria-label={`Remover ${l.label}`}
              className="w-4 h-4 rounded-full flex items-center justify-center text-gray-300 hover:text-red-600 hover:bg-red-50"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )
      })}

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={`Vincular contato ou conversa — ${stageLabel}`}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] transition-colors',
          open ? 'border-brand-400 text-brand-700' : 'border-gray-300 text-gray-500 hover:text-brand-700 hover:border-brand-400',
        )}
      >
        <Plus className="w-3 h-3" /> Vincular
      </button>

      {open && (
        <div className="absolute z-30 left-0 top-full mt-2 w-80 rounded-xl border border-surface-border bg-white shadow-xl">
          <div className="relative border-b border-gray-100">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar contato ou conversa…"
              className="w-full pl-8 pr-3 py-2.5 text-sm bg-transparent focus:outline-none"
            />
            {searching && <Loader2 className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-300" />}
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {query.trim().length < 2 && (
              <>
                <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Conversas do cliente</p>
                {suggested === null && <p className="px-3 py-2 text-xs text-gray-400">Carregando…</p>}
                {suggested !== null && suggestions.length === 0 && (
                  <p className="px-3 py-2 text-xs text-gray-400">Nenhuma conversa do cliente para vincular. Digite para buscar.</p>
                )}
                {suggestions.map(c => (
                  <button key={c.id} type="button" disabled={pending} onClick={() => add('conversation', c.id)}
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-start gap-2">
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm text-gray-800 truncate">{c.instanceLabel}{c.phone ? ` · ${c.phone}` : ''}</span>
                      <span className="block text-[11px] text-gray-400 truncate">
                        {c.lastAt ? formatRelativeWithTime(c.lastAt) : 'sem mensagens'}{c.lastBody ? ` — ${c.lastBody}` : ''}
                      </span>
                    </span>
                  </button>
                ))}
              </>
            )}

            {query.trim().length >= 2 && (
              <>
                {contacts.length > 0 && <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Contatos</p>}
                {contacts.map(c => (
                  <button key={c.id} type="button" disabled={pending} onClick={() => add('contact', c.id)}
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                    <span className="text-sm text-gray-800 truncate">{c.name}</span>
                    {c.phone && <span className="ml-auto text-[11px] text-gray-400 shrink-0">{c.phone}</span>}
                  </button>
                ))}
                {conversations.length > 0 && <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Conversas do CRM</p>}
                {conversations.map(c => (
                  <button key={c.id} type="button" disabled={pending} onClick={() => add('conversation', c.id)}
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center gap-2">
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="text-sm text-gray-800 truncate">{c.label}</span>
                    {c.sublabel && <span className="ml-auto text-[11px] text-gray-400 shrink-0 truncate max-w-[110px]">{c.sublabel}</span>}
                  </button>
                ))}
                {!searching && contacts.length === 0 && conversations.length === 0 && (
                  <p className="px-3 py-3 text-xs text-gray-400">Nada encontrado para “{query.trim()}”.</p>
                )}
              </>
            )}
          </div>
          {error && <p className="px-3 py-2 text-xs text-red-600 border-t border-gray-100">{error}</p>}
        </div>
      )}
    </div>
  )
}
