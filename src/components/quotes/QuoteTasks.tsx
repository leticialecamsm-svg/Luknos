'use client'

import { useState, useTransition, useEffect } from 'react'
import { getTasksByQuote, updateTaskStatus, createTask } from '@/lib/actions'
import { CheckCircle2, Circle, Plus, Loader2, ListTodo } from 'lucide-react'
import { cn } from '@/lib/utils'

const PRIORITY_COLOR = {
  high: 'bg-red-100 text-red-700',
  mid:  'bg-amber-100 text-amber-700',
  low:  'bg-gray-100 text-gray-500',
}
const PRIORITY_LABEL = { high: 'Alta', mid: 'Média', low: 'Baixa' }

interface Task {
  id: string
  title: string
  status: string
  priority: string
  due_date?: string
  users?: { name: string; avatar_color: string } | null
}

export function QuoteTasks({ quoteId, quoteLabel }: { quoteId: string; quoteLabel: string }) {
  const [tasks, setTasks]         = useState<Task[]>([])
  const [loading, setLoading]     = useState(true)
  const [pending, start]          = useTransition()
  const [showForm, setShowForm]   = useState(false)
  const [title, setTitle]         = useState('')
  const [priority, setPriority]   = useState('mid')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const data = await getTasksByQuote(quoteId)
    setTasks(data as Task[])
    setLoading(false)
  }

  function toggle(id: string, status: string) {
    const next = status === 'done' ? 'todo' : 'done'
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: next } : t))
    start(async () => {
      await updateTaskStatus(id, next)
    })
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const today = new Date()
    const due = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
    await createTask({ title: title.trim(), priority, status: 'todo', due_date: due, quote_id: quoteId })
    setTitle('')
    setShowForm(false)
    load()
  }

  const open = tasks.filter(t => t.status !== 'done')
  const done = tasks.filter(t => t.status === 'done')

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <ListTodo className="w-4 h-4" />
          Tarefas
          {tasks.length > 0 && (
            <span className="text-xs font-normal text-gray-400">
              {done.length}/{tasks.length} concluídas
            </span>
          )}
        </h2>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          Nova tarefa
        </button>
      </div>

      {/* Form nova tarefa */}
      {showForm && (
        <form onSubmit={handleCreate} className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Título da tarefa..."
            className="input text-sm"
          />
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {(['high','mid','low'] as const).map(p => (
                <button
                  key={p} type="button"
                  onClick={() => setPriority(p)}
                  className={cn(
                    'px-2 py-1 rounded text-xs font-semibold transition-colors',
                    priority === p ? PRIORITY_COLOR[p] : 'bg-white text-gray-400 border border-gray-200'
                  )}
                >
                  {PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
            <div className="flex gap-2 ml-auto">
              <button type="button" onClick={() => setShowForm(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
              <button type="submit" className="btn-primary text-xs py-1">Criar</button>
            </div>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-300" /></div>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">Nenhuma tarefa vinculada</p>
      ) : (
        <div className="space-y-1">
          {[...open, ...done].map(task => (
            <div
              key={task.id}
              className="flex items-center gap-3 py-2 px-1 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <button
                onClick={() => toggle(task.id, task.status)}
                disabled={pending}
                className="shrink-0 text-gray-300 hover:text-brand-500 transition-colors"
              >
                {task.status === 'done'
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  : <Circle className="w-5 h-5" />
                }
              </button>
              <span className={cn('text-sm flex-1', task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700')}>
                {task.title}
              </span>
              <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', PRIORITY_COLOR[task.priority as keyof typeof PRIORITY_COLOR] ?? 'bg-gray-100 text-gray-400')}>
                {PRIORITY_LABEL[task.priority as keyof typeof PRIORITY_LABEL] ?? task.priority}
              </span>
              {task.due_date && (
                <span className="text-[10px] text-gray-400">{task.due_date.split('-').reverse().join('/')}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
