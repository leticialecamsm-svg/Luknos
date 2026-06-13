'use client'

import { useState, useTransition, useEffect } from 'react'
import { getTasks, updateTaskStatus, deleteTask, createTask, getCurrentUser } from '@/lib/actions'
import { TasksViewModal } from './TasksViewModal'
import { TasksEditModal } from './TasksEditModal'
import { TasksModal } from './TasksModal'
import { InlineStatusEditor, InlineDateEditor, InlinePriorityEditor } from './InlineTaskEditor'
import { Trash2, Edit2, Plus } from 'lucide-react'

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
  const [showAllCompleted, setShowAllCompleted] = useState(false)
  const [userName, setUserName] = useState<string>('Usuário')
  const [draggedTask, setDraggedTask] = useState<string | null>(null)

  // Carregar tarefas
  const loadTasks = async () => {
    setLoading(true)
    const data = await getTasks()
    setTasks(data as Task[])
    setLoading(false)
  }

  // Carregar nome do usuário
  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser()
      if (user?.name) {
        setUserName(user.name)
      }
    }
    loadUser()
  }, [])

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

  // Funções utilitárias de data (precisam ser definidas antes de usar)
  const getTodayString = () => {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const isOverdue = (dueDate: string | undefined) => {
    if (!dueDate) return false
    const taskDate = dueDate.split('T')[0]
    const today = getTodayString()
    return taskDate < today
  }

  const isYesterday = (dueDate: string | undefined) => {
    if (!dueDate) return false
    const taskDate = dueDate.split('T')[0]
    const today = getTodayString()

    // Calcula ontem usando apenas strings (evita problemas de timezone)
    const [year, month, day] = today.split('-').map(Number)
    let yesterdayDay = day - 1
    let yesterdayMonth = month
    let yesterdayYear = year

    if (yesterdayDay < 1) {
      yesterdayMonth -= 1
      if (yesterdayMonth < 1) {
        yesterdayMonth = 12
        yesterdayYear -= 1
      }
      // Último dia do mês anterior
      const daysInMonth = new Date(yesterdayYear, yesterdayMonth, 0).getDate()
      yesterdayDay = daysInMonth
    }

    const yesterday = `${yesterdayYear}-${String(yesterdayMonth).padStart(2, '0')}-${String(yesterdayDay).padStart(2, '0')}`

    return taskDate === yesterday
  }

  const formatDateDisplay = (dateStr: string | undefined) => {
    if (!dateStr) return ''
    // Pega apenas a parte da data (antes do T se tiver hora)
    const datePart = dateStr.split('T')[0]
    const [year, month, day] = datePart.split('-')
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
    return `${day} de ${months[parseInt(month) - 1]}`
  }

  const isTodayCompleted = (completedAt: string | null | undefined) => {
    if (!completedAt) return false
    const completedDate = completedAt.split('T')[0]
    const today = getTodayString()
    return completedDate === today
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

  // Tarefas concluídas: separar por "hoje" e "anteriores"
  const allCompletedTasks = tasks.filter(t => t.status === 'done' && applyFilters(t))
  const completedTodayTasks = allCompletedTasks.filter(t => isTodayCompleted(t.completed_at))
  const completedPreviousTasks = allCompletedTasks.filter(t => !isTodayCompleted(t.completed_at))
    .sort((a, b) => {
      // Ordenar por data de conclusão (mais recente primeiro)
      const dateA = a.completed_at ? new Date(a.completed_at).getTime() : 0
      const dateB = b.completed_at ? new Date(b.completed_at).getTime() : 0
      return dateB - dateA
    })

  const handleCheckboxChange = async (taskId: string, currentStatus: string) => {
    startTransition(async () => {
      // Se já está concluída, voltar para "Em andamento"
      // Se não está concluída, marcar como "Concluída"
      const newStatus = currentStatus === 'done' ? 'doing' : 'done'
      await updateTaskStatus(taskId, newStatus)
      loadTasks()
    })
  }

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTask(taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, targetTaskId: string) => {
    e.preventDefault()
    if (!draggedTask || draggedTask === targetTaskId) {
      setDraggedTask(null)
      return
    }

    // Reordenar tarefas: mover dragged para posição de target
    const draggedIndex = tasks.findIndex(t => t.id === draggedTask)
    const targetIndex = tasks.findIndex(t => t.id === targetTaskId)

    if (draggedIndex !== -1 && targetIndex !== -1) {
      const newTasks = [...tasks]
      const [removed] = newTasks.splice(draggedIndex, 1)
      newTasks.splice(targetIndex, 0, removed)
      setTasks(newTasks)
    }

    setDraggedTask(null)
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

    // Calcular data FORA do startTransition para garantir que é avaliada corretamente
    const todayDate = getTodayString()

    startTransition(async () => {
      const result = await createTask({
        title: title,
        priority: priority,
        status: 'todo',
        due_date: todayDate,
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

  const renderTaskRow = (task: Task, isCompleted: boolean = false) => (
    <div
      key={task.id}
      draggable={!isCompleted}
      onDragStart={(e) => handleDragStart(e, task.id)}
      onDragOver={handleDragOver}
      onDrop={(e) => handleDrop(e, task.id)}
      className={`border-b p-2.5 transition-colors group flex items-center gap-3 cursor-move ${
        draggedTask === task.id ? 'opacity-50 bg-blue-50' : 'hover:bg-gray-50'
      } ${
        isCompleted
          ? 'border-green-100'
          : 'border-gray-200'
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
            <InlineStatusEditor taskId={task.id} currentStatus={task.status} currentDueDate={task.due_date} onSave={loadTasks} />
            <InlineDateEditor taskId={task.id} currentStatus={task.status} currentDueDate={task.due_date} onSave={loadTasks} />
            <InlinePriorityEditor taskId={task.id} currentPriority={task.priority} onSave={loadTasks} />
          </>
        )}
        {isCompleted && task.completed_at && (
          <span className="text-xs font-semibold text-green-700">Concluída em {formatDateDisplay(task.completed_at)}</span>
        )}
        {isCompleted && !task.completed_at && (
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
          <p className="text-sm text-gray-600">{userName} · {totalTasks} tarefas · {pendingCount} pendentes</p>
        </div>
        <button
          onClick={() => setShowNewTaskModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          + Nova tarefa
        </button>
      </div>

      {/* Top Stats Bar */}
      <div className="flex gap-3 items-stretch">
        {/* Stat Cards */}
        <div className="grid grid-cols-4 gap-3 flex-1">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
            <div className="text-xs font-semibold text-gray-600 mb-1">A fazer</div>
            <div className="text-2xl font-bold text-gray-900">{todoCount}</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
            <div className="text-xs font-semibold text-gray-600 mb-1">Em andamento</div>
            <div className="text-2xl font-bold text-blue-600">{doingCount}</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
            <div className="text-xs font-semibold text-gray-600 mb-1">Pendente</div>
            <div className="text-2xl font-bold text-orange-600">{pendingCount}</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
            <div className="text-xs font-semibold text-gray-600 mb-1">Concluídas</div>
            <div className="text-2xl font-bold text-green-600">{doneCount}</div>
          </div>
        </div>

        {/* Progress Card */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 min-w-64 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-green-700">Progresso hoje</span>
            <span className="text-xs font-bold text-green-600">{progressPercent}%</span>
          </div>
          <div className="h-2 bg-green-200 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progressPercent}%` }}></div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap items-center">
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

        {/* Priority Dropdown */}
        <div className="relative">
          <button
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors flex items-center gap-2 ${
              filterPriority ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
            }`}
          >
            {filterPriority === 'high' && '🔴 Alta'}
            {filterPriority === 'mid' && '🟡 Média'}
            {filterPriority === 'low' && '⚪ Baixa'}
            {!filterPriority && '🔴 Alta'}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>

          <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-32">
            <button
              onClick={() => setFilterPriority(filterPriority === 'high' ? '' : 'high')}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${
                filterPriority === 'high' ? 'bg-red-50 text-red-700 font-semibold' : 'text-gray-700'
              }`}
            >
              🔴 Alta
            </button>
            <button
              onClick={() => setFilterPriority(filterPriority === 'mid' ? '' : 'mid')}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${
                filterPriority === 'mid' ? 'bg-amber-50 text-amber-700 font-semibold' : 'text-gray-700'
              }`}
            >
              🟡 Média
            </button>
            <button
              onClick={() => setFilterPriority(filterPriority === 'low' ? '' : 'low')}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors rounded-b-lg ${
                filterPriority === 'low' ? 'bg-slate-50 text-slate-700 font-semibold' : 'text-gray-700'
              }`}
            >
              ⚪ Baixa
            </button>
          </div>
        </div>

        <button
          onClick={() => {
            setFilterStatus(filterStatus === 'done' ? '' : 'done')
            setShowAllCompleted(false)
          }}
          className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
            filterStatus === 'done' && !showAllCompleted ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
          }`}
        >
          Concluídas
        </button>

        {filterStatus === 'done' && (
          <button
            onClick={() => setShowAllCompleted(!showAllCompleted)}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              showAllCompleted ? 'bg-green-600 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
            }`}
          >
            Ver histórico
          </button>
        )}
      </div>

      {/* Mostrar apenas ALTA PRIORIDADE e OUTRAS TAREFAS se não estiver vendo Concluídas */}
      {filterStatus !== 'done' && (
        <>
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
        </>
      )}

      {/* CONCLUÍDAS */}
      {(() => {
        // Modo "todas": ativo quando filtro "Concluídas" ou botão "Ver histórico" selecionado
        const showAllMode = showAllCompleted || filterStatus === 'done'
        const totalCompleted = completedTodayTasks.length + completedPreviousTasks.length

        // Esconde a seção quando, no modo padrão, não há concluídas hoje
        if (!showAllMode && completedTodayTasks.length === 0) return null

        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-3 py-2 bg-green-50 rounded">
              <div className="flex items-center gap-2">
                <span className="text-green-600 font-bold">✓</span>
                <span className="text-xs font-bold text-green-700 uppercase tracking-wide">
                  {showAllMode ? 'Concluídas' : 'Concluídas Hoje'}
                </span>
              </div>
              <span className="text-sm font-bold text-green-600">
                {showAllMode ? totalCompleted : completedTodayTasks.length}
              </span>
            </div>
            {showAllMode ? (
              <>
                {/* Todas as concluídas, ordenadas do mais recente ao mais antigo */}
                {completedTodayTasks.length > 0 && (
                  <div className="px-3 py-1 text-xs font-semibold text-gray-600 bg-green-100">Hoje</div>
                )}
                {completedTodayTasks.map((task) => renderTaskRow(task, true))}

                {completedPreviousTasks.length > 0 && (
                  <div className="px-3 py-1 text-xs font-semibold text-gray-600 bg-gray-100">Anteriores</div>
                )}
                {completedPreviousTasks.map((task) => renderTaskRow(task, true))}

                {totalCompleted === 0 && (
                  <div className="px-3 py-4 text-sm text-gray-400 text-center">Nenhuma tarefa concluída ainda</div>
                )}
              </>
            ) : (
              completedTodayTasks.map((task) => renderTaskRow(task, true))
            )}
          </div>
        )
      })()}

      {/* Modais */}
      {showNewTaskModal && <TasksModal onClose={() => setShowNewTaskModal(false)} onSuccess={() => { setShowNewTaskModal(false); loadTasks() }} />}
      {viewTask && <TasksViewModal task={viewTask} onClose={() => setViewTask(null)} onEdit={(task) => { setViewTask(null); setEditTask(task) }} />}
      {editTask && <TasksEditModal task={editTask} onClose={() => setEditTask(null)} onSuccess={() => { loadTasks(); setEditTask(null) }} />}
    </div>
  )
}
