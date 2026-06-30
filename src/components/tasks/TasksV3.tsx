'use client'

import { useState, useMemo, useRef, useTransition } from 'react'
import { updateTaskStatus, deleteTask, createTask, createTaskForUser, updateTask } from '@/lib/actions'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import {
  Plus, Search, X, ChevronDown, ChevronRight,
  Calendar, CheckCircle2, Clock, Pause, Circle,
  Trash2, Link2, ExternalLink, Flag, Users,
  MoreHorizontal, ArrowUpDown,
} from 'lucide-react'
import { format, isToday, isTomorrow, isPast, parseISO, differenceInDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type Status   = 'todo' | 'doing' | 'paused' | 'done'
type Priority = 'high' | 'mid' | 'low'
type GroupBy  = 'status' | 'priority' | 'assignee'

interface Task {
  id: string; title: string; description?: string
  status: Status; priority: Priority
  due_date?: string | null; completed_at?: string | null
  checklist?: { text: string; done: boolean }[]
  subtasks?: { id: string; done: boolean }[]
  created_at: string; user_id?: string
  users?: { name: string; avatar_color: string; avatar_url?: string | null } | null
  quote?: { number: number; client_name: string } | null
  quote_id?: string | null
}

interface User { id: string; name: string; avatar_color: string; avatar_url?: string | null; role?: string }

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  todo:   { label: 'A fazer',       Icon: Circle,       dot: 'bg-gray-400',     text: 'text-gray-500',   ring: 'ring-gray-200',   header: 'bg-gray-50  border-gray-200' },
  doing:  { label: 'Em andamento',  Icon: Clock,        dot: 'bg-blue-500',     text: 'text-blue-600',   ring: 'ring-blue-200',   header: 'bg-blue-50  border-blue-200' },
  paused: { label: 'Pausada',       Icon: Pause,        dot: 'bg-amber-400',    text: 'text-amber-600',  ring: 'ring-amber-200',  header: 'bg-amber-50 border-amber-200' },
  done:   { label: 'Concluída',     Icon: CheckCircle2, dot: 'bg-emerald-500',  text: 'text-emerald-600',ring: 'ring-emerald-200',header: 'bg-emerald-50 border-emerald-200' },
}

const PRIORITY_CFG = {
  high: { label: 'Alta',  dot: 'bg-red-500',    text: 'text-red-500',    bg: 'bg-red-50    border-red-200' },
  mid:  { label: 'Média', dot: 'bg-amber-400',  text: 'text-amber-600',  bg: 'bg-amber-50  border-amber-200' },
  low:  { label: 'Baixa', dot: 'bg-gray-300',   text: 'text-gray-400',   bg: 'bg-gray-50   border-gray-200' },
}

const STATUS_ORDER: Status[]   = ['doing', 'todo', 'paused', 'done']
const PRIORITY_ORDER: Priority[] = ['high', 'mid', 'low']

// ── Helpers ───────────────────────────────────────────────────────────────────

function DueChip({ date }: { date?: string | null }) {
  if (!date) return null
  const d = parseISO(date)
  const overdue = isPast(d) && !isToday(d)
  const urgent  = isToday(d)
  const soon    = !overdue && !urgent && differenceInDays(d, new Date()) <= 3
  const label   = isToday(d) ? 'Hoje' : isTomorrow(d) ? 'Amanhã' : format(d, 'dd/MM', { locale: ptBR })
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md whitespace-nowrap',
      overdue ? 'bg-red-100 text-red-600' :
      urgent  ? 'bg-orange-100 text-orange-600' :
      soon    ? 'bg-amber-50 text-amber-600' :
                'bg-gray-100 text-gray-500'
    )}>
      <Calendar className="w-3 h-3" /> {label}
    </span>
  )
}

function PriorityDot({ p }: { p: Priority }) {
  return <span className={cn('w-2 h-2 rounded-full shrink-0', PRIORITY_CFG[p].dot)} title={PRIORITY_CFG[p].label} />
}

