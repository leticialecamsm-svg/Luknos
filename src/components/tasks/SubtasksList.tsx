'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Check, GripVertical } from 'lucide-react'
import { getSubtasks, createSubtask, updateSubtask, deleteSubtask, updateTaskStatus, reorderSubtasks } from '@/lib/actions'

interface Subtask {
  id: string
  task_id: string
  title: string
  done: boolean
  position: number
  created_at: string
}

interface SubtasksListProps {
  taskId: string
  allDone?: boolean
  onSubtasksChange?: () => void
}

export function SubtasksList({ taskId, allDone, onSubtasksChange }: SubtasksListProps) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [showInput, setShowInput] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragIndex = useRef<number | null>(null)

  const load = async () => {
    const result = await getSubtasks(taskId)
    if (result.data) setSubtasks(result.data as Subtask[])
    setLoading(false)
  }

  useEffect(() => { load() }, [taskId])

  useEffect(() => {
    if (allDone && subtasks.length > 0) {
      setSubtasks(prev => prev.map(s => ({ ...s, done: true })))
    }
  }, [allDone])

  useEffect(() => {
    if (showInput && inputRef.current) inputRef.current.focus()
  }, [showInput])

  const handleToggle = async (subtask: Subtask) => {
    const newDone = !subtask.done
    const updated = subtasks.map(s => s.id === subtask.id ? { ...s, done: newDone } : s)
    setSubtasks(updated)
    await updateSubtask(subtask.id, { done: newDone })
    if (newDone && updated.length > 0 && updated.every(s => s.done)) {
      await updateTaskStatus(taskId, 'done')
    }
    onSubtasksChange?.()
  }

  const handleAdd = async () => {
    if (!newTitle.trim()) { setShowInput(false); return }
    setAdding(true)
    const result = await createSubtask(taskId, newTitle)
    if (result.data) {
      setSubtasks(prev => [...prev, result.data as Subtask])
      onSubtasksChange?.()
    }
    setNewTitle('')
    setAdding(false)
    setShowInput(false)
  }

  const handleDelete = async (id: string) => {
    setSubtasks(prev => prev.filter(s => s.id !== id))
    await deleteSubtask(id)
    onSubtasksChange?.()
  }

  const handleTitleEdit = async (subtask: Subtask, newTitle: string) => {
    if (newTitle.trim() && newTitle.trim() !== subtask.title) {
      setSubtasks(prev => prev.map(s => s.id === subtask.id ? { ...s, title: newTitle.trim() } : s))
      await updateSubtask(subtask.id, { title: newTitle.trim() })
    }
  }

  // Drag handlers
  const handleDragStart = (index: number) => {
    dragIndex.current = index
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (dragIndex.current === null || dragIndex.current === index) return
    const updated = [...subtasks]
    const [moved] = updated.splice(dragIndex.current, 1)
    updated.splice(index, 0, moved)
    dragIndex.current = index
    setSubtasks(updated)
  }

  const handleDragEnd = async () => {
    dragIndex.current = null
    const items = subtasks.map((s, i) => ({ id: s.id, position: i }))
    await reorderSubtasks(items)
  }

  const doneCount = subtasks.filter(s => s.done).length
  const total = subtasks.length
  const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0

  if (loading) return <div className="text-xs text-gray-400 py-2">Carregando subtarefas...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-700 uppercase">Subtarefas</h3>
        {total > 0 && (
          <span className="text-xs font-semibold text-emerald-600">
            {doneCount}/{total} concluídas · {percent}%
          </span>
        )}
      </div>

      {total > 0 && (
        <div className="h-1.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${percent}%` }} />
        </div>
      )}

      <div className="space-y-1 mb-2">
        {subtasks.map((subtask, index) => (
          <SubtaskItem
            key={subtask.id}
            subtask={subtask}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onTitleEdit={handleTitleEdit}
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>

      {showInput ? (
        <div className="flex items-center gap-2 mt-2">
          <div className="w-4 h-4 rounded border border-gray-300 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAdd()
              if (e.key === 'Escape') { setShowInput(false); setNewTitle('') }
            }}
            onBlur={handleAdd}
            placeholder="Nome da subtarefa..."
            disabled={adding}
            className="flex-1 text-sm border border-blue-400 rounded px-2 py-1 outline-none"
          />
        </div>
      ) : (
        <button
          onClick={() => setShowInput(true)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#CBA455] transition-colors mt-1"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar subtarefa
        </button>
      )}
    </div>
  )
}

function SubtaskItem({
  subtask,
  onToggle,
  onDelete,
  onTitleEdit,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  subtask: Subtask
  onToggle: (s: Subtask) => void
  onDelete: (id: string) => void
  onTitleEdit: (s: Subtask, title: string) => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnd: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(subtask.title)
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)

  return (
    <div
      draggable
      onDragStart={() => { setDragging(true); onDragStart() }}
      onDragOver={onDragOver}
      onDragEnd={() => { setDragging(false); onDragEnd() }}
      className={`flex items-center gap-2 group rounded-lg px-2 py-1.5 transition-colors ${
        dragging ? 'opacity-40 bg-blue-50' : 'hover:bg-gray-50'
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Drag handle */}
      <GripVertical className={`w-3.5 h-3.5 flex-shrink-0 cursor-grab transition-opacity ${hovered ? 'text-gray-300' : 'text-transparent'}`} />

      {/* Checkbox */}
      <button
        onClick={() => onToggle(subtask)}
        className={`w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
          subtask.done ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-emerald-400'
        }`}
      >
        {subtask.done && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
      </button>

      {/* Título */}
      {editing ? (
        <input
          type="text"
          value={title}
          autoFocus
          onChange={e => setTitle(e.target.value)}
          onBlur={() => { onTitleEdit(subtask, title); setEditing(false) }}
          onKeyDown={e => {
            if (e.key === 'Enter') { onTitleEdit(subtask, title); setEditing(false) }
            if (e.key === 'Escape') { setTitle(subtask.title); setEditing(false) }
          }}
          className="flex-1 text-sm border border-blue-400 rounded px-1 py-0.5 outline-none"
        />
      ) : (
        <span
          onClick={() => setEditing(true)}
          className={`flex-1 text-sm cursor-text ${subtask.done ? 'line-through text-gray-400' : 'text-gray-800'}`}
        >
          {subtask.title}
        </span>
      )}

      {hovered && !editing && (
        <button
          onClick={() => onDelete(subtask.id)}
          className="p-0.5 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
