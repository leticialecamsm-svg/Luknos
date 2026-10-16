'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getConversationFollowups, createFollowup, updateFollowup, completeFollowup, deleteFollowup,
  type FollowupItem,
} from '@/lib/crm-actions'
import { dueState, followupPresets, formatDue, fromLocalInput, toLocalInput, FOLLOWUP_NOTE_MAX } from '@/lib/crm-followup'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { CalendarClock, Check, Pencil, Trash2, Loader2, Plus } from 'lucide-react'

interface UserLite { id: string; name: string; role_label?: string }

export const DUE_STYLE: Record<string, string> = {
  overdue: 'text-red-700 bg-red-50 border-red-200',
  today: 'text-amber-800 bg-amber-50 border-amber-200',
  soon: 'text-sky-800 bg-sky-50 border-sky-200',
  later: 'text-gray-700 bg-gray-50 border-gray-200',
}

// Follow-up da conversa: lembrete com data/hora, responsável e o que falar.
export function FollowupPopover({
  conversationId, users, defaultAssigneeId, open, onOpenChange, onChanged,
}: {
  conversationId: string
  users: UserLite[]
  defaultAssigneeId: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onChanged: () => void
}) {
  const toast = useToast()
  const ref = useRef<HTMLDivElement>(null)
  const [items, setItems] = useState<FollowupItem[] | null>(null)
  const [form, setForm] = useState<{ id: string | null; due: string; note: string; assignee: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => { getConversationFollowups(conversationId).then(setItems) }, [conversationId])
  useEffect(() => { if (open) load() }, [open, load])
  useEffect(() => { setForm(null); setItems(null) }, [conversationId])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onOpenChange(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open, onOpenChange])

  const openItems = (items ?? []).filter((i) => i.status !== 'done')
  const doneItems = (items ?? []).filter((i) => i.status === 'done')

  function startNew() {
    const first = followupPresets()[1] // amanhã 9h
    setForm({ id: null, due: toLocalInput(first.date), note: '', assignee: defaultAssigneeId ?? '' })
    setError(null)
  }
  function startEdit(i: FollowupItem) {
    setForm({ id: i.id, due: toLocalInput(new Date(i.due_at)), note: i.note ?? '', assignee: i.assignee?.id ?? '' })
    setError(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form || saving) return
    const d = fromLocalInput(form.due)
    if (!d) { setError('Escolha a data e a hora'); return }
    setSaving(true); setError(null)
    const payload = { dueAt: d.toISOString(), note: form.note, assigneeId: form.assignee || undefined }
    const r = form.id ? await updateFollowup(form.id, payload) : await createFollowup(conversationId, payload)
    setSaving(false)
    if ('error' in r && r.error) { setError(r.error); return }
    toast.success(form.id ? 'FOLLOW-UP ATUALIZADO' : 'FOLLOW-UP AGENDADO')
    setForm(null); load(); onChanged()
  }

  async function done(i: FollowupItem) {
    const r = await completeFollowup(i.id)
    if ('error' in r && r.error) toast.error('ERRO', r.error)
    else { toast.success('FOLLOW-UP CONCLUÍDO'); load(); onChanged() }
  }
  async function remove(i: FollowupItem) {
    if (!window.confirm('Excluir este follow-up?')) return
    const r = await deleteFollowup(i.id)
    if ('error' in r && r.error) toast.error('ERRO', r.error)
    else { load(); onChanged() }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Follow-up"
        title="Agendar follow-up"
        className={cn('px-3 py-2 text-sm rounded-lg transition-colors', open ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100')}
      >
        <CalendarClock className="w-4 h-4" />
      </button>
      {open && (
        <div role="dialog" aria-label="Follow-up" className="absolute right-0 z-40 mt-1 w-[22rem] max-w-[92vw] bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-sm max-h-[75vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-gray-900">Follow-up</h4>
            {!form && <button onClick={startNew} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-900 text-white text-xs font-medium hover:bg-gray-700"><Plus className="w-3.5 h-3.5" /> Agendar</button>}
          </div>

          {form ? (
            <form onSubmit={submit} className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">Quando</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {followupPresets().map((p) => (
                    <button type="button" key={p.id} onClick={() => setForm({ ...form, due: toLocalInput(p.date) })}
                      className="px-2 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-xs">{p.label}</button>
                  ))}
                </div>
                <input type="datetime-local" aria-label="Data e hora do follow-up" value={form.due} onChange={(e) => { setForm({ ...form, due: e.target.value }); setError(null) }}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
              </div>
              <div>
                <label htmlFor="fu-assignee" className="block text-xs text-gray-500 mb-1">Responsável</label>
                <select id="fu-assignee" value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                  <option value="">Atendente da conversa (ou eu)</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.role_label ? ` — ${u.role_label}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="fu-note" className="block text-xs text-gray-500 mb-1">O que falar no follow-up</label>
                <textarea id="fu-note" rows={4} maxLength={FOLLOWUP_NOTE_MAX} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="Ex.: perguntar se conseguiu conferir o orçamento e se tem dúvidas nos modelos."
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y" />
                <p className="text-[11px] text-gray-400 text-right">{form.note.length}/{FOLLOWUP_NOTE_MAX}</p>
              </div>
              {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => { setForm(null); setError(null) }} disabled={saving} className="flex-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-60 inline-flex items-center justify-center gap-1.5">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {form.id ? 'Salvar' : 'Agendar'}
                </button>
              </div>
            </form>
          ) : (
            <>
              {items === null && <Loader2 className="w-4 h-4 animate-spin text-gray-400 mx-auto my-4" />}
              {items && openItems.length === 0 && <p className="text-gray-500 py-2">Nenhum follow-up agendado para esta conversa.</p>}
              <ul className="space-y-2">
                {openItems.map((i) => {
                  const st = dueState(i.due_at)
                  return (
                    <li key={i.id} className={cn('rounded-lg border p-2.5', DUE_STYLE[st])}>
                      <div className="flex items-center gap-2">
                        <CalendarClock className="w-4 h-4 shrink-0" />
                        <span className="font-semibold">{formatDue(i.due_at)}</span>
                        {st === 'overdue' && <span className="text-[11px] font-semibold uppercase">atrasado</span>}
                        <span className="ml-auto flex gap-0.5">
                          <button onClick={() => done(i)} aria-label="Concluir follow-up" title="Concluir" className="p-1 rounded hover:bg-white/70"><Check className="w-4 h-4" /></button>
                          <button onClick={() => startEdit(i)} aria-label="Editar follow-up" title="Editar" className="p-1 rounded hover:bg-white/70"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => remove(i)} aria-label="Excluir follow-up" title="Excluir" className="p-1 rounded hover:bg-white/70"><Trash2 className="w-3.5 h-3.5" /></button>
                        </span>
                      </div>
                      {i.note && <p className="mt-1.5 text-gray-800 whitespace-pre-wrap break-words">{i.note}</p>}
                      {i.assignee && <p className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-600"><Avatar user={i.assignee} size={16} /> {i.assignee.name}</p>}
                    </li>
                  )
                })}
              </ul>
              {doneItems.length > 0 && (
                <div className="mt-3">
                  <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Concluídos recentemente</p>
                  <ul className="space-y-1">
                    {doneItems.map((i) => (
                      <li key={i.id} className="text-xs text-gray-500 flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" /><span className="truncate">{formatDue(i.due_at)}{i.note ? ` — ${i.note}` : ''}</span></li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