function progress(task: Task) {
  const items = task.subtasks?.length ? task.subtasks : (task.checklist ?? [])
  if (!items.length) return null
  return { done: items.filter((i: any) => i.done).length, total: items.length }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function TasksV3({ myTasks, allTasks, allUsers, currentUser, isAdmin }: {
  myTasks: Task[]; allTasks: Task[]; allUsers: User[]
  currentUser: User; isAdmin: boolean
}) {
  const toast = useToast()
  const [scope, setScope]             = useState<'mine' | 'team'>('mine')
  const [groupBy, setGroupBy]         = useState<GroupBy>('status')
  const [search, setSearch]           = useState('')
  const [filterPriority, setFilterP]  = useState<Priority | ''>('')
  const [filterUser, setFilterU]      = useState('')
  const [selected, setSelected]       = useState<Task | null>(null)
  const [creating, setCreating]       = useState<{ groupKey: string } | null>(null)
  const [collapsed, setCollapsed]     = useState<Set<string>>(new Set())
  const [, startTx]                   = useTransition()

  const source = scope === 'mine' ? myTasks : allTasks

  const [tasks, setTasks] = useState<Task[]>(source)

  function reload() {
    startTx(async () => {
      const { getTasks, getAllTasks } = await import('@/lib/actions')
      const data = await (scope === 'mine' ? getTasks() : getAllTasks())
      setTasks(data as Task[])
    })
  }

  const filtered = useMemo(() => {
    let t = scope === 'mine' ? myTasks : allTasks
    if (search)         t = t.filter(x => x.title.toLowerCase().includes(search.toLowerCase()))
    if (filterPriority) t = t.filter(x => x.priority === filterPriority)
    if (filterUser)     t = t.filter(x => x.user_id === filterUser)
    return t
  }, [myTasks, allTasks, scope, search, filterPriority, filterUser])

  // ── Grouping ──────────────────────────────────────────────────────────────

  const groups: { key: string; label: string; cfg: any; tasks: Task[] }[] = useMemo(() => {
    if (groupBy === 'status') {
      return STATUS_ORDER.map(s => ({
        key: s, label: STATUS_CFG[s].label, cfg: STATUS_CFG[s],
        tasks: filtered.filter(t => t.status === s),
      }))
    }
    if (groupBy === 'priority') {
      return PRIORITY_ORDER.map(p => ({
        key: p, label: PRIORITY_CFG[p].label,
        cfg: { header: PRIORITY_CFG[p].bg, dot: PRIORITY_CFG[p].dot, text: PRIORITY_CFG[p].text },
        tasks: filtered.filter(t => t.priority === p),
      }))
    }
    // assignee
    const users = allUsers.length ? allUsers : [currentUser]
    const byUser = Object.fromEntries(users.map(u => [u.id, [] as Task[]]))
    byUser['__none__'] = []
    filtered.forEach(t => {
      if (t.user_id && byUser[t.user_id]) byUser[t.user_id].push(t)
      else byUser['__none__'].push(t)
    })
    return [
      ...users.map(u => ({
        key: u.id, label: u.name,
        cfg: { header: 'bg-white border-gray-200', dot: 'bg-brand-500', text: 'text-brand-600', user: u },
        tasks: byUser[u.id] ?? [],
      })),
      ...(byUser['__none__'].length ? [{ key: '__none__', label: 'Sem responsável', cfg: { header: 'bg-gray-50 border-gray-200', dot: 'bg-gray-300', text: 'text-gray-400' }, tasks: byUser['__none__'] }] : []),
    ]
  }, [filtered, groupBy, allUsers, currentUser])

  // ── Mutations ─────────────────────────────────────────────────────────────

  async function moveTask(id: string, status: Status) {
    await updateTaskStatus(id, status)
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))
    if (selected?.id === id) setSelected(p => p ? { ...p, status } : p)
  }

  async function removeTask(id: string) {
    await deleteTask(id)
    setTasks(prev => prev.filter(t => t.id !== id))
    if (selected?.id === id) setSelected(null)
    toast.success('Tarefa excluída', '')
  }

  async function addTask(title: string, groupKey: string) {
    if (!title.trim()) { setCreating(null); return }
    const status: Status   = groupBy === 'status'   ? groupKey as Status   : 'todo'
    const priority: Priority = groupBy === 'priority' ? groupKey as Priority : 'mid'
    const userId = groupBy === 'assignee' && groupKey !== '__none__' ? groupKey : undefined

    const res = userId && userId !== currentUser.id
      ? await createTaskForUser(userId, { title: title.trim(), priority, status, due_date: '' })
      : await createTask({ title: title.trim(), priority, status })
    if (res?.error) { toast.error('Erro', res.error); return }
    reload()
    setCreating(null)
  }

  function toggleGroup(key: string) {
    setCollapsed(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  const pending = filtered.filter(t => t.status !== 'done').length
  const done    = filtered.filter(t => t.status === 'done').length

  return (
    <div className={cn('flex gap-4 h-full min-h-0', selected && 'pr-0')}>

      {/* ── Left: main list ── */}
      <div className="flex flex-col flex-1 min-w-0 gap-4">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tarefas</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              <span className="text-gray-700 font-medium">{pending}</span> pendentes ·{' '}
              <span className="text-emerald-600 font-medium">{done}</span> concluídas
            </p>
          </div>
          <button
            onClick={() => setCreating({ groupKey: groupBy === 'status' ? 'todo' : groupBy === 'priority' ? 'mid' : currentUser.id })}
            className="btn-primary flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Nova tarefa
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Scope */}
          {isAdmin && (
            <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
              {(['mine', 'team'] as const).map(s => (
                <button key={s} onClick={() => { setScope(s); setFilterU('') }}
                  className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                    scope === s ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
                  {s === 'mine' ? 'Minhas' : 'Equipe'}
                </button>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..." className="input pl-8 h-9 text-sm" />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"><X className="w-3.5 h-3.5" /></button>}
          </div>

          {/* Group by */}
          <div className="flex items-center gap-1.5 ml-auto">
            <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-xs text-gray-500 font-medium">Agrupar:</span>
            {([['status', 'Status'], ['priority', 'Prioridade'], ['assignee', 'Pessoa']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setGroupBy(v)}
                className={cn('px-2.5 py-1 rounded-lg text-xs font-medium border transition-all',
                  groupBy === v ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300')}>
                {l}
              </button>
            ))}
          </div>

          {/* Priority filter */}
          <div className="flex gap-1">
            {(PRIORITY_ORDER).map(p => (
              <button key={p} onClick={() => setFilterP(f => f === p ? '' : p)}
                className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-all',
                  filterPriority === p
                    ? `${PRIORITY_CFG[p].bg} ${PRIORITY_CFG[p].text}`
                    : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300')}>
                <span className={cn('w-1.5 h-1.5 rounded-full', PRIORITY_CFG[p].dot)} />
                {PRIORITY_CFG[p].label}
              </button>
            ))}
          </div>

          {/* User filter (team) */}
          {scope === 'team' && allUsers.length > 0 && (
            <select value={filterUser} onChange={e => setFilterU(e.target.value)}
              className="input h-9 text-sm max-w-[150px]">
              <option value="">Todos</option>
              {allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
          <span>Tarefa</span>
          {scope === 'team' && <span className="w-20 text-center">Responsável</span>}
          <span className="w-24 text-center">Vencimento</span>
          <span className="w-20 text-center">Prioridade</span>
          <span className="w-24 text-center">Status</span>
        </div>

        {/* Groups */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {groups.map(g => {
            const isCollapsed = collapsed.has(g.key)
            return (
              <div key={g.key} className="rounded-xl overflow-hidden border border-gray-200 bg-white">
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(g.key)}
                  className={cn('w-full flex items-center gap-2.5 px-4 py-2.5 text-left border-b', g.cfg.header)}
                >
                  {g.cfg.user
                    ? <Avatar user={g.cfg.user} size={20} />
                    : <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', g.cfg.dot)} />
                  }
                  <span className={cn('text-sm font-semibold', g.cfg.text)}>{g.label}</span>
                  <span className="text-xs text-gray-400 font-medium">{g.tasks.length}</span>
                  <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 ml-auto transition-transform', isCollapsed && '-rotate-90')} />
                </button>

                {/* Rows */}
                {!isCollapsed && (
                  <div className="divide-y divide-gray-50">
                    {g.tasks.length === 0 && creating?.groupKey !== g.key && (
                      <p className="px-4 py-3 text-xs text-gray-400 italic">Sem tarefas neste grupo</p>
                    )}
                    {g.tasks.map(task => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        showUser={scope === 'team'}
                        isSelected={selected?.id === task.id}
                        onSelect={() => setSelected(t => t?.id === task.id ? null : task)}
                        onMove={moveTask}
                        onDelete={removeTask}
                      />
                    ))}

                    {/* Inline create */}
                    {creating?.groupKey === g.key ? (
                      <InlineCreate
                        onSubmit={title => addTask(title, g.key)}
                        onCancel={() => setCreating(null)}
                      />
                    ) : (
                      <button
                        onClick={() => setCreating({ groupKey: g.key })}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> Adicionar tarefa
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Right: detail panel ── */}
      {selected && (
        <DetailPanel
          task={selected}
          onClose={() => setSelected(null)}
          onMove={async s => { await moveTask(selected.id, s); reload() }}
          onDelete={async () => removeTask(selected.id)}
          onChange={async updates => {
            await updateTask(selected.id, updates)
            setSelected(p => p ? { ...p, ...updates } : p)
            reload()
          }}
        />
      )}
    </div>
  )
}

// ── Task Row ──────────────────────────────────────────────────────────────────

function TaskRow({ task, showUser, isSelected, onSelect, onMove, onDelete }: {
  task: Task; showUser: boolean; isSelected: boolean
  onSelect: () => void
  onMove: (id: string, s: Status) => void
  onDelete: (id: string) => void
}) {
  const [hover, setHover] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const prg = progress(task)
  const sCfg = STATUS_CFG[task.status]

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setMenuOpen(false) }}
      onClick={onSelect}
      className={cn(
        'group grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 items-center px-4 py-3 cursor-pointer transition-colors relative',
        isSelected ? 'bg-brand-50 border-l-2 border-brand-500' : 'hover:bg-gray-50/80',
        task.status === 'done' && 'opacity-60'
      )}
    >
      {/* Title + meta */}
      <div className="flex items-center gap-2.5 min-w-0">
        {/* Status dot (clickable cycle) */}
        <button
          onClick={e => {
            e.stopPropagation()
            const order: Status[] = ['todo', 'doing', 'paused', 'done']
            const next = order[(order.indexOf(task.status) + 1) % order.length]
            onMove(task.id, next)
          }}
          className={cn('w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all hover:scale-110', sCfg.ring,
            task.status === 'done' ? sCfg.dot + ' border-transparent' : 'bg-white'
          )}
          title={`Avançar status`}
        >
          {task.status === 'done' && <span className="text-white text-[8px] font-bold">✓</span>}
        </button>

        {/* Priority dot */}
        <PriorityDot p={task.priority} />

        {/* Title */}
        <span className={cn('text-sm text-gray-800 truncate font-medium', task.status === 'done' && 'line-through text-gray-400')}>
          {task.title}
        </span>

        {/* Quote badge */}
        {task.quote && (
          <span className="shrink-0 flex items-center gap-1 text-[11px] text-brand-500 bg-brand-50 px-1.5 py-0.5 rounded-md border border-brand-100">
            <Link2 className="w-3 h-3" /> #{task.quote.number}
          </span>
        )}

        {/* Checklist progress */}
        {prg && (
          <span className="shrink-0 flex items-center gap-1 text-[11px] text-gray-400">
            <CheckCircle2 className="w-3 h-3" /> {prg.done}/{prg.total}
          </span>
        )}
      </div>

      {/* Assignee */}
      {showUser && (
        <div className="w-20 flex justify-center">
          {task.users ? <Avatar user={task.users} size={24} /> : <span className="text-xs text-gray-300">—</span>}
        </div>
      )}

      {/* Due date */}
      <div className="w-24 flex justify-center">
        <DueChip date={task.due_date} />
      </div>

      {/* Priority */}
      <div className="w-20 flex justify-center">
        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-md border', PRIORITY_CFG[task.priority].bg, PRIORITY_CFG[task.priority].text)}>
          {PRIORITY_CFG[task.priority].label}
        </span>
      </div>

      {/* Status */}
      <div className="w-24 flex justify-center">
        {hover ? (
          <select
            value={task.status}
            onClick={e => e.stopPropagation()}
            onChange={e => { e.stopPropagation(); onMove(task.id, e.target.value as Status) }}
            className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 bg-white text-gray-600 w-full"
          >
            {(Object.entries(STATUS_CFG) as [Status, any][]).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        ) : (
          <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full',
            STATUS_CFG[task.status].text, 'bg-opacity-10')}>
            <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_CFG[task.status].dot)} />
            {STATUS_CFG[task.status].label}
          </span>
        )}
      </div>

      {/* Hover delete */}
      {hover && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(task.id) }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </div>
  )
}

// ── Inline Create ─────────────────────────────────────────────────────────────

function InlineCreate({ onSubmit, onCancel }: { onSubmit: (t: string) => void; onCancel: () => void }) {
  const [val, setVal] = useState('')
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-brand-50 border-t border-brand-100">
      <span className="w-4 h-4 rounded-full border-2 border-brand-300 bg-white shrink-0" />
      <input
        autoFocus value={val} onChange={e => setVal(e.target.value)}
        placeholder="Nome da tarefa... (Enter para salvar, Esc para cancelar)"
        className="flex-1 text-sm bg-transparent outline-none text-gray-800 placeholder-gray-400"
        onKeyDown={e => { if (e.key === 'Enter') onSubmit(val); if (e.key === 'Escape') onCancel() }}
      />
      <button onClick={() => onSubmit(val)} disabled={!val.trim()}
        className="text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-30 transition-opacity">
        Salvar
      </button>
      <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
    </div>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function DetailPanel({ task, onClose, onMove, onDelete, onChange }: {
  task: Task; onClose: () => void
  onMove: (s: Status) => void
  onDelete: () => void
  onChange: (u: any) => void
}) {
  const [title, setTitle] = useState(task.title)
  const [editingTitle, setEditingTitle] = useState(false)
  const prg = progress(task)
  const sCfg = STATUS_CFG[task.status]

  return (
    <div className="w-80 shrink-0 flex flex-col bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
      {/* Top bar */}
      <div className={cn('flex items-center gap-2 px-4 py-3 border-b', sCfg.header)}>
        <sCfg.Icon className={cn('w-4 h-4 shrink-0', sCfg.text)} />
        <span className={cn('text-xs font-bold flex-1', sCfg.text)}>{sCfg.label}</span>
        <button onClick={onDelete} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Title */}
        {editingTitle ? (
          <textarea autoFocus rows={2} value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={() => { onChange({ title }); setEditingTitle(false) }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onChange({ title }); setEditingTitle(false) } }}
            className="w-full text-base font-semibold text-gray-900 resize-none rounded-lg border border-brand-300 focus:ring-2 focus:ring-brand-200 outline-none p-2"
          />
        ) : (
          <h2 onClick={() => setEditingTitle(true)}
            className={cn('text-base font-semibold text-gray-900 cursor-text hover:bg-gray-50 rounded-lg p-1.5 -mx-1.5 transition-colors leading-snug',
              task.status === 'done' && 'line-through text-gray-400')}>
            {task.title}
          </h2>
        )}

        {/* Quote */}
        {task.quote && (
          <div className="flex items-center gap-2 bg-brand-50 border border-brand-100 rounded-xl px-3 py-2.5 text-sm text-brand-700">
            <Link2 className="w-4 h-4 shrink-0" />
            <span className="flex-1 min-w-0 truncate font-medium">#{task.quote.number} · {task.quote.client_name}</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-60" />
          </div>
        )}

        {/* Fields */}
        <div className="space-y-3">
          {[
            {
              label: 'Status',
              content: (
                <select value={task.status} onChange={e => onMove(e.target.value as Status)}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700">
                  {(Object.entries(STATUS_CFG) as [Status, any][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              )
            },
            {
              label: 'Prioridade',
              content: (
                <select value={task.priority} onChange={e => onChange({ priority: e.target.value })}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700">
                  {(Object.entries(PRIORITY_CFG) as [Priority, any][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              )
            },
            {
              label: 'Prazo',
              content: (
                <input type="date" defaultValue={task.due_date ?? ''}
                  onChange={e => onChange({ due_date: e.target.value || null })}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700" />
              )
            },
          ].map(({ label, content }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-xs text-gray-400 font-medium w-20 shrink-0">{label}</span>
              {content}
            </div>
          ))}

          {task.users && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 font-medium w-20 shrink-0">Responsável</span>
              <div className="flex items-center gap-2">
                <Avatar user={task.users} size={24} />
                <span className="text-sm text-gray-700">{task.users.name}</span>
              </div>
            </div>
          )}
        </div>

        {/* Progress */}
        {prg && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-500">
              <span className="font-semibold">Progresso</span>
              <span>{Math.round((prg.done / prg.total) * 100)}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${(prg.done / prg.total) * 100}%` }} />
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {(task.checklist ?? task.subtasks ?? []).map((item: any, i: number) => (
                <span key={i} className={cn('text-[11px] px-2 py-0.5 rounded-md border',
                  item.done ? 'bg-emerald-50 text-emerald-600 border-emerald-100 line-through' : 'bg-gray-50 text-gray-500 border-gray-200')}>
                  {item.text ?? `Item ${i + 1}`}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {task.description && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Descrição</p>
            <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-xl p-3">{task.description}</p>
          </div>
        )}

        <p className="text-[11px] text-gray-300 border-t border-gray-100 pt-3">
          Criada em {format(parseISO(task.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
        </p>
      </div>
    </div>
  )
}
