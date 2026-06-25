'use client'

import { useState } from 'react'
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
  { value: 'project',   label: 'Projeto',     emoji: '📐', tone: 'blue' },
  { value: 'execution', label: 'Em execução', emoji: '🚧', tone: 'orange' },
  { value: 'finishing', label: 'Acabamento',  emoji: '🎨', tone: 'violet' },
  { value: 'delivered', label: 'Entregue',    emoji: '✅', tone: 'emerald' },
]
export const PRIORITY_OPTS: PillOption[] = [
  { value: 'normal', label: 'Normal',  emoji: '⚪', tone: 'gray' },
  { value: 'high',   label: 'Alta',    emoji: '🟠', tone: 'orange' },
  { value: 'urgent', label: 'Urgente', emoji: '🔴', tone: 'red' },
]
