'use client'

import { useState } from 'react'
import { updateTask } from '@/lib/actions'

interface InlineTaskEditorProps {
  taskId: string
  currentStatus: string
  currentDueDate: string | undefined
  onSave: () => void
}

const STATUS_LABELS: Record<string, string> = {
  todo: 'A fazer',
  doing: 'Em andamento',
  pending: 'Pendente',
  done: 'Concluído',
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
        <option value="pending">Pendente</option>
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
            : currentStatus === 'pending'
              ? 'bg-orange-50 text-orange-700'
              : 'bg-green-50 text-green-700'
      }`}
    >
      {STATUS_LABELS[currentStatus] || currentStatus}
    </button>
  )
}

export function InlineDateEditor({ taskId, currentDueDate, onSave }: InlineTaskEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [dueDate, setDueDate] = useState(currentDueDate?.split('T')[0] || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (dueDate && dueDate !== currentDueDate?.split('T')[0]) {
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

  if (!currentDueDate) return null

  const formatDateDisplay = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-')
    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
    return `${day} de ${months[parseInt(month) - 1]}`
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        setIsEditing(true)
      }}
      className="text-xs font-semibold whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity text-gray-600"
    >
      {formatDateDisplay(currentDueDate.split('T')[0])}
    </button>
  )
}
