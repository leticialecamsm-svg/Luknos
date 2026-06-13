'use client'

import { X, Edit2, Trash2 } from 'lucide-react'
import { deleteTask, updateTaskStatus } from '@/lib/actions'
import { useState } from 'react'

interface Task {
  id: string
  title: string
  description?: string
  status: 'todo' | 'doing' | 'paused' | 'done'
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
  onStatusChange?: () => void
}

const STATUS_LABELS = {
  todo: 'A fazer',
  doing: 'Em andamento',
  paused: 'Pausada',
  done: 'Finalizada',
}

const PRIORITY_LABELS = {
  high: 'Alta',
  mid: 'Média',
  low: 'Baixa',
}

const PRIORITY_EMOJI = {
  high: '🔴',
  mid: '🟡',
  low: '⚪',
}

const STATUS_COLORS = {
  todo: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
  doing: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  paused: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  done: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
}

const PRIORITY_COLORS = {
  high: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  mid: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  low: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
}

export function TasksViewModal({ task, onClose, onEdit, onStatusChange }: TasksViewModalProps) {
  const [deleting, setDeleting] = useState(false)
  const [updating, setUpdating] = useState(false)

  const handleDelete = async () => {
    if (confirm('Tem certeza que deseja deletar esta tarefa?')) {
      setDeleting(true)
      await deleteTask(task.id)
      onClose()
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    setUpdating(true)
    await updateTaskStatus(task.id, newStatus)
    setUpdating(false)
    onStatusChange?.()
  }

  const handleMarkAsCompleted = async () => {
    setUpdating(true)
    const newStatus = task.status === 'done' ? 'doing' : 'done'
    await updateTaskStatus(task.id, newStatus)
    setUpdating(false)
    onStatusChange?.()
  }

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleDateString('pt-BR')
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-start justify-between mb-4">
            {/* Left side: Checkbox, Priority, Status, Title */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  checked={task.status === 'done'}
                  onChange={handleMarkAsCompleted}
                  disabled={updating}
                  className="w-6 h-6 rounded cursor-pointer"
                />
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${PRIORITY_COLORS[task.priority].bg} ${PRIORITY_COLORS[task.priority].text}`}>
                  {PRIORITY_EMOJI[task.priority]} {PRIORITY_LABELS[task.priority]}
                </span>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[task.status].bg} ${STATUS_COLORS[task.status].text}`}>
                  {STATUS_LABELS[task.status]}
                </span>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">{task.title}</h2>
            </div>

            {/* Right side: Edit and Close buttons */}
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={() => onEdit(task)}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <Edit2 className="w-4 h-4" />
                Editar
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 px-6 py-6 space-y-6 overflow-y-auto">
          {/* Status Selection */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Status</h3>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => handleStatusChange(value)}
                  disabled={updating}
                  className={`px-4 py-2 rounded-full font-semibold text-sm transition-all ${
                    task.status === value
                      ? STATUS_COLORS[value as keyof typeof STATUS_COLORS].bg +
                        ' ' +
                        STATUS_COLORS[value as keyof typeof STATUS_COLORS].text +
                        ' border-2 ' +
                        STATUS_COLORS[value as keyof typeof STATUS_COLORS].border
                      : 'bg-gray-50 text-gray-700 border border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-xs font-semibold text-gray-600 mb-2">Início</div>
              <div className="text-lg font-bold text-gray-900">{formatDate(task.created_at)}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-xs font-semibold text-gray-600 mb-2">Conclusão</div>
              <div className={`text-lg font-bold ${task.due_date ? 'text-gray-900' : 'text-gray-400'}`}>
                {task.due_date ? (
                  <>
                    {formatDate(task.due_date)}
                    {new Date(task.due_date) < new Date() && task.status !== 'done' && (
                      <span className="ml-2">⚠️</span>
                    )}
                  </>
                ) : (
                  '-'
                )}
              </div>
            </div>
          </div>

          {/* Observations */}
          {task.description && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Observações</h3>
              <p className="text-gray-600 text-sm whitespace-pre-wrap bg-gray-50 p-4 rounded-lg">
                {task.description}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-between">
          <button
            onClick={handleDelete}
            disabled={deleting || updating}
            className="px-4 py-2 bg-red-50 text-red-600 font-semibold rounded-lg hover:bg-red-100 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            Excluir
          </button>
          <button
            onClick={handleMarkAsCompleted}
            disabled={updating}
            className="px-6 py-2 bg-green-50 text-green-700 font-semibold rounded-lg hover:bg-green-100 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <span>✓</span>
            Marcar como finalizada
          </button>
        </div>
      </div>
    </div>
  )
}
