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
  className,
}: {
  items: TabItem[]
  defaultTab?: string
  className?: string
}) {
  const [active, setActive] = useState(defaultTab ?? items[0]?.id)
  const activeItem = items.find(i => i.id === active) ?? items[0]

  return (
    <div className={className}>
      <div className="flex gap-1 bg-gray-100 rounded-pill p-1 w-fit mb-4 flex-wrap">
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActive(item.id)}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5',
              active === item.id
                ? 'bg-white text-navy shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {item.label}
            {typeof item.badge === 'number' && item.badge > 0 && (
              <span className={cn(
                'text-xs rounded-full px-1.5 py-0.5 leading-none',
                active === item.id ? 'bg-brand-500/20 text-brand-700' : 'bg-gray-200 text-gray-600'
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
