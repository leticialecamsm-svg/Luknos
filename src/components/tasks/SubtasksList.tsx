'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Check } from 'lucide-react'
import { getSubtasks, createSubtask, updateSubtask, deleteSubtask } from '@/lib/actions'

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
  allDone?: boolean // quando tarefa mãe é finalizada
}

export function SubtasksList({ taskId, allDone }: SubtasksListProps) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [showInput, setShowInput] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    const result = await getSubtasks(taskId)
    if (result.data) setSubtasks(result.data as Subtask[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [taskId])

  // Se tarefa mãe foi finalizada, marca todas localmente como done
  useEffect(() => {
    if (allDone && subtasks.length > 0) {
      setSubtasks(prev => prev.map(s => ({ ...s, done: true })))
    }
  }, [allDone])

  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showInput])

  const handleToggle = async (subtask: Subtask) => {
    const newDone = !subtask.done
    setSubtasks(prev => prev.map(s => s.id === subtask.id ? { ...s, done: newDone } : s))
    await updateSubtask(subtask.id, { done: newDone })
  }

  const handleAdd = async () => {
    if (!newTitle.trim()) {
      setShowInput(false)
      return
    }
    setAdding(true)
    const result = await createSubtask(taskId, newTitle)
    if (result.data) {
      setSubtasks(prev => [...prev, result.data as Subtask])
    }
    setNewTitle('')
    setAdding(false)
    setShowInput(false)
  }

  const handleDelete = async (id: string) => {
    setSubtasks(prev => prev.filter(s => s.id !== id))
    await deleteSubtask(id)
  }

  const handleTitleEdit = async (subtask: Subtask, newTitle: string) => {
    if (newTitle.trim() && newTitle.trim() !== subtask.title) {
      setSubtasks(prev => prev.map(s => s.id === subtask.id ? { ...s, title: newTitle.trim() } : s))
      await updateSubtask(subtask.id, { title: newTitle.trim() })
    }
  }

  const doneCount = subtasks.filter(s => s.done).length
  const total = subtasks.length
  const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0

  if (loading) {
    return (
      <div className="text-xs text-gray-400 py-2">Carregando subtarefas...</div>
    )
  }

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

      {/* Barra de progresso */}
      {total > 0 && (
        <div className="h-1.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}

      {/* Lista de subtarefas */}
      <div className="space-y-1.5 mb-2">
        {subtasks.map(subtask => (
          <SubtaskItem
            key={subtask.id}
            subtask={subtask}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onTitleEdit={handleTitleEdit}
          />
        ))}
      </div>

      {/* Input para nova subtarefa */}
      {showInput ? (
        <div className="flex items-center gap-2 mt-2">
          <div className="w-4 h-4 rounded border border-gray-300 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
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
}: {
  subtask: Subtask
  onToggle: (s: Subtask) => void
  onDelete: (id: string) => void
  onTitleEdit: (s: Subtask, title: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(subtask.title)
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="flex items-center gap-2 group rounded-lg px-2 py-1.5 hover:bg-gray-50 transition-colors"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(subtask)}
        className={`w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
          subtask.done
            ? 'bg-emerald-500 border-emerald-500'
            : 'border-gray-300 hover:border-emerald-400'
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
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            onTitleEdit(subtask, title)
            setEditing(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { onTitleEdit(subtask, title); setEditing(false) }
            if (e.key === 'Escape') { setTitle(subtask.title); setEditing(false) }
          }}
          className="flex-1 text-sm border border-blue-400 rounded px-1 py-0.5 outline-none"
        />
      ) : (
        <span
          onClick={() => setEditing(true)}
          className={`flex-1 text-sm cursor-text ${
            subtask.done ? 'line-through text-gray-400' : 'text-gray-800'
          }`}
        >
          {subtask.title}
        </span>
      )}

      {/* Botão deletar (aparece no hover) */}
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
