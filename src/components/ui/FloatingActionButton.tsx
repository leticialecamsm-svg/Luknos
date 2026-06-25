'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, FileText, Users, CheckSquare, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TasksModal } from '@/components/tasks/TasksModal'
import { NewPartnerModal } from '@/components/partners/NewPartnerModal'
import { NewQuoteModal } from '@/components/quotes/NewQuoteModal'

export function FloatingActionButton({ currentUserId }: { currentUserId: string }) {
  const [open, setOpen] = useState(false)
  const [modal, setModal] = useState<'task' | 'partner' | 'quote' | null>(null)
  const router = useRouter()

  function openModal(m: 'task' | 'partner' | 'quote') {
    setOpen(false)
    setModal(m)
  }

  return (
    <>
      {/* Overlay do menu */}
      {open && <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />}

      <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-3">
        {/* Action buttons */}
        {open && (
          <div className="flex flex-col items-end gap-2 mb-1">
            <button
              onClick={() => openModal('quote')}
              className="flex items-center gap-3 px-4 py-2.5 rounded-full text-white text-sm font-medium shadow-lg bg-blue-500 hover:bg-blue-600 transition-all"
            >
              <FileText className="w-4 h-4" />
              Novo orçamento
            </button>
            <button
              onClick={() => openModal('partner')}
              className="flex items-center gap-3 px-4 py-2.5 rounded-full text-white text-sm font-medium shadow-lg bg-purple-500 hover:bg-purple-600 transition-all"
            >
              <Users className="w-4 h-4" />
              Novo parceiro
            </button>
            <button
              onClick={() => openModal('task')}
              className="flex items-center gap-3 px-4 py-2.5 rounded-full text-white text-sm font-medium shadow-lg bg-emerald-500 hover:bg-emerald-600 transition-all"
            >
              <CheckSquare className="w-4 h-4" />
              Nova tarefa
            </button>
          </div>
        )}

        {/* FAB principal */}
        <button
          onClick={() => setOpen(o => !o)}
          className={cn(
            'w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-200',
            open ? 'bg-gray-700 hover:bg-gray-800 rotate-45' : ''
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

      {/* Modais renderizados in-place */}
      {modal === 'task' && (
        <TasksModal
          onClose={() => setModal(null)}
          onSuccess={() => setModal(null)}
        />
      )}

      {modal === 'partner' && (
        <NewPartnerModal
          currentUserId={currentUserId}
          onClose={() => setModal(null)}
        />
      )}

      {modal === 'quote' && (
        <NewQuoteModal onClose={() => setModal(null)} />
      )}
    </>
  )
}
