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
  const [localTask, setLocalTask] = useState(task)
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
    setLocalTask({ ...localTask, status: newStatus as Task['status'] })
    await updateTaskStatus(task.id, newStatus)
    setUpdating(false)
    onStatusChange?.()
  }

  const handleMarkAsCompleted = async () => {
    setUpdating(true)
    const newStatus = localTask.status === 'done' ? 'doing' : 'done'
    setLocalTask({ ...localTask, status: newStatus as Task['status'] })
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
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-3">
          <div className="flex items-start justify-between mb-3">
            {/* Left side: Priority, Status, Title */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${PRIORITY_COLORS[localTask.priority].bg} ${PRIORITY_COLORS[localTask.priority].text}`}>
                  {PRIORITY_EMOJI[localTask.priority]} {PRIORITY_LABELS[localTask.priority]}
                </span>
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[localTask.status].bg} ${STATUS_COLORS[localTask.status].text}`}>
                  {STATUS_LABELS[localTask.status]}
                </span>
              </div>
              <h2 className="text-xl font-bold text-gray-900">{localTask.title}</h2>
            </div>

            {/* Right side: Edit and Close buttons */}
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={() => onEdit(task)}
                className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Editar
              </button>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 px-5 py-4 space-y-4 overflow-y-auto">
          {/* Status Selection */}
          <div>
            <h3 className="text-xs font-semibold text-gray-700 mb-2 uppercase">Status</h3>
            <div className="flex gap-1.5 flex-wrap">
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => handleStatusChange(value)}
                  disabled={updating}
                  className={`px-3 py-1.5 rounded-full font-semibold text-xs transition-all ${
                    localTask.status === value
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
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs font-semibold text-gray-600 mb-1">Início</div>
              <div className="text-sm font-bold text-gray-900">{formatDate(localTask.created_at)}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs font-semibold text-gray-600 mb-1">Conclusão</div>
              <div className={`text-sm font-bold ${localTask.due_date ? 'text-gray-900' : 'text-gray-400'}`}>
                {localTask.due_date ? (
                  <>
                    {formatDate(localTask.due_date)}
                    {new Date(localTask.due_date) < new Date() && localTask.status !== 'done' && (
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
          {localTask.description && (
            <div>
              <h3 className="text-xs font-semibold text-gray-700 mb-2 uppercase">Observações</h3>
              <p className="text-gray-600 text-xs whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">
                {localTask.description}
              </p>
            </div>
          )}

          {/* History */}
          <div>
            <h3 className="text-xs font-semibold text-gray-700 mb-3 uppercase">Histórico</h3>
            <div className="space-y-3">
              {/* Created */}
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-3 h-3 bg-gray-300 rounded-full"></div>
                  <div className="w-0.5 h-8 bg-gray-200 mt-1"></div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">ontem · 16:45</div>
                  <div className="text-xs font-semibold text-gray-700">Tarefa criada</div>
                </div>
              </div>

              {/* Status changes - example */}
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  <div className="w-0.5 h-8 bg-gray-200 mt-1"></div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">hoje · 14:20</div>
                  <div className="text-xs font-semibold text-gray-700">Status → Em andamento</div>
                </div>
              </div>

              {/* Last change */}
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">hoje · 14:25</div>
                  <div className="text-xs font-semibold text-gray-700">Status → {STATUS_LABELS[localTask.status]}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-5 py-3 flex items-center justify-between">
          <button
            onClick={handleDelete}
            disabled={deleting || updating}
            className="px-3 py-1.5 bg-red-50 text-red-600 font-semibold rounded-lg text-sm hover:bg-red-100 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Excluir
          </button>
          <button
            onClick={handleMarkAsCompleted}
            disabled={updating}
            className="px-4 py-1.5 bg-green-50 text-green-700 font-semibold rounded-lg text-sm hover:bg-green-100 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <span>✓</span>
            Marcar como finalizada
          </button>
        </div>
      </div>
    </div>
  )
}
