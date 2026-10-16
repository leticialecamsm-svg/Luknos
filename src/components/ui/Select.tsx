'use client'

// Seletor do sistema (substitui o <select> nativo, que usa o visual do
// sistema operacional). Opções podem ter:
//  - avatar: foto/iniciais da pessoa (seletor de responsável);
//  - tag: classes bg/text do status (tag colorida, como o StatusSelect);
//  - color: cor hex (bolinha + fundo suave), para quando só há a cor.
// O menu é renderizado num Portal, então não é cortado por cards/modais.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import { Portal } from '@/components/ui/Portal'

export type SelectOption = {
  value: string
  label: string
  avatar?: { name: string; avatar_url?: string | null; avatar_color?: string | null }
  tag?: { bg: string; text: string }
  color?: string
  hint?: string
}

function OptionContent({ o, compact }: { o: SelectOption; compact?: boolean }) {
  if (o.avatar) {
    return (
      <span className="inline-flex items-center gap-2 min-w-0">
        <Avatar user={o.avatar} size={compact ? 20 : 22} />
        <span className="truncate">{o.label}</span>
      </span>
    )
  }
  if (o.tag) {
    return <span className={cn('badge font-semibold', o.tag.bg, o.tag.text)}>{o.label}</span>
  }
  if (o.color) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold text-gray-800"
        style={{ background: `${o.color}22` }}
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: o.color }} />
        {o.label}
      </span>
    )
  }
  return <span className="truncate">{o.label}</span>
}

export function Select({
  value, onChange, options, placeholder = 'Selecionar…', disabled, className, align = 'left', 'aria-label': ariaLabel,
}: {
  value: string | null
  onChange: (v: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  align?: 'left' | 'right'
  'aria-label'?: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number; up: boolean } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const current = options.find(o => o.value === value) ?? null

  const place = useCallback(() => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const menuH = Math.min(260, options.length * 36 + 8)
    const up = window.innerHeight - r.bottom < menuH + 12 && r.top > menuH
    setPos({
      top: up ? r.top - 4 : r.bottom + 4,
      left: align === 'right' ? r.right : r.left,
      minWidth: r.width,
      up,
    })
  }, [align, options.length])

  useLayoutEffect(() => { if (open) place() }, [open, place])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onMove = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'inline-flex items-center justify-between gap-2 rounded-lg border border-surface-border bg-white px-2.5 py-1.5 text-sm text-gray-800',
          'hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-60 disabled:cursor-not-allowed',
          open && 'border-brand-400',
          className,
        )}
      >
        <span className="min-w-0 truncate text-left">
          {current ? <OptionContent o={current} compact /> : <span className="text-gray-400">{placeholder}</span>}
        </span>
        <ChevronDown className={cn('w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && pos && (
        <Portal>
          <div
            ref={menuRef}
            role="listbox"
            className="fixed z-[10000] max-h-64 overflow-y-auto rounded-xl border border-surface-border bg-white shadow-lg py-1"
            style={{
              top: pos.up ? undefined : pos.top,
              bottom: pos.up ? window.innerHeight - pos.top : undefined,
              left: align === 'right' ? undefined : pos.left,
              right: align === 'right' ? window.innerWidth - pos.left : undefined,
              minWidth: Math.max(pos.minWidth, 160),
            }}
          >
            {options.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">Sem opções</p>}
            {options.map(o => {
              const selected = o.value === value
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => { setOpen(false); if (!selected) onChange(o.value) }}
                  className={cn(
                    'w-full flex items-center justify-between gap-3 px-3 py-1.5 text-sm text-left transition-colors',
                    selected ? 'bg-brand-50' : 'hover:bg-gray-50',
                  )}
                >
                  <span className="min-w-0 flex flex-col">
                    <OptionContent o={o} />
                    {o.hint && <span className="text-[11px] text-gray-400">{o.hint}</span>}
                  </span>
                  {selected && <Check className="w-3.5 h-3.5 shrink-0 text-brand-600" />}
                </button>
              )
            })}
          </div>
        </Portal>
      )}
    </>
  )
}
