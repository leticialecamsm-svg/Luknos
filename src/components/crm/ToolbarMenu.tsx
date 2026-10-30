'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Check, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Menu da barra das abas do CRM (Etiquetas, Atuar como): fechado é uma pílula branca com borda e seta;
// aberto é um painel branco com um item por linha (bolinha de cor ou avatar à esquerda, ✓ no escolhido).
export function ToolbarMenu({
  icon, label, tone = 'default', onClear, clearLabel, busy, disabled, ariaLabel, title, multi, width = 'w-64', children, className,
}: {
  icon: ReactNode
  label: ReactNode
  tone?: 'default' | 'active' | 'amber'
  onClear?: () => void // mostra o × no lugar da seta
  clearLabel?: string
  busy?: boolean
  disabled?: boolean
  ariaLabel: string
  title?: string
  multi?: boolean
  width?: string
  children: (close: () => void) => ReactNode
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

  return (
    <div ref={ref} className={cn('relative min-w-0', className)} title={title}>
      <div
        className={cn(
          'inline-flex items-center rounded-full border bg-white max-w-full transition-colors',
          tone === 'amber' ? 'border-amber-400 text-amber-900' : tone === 'active' ? 'border-gray-900 text-gray-900' : 'border-gray-200 text-gray-700 hover:border-gray-300',
          open && tone === 'default' && 'border-gray-300',
        )}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 text-xs min-w-0 disabled:opacity-60"
        >
          <span className="shrink-0 inline-flex">{icon}</span>
          <span className="truncate">{label}</span>
          {!onClear && <ChevronDown className={cn('w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform', open && 'rotate-180')} />}
        </button>
        {onClear && (
          <button type="button" onClick={onClear} aria-label={clearLabel ?? 'Limpar'} className="pr-2.5 pl-0.5 py-1 text-gray-400 hover:text-gray-800">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        {busy && <Loader2 className="w-3.5 h-3.5 mr-2 -ml-1 animate-spin text-gray-400" aria-hidden />}
      </div>
      {open && (
        <div
          role="listbox"
          aria-multiselectable={multi || undefined}
          className={cn('absolute right-0 top-full mt-1 z-30 max-h-80 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-sm', width)}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function ToolbarMenuItem({
  selected, onClick, lead, children, hint,
}: {
  selected: boolean
  onClick: () => void
  lead?: ReactNode
  children: ReactNode
  hint?: ReactNode
}) {
  return (
    <button type="button" role="option" aria-selected={selected} onClick={onClick} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left">
      <Check className={cn('w-4 h-4 shrink-0', selected ? 'text-gray-900' : 'opacity-0')} />
      {lead && <span className="shrink-0 inline-flex">{lead}</span>}
      <span className={cn('truncate flex-1', selected ? 'text-gray-900 font-medium' : 'text-gray-800')}>{children}</span>
      {hint && <span className="shrink-0 text-xs text-gray-400">{hint}</span>}
    </button>
  )
}

export const ColorDot = ({ color }: { color: string }) => <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
