'use client'

import { useEffect, useRef, useState } from 'react'
import { createCrmLabel, deleteCrmLabel, setConversationLabels, type CrmLabel } from '@/lib/crm-actions'
import { STAGE_COLORS } from '@/lib/crm-stages'
import { useToast } from '@/components/ui/Toast'
import { LabelChip } from './ConvTags'
import { cn } from '@/lib/utils'
import { Tag, Check, Plus, Trash2, Loader2 } from 'lucide-react'

// Etiquetas da conversa. Qualquer atendente aplica/tira; só administrador cria e exclui etiquetas.
export function LabelPicker({
  conversationId, all, selectedIds, isAdmin, onChanged, onCatalogChanged, align = 'right', compact = false,
}: {
  conversationId: string
  all: CrmLabel[]
  selectedIds: string[]
  isAdmin: boolean
  onChanged: (ids: string[]) => void
  onCatalogChanged: () => void
  align?: 'left' | 'right'
  compact?: boolean
}) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(STAGE_COLORS[0])
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  async function toggle(id: string) {
    if (busy) return
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]
    setBusy(true)
    const r = await setConversationLabels(conversationId, next)
    setBusy(false)
    if (r.error) toast.error('ERRO', r.error); else onChanged(next)
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    const r = await createCrmLabel({ name, color })
    if (r.error || !r.label) { setBusy(false); setError(r.error ?? 'Erro'); return }
    // já aplica a etiqueta nova nesta conversa
    const next = [...selectedIds, r.label.id]
    const a = await setConversationLabels(conversationId, next)
    setBusy(false)
    if (a.error) { toast.error('ERRO', a.error); return }
    setName(''); setCreating(false)
    onCatalogChanged(); onChanged(next)
  }

  async function remove(l: CrmLabel) {
    if (busy || !window.confirm(`Excluir a etiqueta “${l.name}”? Ela some de todas as conversas.`)) return
    setBusy(true)
    const r = await deleteCrmLabel(l.id)
    setBusy(false)
    if (r.error) toast.error('ERRO', r.error)
    else { onCatalogChanged(); onChanged(selectedIds.filter((x) => x !== l.id)) }
  }

  const selected = all.filter((l) => selectedIds.includes(l.id))

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Etiquetas da conversa"
        title="Etiquetas"
        className={cn('rounded-lg text-gray-700 hover:bg-gray-100 inline-flex items-center gap-1.5', compact ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm', open && 'bg-gray-100')}
      >
        <Tag className="w-4 h-4" />
        {compact && (selected.length ? `${selected.length}` : 'Etiquetar')}
      </button>
      {open && (
        <div role="dialog" aria-label="Etiquetas" className={cn('absolute z-40 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-xl p-2 text-sm', align === 'right' ? 'right-0' : 'left-0')}>
          {all.length === 0 && <p className="px-2 py-2 text-gray-500">Nenhuma etiqueta criada ainda.</p>}
          <ul className="max-h-56 overflow-y-auto">
            {all.map((l) => {
              const on = selectedIds.includes(l.id)
              return (
                <li key={l.id} className="flex items-center gap-1 group">
                  <button type="button" onClick={() => toggle(l.id)} disabled={busy} className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-left">
                    <Check className={cn('w-4 h-4 shrink-0', on ? 'text-gray-900' : 'opacity-0')} />
                    <LabelChip label={l} className="text-xs px-2 py-1" />
                  </button>
                  {isAdmin && (
                    <button type="button" onClick={() => remove(l)} aria-label={`Excluir etiqueta ${l.name}`} className="p-1.5 rounded text-gray-300 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 focus:opacity-100">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          {isAdmin && (
            <div className="border-t border-gray-100 mt-1 pt-2">
              {!creating ? (
                <button type="button" onClick={() => setCreating(true)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-gray-700">
                  <Plus className="w-4 h-4" /> Nova etiqueta
                </button>
              ) : (
                <form onSubmit={create} className="space-y-2 px-1">
                  <input value={name} onChange={(e) => { setName(e.target.value); setError(null) }} maxLength={30} placeholder="Nome da etiqueta" aria-label="Nome da nova etiqueta" autoFocus
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
                  <div className="flex gap-1.5 flex-wrap">
                    {STAGE_COLORS.map((c) => (
                      <button type="button" key={c} onClick={() => setColor(c)} aria-label={`Cor ${c}`} aria-pressed={color === c}
                        className={cn('w-5 h-5 rounded-full border-2', color === c ? 'border-gray-900' : 'border-transparent')} style={{ background: c }} />
                    ))}
                  </div>
                  {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setCreating(false); setError(null) }} className="flex-1 px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs">Cancelar</button>
                    <button type="submit" disabled={busy} className="flex-1 px-2 py-1 rounded-lg bg-gray-900 text-white text-xs inline-flex items-center justify-center gap-1 disabled:opacity-60">
                      {busy && <Loader2 className="w-3 h-3 animate-spin" />} Criar e aplicar
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
