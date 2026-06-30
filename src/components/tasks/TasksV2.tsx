'use client'

import { useState, useMemo, useTransition, useRef } from 'react'
import { updateTaskStatus, deleteTask, createTask, createTaskForUser, updateTask } from '@/lib/actions'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import {
  Plus, LayoutGrid, List, Search, ChevronDown, X,
  Flag, Calendar, Circle, CheckCircle2, Clock, Pause,
  AlertCircle, Loader2, Trash2, Pencil, Link2, ExternalLink
} from 'lucide-react'
import { format, isToday, isTomorrow, isPast, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// ── Types ─────────────────────────────────────────────────────────────────────

type Status = 'todo' | 'doing' | 'paused' | 'done'
type Priority = 'high' | 'mid' | 'low'

interface Task {
  id: string
  title: string
  description?: string
  status: Status
  priority: Priority
  due_date?: string | null
  completed_at?: string | null
  checklist?: { text: string; done: boolean }[]
  subtasks?: { id: string; done: boolean }[]
  created_at: string
  user_id?: string
  users?: { name: string; avatar_color: string; avatar_url?: string | null } | null
  quote?: { number: number; client_name: string } | null
  quote_id?: string | null
}

interface User {
  id: string
  name: string
  avatar_color: string
  avatar_url?: string | null
  role?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COLUMNS: { id: Status; label: string; icon: React.ElementType; color: string; bg: string; border: string }[] = [
  { id: 'todo',   label: 'A fazer',        icon: Circle,        color: 'text-gray-500',   bg: 'bg-gray-100',    border: 'border-gray-200' },
  { id: 'doing',  label: 'Em andamento',   icon: Clock,         color: 'text-blue-600',   bg: 'bg-blue-50',     border: 'border-blue-200' },
  { id: 'paused', label: 'Pausada',        icon: Pause,         color: 'text-yellow-600', bg: 'bg-yellow-50',   border: 'border-yellow-200' },
  { id: 'done',   label: 'Concluída',      icon: CheckCircle2,  color: 'text-emerald-600',bg: 'bg-emerald-50',  border: 'border-emerald-200' },
]

const PRIORITY_CONFIG = {
  high: { label: 'Alta',   color: 'text-red-500',    bg: 'bg-red-50',     dot: 'bg-red-500' },
  mid:  { label: 'Média',  color: 'text-yellow-600', bg: 'bg-yellow-50',  dot: 'bg-yellow-500' },
  low:  { label: 'Baixa',  color: 'text-gray-400',   bg: 'bg-gray-50',    dot: 'bg-gray-400' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dueDateLabel(date: string | null | undefined): { label: string; urgent: boolean } | null {
  if (!date) return null
  const d = parseISO(date)
  if (isToday(d)) return { label: 'Hoje', urgent: true }
  if (isTomorrow(d)) return { label: 'Amanhã', urgent: false }
  if (isPast(d)) return { label: format(d, "dd/MM", { locale: ptBR }), urgent: true }
  return { label: format(d, "dd/MM", { locale: ptBR }), urgent: false }
}

function subtaskProgress(task: Task): { done: number; total: number } | null {
  const items = task.subtasks?.length ? task.subtasks : (task.checklist ?? [])
  if (!items.length) return null
  const done = items.filter((i: any) => i.done).length
  return { done, total: items.length }
}

// ── Main Component ────────────────────────────────────────────────────────────

export function TasksV2({
  myTasks, allTasks, allUsers, currentUser, isAdmin,
}: {
  myTasks: Task[]
  allTasks: Task[]
  allUsers: User[]
  currentUser: User
  isAdmin: boolean
}) {
  const toast = useToast()
  const [view, setView] = useState<'board' | 'list'>('board')
  const [scope, setScope] = useState<'mine' | 'team'>('mine')
  const [search, setSearch] = useState('')
  const [filterPriority, setFilterPriority] = useState<Priority | ''>('')
  const [filterUser, setFilterUser] = useState<string>('')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [creating, setCreating] = useState<{ status: Status; userId?: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const [tasks, setTasks] = useState<Task[]>(() =>
    scope === 'mine' ? myTasks : allTasks
  )

  function reload() {
    startTransition(async () => {
      const { getTasks, getAllTasks } = await import('@/lib/actions')
      const [mine, all] = await Promise.all([getTasks(), getAllTasks()])
      setTasks((scope === 'mine' ? mine : all) as Task[])
    })
  }

  // Sync scope change
  function setAndSyncScope(s: 'mine' | 'team') {
    setScope(s)
    setTasks(s === 'mine' ? myTasks : allTasks)
    setFilterUser('')
  }

  const filtered = useMemo(() => {
    let t = tasks
    if (scope === 'mine') t = myTasks
    else t = allTasks
    if (search) t = t.filter(x => x.title.toLowerCase().includes(search.toLowerCase()))
    if (filterPriority) t = t.filter(x => x.priority === filterPriority)
    if (filterUser) t = t.filter(x => x.user_id === filterUser)
    return t
  }, [tasks, myTasks, allTasks, scope, search, filterPriority, filterUser])

  async function moveTask(id: string, status: Status) {
    await updateTaskStatus(id, status)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status, completed_at: status === 'done' ? new Date().toISOString() : t.completed_at } : t))
    if (selectedTask?.id === id) setSelectedTask(p => p ? { ...p, status } : p)
  }

  async function removeTask(id: string) {
    await deleteTask(id)
    setTasks(prev => prev.filter(t => t.id !== id))
    if (selectedTask?.id === id) setSelectedTask(null)
    toast.success('Tarefa excluída', '')
  }

  async function addTask(title: string, status: Status, userId?: string) {
    if (!title.trim()) return
    const res = userId && userId !== currentUser.id
      ? await createTaskForUser(userId, { title: title.trim(), priority: 'mid', status, due_date: '' })
      : await createTask({ title: title.trim(), priority: 'mid', status })
    if (res?.error) { toast.error('Erro', res.error); return }
    reload()
    setCreating(null)
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tarefas</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {filtered.filter(t => t.status !== 'done').length} pendentes · {filtered.filter(t => t.status === 'done').length} concluídas
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1 gap-0.5">
            <button onClick={() => setView('board')} className={cn('p-1.5 rounded-md transition-all', view === 'board' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-700')}>
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button onClick={() => setView('list')} className={cn('p-1.5 rounded-md transition-all', view === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-700')}>
              <List className="w-4 h-4" />
            </button>
          </div>
          {/* New task */}
          <button
            onClick={() => setCreating({ status: 'todo', userId: scope === 'team' ? filterUser || undefined : undefined })}
            className="btn-primary flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Nova tarefa
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Scope (admin only) */}
        {isAdmin && (
          <div className="flex bg-gray-100 rounded-lg p-1 gap-0.5">
            {(['mine', 'team'] as const).map(s => (
              <button key={s} onClick={() => setAndSyncScope(s)}
                className={cn('px-3 py-1 rounded-md text-sm font-medium transition-all',
                  scope === s ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
                {s === 'mine' ? 'Minhas' : 'Equipe'}
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar tarefa..."
            className="input pl-8 py-1.5 text-sm h-9"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>}
        </div>

        {/* Priority filter */}
        <div className="flex gap-1">
          {(['high', 'mid', 'low'] as Priority[]).map(p => (
            <button key={p} onClick={() => setFilterPriority(f => f === p ? '' : p)}
              className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all',
                filterPriority === p
                  ? `${PRIORITY_CONFIG[p].bg} ${PRIORITY_CONFIG[p].color} border-current`
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300')}>
              <span className={cn('w-1.5 h-1.5 rounded-full', PRIORITY_CONFIG[p].dot)} />
              {PRIORITY_CONFIG[p].label}
            </button>
          ))}
        </div>

        {/* User filter (team view) */}
        {scope === 'team' && allUsers.length > 0 && (
          <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
            className="input py-1.5 text-sm h-9 max-w-[160px]">
            <option value="">Todos os membros</option>
            {allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}

        {/* Active filter count */}
        {(search || filterPriority || filterUser) && (
          <button onClick={() => { setSearch(''); setFilterPriority(''); setFilterUser('') }}
            className="text-xs text-brand-600 hover:underline">
            Limpar filtros
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0 gap-4 overflow-hidden">
        {view === 'board' ? (
          <BoardView
            tasks={filtered}
            scope={scope}
            allUsers={allUsers}
            currentUser={currentUser}
            onMove={moveTask}
            onDelete={removeTask}
            onSelect={setSelectedTask}
            onAdd={addTask}
            creating={creating}
            setCreating={setCreating}
          />
        ) : (
          <ListView
            tasks={filtered}
            scope={scope}
            allUsers={allUsers}
            onMove={moveTask}
            onDelete={removeTask}
            onSelect={setSelectedTask}
            onAdd={addTask}
            creating={creating}
            setCreating={setCreating}
          />
        )}

        {/* Task detail side panel */}
        {selectedTask && (
          <TaskDetail
            task={selectedTask}
            onClose={() => setSelectedTask(null)}
            onMove={async (status) => { await moveTask(selectedTask.id, status); reload() }}
            onDelete={async () => { await removeTask(selectedTask.id) }}
            onChange={async (updates) => {
              await updateTask(selectedTask.id, updates)
              setSelectedTask(p => p ? { ...p, ...updates } : p)
              reload()
            }}
          />
        )}
      </div>
    </div>
  )
}

// ── Board View ────────────────────────────────────────────────────────────────

function BoardView({ tasks, scope, allUsers, currentUser, onMove, onDelete, onSelect, onAdd, creating, setCreating }: {
  tasks: Task[]
  scope: 'mine' | 'team'
  allUsers: User[]
  currentUser: User
  onMove: (id: string, s: Status) => void
  onDelete: (id: string) => void
  onSelect: (t: Task) => void
  onAdd: (title: string, status: Status, userId?: string) => void
  creating: { status: Status; userId?: string } | null
  setCreating: (v: any) => void
}) {
  return (
    <div className="flex gap-3 flex-1 overflow-x-auto pb-2">
      {COLUMNS.map(col => {
        const colTasks = tasks.filter(t => t.status === col.id)
        const Icon = col.icon
        return (
          <div key={col.id} className="flex flex-col w-72 shrink-0">
            {/* Column header */}
            <div className={cn('flex items-center justify-between px-3 py-2 rounded-t-xl border-t border-x', col.border, col.bg)}>
              <div className="flex items-center gap-2">
                <Icon className={cn('w-4 h-4', col.color)} />
                <span className="text-sm font-semibold text-gray-800">{col.label}</span>
                <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded-full', col.bg, col.color, 'border', col.border)}>
                  {colTasks.length}
                </span>
              </div>
              <button
                onClick={() => setCreating({ status: col.id })}
                className="text-gray-400 hover:text-gray-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Tasks */}
            <div className={cn('flex flex-col gap-2 flex-1 overflow-y-auto p-2 rounded-b-xl border-b border-x min-h-[200px]', col.border, 'bg-gray-50/50')}>
              {colTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  showUser={scope === 'team'}
                  onMove={onMove}
                  onDelete={onDelete}
                  onSelect={onSelect}
                />
              ))}

              {colTasks.length === 0 && creating?.status !== col.id && (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-xs text-gray-400">Nenhuma tarefa</p>
                </div>
              )}

              {/* Inline create */}
              {creating?.status === col.id && (
                <InlineCreate
                  onSubmit={title => onAdd(title, col.id)}
                  onCancel={() => setCreating(null)}
                  placeholder={`Adicionar em ${col.label.toLowerCase()}...`}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── List View ─────────────────────────────────────────────────────────────────

function ListView({ tasks, scope, onMove, onDelete, onSelect, onAdd, creating, setCreating }: {
  tasks: Task[]
  scope: 'mine' | 'team'
  onMove: (id: string, s: Status) => void
  onDelete: (id: string) => void
  onSelect: (t: Task) => void
  onAdd: (title: string, status: Status, userId?: string) => void
  creating: { status: Status; userId?: string } | null
  setCreating: (v: any) => void
  allUsers?: User[]
}) {
  return (
    <div className="flex-1 overflow-y-auto space-y-4">
      {COLUMNS.map(col => {
        const colTasks = tasks.filter(t => t.status === col.id)
        const [open, setOpen] = useState(col.id !== 'done')
        const Icon = col.icon

        return (
          <div key={col.id} className="rounded-xl border border-gray-200 overflow-hidden bg-white">
            <button
              onClick={() => setOpen(o => !o)}
              className={cn('w-full flex items-center gap-3 px-4 py-3 text-left', col.bg)}
            >
              <Icon className={cn('w-4 h-4 shrink-0', col.color)} />
              <span className="text-sm font-semibold text-gray-800 flex-1">{col.label}</span>
              <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded-full border', col.bg, col.color, col.border)}>{colTasks.length}</span>
              <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', open ? 'rotate-0' : '-rotate-90')} />
            </button>

            {open && (
              <>
                <div className="divide-y divide-gray-100">
                  {colTasks.map(task => (
                    <TaskRow key={task.id} task={task} showUser={scope === 'team'} onMove={onMove} onDelete={onDelete} onSelect={onSelect} />
                  ))}
                </div>
                {creating?.status === col.id ? (
                  <div className="px-4 py-2 border-t border-gray-100">
                    <InlineCreate
                      onSubmit={title => onAdd(title, col.id)}
                      onCancel={() => setCreating(null)}
                      placeholder={`Adicionar em ${col.label.toLowerCase()}...`}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setCreating({ status: col.id })}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors border-t border-gray-100"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar tarefa
                  </button>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Task Card (Kanban) ────────────────────────────────────────────────────────

function TaskCard({ task, showUser, onMove, onDelete, onSelect }: {
  task: Task
  showUser: boolean
  onMove: (id: string, s: Status) => void
  onDelete: (id: string) => void
  onSelect: (t: Task) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const due = dueDateLabel(task.due_date)
  const progress = subtaskProgress(task)
  const pCfg = PRIORITY_CONFIG[task.priority]

  return (
    <div
      onClick={() => onSelect(task)}
      className={cn(
        'group bg-white rounded-xl border border-gray-200 p-3 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all relative',
        task.status === 'done' && 'opacity-60'
      )}
    >
      {/* Priority bar */}
      <div className={cn('absolute left-0 top-3 bottom-3 w-0.5 rounded-full ml-0', pCfg.dot, 'bg-current')}
        style={{ left: 0, width: 3, borderRadius: 4 }}
      />

      <div className="pl-3">
        {/* Title */}
        <p className={cn('text-sm font-medium text-gray-800 leading-snug', task.status === 'done' && 'line-through text-gray-400')}>
          {task.title}
        </p>

        {/* Quote link */}
        {task.quote && (
          <p className="text-[11px] text-brand-500 mt-1 flex items-center gap-1">
            <Link2 className="w-3 h-3" /> #{task.quote.number} · {task.quote.client_name}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          {/* Due date */}
          {due && (
            <span className={cn('flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-md',
              due.urgent ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500')}>
              <Calendar className="w-3 h-3" /> {due.label}
            </span>
          )}

          {/* Subtask progress */}
          {progress && (
            <span className="flex items-center gap-1 text-[11px] text-gray-400">
              <CheckCircle2 className="w-3 h-3" /> {progress.done}/{progress.total}
            </span>
          )}

          {/* Assignee */}
          {showUser && task.users && (
            <div className="ml-auto">
              <Avatar user={task.users} size={20} />
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(o => !o) }}
          className="p-1 rounded-md bg-white shadow-sm border border-gray-200 text-gray-400 hover:text-gray-700"
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      {/* Status quick-move dropdown */}
      {menuOpen && (
        <div
          onClick={e => e.stopPropagation()}
          className="absolute top-8 right-2 z-20 bg-white rounded-xl shadow-xl border border-gray-200 py-1 min-w-[160px]"
        >
          <p className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Mover para</p>
          {COLUMNS.filter(c => c.id !== task.status).map(c => (
            <button key={c.id} onClick={() => { onMove(task.id, c.id); setMenuOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <c.icon className={cn('w-4 h-4', c.color)} /> {c.label}
            </button>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-1">
            <button onClick={() => { onDelete(task.id); setMenuOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50">
              <Trash2 className="w-4 h-4" /> Excluir
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Task Row (List) ───────────────────────────────────────────────────────────

function TaskRow({ task, showUser, onMove, onDelete, onSelect }: {
  task: Task
  showUser: boolean
  onMove: (id: string, s: Status) => void
  onDelete: (id: string) => void
  onSelect: (t: Task) => void
}) {
  const due = dueDateLabel(task.due_date)
  const pCfg = PRIORITY_CONFIG[task.priority]
  const StatusIcon = COLUMNS.find(c => c.id === task.status)?.icon ?? Circle

  return (
    <div
      onClick={() => onSelect(task)}
      className="group flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
    >
      {/* Status icon */}
      <StatusIcon className={cn('w-4 h-4 shrink-0', COLUMNS.find(c => c.id === task.status)?.color)} />

      {/* Priority dot */}
      <span className={cn('w-2 h-2 rounded-full shrink-0', pCfg.dot)} title={pCfg.label} />

      {/* Title */}
      <p className={cn('flex-1 text-sm text-gray-800 min-w-0 truncate', task.status === 'done' && 'line-through text-gray-400')}>
        {task.title}
      </p>

      {/* Quote */}
      {task.quote && (
        <span className="text-[11px] text-brand-500 hidden sm:flex items-center gap-1 shrink-0">
          <Link2 className="w-3 h-3" /> #{task.quote.number}
        </span>
      )}

      {/* Due date */}
      {due && (
        <span className={cn('text-[11px] font-medium shrink-0 flex items-center gap-1',
          due.urgent ? 'text-red-500' : 'text-gray-400')}>
          <Calendar className="w-3 h-3" /> {due.label}
        </span>
      )}

      {/* Assignee */}
      {showUser && task.users && <Avatar user={task.users} size={22} />}

      {/* Quick actions */}
      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
        <select
          value={task.status}
          onChange={e => { e.stopPropagation(); onMove(task.id, e.target.value as Status) }}
          onClick={e => e.stopPropagation()}
          className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 text-gray-600 bg-white"
        >
          {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <button onClick={e => { e.stopPropagation(); onDelete(task.id) }}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Task Detail Sidebar ───────────────────────────────────────────────────────

function TaskDetail({ task, onClose, onMove, onDelete, onChange }: {
  task: Task
  onClose: () => void
  onMove: (s: Status) => void
  onDelete: () => void
  onChange: (updates: any) => void
}) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleVal, setTitleVal] = useState(task.title)
  const due = dueDateLabel(task.due_date)
  const pCfg = PRIORITY_CONFIG[task.priority]
  const col = COLUMNS.find(c => c.id === task.status)!
  const StatusIcon = col.icon
  const progress = subtaskProgress(task)

  return (
    <div className="w-80 shrink-0 flex flex-col bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <StatusIcon className={cn('w-4 h-4', col.color)} />
          <span className="text-xs font-semibold text-gray-500">{col.label}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Title */}
        {editingTitle ? (
          <textarea
            autoFocus
            value={titleVal}
            onChange={e => setTitleVal(e.target.value)}
            onBlur={() => { onChange({ title: titleVal }); setEditingTitle(false) }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onChange({ title: titleVal }); setEditingTitle(false) } }}
            className="w-full text-lg font-semibold text-gray-900 resize-none border-0 outline-none focus:ring-2 focus:ring-brand-300 rounded-lg p-1 -m-1"
            rows={2}
          />
        ) : (
          <h2
            onClick={() => setEditingTitle(true)}
            className="text-lg font-semibold text-gray-900 cursor-text hover:bg-gray-50 rounded-lg p-1 -m-1 transition-colors"
          >
            {task.title}
          </h2>
        )}

        {/* Quote link */}
        {task.quote && (
          <div className="flex items-center gap-2 text-sm text-brand-600 bg-brand-50 rounded-lg px-3 py-2">
            <Link2 className="w-4 h-4 shrink-0" />
            <span className="flex-1 truncate">#{task.quote.number} · {task.quote.client_name}</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </div>
        )}

        {/* Metadata grid */}
        <div className="space-y-2">
          {/* Status */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 w-20 shrink-0">Status</span>
            <select
              value={task.status}
              onChange={e => onMove(e.target.value as Status)}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white"
            >
              {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>

          {/* Priority */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 w-20 shrink-0">Prioridade</span>
            <select
              value={task.priority}
              onChange={e => onChange({ priority: e.target.value })}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white"
            >
              {(Object.entries(PRIORITY_CONFIG) as [Priority, any][]).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          {/* Due date */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 w-20 shrink-0">Prazo</span>
            <input
              type="date"
              defaultValue={task.due_date ?? ''}
              onChange={e => onChange({ due_date: e.target.value || null })}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white"
            />
          </div>

          {/* Assignee */}
          {task.users && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-20 shrink-0">Responsável</span>
              <div className="flex items-center gap-2">
                <Avatar user={task.users} size={22} />
                <span className="text-sm text-gray-700">{task.users.name}</span>
              </div>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {progress && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">Progresso</span>
              <span className="text-xs text-gray-400">{progress.done}/{progress.total}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Checklist */}
        {task.checklist && task.checklist.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Checklist</p>
            {task.checklist.map((item, i) => (
              <div key={i} className={cn('flex items-center gap-2 text-sm py-1', item.done ? 'text-gray-400 line-through' : 'text-gray-700')}>
                <CheckCircle2 className={cn('w-4 h-4 shrink-0', item.done ? 'text-emerald-500' : 'text-gray-300')} />
                {item.text}
              </div>
            ))}
          </div>
        )}

        {/* Description */}
        {task.description && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Descrição</p>
            <p className="text-sm text-gray-600 leading-relaxed">{task.description}</p>
          </div>
        )}

        {/* Created at */}
        <p className="text-[11px] text-gray-300 pt-2 border-t border-gray-100">
          Criada em {format(parseISO(task.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
        </p>
      </div>
    </div>
  )
}

// ── Inline Create ─────────────────────────────────────────────────────────────

function InlineCreate({ onSubmit, onCancel, placeholder }: {
  onSubmit: (title: string) => void
  onCancel: () => void
  placeholder?: string
}) {
  const [val, setVal] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  return (
    <div className="flex items-center gap-2 bg-white rounded-xl border border-brand-300 shadow-sm px-3 py-2">
      <Plus className="w-3.5 h-3.5 text-brand-400 shrink-0" />
      <input
        ref={ref}
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder={placeholder ?? 'Nova tarefa...'}
        className="flex-1 text-sm text-gray-800 bg-transparent outline-none placeholder-gray-400"
        onKeyDown={e => {
          if (e.key === 'Enter') onSubmit(val)
          if (e.key === 'Escape') onCancel()
        }}
      />
      <button onClick={() => onSubmit(val)} disabled={!val.trim()} className="text-brand-600 hover:text-brand-700 text-xs font-semibold">
        Salvar
      </button>
      <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
