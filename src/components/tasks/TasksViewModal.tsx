'use client'

import { X, Edit2, Trash2 } from 'lucide-react'
import { deleteTask, updateTaskStatus } from '@/lib/actions'
import { useState } from 'react'

interface Task {
  id: string
  title: string
  description?: string
  status: 'todo' | 'doing' | 'pending' | 'done'
  priority: 'high' | 'mid' | 'low'
  due_date?: string
  checklist?: { text: string; done: boolean }[]
  created_at: string
  history?: Array<{
    type: string
    timestamp: string
    user_id: string
    changes: any
  }>
}

interface TasksViewModalProps {
  task: Task
  onClose: () => void
  onEdit: (task: Task) => void
  onSuccess?: () => void
}

const STATUS_LABELS = {
  todo: 'A fazer',
  doing: 'Em andamento',
  pending: 'Pendente',
  done: 'Finalizada',
}

const PRIORITY_LABELS = {
  high: 'Alta',
  mid: 'Média',
  low: 'Baixa',
}

const PRIORITY_COLORS = {
  high: { dot: 'bg-red-600', text: 'text-red-700' },
  mid: { dot: 'bg-amber-600', text: 'text-amber-700' },
  low: { dot: 'bg-gray-600', text: 'text-gray-700' },
}

export function TasksViewModal({ task, onClose, onEdit, onSuccess }: TasksViewModalProps) {
  const [deleting, setDeleting] = useState(false)
  const [marking, setMarking] = useState(false)

  const handleDelete = async () => {
    if (confirm('Tem certeza que deseja deletar esta tarefa?')) {
      setDeleting(true)
      await deleteTask(task.id)
      onClose()
    }
  }

  const handleMarkAsDone = async () => {
    setMarking(true)
    const newStatus = task.status === 'done' ? 'doing' : 'done'
    await updateTaskStatus(task.id, newStatus)
    onClose()
    onSuccess?.()
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    const datePart = dateStr.split('T')[0]
    const [year, month, day] = datePart.split('-')
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
    return `${day}/${month}/${year.slice(-2)}`
  }

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString('pt-BR', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const getCompletionDate = () => {
    if (task.status === 'done') {
      // Procura o evento mais recente de conclusão no histórico
      const doneEvents = task.history?.filter((h: any) => h.type === 'status_changed' && h.changes?.status === 'done')
      return doneEvents?.[doneEvents.length - 1]?.timestamp
    }
    return null
  }

  const getHistoryLabel = (type: string, changes: any) => {
    if (type === 'created') return 'Tarefa criada'
    if (type === 'status_changed') return `Status → ${STATUS_LABELS[changes.status as keyof typeof STATUS_LABELS]}`
    if (type === 'updated') {
      const keys = Object.keys(changes).filter(k => k !== 'undefined')
      if (keys.includes('status')) return `Status → ${STATUS_LABELS[changes.status as keyof typeof STATUS_LABELS]}`
      return `${keys.join(', ')} alterado`
    }
    return 'Alteração'
  }

  const checklist = task.checklist || []
  const completedCount = checklist.filter(c => c.done).length

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 mb-3">{task.title}</h2>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Prioridade */}
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-3 h-3 rounded-full ${PRIORITY_COLORS[task.priority].dot}`}></span>
                  <span className={`text-sm font-semibold ${PRIORITY_COLORS[task.priority].text}`}>
                    {PRIORITY_LABELS[task.priority]}
                  </span>
                </div>
                {/* Status */}
                <span className="text-sm font-semibold text-blue-600">
                  {STATUS_LABELS[task.status]}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onEdit(task)}
                className="p-2.5 hover:bg-gray-100 rounded-lg transition-colors"
                title="Editar"
              >
                <Edit2 className="w-5 h-5 text-blue-600" />
              </button>
              <button
                onClick={onClose}
                className="p-2.5 hover:bg-gray-100 rounded-lg transition-colors"
                title="Fechar"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Status Buttons */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Status</h4>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>).map((status) => (
                <button
                  key={status}
                  onClick={async () => {
                    setMarking(true)
                    await updateTaskStatus(task.id, status)
                    setMarking(false)
                    onSuccess?.()
                  }}
                  disabled={marking}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                    task.status === status
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  } disabled:opacity-50`}
                >
                  {STATUS_LABELS[status]}
                </button>
              ))}
            </div>
          </div>

          {/* Datas */}
          <div className="flex gap-6">
            <div className="bg-gray-50 rounded-lg p-4 flex-1">
              <p className="text-xs text-gray-600 font-semibold mb-1">Início</p>
              <p className="text-lg font-bold text-gray-900">{formatDate(task.created_at)}</p>
            </div>
            {task.due_date && (
              <div className={`rounded-lg p-4 flex-1 ${task.status === 'done' ? 'bg-green-50' : 'bg-gray-50'}`}>
                <p className={`text-xs font-semibold mb-1 ${task.status === 'done' ? 'text-green-700' : 'text-gray-600'}`}>
                  {task.status === 'done' ? 'Conclusão' : 'Conclusão'}
                </p>
                <p className={`text-lg font-bold ${task.status === 'done' ? 'text-green-700' : 'text-gray-900'}`}>
                  {formatDate(task.due_date)}
                  {task.status === 'done' && getCompletionDate() && !task.due_date?.includes('T') && ' ✓'}
                </p>
                {task.status !== 'done' && (
                  <p className={`text-xs mt-1 ${new Date(task.due_date) < new Date() ? 'text-red-600' : 'text-gray-600'}`}>
                    {new Date(task.due_date) < new Date() ? '⚠ Vencida' : 'Prazo'}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Subtarefas */}
          {checklist.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-700">Subtarefas</h4>
                <p className="text-xs font-semibold text-gray-600">
                  {completedCount}/{checklist.length} concluídas · {Math.round((completedCount / checklist.length) * 100)}%
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-2 mb-2">
                <div className="w-full bg-gray-300 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-green-500 h-full transition-all"
                    style={{ width: `${(completedCount / checklist.length) * 100}%` }}
                  ></div>
                </div>
              </div>
              <div className="space-y-2">
                {checklist.map((item, idx) => (
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
            </div>
          )}

          {/* Observações */}
          {task.description && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Observações</h4>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
              </div>
            </div>
          )}

          {/* Histórico */}
          {task.history && task.history.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Histórico</h4>
              <div className="space-y-3">
                {task.history
                  .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                  .map((entry: any, idx: number) => {
                    const date = new Date(entry.timestamp)
                    const isToday = new Date().toDateString() === date.toDateString()
                    const isYesterday = new Date(new Date().setDate(new Date().getDate() - 1)).toDateString() === date.toDateString()

                    let timeLabel = ''
                    if (isToday) {
                      timeLabel = `hoje · ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                    } else if (isYesterday) {
                      timeLabel = `ontem · ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                    } else {
                      timeLabel = date.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })
                    }

                    return (
                      <div key={idx} className="flex gap-4 pb-3">
                        <div className="flex flex-col items-center">
                          <div className="w-2.5 h-2.5 rounded-full bg-blue-600 mt-2"></div>
                          {idx < task.history!.length - 1 && <div className="w-0.5 h-12 bg-gray-300 my-1"></div>}
                        </div>
                        <div className="flex-1 pb-3">
                          <p className="text-sm font-semibold text-gray-900">
                            {getHistoryLabel(entry.type, entry.changes)}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">{timeLabel}</p>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex gap-3">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 bg-red-50 text-red-600 font-semibold rounded-lg hover:bg-red-100 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            Excluir
          </button>
          <div className="flex-1"></div>
          <button
            onClick={handleMarkAsDone}
            disabled={marking}
            className={`px-4 py-2 font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 ${
              task.status === 'done'
                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            ✓ Marcar como {task.status === 'done' ? 'pendente' : 'finalizada'}
          </button>
        </div>
      </div>
    </div>
  )
}
