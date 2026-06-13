'use client'

import { useState, useTransition } from 'react'
import { getTasks, updateTaskStatus, deleteTask } from '@/lib/actions'
import { TasksModal } from './TasksModal'
import { TasksViewModal } from './TasksViewModal'
import { TasksEditModal } from './TasksEditModal'
import { Trash2, Edit2, ChevronDown } from 'lucide-react'
import { useConfirm } from '@/components/ui/useConfirm'

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

export function TasksList() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [viewTask, setViewTask] = useState<Task | null>(null)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterPriority, setFilterPriority] = useState<string>('')
  const { confirm, ConfirmDialog } = useConfirm()
  const [isPending, startTransition] = useTransition()

  // Carregar tarefas
  const loadTasks = async () => {
    setLoading(true)
    const data = await getTasks({
      status: filterStatus || undefined,
      priority: filterPriority || undefined,
    })
    setTasks(data as Task[])
    setLoading(false)
  }

  // Efeito inicial
  const [initialized, setInitialized] = useState(false)
  if (!initialized) {
    setInitialized(true)
    loadTasks()
  }

  const handleStatusChange = (taskId: string, newStatus: string) => {
    startTransition(async () => {
      await updateTaskStatus(taskId, newStatus)
      loadTasks()
    })
  }

  const handleDelete = async (taskId: string) => {
    const ok = await confirm('Tem certeza que deseja deletar esta tarefa?', 'Sim, deletar')
    if (!ok) return
    startTransition(async () => {
      await deleteTask(taskId)
      loadTasks()
    })
  }

  const handleNewTask = () => {
    setShowNewModal(true)
  }

  const handleTaskCreated = () => {
    setShowNewModal(false)
    loadTasks()
  }

  const handleTaskUpdated = () => {
    setEditTask(null)
    loadTasks()
  }

  const groupedByStatus = {
    todo: tasks.filter(t => t.status === 'todo'),
    doing: tasks.filter(t => t.status === 'doing'),
    paused: tasks.filter(t => t.status === 'paused'),
    done: tasks.filter(t => t.status === 'done'),
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Minhas Tarefas</h1>
          <p className="text-sm text-gray-600 mt-1">Total: {tasks.length} tarefas</p>
        </div>
        <button
          onClick={handleNewTask}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Nova Tarefa
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-6">
        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value)
            loadTasks()
          }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
        >
          <option value="">Todos os status</option>
          <option value="todo">A fazer</option>
          <option value="doing">Fazendo</option>
          <option value="pending">Pausada</option>
          <option value="done">Concluído</option>
        </select>

        <select
          value={filterPriority}
          onChange={(e) => {
            setFilterPriority(e.target.value)
            loadTasks()
          }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
        >
          <option value="">Todas as prioridades</option>
          <option value="high">Alta</option>
          <option value="mid">Média</option>
          <option value="low">Baixa</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Carregando tarefas...</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500">Nenhuma tarefa encontrada</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByStatus).map(([status, groupTasks]) => (
            <div key={status}>
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-gray-50">
                <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[status as keyof typeof STATUS_COLORS].bg} ${STATUS_COLORS[status as keyof typeof STATUS_COLORS].text}`}>
                  {status === 'todo' && 'A Fazer'}
                  {status === 'doing' && 'Fazendo'}
                  {status === 'paused' && 'Pausada'}
                  {status === 'done' && 'Concluído'}
                </span>
                <span className="text-sm font-semibold text-gray-700 ml-auto">{groupTasks.length}</span>
              </div>

              {groupTasks.map((task) => (
                <div
                  key={task.id}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer group"
                  onClick={() => setViewTask(task)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{task.title}</h3>
                      {task.description && (
                        <p className="text-sm text-gray-600 truncate">{task.description}</p>
                      )}
                      <div className="flex gap-2 mt-2">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${PRIORITY_COLORS[task.priority].bg} ${PRIORITY_COLORS[task.priority].text}`}>
                          {task.priority === 'high' && 'Alta'}
                          {task.priority === 'mid' && 'Média'}
                          {task.priority === 'low' && 'Baixa'}
                        </span>
                        {task.due_date && (
                          <span className="text-xs text-gray-600">
                            Prazo: {new Date(task.due_date).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity ml-4 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditTask(task)
                        }}
                        className="p-2 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4 text-blue-600" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(task.id)
                        }}
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                        title="Deletar"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Modais */}
      {showNewModal && <TasksModal onClose={() => setShowNewModal(false)} onSuccess={handleTaskCreated} />}
      {viewTask && <TasksViewModal task={viewTask} onClose={() => setViewTask(null)} onEdit={(task) => { setViewTask(null); setEditTask(task) }} />}
      {editTask && <TasksEditModal task={editTask} onClose={() => setEditTask(null)} onSuccess={handleTaskUpdated} />}
      {ConfirmDialog}
    </div>
  )
}
