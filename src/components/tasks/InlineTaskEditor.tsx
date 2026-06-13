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

  const handleSave = async () => {
    if (status !== currentStatus) {
      setSaving(true)
      await updateTask(taskId, { status })
      setSaving(false)
      onSave()
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
    <button
      onClick={(e) => {
        e.stopPropagation()
        setIsEditing(true)
      }}
      className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity ${
        currentStatus === 'todo'
          ? 'bg-blue-50 text-blue-700'
          : currentStatus === 'doing'
            ? 'bg-yellow-50 text-yellow-700'
            : currentStatus === 'paused'
              ? 'bg-orange-50 text-orange-700'
              : 'bg-green-50 text-green-700'
      }`}
    >
      {currentStatus ? STATUS_LABELS[currentStatus] : 'Desconhecido'}
    </button>
  )
}

export function InlineDateEditor({ taskId, currentDueDate, onSave }: InlineTaskEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [dueDate, setDueDate] = useState(currentDueDate?.split('T')[0] || '')
  const [saving, setSaving] = useState(false)

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
      await updateTask(taskId, { due_date: dueDate })
      setSaving(false)
      onSave()
    }
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        onBlur={handleSave}
        autoFocus
        disabled={saving}
        onClick={(e) => e.stopPropagation()}
        className="px-2 py-1 rounded text-xs border border-gray-300 bg-white cursor-pointer"
      />
    )
  }

  const dateStyles = getDateStyles(currentDueDate?.split('T')[0])

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        setIsEditing(true)
      }}
      className={`text-xs font-semibold whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity ${dateStyles.className}`}
    >
      {dateStyles.icon}{dateStyles.text}
    </button>
  )
}

export function InlinePriorityEditor({ taskId, currentPriority, onSave }: InlineTaskEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [priority, setPriority] = useState(currentPriority || 'mid')
  const [saving, setSaving] = useState(false)

  const priorityEmoji = {
    high: '🔴',
    mid: '🟡',
    low: '⚪',
  }

  const handleSave = async () => {
    if (priority !== currentPriority) {
      setSaving(true)
      await updateTask(taskId, { priority })
      setSaving(false)
      onSave()
    }
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <select
        value={priority}
        onChange={(e) => setPriority(e.target.value)}
        onBlur={handleSave}
        autoFocus
        disabled={saving}
        onClick={(e) => e.stopPropagation()}
        className="px-2 py-1 rounded text-xs font-semibold border border-gray-300 bg-white cursor-pointer"
      >
        <option value="high">Alta</option>
        <option value="mid">Média</option>
        <option value="low">Baixa</option>
      </select>
    )
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        setIsEditing(true)
      }}
      title={`Prioridade: ${priority === 'high' ? 'Alta' : priority === 'mid' ? 'Média' : 'Baixa'}`}
      className="text-sm font-bold cursor-pointer hover:opacity-80 transition-opacity"
    >
      {priorityEmoji[priority as keyof typeof priorityEmoji]}
    </button>
  )
}
