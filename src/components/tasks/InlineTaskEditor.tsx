'use client'

import { useState } from 'react'
import { updateTask } from '@/lib/actions'

interface InlineTaskEditorProps {
  taskId: string
  currentStatus?: string
  currentDueDate?: string | undefined
  currentPriority?: string
  onSave: () => void
}

const STATUS_LABELS: Record<string, string> = {
  todo: 'A fazer',
  doing: 'Em andamento',
  paused: 'Pausada',
  done: 'Concluído',
}

const getTodayString = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const isYesterdayDate = (dateStr: string | undefined) => {
  if (!dateStr) return false
  const taskDate = dateStr.split('T')[0]
  const today = getTodayString()

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
    const daysInMonth = new Date(yesterdayYear, yesterdayMonth, 0).getDate()
    yesterdayDay = daysInMonth
  }

  const yesterday = `${yesterdayYear}-${String(yesterdayMonth).padStart(2, '0')}-${String(yesterdayDay).padStart(2, '0')}`
  return taskDate === yesterday
}

const isOverdueDate = (dateStr: string | undefined) => {
  if (!dateStr) return false
  const taskDate = dateStr.split('T')[0]
  const today = getTodayString()
  return taskDate < today
}

export function InlineStatusEditor({ taskId, currentStatus, onSave }: InlineTaskEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [status, setStatus] = useState(currentStatus)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (status !== currentStatus) {
      setSaving(true)
      setError(null)
      const result = await updateTask(taskId, { status })
      setSaving(false)

      if (result?.error) {
        setError(result.error)
        console.error('Error updating task status:', result.error)
        // Reset status to previous value on error
        setStatus(currentStatus)
      } else {
        onSave()
      }
    }
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        onBlur={handleSave}
        autoFocus
        disabled={saving}
        onClick={(e) => e.stopPropagation()}
        className="px-2 py-1 rounded text-xs font-semibold border border-gray-300 bg-white cursor-pointer"
      >
        <option value="todo">A fazer</option>
        <option value="doing">Em andamento</option>
        <option value="paused">Pausada</option>
      </select>
    )
  }

  return (
    <div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setIsEditing(true)
          setError(null)
        }}
        className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity ${
          error ? 'bg-red-50 text-red-700 border border-red-300' :
          currentStatus === 'todo'
            ? 'bg-blue-50 text-blue-700'
            : currentStatus === 'doing'
              ? 'bg-yellow-50 text-yellow-700'
              : currentStatus === 'paused'
                ? 'bg-orange-50 text-orange-700'
                : 'bg-green-50 text-green-700'
        }`}
        title={error ? `Erro: ${error}` : ''}
      >
        {error ? '⚠️ Erro' : (currentStatus ? STATUS_LABELS[currentStatus] : 'Desconhecido')}
      </button>
      {error && (
        <div className="text-xs text-red-600 mt-1 px-1">
          {error}
        </div>
      )}
    </div>
  )
}

export function InlineDateEditor({ taskId, currentDueDate, onSave }: InlineTaskEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [dueDate, setDueDate] = useState(currentDueDate?.split('T')[0] || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const formatDateDisplay = (dateStr: string | undefined) => {
    if (!dateStr) return 'Sem prazo'
    const [year, month, day] = dateStr.split('-')
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
    return `${day} de ${months[parseInt(month) - 1]}`
  }

  const getDateStyles = (dateStr: string | undefined) => {
    if (!dateStr) return { text: 'Sem prazo', className: 'text-gray-400', icon: '' }

    if (isOverdueDate(dateStr)) {
      if (isYesterdayDate(dateStr)) {
        return { text: 'ontem', className: 'text-red-600 font-semibold', icon: '⚠️ ' }
      }
      return { text: formatDateDisplay(dateStr), className: 'text-red-600 font-semibold', icon: '⚠️ ' }
    }

    return { text: formatDateDisplay(dateStr), className: 'text-gray-600', icon: '' }
  }

  const handleSave = async () => {
    if (dueDate !== currentDueDate?.split('T')[0]) {
      setSaving(true)
      setError(null)
      const result = await updateTask(taskId, { due_date: dueDate })
      setSaving(false)

      if (result?.error) {
        setError(result.error)
        console.error('Error updating task due date:', result.error)
        // Reset date to previous value on error
        setDueDate(currentDueDate?.split('T')[0] || '')
      } else {
        onSave()
      }
    }
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          onBlur={handleSave}
          autoFocus
          disabled={saving}
          onClick={(e) => e.stopPropagation()}
          className={`px-2 py-1 rounded text-xs border bg-white cursor-pointer ${
            error ? 'border-red-300' : 'border-gray-300'
          }`}
        />
        {error && <div className="text-xs text-red-600 mt-1 px-1">{error}</div>}
      </div>
    )
  }

  const dateStyles = getDateStyles(currentDueDate?.split('T')[0])

  return (
    <div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setIsEditing(true)
          setError(null)
        }}
        className={`text-xs font-semibold whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity ${
          error ? 'text-red-600' : dateStyles.className
        }`}
        title={error ? `Erro: ${error}` : ''}
      >
        {error ? '⚠️ Erro' : `${dateStyles.icon}${dateStyles.text}`}
      </button>
      {error && <div className="text-xs text-red-600 mt-1 px-1">{error}</div>}
    </div>
  )
}

export function InlinePriorityEditor({ taskId, currentPriority, onSave }: InlineTaskEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [priority, setPriority] = useState(currentPriority || 'mid')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const priorityIcon = {
    high: '›',
    mid: '›',
    low: '›',
  }

  const handleSave = async () => {
    if (priority !== currentPriority) {
      setSaving(true)
      setError(null)
      const result = await updateTask(taskId, { priority })
      setSaving(false)

      if (result?.error) {
        setError(result.error)
        console.error('Error updating task priority:', result.error)
        // Reset priority to previous value on error
        setPriority(currentPriority || 'mid')
      } else {
        onSave()
      }
    }
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          onBlur={handleSave}
          autoFocus
          disabled={saving}
          onClick={(e) => e.stopPropagation()}
          className={`px-2 py-1 rounded text-xs font-semibold border bg-white cursor-pointer ${
            error ? 'border-red-300' : 'border-gray-300'
          }`}
        >
          <option value="high">Alta</option>
          <option value="mid">Média</option>
          <option value="low">Baixa</option>
        </select>
        {error && <div className="text-xs text-red-600 mt-1 px-1">{error}</div>}
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setIsEditing(true)
          setError(null)
        }}
        title={error ? `Erro: ${error}` : `Prioridade: ${priority === 'high' ? 'Alta' : priority === 'mid' ? 'Média' : 'Baixa'}`}
        className={`flex items-center gap-1 text-sm font-semibold cursor-pointer hover:opacity-80 transition-opacity ${
          error ? 'text-red-600' : 'text-gray-700'
        }`}
      >
        {error ? '⚠️ Erro' : (
          <>
            <span className="text-lg">
              {priority === 'high' ? '🔴' : priority === 'mid' ? '🟡' : '⚪'}
            </span>
            <span className="text-xs">
              {priority === 'high' ? 'Alta' : priority === 'mid' ? 'Média' : 'Baixa'}
            </span>
          </>
        )}
      </button>
      {error && <div className="text-xs text-red-600 mt-1 px-1">{error}</div>}
    </div>
  )
}

export function InlineTitleEditor({ taskId, currentTitle, onSave }: { taskId: string; currentTitle: string; onSave: () => void }) {
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(currentTitle)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (title.trim() !== currentTitle.trim() && title.trim()) {
      setSaving(true)
      setError(null)
      const result = await updateTask(taskId, { title: title.trim() })
      setSaving(false)

      if (result?.error) {
        setError(result.error)
        console.error('Error updating task title:', result.error)
        setTitle(currentTitle)
      } else {
        onSave()
      }
    }
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleSave()
          } else if (e.key === 'Escape') {
            setTitle(currentTitle)
            setIsEditing(false)
          }
        }}
        autoFocus
        disabled={saving}
        className="flex-1 text-sm font-semibold border border-blue-400 rounded px-2 py-1 outline-none"
      />
    )
  }

  return (
    <h4
      onClick={() => setIsEditing(true)}
      className={`text-sm font-semibold cursor-text hover:text-blue-600 transition-colors ${
        error ? 'text-red-600' : 'text-gray-900'
      }`}
      title="Clique para editar"
    >
      {error ? '⚠️ Erro ao salvar' : currentTitle}
    </h4>
  )
}
