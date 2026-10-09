'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { getMyFollowups, type MyFollowup } from '@/lib/crm-actions'
import { dueState, formatDue } from '@/lib/crm-followup'
import { DUE_STYLE } from './FollowupPopover'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { CalendarClock } from 'lucide-react'

const SEEN_KEY = 'crm-followup-notified'

function readSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')) } catch { return new Set() }
}
function writeSeen(s: Set<string>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(s).slice(-200))) } catch { /* ignore */ }
}

// "Meus follow-ups": sino com a lista e aviso (toast) quando algum vence com a tela aberta.
export function FollowupNotifier() {
  const toast = useToast()
  const [items, setItems] = useState<MyFollowup[]>([])
  const [open, setOpen] = useState(false)
  const first = useRef(true)
  const ref = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const list = await getMyFollowups()
    setItems(list)
    const seen = readSeen()
    const now = Date.now()
    const due = list.filter((f) => new Date(f.due_at).getTime() <= now && !seen.has(`${f.id}|${f.due_at}`))
    if (due.length) {
      if (first.current && due.length > 1) {
        toast.info('FOLLOW-UPS VENCIDOS', `Você tem ${due.length} follow-ups para fazer. Veja no ícone do relógio.`)
      } else {
        for (const f of due.slice(0, 3)) toast.info('HORA DO FOLLOW-UP', `${f.contact_name}${f.note ? ` — ${f.note.slice(0, 80)}` : ''}`)
      }
      due.forEach((f) => seen.add(`${f.id}|${f.due_at}`))
      writeSeen(seen)
    }
    first.current = false
  }, [toast])

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const overdue = items.filter((f) => dueState(f.due_at) === 'overdue').length
  const today = items.filter((f) => dueState(f.due_at) === 'today').length

  return (
    <div ref={ref} className="relative ml-auto self-center">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); if (!open) load() }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Meus follow-ups: ${items.length}`}
        className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border', overdue ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50')}
      >
        <CalendarClock className="w-4 h-4" />
        Follow-ups
        {items.length > 0 && <span className={cn('text-xs rounded-full px-1.5 py-0.5', overdue ? 'bg-red-600 text-white' : today ? 'bg-amber-200 text-amber-900' : 'bg-gray-200 text-gray-700')}>{items.length}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Meus follow-ups" className="absolute right-0 z-40 mt-1 w-[24rem] max-w-[92vw] bg-white border border-gray-200 rounded-xl shadow-xl p-2 max-h-[70vh] overflow-y-auto">
          {items.length === 0 && <p className="p-3 text-sm text-gray-500">Nenhum follow-up pendente. 🎉</p>}
          <ul className="space-y-1.5">
            {items.map((f) => {
              const st = dueState(f.due_at)
              return (
                <li key={f.id}>
                  <Link href={`/crm/conversas?c=${f.conversation_id}`} onClick={() => setOpen(false)} className={cn('block rounded-lg border p-2.5 text-sm hover:brightness-95', DUE_STYLE[st])}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold truncate">{f.contact_name}</span>
                      <span className="text-xs shrink-0">{st === 'overdue' ? 'Atrasado · ' : ''}{formatDue(f.due_at)}</span>
                    </div>
                    {f.note && <p className="mt-1 text-gray-800 line-clamp-2 whitespace-pre-wrap">{f.note}</p>}
                    <p className="mt-1 text-[11px] text-gray-500">{f.instance_label}</p>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
