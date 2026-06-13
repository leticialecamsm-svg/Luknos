'use client'

import { X, Edit2, Trash2 } from 'lucide-react'
import { deleteTask, updateTaskStatus } from '@/lib/actions'
import { useState } from 'react'
import { SubtasksList } from './SubtasksList'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'

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
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const toast = useToast()

  const handleDelete = async () => {
    setDeleting(true)
    const result = await deleteTask(task.id)
    if (result?.error) {
      toast.error('OCORREU UM ERRO', 'Não foi possível excluir a tarefa.')
      setDeleting(false)
    } else {
      toast.success('TUDO CERTO!', 'Tarefa excluída com sucesso.')
      onClose()
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    setUpdating(true)
    setLocalTask({ ...localTask, status: newStatus as Task['status'] })
    const result = await updateTaskStatus(task.id, newStatus)
    setUpdating(false)
    if (result?.error) {
      toast.error('OCORREU UM ERRO', 'Não foi possível atualizar o status.')
    } else {
      toast.success('TUDO CERTO!', 'Status atualizado com sucesso.')
    }
    onStatusChange?.()
  }

  const handleMarkAsCompleted = async () => {
    setUpdating(true)
    const newStatus = localTask.status === 'done' ? 'doing' : 'done'
    setLocalTask({ ...localTask, status: newStatus as Task['status'] })
    const result = await updateTaskStatus(task.id, newStatus)
    setUpdating(false)
    if (result?.error) {
      toast.error('OCORREU UM ERRO', 'Não foi possível atualizar a tarefa.')
    } else {
      toast.success('TUDO CERTO!', newStatus === 'done' ? 'Tarefa finalizada!' : 'Tarefa reaberta.')
    }
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

          {/* Subtarefas */}
          <div className="border-t border-gray-100 pt-4">
            <SubtasksList
              taskId={localTask.id}
              allDone={localTask.status === 'done'}
              onSubtasksChange={onStatusChange}
            />
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
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-5 py-3 flex items-center justify-between">
          <button
            onClick={() => setShowConfirmDelete(true)}
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

      {showConfirmDelete && (
        <ConfirmModal
          message="Tem certeza que deseja deletar esta tarefa?"
          onConfirm={() => { setShowConfirmDelete(false); handleDelete() }}
          onCancel={() => setShowConfirmDelete(false)}
        />
      )}
    </div>
  )
}
