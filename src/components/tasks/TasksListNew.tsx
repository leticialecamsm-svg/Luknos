'use client'

import { useState, useTransition } from 'react'
import { getTasks, updateTaskStatus, deleteTask, createTask } from '@/lib/actions'
import { TasksViewModal } from './TasksViewModal'
import { TasksEditModal } from './TasksEditModal'
import { TasksModal } from './TasksModal'
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
  const [showNewTaskModal, setShowNewTaskModal] = useState(false)
  const [inlineTaskTitleHigh, setInlineTaskTitleHigh] = useState('')
  const [inlineTaskTitleOther, setInlineTaskTitleOther] = useState('')
  const [isPending, startTransition] = useTransition()
  const [initialized, setInitialized] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterPriority, setFilterPriority] = useState<string>('')

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

  // Aplicar filtros
  const applyFilters = (task: Task) => {
    if (filterPriority && task.priority !== filterPriority) return false
    if (filterStatus && task.status !== filterStatus) return false
    return true
  }

  // Separar tarefas em 3 seções
  // Alta prioridade: tarefas com prioridade "alta" OU vencidas
  const highPriorityTasks = tasks.filter(t => {
    if (t.status === 'done') return false
    if (!applyFilters(t)) return false
    // Incluir se prioridade é alta
    if (t.priority === 'high') return true
    // Incluir se está vencida (de qualquer prioridade)
    if (isOverdue(t.due_date)) return true
    return false
  })

  // Outras tarefas: não alta prioridade E não vencidas
  const otherTasks = tasks.filter(t => {
    if (t.status === 'done') return false
    if (!applyFilters(t)) return false
    // Excluir se prioridade é alta
    if (t.priority === 'high') return false
    // Excluir se está vencida
    if (isOverdue(t.due_date)) return false
    return true
  })

  const completedTasks = tasks.filter(t => t.status === 'done' && applyFilters(t))

  const handleCheckboxChange = async (taskId: string, currentStatus: string) => {
    startTransition(async () => {
      // Se já está concluída, voltar para "Em andamento"
      // Se não está concluída, marcar como "Concluída"
      const newStatus = currentStatus === 'done' ? 'doing' : 'done'
      await updateTaskStatus(taskId, newStatus)
      loadTasks()
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

  const handleAddTaskInline = async (priority: 'high' | 'mid') => {
    const title = priority === 'high' ? inlineTaskTitleHigh : inlineTaskTitleOther
    if (!title.trim()) return

    startTransition(async () => {
      const result = await createTask({
        title: title,
        priority: priority,
        status: 'todo',
      })
      if (!result.error) {
        if (priority === 'high') {
          setInlineTaskTitleHigh('')
        } else {
          setInlineTaskTitleOther('')
        }
        loadTasks()
      }
    })
  }

  const getTodayString = () => {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const formatDateDisplay = (dateStr: string | undefined) => {
    if (!dateStr) return ''
    const [year, month, day] = dateStr.split('-')
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
    return `${day} de ${months[parseInt(month) - 1]}`
  }

  const isOverdue = (dueDate: string | undefined) => {
    if (!dueDate) return false
    const taskDate = dueDate.split('T')[0]
    const today = getTodayString()
    return taskDate < today
  }

  const renderTaskRow = (task: Task, isCompleted: boolean = false) => (
    <div
      key={task.id}
      className={`border rounded-lg p-3 hover:shadow-md transition-shadow group flex items-center gap-3 ${
        isCompleted
          ? 'bg-green-50 border-green-200'
          : 'bg-white border-gray-200'
      }`}
    >
      <input
        type="checkbox"
        checked={isCompleted}
        onChange={(e) => {
          e.stopPropagation()
          handleCheckboxChange(task.id, task.status)
        }}
        className={`w-5 h-5 rounded cursor-pointer flex-shrink-0 ${
          isCompleted
            ? 'border-green-400 bg-green-500 accent-green-500'
            : 'border-gray-300'
        }`}
      />
      <div
        onClick={() => setViewTask(task)}
        className="flex-1 cursor-pointer min-w-0"
      >
        <h4 className={`text-sm font-semibold ${
          isCompleted ? 'text-gray-500 line-through' : 'text-gray-900'
        }`}>
          {task.title}
        </h4>
        {task.checklist && task.checklist.length > 0 && (
          <p className={`text-xs mt-0.5 ${
            isCompleted ? 'text-gray-400' : 'text-gray-600'
          }`}>
            {task.checklist.filter(c => c.done).length}/{task.checklist.length} subtarefas
          </p>
        )}
      </div>
      <div className="flex items-center gap-3 ml-auto flex-shrink-0">
        {!isCompleted && (
          <>
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
                {isOverdue(task.due_date) ? '⚠ ontem' : formatDateDisplay(task.due_date)}
              </span>
            )}
            <span className="text-xs font-bold">
              {task.priority === 'high' ? '🔴' : task.priority === 'mid' ? '🟡' : '⚪'}
            </span>
          </>
        )}
        {isCompleted && (
          <span className="text-xs font-semibold text-green-700">Concluída</span>
        )}
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setEditTask(task)
          }}
          className={`p-1.5 rounded transition-colors ${
            isCompleted ? 'hover:bg-green-100' : 'hover:bg-blue-50'
          }`}
          title="Editar"
        >
          <Edit2 className={`w-4 h-4 ${isCompleted ? 'text-green-600' : 'text-blue-600'}`} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleDelete(task.id)
          }}
          className={`p-1.5 rounded transition-colors ${
            isCompleted ? 'hover:bg-green-100' : 'hover:bg-red-50'
          }`}
          title="Deletar"
        >
          <Trash2 className={`w-4 h-4 ${isCompleted ? 'text-green-600' : 'text-red-600'}`} />
        </button>
      </div>
    </div>
  )

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
          <button
            onClick={() => setShowNewTaskModal(true)}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            + Nova tarefa
          </button>
        </div>
      </div>

      {/* Top Stats Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-6">
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

        <div className="w-px h-12 bg-gray-200"></div>

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
        <button
          onClick={() => { setFilterPriority(''); setFilterStatus('') }}
          className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
            !filterPriority && !filterStatus ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
          }`}
        >
          Todas
        </button>
        <button
          onClick={() => setFilterPriority(filterPriority === 'high' ? '' : 'high')}
          className={`px-3 py-2 rounded-full text-sm font-semibold transition-colors ${
            filterPriority === 'high' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
          }`}
        >
          🔴 Alta
        </button>
        <button
          onClick={() => setFilterPriority(filterPriority === 'mid' ? '' : 'mid')}
          className={`px-3 py-2 rounded-full text-sm font-semibold transition-colors ${
            filterPriority === 'mid' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
          }`}
        >
          🟡 Média
        </button>
        <button
          onClick={() => setFilterPriority(filterPriority === 'low' ? '' : 'low')}
          className={`px-3 py-2 rounded-full text-sm font-semibold transition-colors ${
            filterPriority === 'low' ? 'bg-slate-50 text-slate-700 border border-slate-200' : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
          }`}
        >
          ⚪ Baixa
        </button>
        <button
          onClick={() => setFilterStatus(filterStatus === 'todo' ? '' : 'todo')}
          className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
            filterStatus === 'todo' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
          }`}
        >
          A fazer
        </button>
        <button
          onClick={() => setFilterStatus(filterStatus === 'doing' ? '' : 'doing')}
          className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
            filterStatus === 'doing' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
          }`}
        >
          Em andamento
        </button>
        <button
          onClick={() => setFilterStatus(filterStatus === 'done' ? '' : 'done')}
          className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
            filterStatus === 'done' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
          }`}
        >
          Concluídas
        </button>
      </div>

      {/* ALTA PRIORIDADE */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-red-600 font-bold">●</span>
            <span className="text-xs font-bold text-red-700 uppercase tracking-wide">Alta Prioridade</span>
          </div>
          <span className="text-sm font-bold text-red-600">{highPriorityTasks.length}</span>
        </div>
        {highPriorityTasks.map(task => renderTaskRow(task, false))}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleAddTaskInline('high')
          }}
          className="px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={inlineTaskTitleHigh}
              onChange={(e) => setInlineTaskTitleHigh(e.target.value)}
              placeholder="Adicionar tarefa de alta prioridade..."
              className="flex-1 border-none outline-none text-sm bg-transparent placeholder-gray-400 text-gray-700"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddTaskInline('high')
                }
              }}
            />
          </div>
        </form>
      </div>

      {/* OUTRAS TAREFAS */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Outras Tarefas</span>
          <span className="text-sm font-bold text-gray-600">{otherTasks.length}</span>
        </div>
        {otherTasks.map(task => renderTaskRow(task, false))}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleAddTaskInline('mid')
          }}
          className="px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={inlineTaskTitleOther}
              onChange={(e) => setInlineTaskTitleOther(e.target.value)}
              placeholder="Adicionar tarefa..."
              className="flex-1 border-none outline-none text-sm bg-transparent placeholder-gray-400 text-gray-700"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddTaskInline('mid')
                }
              }}
            />
          </div>
        </form>
      </div>

      {/* CONCLUÍDAS HOJE */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-3 py-2 bg-green-50 rounded">
          <div className="flex items-center gap-2">
            <span className="text-green-600 font-bold">✓</span>
            <span className="text-xs font-bold text-green-700 uppercase tracking-wide">Concluídas Hoje</span>
          </div>
          <span className="text-sm font-bold text-green-600">{completedTasks.length}</span>
        </div>
        {completedTasks.map((task) => renderTaskRow(task, true))}
      </div>

      {/* Modais */}
      {showNewTaskModal && <TasksModal onClose={() => setShowNewTaskModal(false)} onSuccess={() => { setShowNewTaskModal(false); loadTasks() }} />}
      {viewTask && <TasksViewModal task={viewTask} onClose={() => setViewTask(null)} onEdit={(task) => { setViewTask(null); setEditTask(task) }} />}
      {editTask && <TasksEditModal task={editTask} onClose={() => setEditTask(null)} onSuccess={() => { loadTasks(); setEditTask(null) }} />}
    </div>
  )
}
