'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getCrmInstanceOptions } from '@/lib/crm-actions'
import { cn } from '@/lib/utils'
import { ChevronDown, Check, Lock } from 'lucide-react'
import { WhatsappIcon } from './WhatsappIcon'
import { instanceColor } from '@/lib/crm-ui'

export interface InstanceOption { id: string; label: string; is_private: boolean; color_index: number }

const KEY = 'crm-instance-filter'

// Escolha de WhatsApp(s) compartilhada entre Quadro e Conversas (fica salva no
// navegador). selected vazio = todos os WhatsApps que a pessoa enxerga.
export function useInstanceFilter() {
  const [options, setOptions] = useState<InstanceOption[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selected, setSelectedState] = useState<string[]>([])

  useEffect(() => {
    let alive = true
    getCrmInstanceOptions().then((o) => {
      if (!alive) return
      setOptions(o)
      try {
        const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]
        // ignora ids que a pessoa não enxerga mais
        setSelectedState(Array.isArray(saved) ? saved.filter((id) => o.some((x) => x.id === id)) : [])
      } catch { /* sem preferência salva */ }
      setLoaded(true)
    })
    return () => { alive = false }
  }, [])

  const setSelected = useCallback((ids: string[]) => {
    // marcar todos equivale a "Todos"
    const next = ids.length === options.length ? [] : ids
    setSelectedState(next)
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }, [options.length])

  const colorOf = useCallback((id: string) => instanceColor(options.find((o) => o.id === id)?.color_index), [options])
  return { options, loaded, selected, setSelected, colorOf }
}

export function InstanceFilter({
  options, selected, onChange, className,
}: {
  options: InstanceOption[]
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

  const all = selected.length === 0
  const label = options.length === 0 ? 'WhatsApps' : all
    ? options.length === 1 ? options[0].label : `Todos os WhatsApps (${options.length})`
    : selected.length === 1 ? (options.find((o) => o.id === selected[0])?.label ?? '1 WhatsApp') : `${selected.length} WhatsApps`

  const toggle = (id: string) => {
    // com "Todos" ativo, clicar num WhatsApp escolhe SÓ ele; depois cada clique soma ou tira
    if (all) { onChange([id]); return }
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
    onChange(next) // sem nenhum marcado volta para "Todos"
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filtrar por WhatsApp"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full bg-gray-100 text-gray-800 hover:bg-gray-200 max-w-full"
      >
        <WhatsappIcon className="w-4 h-4 text-green-600 shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown className="w-4 h-4 shrink-0 text-gray-500" />
      </button>
      {open && (
        <div role="listbox" aria-multiselectable="true" className="absolute left-0 top-full mt-1 z-30 w-64 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-sm">
          <button type="button" role="option" aria-selected={all} onClick={() => onChange([])} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 font-medium">
            <Check className={cn('w-4 h-4', all ? 'text-gray-900' : 'opacity-0')} /> Todos os WhatsApps
          </button>
          <div className="my-1 border-t border-gray-100" />
          {options.map((o) => {
            const on = all || selected.includes(o.id)
            return (
              <button key={o.id} type="button" role="option" aria-selected={on} onClick={() => toggle(o.id)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
                <Check className={cn('w-4 h-4 shrink-0', on && !all ? 'text-gray-900' : 'opacity-0')} />
                <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', instanceColor(o.color_index).dot)} />
                <span className="truncate flex-1 text-left">{o.label}</span>
                {o.is_private && <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-label="Privado" />}
              </button>
            )
          })}
          {options.length === 0 && <p className="px-3 py-2 text-gray-500">Nenhum WhatsApp disponível</p>}
        </div>
      )}
    </div>
  )
}
