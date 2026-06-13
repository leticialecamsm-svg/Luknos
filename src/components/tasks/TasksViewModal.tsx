'use client'

import { X, Edit2, Trash2 } from 'lucide-react'
import { deleteTask } from '@/lib/actions'
import { useState } from 'react'

interface Task {
  id: string
  title: string
  description?: string
  status: 'todo' | 'doing' | 'pending' | 'done'
  priority: 'high' | 'mid' | 'low'
  due_date?: string
  completed_at?: string | null
  checklist?: { text: string; done: boolean }[]
  created_at: string
}

interface TasksViewModalProps {
  task: Task
  onClose: () => void
  onEdit: (task: Task) => void
}

const STATUS_LABELS = {
  todo: 'A Fazer',
  doing: 'Fazendo',
  pending: 'Pendente',
  done: 'Concluído',
}

const PRIORITY_LABELS = {
  high: 'Alta',
  mid: 'Média',
  low: 'Baixa',
}

const STATUS_COLORS = {
  todo: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
  doing: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  pending: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  done: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
}

const PRIORITY_COLORS = {
  high: { bg: 'bg-red-50', text: 'text-red-700' },
  mid: { bg: 'bg-amber-50', text: 'text-amber-700' },
  low: { bg: 'bg-slate-50', text: 'text-slate-700' },
}

export function TasksViewModal({ task, onClose, onEdit }: TasksViewModalProps) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (confirm('Tem certeza que deseja deletar esta tarefa?')) {
      setDeleting(true)
      await deleteTask(task.id)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Detalhes da Tarefa</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Título */}
          <div>
            <h3 className="text-xl font-bold text-gray-900">{task.title}</h3>
          </div>

          {/* Badges */}
          <div className="flex gap-2 flex-wrap">
            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[task.status].bg} ${STATUS_COLORS[task.status].text}`}>
              {STATUS_LABELS[task.status]}
            </span>
            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${PRIORITY_COLORS[task.priority].bg} ${PRIORITY_COLORS[task.priority].text}`}>
              {PRIORITY_LABELS[task.priority]}
            </span>
            {task.due_date && (
              <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                Prazo: {new Date(task.due_date).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>

          {/* Descrição */}
          {task.description && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Descrição</h4>
              <p className="text-gray-600 text-sm whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Checklist */}
          {task.checklist && task.checklist.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Checklist</h4>
              <div className="space-y-2">
                {task.checklist.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.done}
                      disabled
                      className="w-4 h-4 rounded"
                    />
                    <span className={`text-sm ${item.done ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                      {item.text}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs text-gray-600">
                {task.checklist.filter(i => i.done).length} de {task.checklist.length} concluídas
              </div>
            </div>
          )}

          {/* Info */}
          <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-600 space-y-2">
            <div>
              Criada em: {new Date(task.created_at).toLocaleDateString('pt-BR', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-gray-700 font-semibold rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
          >
            Fechar
          </button>
          <button
            onClick={() => onEdit(task)}
            className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Edit2 className="w-4 h-4" />
            Editar
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 bg-red-50 text-red-600 font-semibold rounded-lg hover:bg-red-100 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            Deletar
          </button>
        </div>
      </div>
    </div>
  )
}
