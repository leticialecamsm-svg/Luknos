'use client'

import { useState, useTransition } from 'react'
import { getTasks, updateTaskStatus, deleteTask, createTask } from '@/lib/actions'
import { TasksViewModal } from './TasksViewModal'
import { TasksEditModal } from './TasksEditModal'
import { Trash2, Edit2, Plus } from 'lucide-react'

interface Task {
  id: string
  title: string
  description?: string
  status: 'todo' | 'doing' | 'pending' | 'done'
  priority: 'high' | 'mid' | 'low'
  due_date?: string
  checklist?: { text: string; done: boolean }[]
  created_at: string
}

const STATUS_LABELS = {
  todo: 'A fazer',
  doing: 'Em andamento',
  pending: 'Pendente',
  done: 'Concluídas',
}

const PRIORITY_COLORS = {
  high: { bg: 'bg-red-50', text: 'text-red-700', badge: '🔴' },
  mid: { bg: 'bg-amber-50', text: 'text-amber-700', badge: '🟡' },
  low: { bg: 'bg-slate-50', text: 'text-slate-700', badge: '⚪' },
}

export function TasksListNew() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [viewTask, setViewTask] = useState<Task | null>(null)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [filterPriority, setFilterPriority] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [isPending, startTransition] = useTransition()
  const [initialized, setInitialized] = useState(false)

  // Carregar tarefas
  const loadTasks = async () => {
    setLoading(true)
    const data = await getTasks()
    setTasks(data as Task[])
    setLoading(false)
  }

  if (!initialized) {
    setInitialized(true)
    loadTasks()
  }

  const todoCount = tasks.filter(t => t.status === 'todo').length
  const doingCount = tasks.filter(t => t.status === 'doing').length
  const pendingCount = tasks.filter(t => t.status === 'pending').length
  const doneCount = tasks.filter(t => t.status === 'done').length

  const progressPercent = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0

  const filteredTasks = tasks.filter(t => {
    if (filterStatus && t.status !== filterStatus) return false
    if (filterPriority && t.priority !== filterPriority) return false
    return true
  })

  const groupedByStatus = {
    todo: filteredTasks.filter(t => t.status === 'todo'),
    doing: filteredTasks.filter(t => t.status === 'doing'),
    pending: filteredTasks.filter(t => t.status === 'pending'),
    done: filteredTasks.filter(t => t.status === 'done'),
  }

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskTitle.trim()) return

    startTransition(async () => {
      const result = await createTask({
        title: newTaskTitle,
        priority: 'mid',
        status: 'todo',
      })
      if (!result.error) {
        setNewTaskTitle('')
        loadTasks()
      }
    })
  }

  const handleDelete = (taskId: string) => {
    if (confirm('Tem certeza que deseja deletar esta tarefa?')) {
      startTransition(async () => {
        await deleteTask(taskId)
        loadTasks()
      })
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Minhas tarefas</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            Seu nome · {todoCount + doingCount + pendingCount} tarefas · {pendingCount} pendentes
          </p>
        </div>
        <button
          onClick={() => {/* Nova tarefa modal */}}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          + Nova tarefa
        </button>
      </div>

      {/* Progress Bar */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">Progresso hoje</span>
          <span className="text-sm font-bold text-green-600">{progressPercent}%</span>
        </div>
        <div className="w-full h-2 bg-green-200 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progressPercent}%` }}></div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">{todoCount}</div>
          <div className="text-xs text-gray-600 mt-1">A fazer</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-yellow-600">{doingCount}</div>
          <div className="text-xs text-gray-600 mt-1">Em andamento</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-orange-600">{pendingCount}</div>
          <div className="text-xs text-gray-600 mt-1">Pendente</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{doneCount}</div>
          <div className="text-xs text-gray-600 mt-1">Concluídas</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Buscar tarefas..."
          className="px-4 py-2 border border-gray-200 rounded-full text-sm bg-white flex-1 min-w-48 focus:outline-none focus:border-blue-500"
        />
        <button className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
          !filterStatus && !filterPriority ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`} onClick={() => { setFilterStatus(''); setFilterPriority('') }}>
          Todas
        </button>
        <button className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors flex items-center gap-1 ${
          filterPriority === 'high' ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
        }`} onClick={() => setFilterPriority(filterPriority === 'high' ? '' : 'high')}>
          🔴 Alta
        </button>
        <button className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors flex items-center gap-1 ${
          filterPriority === 'mid' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
        }`} onClick={() => setFilterPriority(filterPriority === 'mid' ? '' : 'mid')}>
          🟡 Média
        </button>
        <button className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors flex items-center gap-1 ${
          filterPriority === 'low' ? 'bg-slate-100 text-slate-700 border border-slate-200' : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
        }`} onClick={() => setFilterPriority(filterPriority === 'low' ? '' : 'low')}>
          ⚪ Baixa
        </button>
        <button className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
          filterStatus === 'todo' ? 'bg-gray-800 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
        }`} onClick={() => setFilterStatus(filterStatus === 'todo' ? '' : 'todo')}>
          A fazer
        </button>
        <button className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
          filterStatus === 'doing' ? 'bg-gray-800 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
        }`} onClick={() => setFilterStatus(filterStatus === 'doing' ? '' : 'doing')}>
          Em andamento
        </button>
        <button className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
          filterStatus === 'done' ? 'bg-gray-800 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
        }`} onClick={() => setFilterStatus(filterStatus === 'done' ? '' : 'done')}>
          Concluídas
        </button>
      </div>

      {/* Tasks by Status */}
      {Object.entries(groupedByStatus).map(([status, statusTasks]) => (
        <div key={status} className="space-y-2">
          {statusTasks.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-gray-700 uppercase tracking-wide">
              <span className={`inline-block ${
                status === 'todo' ? 'text-blue-700' :
                status === 'doing' ? 'text-yellow-700' :
                status === 'pending' ? 'text-orange-700' :
                'text-green-700'
              }`}>
                {status === 'todo' && '●'}
                {status === 'doing' && '●'}
                {status === 'pending' && '●'}
                {status === 'done' && '✓'}
              </span>
              {status === 'todo' && 'ALTA PRIORIDADE'}
              {status === 'doing' && 'OUTRAS TAREFAS'}
              {status === 'pending' && 'PENDENTES'}
              {status === 'done' && 'CONCLUÍDAS HOJE'}
              <span className="ml-auto text-gray-500">{statusTasks.length}</span>
            </div>
          )}

          {statusTasks.map((task) => (
            <div
              key={task.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow group cursor-pointer flex items-center gap-3"
              onClick={() => setViewTask(task)}
            >
              <input type="checkbox" className="w-5 h-5 rounded border-gray-300 cursor-pointer" />
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-gray-900">{task.title}</h4>
                {task.checklist && task.checklist.length > 0 && (
                  <p className="text-xs text-gray-600 mt-0.5">
                    {task.checklist.filter(c => c.done).length}/{task.checklist.length} subtarefas
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  task.status === 'todo' ? 'bg-blue-100 text-blue-700' :
                  task.status === 'doing' ? 'bg-yellow-100 text-yellow-700' :
                  task.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {STATUS_LABELS[task.status]}
                </span>
                {task.due_date && (
                  <span className="text-xs text-gray-600 whitespace-nowrap">
                    {new Date(task.due_date).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditTask(task)
                  }}
                  className="p-1.5 hover:bg-blue-50 rounded transition-colors"
                  title="Editar"
                >
                  <Edit2 className="w-4 h-4 text-blue-600" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(task.id)
                  }}
                  className="p-1.5 hover:bg-red-50 rounded transition-colors"
                  title="Deletar"
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </button>
              </div>
            </div>
          ))}

          {/* Add Task Inline */}
          {status === 'pending' && (
            <form onSubmit={handleAddTask} className="bg-white border border-dashed border-gray-300 rounded-lg p-3 hover:border-blue-400 transition-colors">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={`Adicionar tarefa de ${STATUS_LABELS[status as keyof typeof STATUS_LABELS]}...`}
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="flex-1 border-none outline-none text-sm text-gray-700 placeholder-gray-400 bg-transparent"
                />
              </div>
            </form>
          )}
        </div>
      ))}

      {/* Modais */}
      {viewTask && <TasksViewModal task={viewTask} onClose={() => setViewTask(null)} onEdit={(task) => { setViewTask(null); setEditTask(task) }} />}
      {editTask && <TasksEditModal task={editTask} onClose={() => setEditTask(null)} onSuccess={() => { loadTasks(); setEditTask(null) }} />}
    </div>
  )
}
