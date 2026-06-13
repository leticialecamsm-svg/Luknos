'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { getTasks, updateTaskStatus, deleteTask, createTask, getCurrentUser } from '@/lib/actions'
import { TasksViewModal } from './TasksViewModal'
import { TasksEditModal } from './TasksEditModal'
import { TasksModal } from './TasksModal'
import { InlineStatusEditor, InlineDateEditor, InlinePriorityEditor, InlineTitleEditor } from './InlineTaskEditor'
import { Trash2, Edit2, Plus, Pencil } from 'lucide-react'

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

const STATUS_LABELS = {
  todo: 'A fazer',
  doing: 'Em andamento',
  paused: 'Pausada',
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
  const [isPriorityDropdownOpen, setIsPriorityDropdownOpen] = useState(false)

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

  // Funções utilitárias de data (precisam ser definidas antes de usar)
  const getTodayString = () => {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const isTaskTodayOrOverdue = (dueDate: string | undefined) => {
    if (!dueDate) return false
    const taskDate = dueDate.split('T')[0]
    const today = getTodayString()
    return taskDate <= today
  }

  const todoCount = tasks.filter(t => t.status === 'todo').length
  const doingCount = tasks.filter(t => t.status === 'doing').length
  const pendingCount = tasks.filter(t => t.status === 'paused').length
  const doneCount = tasks.filter(t => t.status === 'done').length
  const totalTasks = tasks.length

  // Para o progresso, considerar apenas tarefas de hoje ou atrasadas
  const todayOrOverdueTasks = tasks.filter(t => isTaskTodayOrOverdue(t.due_date) && t.status !== 'done')
  const todayOrOverdueDoneCount = tasks.filter(t => isTaskTodayOrOverdue(t.due_date) && t.status === 'done').length
  const todayOrOverdueTotalTasks = todayOrOverdueTasks.length + todayOrOverdueDoneCount

  const progressPercent = todayOrOverdueTotalTasks > 0 ? Math.round((todayOrOverdueDoneCount / todayOrOverdueTotalTasks) * 100) : 0

  // Aplicar filtros
  const applyFilters = (task: Task) => {
    if (filterPriority && task.priority !== filterPriority) return false
    if (filterStatus && task.status !== filterStatus) return false
    return true
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

  // Componente separado para cada linha de tarefa
  const TaskRow = ({ task, isCompleted }: { task: Task; isCompleted: boolean }) => {
    const titleEditorRef = useRef<any>(null)

    return (
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
        className={`w-5 h-5 rounded-md cursor-pointer flex-shrink-0 ${
          isCompleted
            ? 'border-green-400 bg-green-500 accent-green-500'
            : 'border-gray-300'
        }`}
      />
      <div
        onClick={() => setViewTask(task)}
        className="flex-1 min-w-0 cursor-pointer group"
      >
        <div className="flex items-center gap-2">
          {!isCompleted ? (
            <>
              <InlineTitleEditor ref={titleEditorRef} taskId={task.id} currentTitle={task.title} onSave={loadTasks} />
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  titleEditorRef.current?.startEditing()
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-yellow-50 rounded"
                title="Editar título"
              >
                <Pencil className="w-3 h-3" style={{ color: '#CBA455' }} />
              </button>
            </>
          ) : (
            <h4 className="text-sm font-semibold text-gray-500 line-through hover:text-gray-600">
              {task.title}
            </h4>
          )}
        </div>
        {task.checklist && task.checklist.length > 0 && (
          <p
            className={`text-xs mt-0.5 ${
              isCompleted ? 'text-gray-400' : 'text-gray-600'
            }`}
          >
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
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Minhas tarefas</h1>
          <p className="text-sm text-gray-600">{userName} · {totalTasks} tarefas · {pendingCount} pausadas</p>
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
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-center">
            <div className="text-xs font-semibold text-gray-600 mb-0.5">A fazer</div>
            <div className="text-lg font-bold text-gray-900">{todoCount}</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-center">
            <div className="text-xs font-semibold text-gray-600 mb-0.5">Em andamento</div>
            <div className="text-lg font-bold text-blue-600">{doingCount}</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-center">
            <div className="text-xs font-semibold text-gray-600 mb-0.5">Pausada</div>
            <div className="text-lg font-bold text-orange-600">{pendingCount}</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-center">
            <div className="text-xs font-semibold text-gray-600 mb-0.5">Concluídas</div>
            <div className="text-lg font-bold text-green-600">{doneCount}</div>
          </div>
        </div>

        {/* Progress Card */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex-1 space-y-2">
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
            onClick={() => setIsPriorityDropdownOpen(!isPriorityDropdownOpen)}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors flex items-center gap-2 ${
              filterPriority === 'high' ? 'bg-white text-red-700 border-2' :
              filterPriority === 'mid' ? 'text-yellow-900 border-2' :
              filterPriority === 'low' ? 'bg-white text-gray-600 border-2' :
              'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
            }`}
            style={
              filterPriority === 'high' ? { borderColor: '#DC2626', color: '#DC2626' } :
              filterPriority === 'mid' ? { backgroundColor: '#FFFBE3', borderColor: '#B69900', color: '#B69900' } :
              filterPriority === 'low' ? { borderColor: '#E5E3DB', color: '#344153' } :
              {}
            }
          >
            {filterPriority ? (
              <>
                {filterPriority === 'high' && '🔴 Alta'}
                {filterPriority === 'mid' && '🟡 Média'}
                {filterPriority === 'low' && '⚪ Baixa'}
              </>
            ) : (
              'Prioridade:'
            )}
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </button>

          {isPriorityDropdownOpen && (
            <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-32">
              <button
                onClick={() => {
                  setFilterPriority(filterPriority === 'high' ? '' : 'high')
                  setIsPriorityDropdownOpen(false)
                }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${
                  filterPriority === 'high' ? 'bg-red-50 text-red-700 font-semibold' : 'text-gray-700'
                }`}
              >
                🔴 Alta
              </button>
              <button
                onClick={() => {
                  setFilterPriority(filterPriority === 'mid' ? '' : 'mid')
                  setIsPriorityDropdownOpen(false)
                }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors ${
                  filterPriority === 'mid' ? 'bg-amber-50 text-amber-700 font-semibold' : 'text-gray-700'
                }`}
              >
                🟡 Média
              </button>
              <button
                onClick={() => {
                  setFilterPriority(filterPriority === 'low' ? '' : 'low')
                  setIsPriorityDropdownOpen(false)
                }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors rounded-b-lg ${
                  filterPriority === 'low' ? 'bg-slate-50 text-slate-700 font-semibold' : 'text-gray-700'
                }`}
              >
                ⚪ Baixa
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => {
            setFilterStatus(filterStatus === 'done' ? '' : 'done')
            setShowAllCompleted(false)
          }}
          className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
            filterStatus === 'done' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
          }`}
        >
          Concluídas
        </button>
      </div>

      {/* Quando há filtro de prioridade, mostrar apenas as tarefas daquela prioridade */}
      {filterPriority && filterStatus !== 'done' && (
        <div className="bg-white rounded-lg overflow-hidden border border-gray-200">
          <div className={`flex items-center gap-2 px-3 py-2 ${
            filterPriority === 'high' ? 'bg-red-50' :
            filterPriority === 'mid' ? 'bg-yellow-50' :
            'bg-gray-50'
          }`}>
            <span className={`font-bold text-lg ${
              filterPriority === 'high' ? 'text-red-600' :
              filterPriority === 'mid' ? 'text-yellow-600' :
              'text-gray-400'
            }`}>●</span>
            <span className={`text-xs font-bold uppercase tracking-wide ${
              filterPriority === 'high' ? 'text-red-700' :
              filterPriority === 'mid' ? 'text-yellow-700' :
              'text-gray-700'
            }`}>
              {filterPriority === 'high' && 'Alta Prioridade'}
              {filterPriority === 'mid' && 'Média Prioridade'}
              {filterPriority === 'low' && 'Baixa Prioridade'}
            </span>
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
              filterPriority === 'high' ? 'bg-red-200 text-red-700' :
              filterPriority === 'mid' ? 'bg-yellow-200 text-yellow-700' :
              'bg-gray-200 text-gray-700'
            }`}>
              {tasks.filter(t => t.status !== 'done' && t.priority === filterPriority).length}
            </span>
          </div>
          <div className="space-y-0">
            {tasks.filter(t => t.status !== 'done' && t.priority === filterPriority).map(task => <TaskRow task={task} isCompleted={false} />)}
          </div>
        </div>
      )}

      {/* Mostrar apenas ALTA PRIORIDADE e OUTRAS TAREFAS se não estiver vendo Concluídas E não houver filtro de prioridade */}
      {!filterPriority && filterStatus !== 'done' && (
        <>
          {/* ALTA PRIORIDADE */}
          <div className="bg-white rounded-lg overflow-hidden border border-gray-200">
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50">
              <span className="text-red-600 font-bold">●</span>
              <span className="text-xs font-bold text-red-700 uppercase tracking-wide">Alta Prioridade</span>
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold bg-red-200 text-red-700">
                {highPriorityTasks.length}
              </span>
            </div>
            <div className="space-y-0">
                {highPriorityTasks.map(task => <TaskRow task={task} isCompleted={false} />)}
            </div>
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
          <div className="bg-white rounded-lg overflow-hidden border border-gray-200">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Outras Tarefas</span>
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold bg-gray-200 text-gray-700">
                {otherTasks.length}
              </span>
            </div>
            <div className="space-y-0">
              {otherTasks.map(task => <TaskRow task={task} isCompleted={false} />)}
            </div>
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

        // Esconde a seção quando filtro de prioridade está ativo
        if (filterPriority) return null

        // Esconde a seção quando, no modo padrão, não há concluídas hoje
        if (!showAllMode && completedTodayTasks.length === 0) return null

        return (
          <div className="bg-white rounded-lg overflow-hidden border border-gray-200">
            <div className="flex items-center gap-2 px-3 py-2 bg-green-50">
              <span className="text-green-600 font-bold">✓</span>
              <span className="text-xs font-bold text-green-700 uppercase tracking-wide">
                {showAllMode ? 'Concluídas' : 'Concluídas Hoje'}
              </span>
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold bg-green-200 text-green-700">
                {showAllMode ? totalCompleted : completedTodayTasks.length}
              </span>
            </div>
            <div className="space-y-0">
            {showAllMode ? (
              <>
                {/* Todas as concluídas, ordenadas do mais recente ao mais antigo */}
                {completedTodayTasks.length > 0 && (
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 border-t border-gray-100">Hoje</div>
                )}
                {completedTodayTasks.map((task) => <TaskRow task={task} isCompleted={true} />)}

                {completedPreviousTasks.length > 0 && (
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 border-t border-gray-100">Anteriores</div>
                )}
                {completedPreviousTasks.map((task) => <TaskRow task={task} isCompleted={true} />)}

                {totalCompleted === 0 && (
                  <div className="px-3 py-4 text-sm text-gray-400 text-center">Nenhuma tarefa concluída ainda</div>
                )}
              </>
            ) : (
              completedTodayTasks.map((task) => <TaskRow task={task} isCompleted={true} />)
            )}
            </div>
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
