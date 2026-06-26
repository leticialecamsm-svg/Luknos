'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PillOption { value: string; label: string; emoji?: string; tone?: string }

const TONES: Record<string, { bg: string; text: string; border: string }> = {
  gray:    { bg: 'bg-gray-100',   text: 'text-gray-700',   border: 'border-gray-300' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-300' },
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-300' },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-700', border: 'border-violet-300' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700',border: 'border-emerald-300' },
  orange:  { bg: 'bg-orange-50',  text: 'text-orange-700', border: 'border-orange-300' },
  red:     { bg: 'bg-red-50',     text: 'text-red-700',    border: 'border-red-300' },
  teal:    { bg: 'bg-teal-50',    text: 'text-teal-700',   border: 'border-teal-300' },
  pink:    { bg: 'bg-pink-50',    text: 'text-pink-700',   border: 'border-pink-300' },
}

// Seletor de opções em pills com emoji + cor (substitui <select>). Mantém um input hidden p/ FormData.
export function OptionPills({ name, label, defaultValue, options, allowEmpty }: {
  name: string
  label?: string
  defaultValue?: string
  options: PillOption[]
  allowEmpty?: boolean
}) {
  const [val, setVal] = useState(defaultValue ?? '')
  return (
    <div>
      {label && <label className="label">{label}</label>}
      <input type="hidden" name={name} value={val} />
      <div className="flex flex-wrap gap-1.5 mt-1">
        {options.map(o => {
          const active = val === o.value
          const tone = TONES[o.tone ?? 'gray']
          return (
            <button key={o.value} type="button"
              onClick={() => setVal(allowEmpty && active ? '' : o.value)}
              className={cn('inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all',
                active ? cn(tone.bg, tone.text, tone.border, 'ring-1 ring-inset ring-current/20')
                       : 'bg-white text-gray-500 border-surface-border hover:border-gray-300')}>
              {o.emoji && <span className="text-sm leading-none">{o.emoji}</span>}
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Dropdown com a opção selecionada e a lista exibidas como TAGS coloridas
export function TagSelect({ name, label, defaultValue, options, placeholder, allowEmpty }: {
  name: string
  label?: string
  defaultValue?: string
  options: PillOption[]
  placeholder?: string
  allowEmpty?: boolean
}) {
  const [val, setVal] = useState(defaultValue ?? '')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const selected = options.find(o => o.value === val)
  const Tag = ({ o }: { o: PillOption }) => {
    const t = TONES[o.tone ?? 'gray']
    return (
      <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border', t.bg, t.text, t.border)}>
        {o.emoji && <span className="leading-none">{o.emoji}</span>}{o.label}
      </span>
    )
  }

  return (
    <div ref={ref} className="relative">
      {label && <label className="label">{label}</label>}
      <input type="hidden" name={name} value={val} />
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full mt-1 px-3 py-2 bg-white border border-surface-border rounded-lg text-sm flex items-center justify-between gap-2 hover:border-gray-300 transition-colors">
        {selected ? <Tag o={selected} /> : <span className="text-gray-400">{placeholder ?? 'Selecione'}</span>}
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-surface-border rounded-lg shadow-lg p-1.5 space-y-1">
          {allowEmpty && (
            <button type="button" onClick={() => { setVal(''); setOpen(false) }}
              className="w-full text-left px-2 py-1.5 rounded-md text-xs text-gray-400 hover:bg-surface">— nenhum —</button>
          )}
          {options.map(o => (
            <button key={o.value} type="button" onClick={() => { setVal(o.value); setOpen(false) }}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-surface">
              <Tag o={o} />
              {val === o.value && <Check className="w-3.5 h-3.5 text-brand-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Tag somente-leitura (para a visualização) — usa o mesmo emoji/cor das opções
export function OptionTag({ options, value }: { options: PillOption[]; value?: string | null }) {
  const o = options.find(x => x.value === value)
  if (!o) return <span className="text-sm text-gray-400">—</span>
  const t = TONES[o.tone ?? 'gray']
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border', t.bg, t.text, t.border)}>
      {o.emoji && <span className="leading-none">{o.emoji}</span>}{o.label}
    </span>
  )
}

// Presets reutilizáveis
export const CATEGORY_OPTS: PillOption[] = [
  { value: 'lighting',   label: 'Iluminação',  emoji: '💡', tone: 'amber' },
  { value: 'automation', label: 'Automação',   emoji: '🎛️', tone: 'blue' },
  { value: 'both',       label: 'Ilum. + Auto.', emoji: '✨', tone: 'violet' },
]
export const SIZE_OPTS: PillOption[] = [
  { value: 'small',  label: 'Pequeno', emoji: '🔹', tone: 'gray' },
  { value: 'medium', label: 'Médio',   emoji: '🔷', tone: 'blue' },
  { value: 'large',  label: 'Grande',  emoji: '🟦', tone: 'violet' },
]
export const ORIGIN_OPTS: PillOption[] = [
  { value: 'store',    label: 'Loja',      emoji: '🏬', tone: 'teal' },
  { value: 'whatsapp', label: 'WhatsApp',  emoji: '💬', tone: 'emerald' },
  { value: 'visit',    label: 'Visita',    emoji: '📍', tone: 'red' },
  { value: 'referral', label: 'Indicação', emoji: '🤝', tone: 'amber' },
  { value: 'other',    label: 'Outro',     emoji: '•',  tone: 'gray' },
]
export const STAGE_OPTS: PillOption[] = [
  { value: 'project',   label: 'Início (Etapa de Terreno)',    emoji: '📐', tone: 'blue' },
  { value: 'execution', label: 'Pré Acabamentos (Etapa de Construção)', emoji: '🚧', tone: 'orange' },
  { value: 'finishing', label: 'Fase do Gesso',  emoji: '🎨', tone: 'violet' },
  { value: 'delivered', label: 'Instalação Imediata', emoji: '✅', tone: 'emerald' },
]
export const PRIORITY_OPTS: PillOption[] = [
  { value: 'normal', label: 'Normal',  emoji: '⚪', tone: 'gray' },
  { value: 'high',   label: 'Alta',    emoji: '🟠', tone: 'orange' },
  { value: 'urgent', label: 'Urgente', emoji: '🔴', tone: 'red' },
]
