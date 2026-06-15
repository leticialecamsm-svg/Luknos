'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, FileText, Users, CheckSquare, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const ACTIONS = [
  {
    label: 'Novo orçamento',
    icon: FileText,
    href: '/quotes/new',
    color: 'bg-blue-500 hover:bg-blue-600',
  },
  {
    label: 'Novo parceiro',
    icon: Users,
    href: '/partners?new=1',
    color: 'bg-purple-500 hover:bg-purple-600',
  },
  {
    label: 'Nova tarefa',
    icon: CheckSquare,
    href: '/dashboard/tasks?new=1',
    color: 'bg-emerald-500 hover:bg-emerald-600',
  },
]

export function FloatingActionButton() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  function handleAction(href: string) {
    setOpen(false)
    router.push(href)
  }

  return (
    <>
      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}

      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {/* Action buttons */}
        {open && (
          <div className="flex flex-col items-end gap-2 mb-1">
            {ACTIONS.map((action) => {
              const Icon = action.icon
              return (
                <button
                  key={action.label}
                  onClick={() => handleAction(action.href)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 rounded-full text-white text-sm font-medium shadow-lg transition-all',
                    'animate-in slide-in-from-bottom-2 fade-in duration-150',
                    action.color
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {action.label}
                </button>
              )
            })}
          </div>
        )}

        {/* FAB principal */}
        <button
          onClick={() => setOpen(o => !o)}
          className={cn(
            'w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-200',
            open
              ? 'bg-gray-700 hover:bg-gray-800 rotate-45'
              : 'bg-brand-500 hover:bg-brand-600'
          )}
          style={!open ? { background: '#CBA455' } : undefined}
          aria-label="Ações rápidas"
        >
          {open
            ? <X className="w-6 h-6 text-white" />
            : <Plus className="w-6 h-6 text-white" />
          }
        </button>
      </div>
    </>
  )
}
