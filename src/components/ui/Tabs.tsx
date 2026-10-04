'use client'

// Tabs genérico e reutilizável, extraído do padrão ad hoc de pílulas usado
// em telas como DesignProjectsWorkspace (useState<'a'|'b'>() + botões com
// bg-white/shadow quando ativo). Mantém a mesma aparência visual, só troca
// tabs fixas por uma lista de itens configurável.

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type TabItem = {
  id: string
  label: string
  badge?: number
  content: ReactNode
}

export function Tabs({
  items,
  defaultTab,
  active: controlledActive,
  onChange,
  className,
}: {
  items: TabItem[]
  defaultTab?: string
  // Modo controlado (opcional): permite a tela trocar de aba por fora (ex.: barra de etapas).
  active?: string
  onChange?: (id: string) => void
  className?: string
}) {
  const [inner, setInner] = useState(defaultTab ?? items[0]?.id)
  const active = controlledActive ?? inner
  const setActive = (id: string) => { setInner(id); onChange?.(id) }
  const activeItem = items.find(i => i.id === active) ?? items[0]

  return (
    <div className={className}>
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActive(item.id)}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5',
              active === item.id
                ? 'bg-white border border-brand-500/30 text-navy shadow-sm font-semibold'
                : 'bg-transparent text-gray-500 hover:text-navy hover:bg-gray-100/60'
            )}
          >
            {item.label}
            {typeof item.badge === 'number' && item.badge > 0 && (
              <span className={cn(
                'text-xs rounded-full px-1.5 py-0.5 leading-none',
                active === item.id ? 'bg-brand-500/15 text-brand-700' : 'bg-gray-200 text-gray-500'
              )}>
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </div>
      <div>{activeItem?.content}</div>
    </div>
  )
}
