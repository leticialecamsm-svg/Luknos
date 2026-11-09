'use client'

import { useState, useEffect } from 'react'
import { getTasksBySolicitation, createTask, updateTaskStatus, getActiveUsers } from '@/lib/actions'
import {
  CheckSquare, Plus, Loader2, Circle, CheckCircle2, Clock, AlertTriangle,
  User, Calendar, ChevronDown,
} from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  todo:    { label: 'A fazer',     icon: Circle,       color: 'text-gray-400' },
  doing:   { label: 'Em andamento', icon: Clock,        color: 'text-blue-500' },
  paused:  { label: 'Pausada',     icon: AlertTriangle, color: 'text-amber-500' },
  done:    { label: 'Concluída',   icon: CheckCircle2,  color: 'text-green-500' },
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low:    { label: 'Baixa',  color: 'text-gray-400 bg-gray-50' },
  medium: { label: 'Média',  color: 'text-amber-600 bg-amber-50' },
  high:   { label: 'Alta',   color: 'text-red-600 bg-red-50' },
}

function QuickAddTask({ solicitationId, users, onAdded }: {
  solicitationId: string
  users: any[]
  onAdded: () => void
}) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [priority, setPriority] = useState('medium')
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    if (!title.trim()) return
    setSaving(true)
    await createTask({
      title: title.trim(),
      priority,
      status: 'todo',
      due_date: dueDate || undefined,
      assignee_id: assigneeId || undefined,
      solicitation_id: solicitationId,
    })
    setTitle(''); setDueDate(''); setAssigneeId(''); setPriority('medium')
    setSaving(false)
    onAdded()
  }

  return (
    <div className="rounded-xl border border-dashed border-brand-300 bg-brand-50/40 p-3 space-y-2">
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
        placeholder="Título da tarefa..."
        className="input w-full"
        autoFocus
      />
      <div className="flex flex-wrap gap-2">
        <select value={priority} onChange={e => setPriority(e.target.value)} className="input text-xs w-auto">
          <option value="low">Prioridade baixa</option>
          <option value="medium">Prioridade média</option>
          <option value="high">Prioridade alta</option>
        </select>
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input text-xs w-auto" />
        <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className="input text-xs w-auto">
          <option value="">Atribuir a...</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name.split(' ')[0]}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || !title.trim()}
          className="btn-primary px-3 py-1 text-xs flex items-center gap-1"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Adicionar
        </button>
      </div>
    </div>
  )
}

export function SolicitationTasksTab({ solicitationId }: { solicitationId: string }) {
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [users, setUsers] = useState<any[]>([])
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('open')

  useEffect(() => {
    getActiveUsers().then(u => setUsers(u as any[]))
    load()
  }, [solicitationId])

  async function load() {
    setLoading(true)
    const data = await getTasksBySolicitation(solicitationId)
    setTasks(data as any[])
    setLoading(false)
  }

  async function toggleStatus(task: any) {
    const next = task.status === 'done' ? 'todo' : 'done'
    await updateTaskStatus(task.id, next)
    load()
  }

  const filtered = tasks.filter(t =>
    filter === 'all' ? true :
    filter === 'done' ? t.status === 'done' :
    t.status !== 'done'
  )

  const openCount = tasks.filter(t => t.status !== 'done').length
  const doneCount = tasks.filter(t => t.status === 'done').length

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex gap-1 text-xs">
          {(['open', 'all', 'done'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn('px-2.5 py-1 rounded-full font-medium transition-colors',
                filter === f ? 'bg-brand-100 text-brand-700' : 'text-gray-500 hover:bg-gray-100')}>
              {f === 'open' ? `Em aberto (${openCount})` : f === 'done' ? `Concluídas (${doneCount})` : `Todas (${tasks.length})`}
            </button>
          ))}
        </div>
        <button onClick={() => setShowAdd(v => !v)}
          className="ml-auto flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
          <Plus className="w-3.5 h-3.5" /> Nova tarefa
        </button>
      </div>

      {showAdd && (
        <QuickAddTask
          solicitationId={solicitationId}
          users={users}
          onAdded={() => { setShowAdd(false); load() }}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400">
          {filter === 'open' ? 'Nenhuma tarefa em aberto' : filter === 'done' ? 'Nenhuma tarefa concluída' : 'Nenhuma tarefa ainda'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(task => {
            const sc = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.todo
            const pc = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium
            const StatusIcon = sc.icon
            return (
              <div key={task.id}
                className={cn('flex items-start gap-3 px-3 py-2.5 rounded-xl border border-gray-100 bg-white hover:shadow-sm transition-all',
                  task.status === 'done' && 'opacity-60')}>
                <button type="button" onClick={() => toggleStatus(task)} className={cn('mt-0.5 shrink-0', sc.color)}>
                  <StatusIcon className="w-4 h-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-medium text-gray-800', task.status === 'done' && 'line-through text-gray-500')}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', pc.color)}>{pc.label}</span>
                    {task.due_date && (
                      <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                        <Calendar className="w-2.5 h-2.5" />
                        {formatDate(task.due_date)}
                      </span>
                    )}
                    {task.users && (
                      <span className="flex items-center gap-1">
                        <Avatar user={task.users} size={14} />
                        <span className="text-[10px] text-gray-500">{task.users.name?.split(' ')[0]}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
