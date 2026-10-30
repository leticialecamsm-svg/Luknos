'use client'

import { useCallback, useEffect, useState } from 'react'
import { Tag } from 'lucide-react'
import { ToolbarMenu, ToolbarMenuItem, ColorDot } from './ToolbarMenu'
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
  // etiqueta apagada do catálogo some do filtro
  const active = labels.length ? selected.filter((id) => labels.some((l) => l.id === id)) : selected
  const first = labels.find((l) => l.id === active[0])
  const label = active.length === 0 ? 'Etiquetas' : active.length === 1 ? (first?.name ?? '1 etiqueta') : `${active.length} etiquetas`
  const toggle = (id: string) => onChange(active.includes(id) ? active.filter((x) => x !== id) : [...active, id])

  return (
    <ToolbarMenu
      className={className}
      ariaLabel="Filtrar por etiqueta"
      multi
      width="w-60"
      tone={active.length ? 'active' : 'default'}
      icon={first && active.length === 1 ? <ColorDot color={first.color} /> : <Tag className="w-3.5 h-3.5 text-gray-500" />}
      label={label}
      onClear={active.length ? () => onChange([]) : undefined}
      clearLabel="Limpar filtro de etiquetas"
    >
      {() => (
        <>
          {labels.map((l) => (
            <ToolbarMenuItem key={l.id} selected={active.includes(l.id)} onClick={() => toggle(l.id)} lead={<ColorDot color={l.color} />}>
              {l.name}
            </ToolbarMenuItem>
          ))}
          {labels.length === 0 && <p className="px-3 py-2 text-gray-500">Nenhuma etiqueta criada</p>}
        </>
      )}
    </ToolbarMenu>
  )
}
