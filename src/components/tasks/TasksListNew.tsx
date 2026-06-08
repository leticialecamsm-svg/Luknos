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

export function TasksListNew() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [viewTask, setViewTask] = useState<Task | null>(null)
  const [editTask, setEditTask] = useState<Task | null>(null)
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
  const totalTasks = tasks.length

  const progressPercent = totalTasks > 0 ? Math.round((doneCount / totalTasks) * 100) : 0

  // Separar tarefas em 3 seções
  const highPriorityTasks = tasks.filter(t => {
    if (t.status === 'done') return false
    if (t.priority === 'high') return true
    // Tarefas atrasadas também vão para alta prioridade
    if (t.due_date && new Date(t.due_date) < new Date(new Date().setHours(0, 0, 0, 0))) return true
    return false
  })

  const otherTasks = tasks.filter(t => {
    if (t.status === 'done') return false
    if (t.priority === 'high') return false
    // Não incluir tarefas atrasadas
    if (t.due_date && new Date(t.due_date) < new Date(new Date().setHours(0, 0, 0, 0))) return false
    return true
  })

  const completedTasks = tasks.filter(t => t.status === 'done')

  const handleCheckboxChange = async (taskId: string) => {
    startTransition(async () => {
      const task = tasks.find(t => t.id === taskId)
      if (task) {
        await updateTaskStatus(taskId, 'done')
        loadTasks()
      }
    })
  }

  const handleAddTask = async (e: React.FormEvent, section: 'high' | 'other') => {
    e.preventDefault()
    if (!newTaskTitle.trim()) return

    startTransition(async () => {
      // Data de hoje
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const dueDate = today.toISOString().split('T')[0]

      const result = await createTask({
        title: newTaskTitle,
        priority: section === 'high' ? 'high' : 'mid',
        status: 'todo',
        due_date: dueDate,
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

  const isOverdue = (dueDate: string | undefined) => {
    if (!dueDate) return false
    return new Date(dueDate) < new Date(new Date().setHours(0, 0, 0, 0))
  }

  const getPriorityBadge = (priority: string, overdue: boolean) => {
    if (overdue) return '⚠ ontem'
    if (priority === 'high') return '🔴'
    if (priority === 'mid') return '🟡'
    return '⚪'
  }

  const getTodayDate = () => {
    const today = new Date()
    return today.toLocaleDateString('pt-BR', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Minhas tarefas</h1>
          <p className="text-sm text-gray-600">Jennifer · {totalTasks} tarefas · {pendingCount} pendentes</p>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors">
            ≡ Lista
          </button>
          <button className="px-3 py-1.5 bg-white text-gray-700 border border-gray-200 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors">
            ■ Kanban
          </button>
          <button className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
            + Nova tarefa
          </button>
        </div>
      </div>

      {/* Top Stats Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-6">
        {/* Stats */}
        <div className="flex gap-6">
          <div className="text-center">
            <div className="text-sm font-bold text-gray-700">A fazer</div>
            <div className="text-lg font-bold text-gray-900">{todoCount}</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-bold text-gray-700">Em andamento</div>
            <div className="text-lg font-bold text-gray-900">{doingCount}</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-bold text-gray-700">Pendente</div>
            <div className="text-lg font-bold text-orange-600">{pendingCount}</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-bold text-gray-700">Concluídas</div>
            <div className="text-lg font-bold text-green-600">{doneCount}</div>
          </div>
        </div>

        {/* Separator */}
        <div className="w-px h-12 bg-gray-200"></div>

        {/* Progress Bar */}
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Progresso hoje</span>
            <span className="text-sm font-bold text-green-600">{progressPercent}%</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progressPercent}%` }}></div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Buscar tarefas..."
          className="px-4 py-2 border border-gray-300 rounded-full text-sm bg-white flex-1 min-w-48 focus:outline-none focus:border-blue-500"
        />
        <button className="px-4 py-2 bg-gray-900 text-white rounded-full text-sm font-semibold">
          Todas
        </button>
        <button className="px-3 py-2 bg-red-50 text-red-700 rounded-full text-sm font-semibold border border-red-200">
          🔴 Alta
        </button>
        <button className="px-3 py-2 bg-white text-gray-700 rounded-full text-sm font-semibold border border-gray-200 hover:border-gray-300">
          🟡 Média
        </button>
        <button className="px-3 py-2 bg-white text-gray-700 rounded-full text-sm font-semibold border border-gray-200 hover:border-gray-300">
          ⚪ Baixa
        </button>
        <button className="px-4 py-2 bg-white text-gray-700 rounded-full text-sm font-semibold border border-gray-200 hover:border-gray-300">
          A fazer
        </button>
        <button className="px-4 py-2 bg-white text-gray-700 rounded-full text-sm font-semibold border border-gray-200 hover:border-gray-300">
          Em andamento
        </button>
        <button className="px-4 py-2 bg-white text-gray-700 rounded-full text-sm font-semibold border border-gray-200 hover:border-gray-300">
          Concluídas
        </button>
      </div>

      {/* ALTA PRIORIDADE */}
      {highPriorityTasks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-red-600 font-bold">●</span>
              <span className="text-xs font-bold text-red-700 uppercase tracking-wide">Alta Prioridade</span>
            </div>
            <span className="text-sm font-bold text-red-600">{highPriorityTasks.length}</span>
          </div>

          {highPriorityTasks.map((task) => (
            <div
              key={task.id}
              className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow group flex items-center gap-3"
            >
              <input
                type="checkbox"
                checked={false}
                onChange={() => handleCheckboxChange(task.id)}
                className="w-5 h-5 rounded border-gray-300 cursor-pointer flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-gray-900">{task.title}</h4>
                {task.checklist && task.checklist.length > 0 && (
                  <p className="text-xs text-gray-600 mt-0.5">
                    {task.checklist.filter(c => c.done).length}/{task.checklist.length} subtarefas
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 ml-auto flex-shrink-0">
                <span className={`px-2.5 py-1 rounded text-xs font-semibold ${
                  task.status === 'todo' ? 'bg-blue-50 text-blue-700' :
                  task.status === 'doing' ? 'bg-yellow-50 text-yellow-700' :
                  task.status === 'pending' ? 'bg-orange-50 text-orange-700' :
                  'bg-green-50 text-green-700'
                }`}>
                  {STATUS_LABELS[task.status]}
                </span>
                {task.due_date && (
                  <span className={`text-xs font-semibold whitespace-nowrap ${
                    isOverdue(task.due_date) ? 'text-red-600' : 'text-gray-600'
                  }`}>
                    {isOverdue(task.due_date) ? '⚠ ontem' : task.due_date.split('T')[0]}
                  </span>
                )}
                <span className="text-xs font-bold">{getPriorityBadge(task.priority, isOverdue(task.due_date))}</span>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setEditTask(task)}
                  className="p-1.5 hover:bg-blue-50 rounded transition-colors"
                  title="Editar"
                >
                  <Edit2 className="w-4 h-4 text-blue-600" />
                </button>
                <button
                  onClick={() => handleDelete(task.id)}
                  className="p-1.5 hover:bg-red-50 rounded transition-colors"
                  title="Deletar"
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </button>
              </div>
            </div>
          ))}

          {/* Add High Priority Task */}
          <form onSubmit={(e) => handleAddTask(e, 'high')} className="px-3 py-2">
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <Plus className="w-4 h-4" />
              <input
                type="text"
                placeholder="Adicionar tarefa de alta prioridade..."
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                className="flex-1 border-none outline-none text-sm bg-transparent placeholder-gray-400"
              />
              <button
                type="submit"
                className="flex gap-2 text-xs font-semibold text-gray-600 hover:text-gray-900"
              >
                <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700">🔴 Alta</span>
                <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">📅 Data</span>
                <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">Mais ›</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* OUTRAS TAREFAS */}
      {otherTasks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-3 py-2 text-gray-600">
            <span className="text-xs font-bold uppercase tracking-wide">Outras Tarefas</span>
            <span className="text-sm font-bold">{otherTasks.length}</span>
          </div>

          {otherTasks.map((task) => (
            <div
              key={task.id}
              className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow group flex items-center gap-3"
            >
              <input
                type="checkbox"
                checked={false}
                onChange={() => handleCheckboxChange(task.id)}
                className="w-5 h-5 rounded border-gray-300 cursor-pointer flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-gray-900">{task.title}</h4>
              </div>
              <div className="flex items-center gap-3 ml-auto flex-shrink-0">
                <span className={`px-2.5 py-1 rounded text-xs font-semibold ${
                  task.status === 'todo' ? 'bg-blue-50 text-blue-700' :
                  task.status === 'doing' ? 'bg-yellow-50 text-yellow-700' :
                  task.status === 'pending' ? 'bg-orange-50 text-orange-700' :
                  'bg-green-50 text-green-700'
                }`}>
                  {STATUS_LABELS[task.status]}
                </span>
                {task.due_date && (
                  <span className="text-xs font-semibold text-gray-600 whitespace-nowrap">
                    {task.due_date.split('T')[0]}
                  </span>
                )}
                <span className="text-xs font-bold text-gray-600">{getPriorityBadge(task.priority, false)}</span>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setEditTask(task)}
                  className="p-1.5 hover:bg-blue-50 rounded transition-colors"
                  title="Editar"
                >
                  <Edit2 className="w-4 h-4 text-blue-600" />
                </button>
                <button
                  onClick={() => handleDelete(task.id)}
                  className="p-1.5 hover:bg-red-50 rounded transition-colors"
                  title="Deletar"
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </button>
              </div>
            </div>
          ))}

          {/* Add Other Task */}
          <form onSubmit={(e) => handleAddTask(e, 'other')} className="px-3 py-2">
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <Plus className="w-4 h-4" />
              <input
                type="text"
                placeholder="Adicionar tarefa..."
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                className="flex-1 border-none outline-none text-sm bg-transparent placeholder-gray-400"
              />
              <button
                type="submit"
                className="flex gap-2 text-xs font-semibold text-gray-600 hover:text-gray-900"
              >
                <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">🔴 Alta</span>
                <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">📅 Data</span>
                <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">Mais ›</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CONCLUÍDAS HOJE */}
      {completedTasks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-3 py-2 bg-green-50 rounded">
            <div className="flex items-center gap-2">
              <span className="text-green-600 font-bold">✓</span>
              <span className="text-xs font-bold text-green-700 uppercase tracking-wide">Concluídas Hoje</span>
            </div>
            <span className="text-sm font-bold text-green-600">{completedTasks.length}</span>
          </div>

          {completedTasks.map((task) => (
            <div
              key={task.id}
              className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3 opacity-75"
            >
              <input
                type="checkbox"
                checked={true}
                onChange={() => {}}
                className="w-5 h-5 rounded border-green-400 bg-green-500 cursor-pointer flex-shrink-0 accent-green-500"
              />
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-gray-500 line-through">{task.title}</h4>
              </div>
              <div className="flex items-center gap-3 ml-auto flex-shrink-0">
                <span className="text-xs font-semibold text-green-700">Concluída</span>
                {task.due_date && (
                  <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">
                    {task.due_date.split('T')[0]}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modais */}
      {viewTask && <TasksViewModal task={viewTask} onClose={() => setViewTask(null)} onEdit={(task) => { setViewTask(null); setEditTask(task) }} />}
      {editTask && <TasksEditModal task={editTask} onClose={() => setEditTask(null)} onSuccess={() => { loadTasks(); setEditTask(null) }} />}
    </div>
  )
}
