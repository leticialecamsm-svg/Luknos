'use client'

import { useEffect, useRef, useState } from 'react'
import { History, Loader2, X, Bot } from 'lucide-react'
import { getConversationHistory, type ConversationHistoryItem } from '@/lib/crm-actions'
import { Avatar } from '@/components/ui/Avatar'
import { useFocusTrap } from '@/components/ui/useFocusTrap'

const dayFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
const dayKey = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10)

// Histórico de ocorrências da conversa: consultor, etapa, valor, etiquetas, acesso, follow-ups, solicitações.
export function ConversationHistory({ conversationId, title, onClose }: { conversationId: string; title: string; onClose: () => void }) {
  const [data, setData] = useState<{ items: ConversationHistoryItem[] } | { error: string } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, onClose, true)
  useEffect(() => { getConversationHistory(conversationId).then(setData) }, [conversationId])

  const items = data && 'items' in data ? data.items : []
  const groups: { day: string; label: string; items: ConversationHistoryItem[] }[] = []
  for (const it of items) {
    const k = dayKey(it.at)
    const g = groups[groups.length - 1]
    if (g && g.day === k) g.items.push(it)
    else groups.push({ day: k, label: dayFmt.format(new Date(it.at)), items: [it] })
  }

  return (
    <div className="fixed inset-0 modal-backdrop z-50 flex justify-end" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={`Histórico de ${title}`} className="bg-white w-full max-w-md h-full flex flex-col shadow-xl">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
          <History className="w-4 h-4 text-gray-500" />
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-gray-900 leading-5">Histórico</h3>
            <p className="text-xs text-gray-500 truncate">{title}</p>
          </div>
          <button onClick={onClose} aria-label="Fechar histórico" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {data === null && <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto my-10" />}
          {data && 'error' in data && <p role="alert" className="text-sm text-red-600">{data.error}</p>}
          {data && 'items' in data && items.length === 0 && <p className="text-sm text-gray-500 text-center my-10">Nada registrado ainda.</p>}
          {groups.map((g) => (
            <section key={g.day} className="mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2 first-letter:uppercase">{g.label}</p>
              <ol className="relative border-l border-gray-200 ml-2.5 space-y-3">
                {g.items.map((it) => (
                  <li key={it.id} className="pl-5 relative">
                    <span className="absolute -left-[11px] top-0.5 bg-white">
                      {it.actor ? <Avatar user={it.actor} size={20} /> : <span className="w-5 h-5 rounded-full bg-gray-100 inline-flex items-center justify-center"><Bot className="w-3 h-3 text-gray-400" /></span>}
                    </span>
                    <p className="text-sm text-gray-800 leading-5">{it.text}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {timeFmt.format(new Date(it.at))} · {it.actor ? it.actor.name : it.kind === 'note' ? 'registro na conversa' : 'automático'}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
