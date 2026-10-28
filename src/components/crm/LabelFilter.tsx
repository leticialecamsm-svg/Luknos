'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, Check, Tag, X } from 'lucide-react'
import type { CrmLabel } from '@/lib/crm-actions'

const KEY = 'crm-label-filter'

// Etiquetas escolhidas neste navegador (vazio = sem filtro). Lida direto, como a escolha de WhatsApp.
export function readSavedLabelSelection(): string[] {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(s) ? s.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}

export function useLabelFilter() {
  const [selected, setSelectedState] = useState<string[]>([])
  useEffect(() => { setSelectedState(readSavedLabelSelection()) }, [])
  const setSelected = useCallback((ids: string[]) => {
    setSelectedState(ids)
    try { localStorage.setItem(KEY, JSON.stringify(ids)) } catch { /* ignore */ }
  }, [])
  return { selected, setSelected }
}

// Filtro por etiqueta: mostra as conversas que têm QUALQUER uma das etiquetas marcadas.
export function LabelFilter({
  labels, selected, onChange, className,
}: {
  labels: CrmLabel[]
  selected: string[]
  onChange: (ids: string[]) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  // etiqueta apagada do catálogo some do filtro
  const active = labels.length ? selected.filter((id) => labels.some((l) => l.id === id)) : selected
  const first = labels.find((l) => l.id === active[0])
  const label = active.length === 0 ? 'Etiquetas' : active.length === 1 ? (first?.name ?? '1 etiqueta') : `${active.length} etiquetas`
  const toggle = (id: string) => onChange(active.includes(id) ? active.filter((x) => x !== id) : [...active, id])

  return (
    <div ref={ref} className={cn('relative min-w-0', className)}>
      <div
        className={cn(
          'inline-flex items-center rounded-full max-w-full',
          active.length ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200',
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Filtrar por etiqueta"
          className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 text-sm font-medium min-w-0"
        >
          {first && active.length === 1
            ? <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: first.color }} />
            : <Tag className="w-4 h-4 shrink-0" />}
          <span className="truncate">{label}</span>
          {!active.length && <ChevronDown className="w-4 h-4 shrink-0 text-gray-500" />}
        </button>
        {active.length > 0 && (
          <button type="button" onClick={() => onChange([])} aria-label="Limpar filtro de etiquetas" className="pr-2.5 pl-0.5 py-1.5 opacity-80 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div role="listbox" aria-multiselectable="true" className="absolute left-0 top-full mt-1 z-30 w-60 max-h-80 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-sm">
          {labels.map((l) => {
            const on = active.includes(l.id)
            return (
              <button key={l.id} type="button" role="option" aria-selected={on} onClick={() => toggle(l.id)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
                <Check className={cn('w-4 h-4 shrink-0', on ? 'text-gray-900' : 'opacity-0')} />
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: l.color }} />
                <span className="truncate flex-1 text-left text-gray-800">{l.name}</span>
              </button>
            )
          })}
          {labels.length === 0 && <p className="px-3 py-2 text-gray-500">Nenhuma etiqueta criada</p>}
        </div>
      )}
    </div>
  )
}
