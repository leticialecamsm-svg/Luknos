'use client'

import { useState, useMemo, useRef, useTransition } from 'react'
import {
  updateTaskStatus, deleteTask, createTask,
  updateTask, updateTasksOrder,
} from '@/lib/actions'
import { useToast } from '@/components/ui/Toast'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import { Plus, X, Search, ChevronDown, Link2, Trash2, Users, ExternalLink, CheckCircle2 } from 'lucide-react'
import { format, isToday, isPast, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type Status   = 'todo' | 'doing' | 'paused' | 'done'
type Priority = 'high' | 'mid' | 'low'

interface Task {
  id: string; title: string; description?: string
  status: Status; priority: Priority
  due_date?: string | null; completed_at?: string | null
  sort_order?: number; pinned_to_today?: boolean
  created_at: string; user_id?: string
  users?: { name: string; avatar_color: string; avatar_url?: string | null } | null
  quote?: { number: number; client_name: string } | null
  quote_id?: string | null
  checklist?: { text: string; done: boolean }[]
  subtasks?: { id: string; done: boolean }[]
}

interface User { id: string; name: string; avatar_color: string; avatar_url?: string | null }

const P = {
  high: { label: 'Alta',  dot: 'bg-red-500',   text: 'text-red-600',   bg: 'bg-red-50',   pill: 'bg-red-100 text-red-600',    lborder: 'border-l-red-400' },
  mid:  { label: 'Média', dot: 'bg-amber-400', text: 'text-amber-600', bg: 'bg-amber-50', pill: 'bg-amber-100 text-amber-600', lborder: 'border-l-amber-400' },
  low:  { label: 'Baixa', dot: 'bg-gray-300',  text: 'text-gray-500',  bg: 'bg-gray-50',  pill: 'bg-gray-100 text-gray-500',   lborder: 'border-l-gray-300' },
}

const TODAY    = new Date().toISOString().split('T')[0]
const TOMORROW = new Date(Date.now() + 86400000).toISOString().split('T')[0]

function isInToday(t: Task) {
  if (t.pinned_to_today) return true
  if (!t.due_date) return false
  const d = parseISO(t.due_date)
  return isToday(d) || isPast(d)
}

function sortedBy(tasks: Task[]) {
  return [...tasks].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function TasksV5({ myTasks, allTasks, allUsers, currentUser, isAdmin }: {
  myTasks: Task[]; allTasks: Task[]; allUsers: User[]
  currentUser: User; isAdmin: boolean
}) {
  const toast = useToast()
  const [, startTx] = useTransition()
  const [scope, setScope]   = useState<'mine' | 'team'>('mine')
  const [search, setSearch] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState<Priority>('mid')
  const [doneOpen, setDoneOpen] = useState(false)
  const [selected, setSelected] = useState<Task | null>(null)

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
    if (search) t = t.filter(x => x.title.toLowerCase().includes(search.toLowerCase()))
    return t
  }, [myTasks, allTasks, scope, search])

  const active     = filtered.filter(t => t.status !== 'done')
  const done       = filtered.filter(t => t.status === 'done')
  const todayTasks = sortedBy(active.filter(isInToday))
  const laterTasks = sortedBy(active.filter(t => !isInToday(t)))

  // ── Mutations ─────────────────────────────────────────────────────────────

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    setNewTitle('')
    const tmp: Task = { id: '__tmp__' + Date.now(), title, status: 'todo', priority: newPriority, created_at: new Date().toISOString(), due_date: TODAY, sort_order: -1 }
    setTasks(prev => [tmp, ...prev])
    const res = await createTask({ title, priority: newPriority, status: 'todo', due_date: TODAY })
    if (res?.error) { toast.error('Erro', res.error); setTasks(prev => prev.filter(t => t.id !== tmp.id)); return }
    reload()
  }

  async function toggleDone(task: Task) {
    const next: Status = task.status === 'done' ? 'todo' : 'done'
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t))
    if (selected?.id === task.id) setSelected(p => p ? { ...p, status: next } : p)
    await updateTaskStatus(task.id, next)
  }

  async function removeTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
    if (selected?.id === id) setSelected(null)
    await deleteTask(id)
  }

  async function changeTask(id: string, updates: Partial<Task>) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
    if (selected?.id === id) setSelected(p => p ? { ...p, ...updates } : p)
    await updateTask(id, updates as any)
  }

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  // dropTarget: ref mutado em onDragOver de cada row, lido em onDrop do grupo
  const draggingId = useRef<string | null>(null)
  const dropTarget = useRef<{ section: 'today' | 'later'; priority: Priority | null; insertBeforeId: string | null }>({
    section: 'today', priority: null, insertBeforeId: null,
  })

  async function applyDrop() {
    const taskId = draggingId.current
    if (!taskId) return
    const { section: toSection, priority: toPriority, insertBeforeId } = dropTarget.current

    const task = (scope === 'mine' ? myTasks : allTasks).find(t => t.id === taskId)
    if (!task) return

    const updates: Partial<Task> = {}
    const wasToday = isInToday(task)

    if (toSection === 'today' && !wasToday) {
      updates.due_date = TODAY
      updates.pinned_to_today = true
    } else if (toSection === 'later' && wasToday) {
      updates.pinned_to_today = false
      if (!task.due_date || isToday(parseISO(task.due_date)) || isPast(parseISO(task.due_date))) {
        updates.due_date = TOMORROW
      }
    }
    if (toPriority && toPriority !== task.priority) {
      updates.priority = toPriority
    }

    // Recalcula sort_order da lista destino
    const destList = toSection === 'today' ? todayTasks : laterTasks
    const without = destList.filter(t => t.id !== taskId)
    const movedTask = { ...task, ...updates }
    let inserted: Task[]
    if (insertBeforeId) {
      const idx = without.findIndex(t => t.id === insertBeforeId)
      inserted = [...without]
      inserted.splice(idx === -1 ? inserted.length : idx, 0, movedTask)
    } else {
      inserted = [...without, movedTask]
    }
    const orderUpdates = inserted.map((t, i) => ({ id: t.id, sort_order: i * 10 }))

    // Optimistic update
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) return { ...t, ...updates, sort_order: orderUpdates.find(u => u.id === taskId)?.sort_order ?? t.sort_order }
      const ou = orderUpdates.find(u => u.id === t.id)
      return ou ? { ...t, sort_order: ou.sort_order } : t
    }))
    if (selected?.id === taskId) setSelected(p => p ? { ...p, ...updates } : p)

    await Promise.all([
      updateTasksOrder(orderUpdates),
      ...(Object.keys(updates).length ? [updateTask(taskId, updates as any)] : []),
    ])
  }

  const todayByP: Record<Priority, Task[]> = {
    high: todayTasks.filter(t => t.priority === 'high'),
    mid:  todayTasks.filter(t => t.priority === 'mid'),
    low:  todayTasks.filter(t => t.priority === 'low'),
  }

  return (
    <div className={cn('flex gap-5 h-full min-h-0', selected && 'pr-0')}>
      <div className="flex flex-col flex-1 min-w-0 gap-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tarefas</h1>
            <p className="text-sm text-gray-400">
              {todayTasks.length > 0
                ? <><span className="text-orange-600 font-semibold">{todayTasks.length}</span> para hoje · <span className="text-gray-600">{laterTasks.length}</span> depois</>
                : <span className="text-emerald-600 font-medium">✓ Dia em dia!</span>
              }
            </p>
          </div>
          {isAdmin && (
            <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5">
              {(['mine', 'team'] as const).map(s => (
                <button key={s} onClick={() => setScope(s)}
                  className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                    scope === s ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
                  {s === 'mine' ? 'Minhas' : <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />Equipe</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick add */}
        <form onSubmit={handleAdd}
          className="flex items-center gap-3 bg-white rounded-2xl border-2 border-dashed border-gray-200 hover:border-brand-300 focus-within:border-brand-400 focus-within:shadow-sm transition-all px-4 py-3">
          <Plus className="w-4 h-4 text-gray-400 shrink-0" />
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
            placeholder="Adicionar tarefa de hoje... (Enter para salvar)"
            className="flex-1 text-sm text-gray-800 bg-transparent outline-none placeholder-gray-400" />
          <div className="flex items-center gap-1.5 shrink-0">
            {(['high', 'mid', 'low'] as Priority[]).map(p => (
              <button key={p} type="button" onClick={() => setNewPriority(p)} title={P[p].label}
                className={cn('w-4 h-4 rounded-full border-2 transition-all',
                  newPriority === p ? `${P[p].dot} border-transparent scale-125` : 'border-gray-300 bg-white hover:border-gray-500')} />
            ))}
          </div>
          {newTitle && (
            <button type="submit" className="shrink-0 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 px-3 py-1.5 rounded-lg transition-colors">
              Salvar
            </button>
          )}
        </form>

        {/* Search */}
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tarefa..."
            className="input pl-9 h-9 text-sm w-full" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X className="w-3 h-3" /></button>}
        </div>

        {/* Lists */}
        <div className="flex-1 overflow-y-auto space-y-3 pb-6">

          {/* TAREFAS DO DIA */}
          <Section title="Tarefas do dia" count={todayTasks.length} accent="text-orange-600" defaultOpen>
            {(['high', 'mid', 'low'] as Priority[]).map(p => (
              <PriorityGroup
                key={p} priority={p} tasks={todayByP[p]}
                showUser={scope === 'team'}
                draggingId={draggingId} dropTarget={dropTarget}
                onDrop={applyDrop}
                onToggle={toggleDone} onDelete={removeTask}
                onSelect={t => setSelected(s => s?.id === t.id ? null : t)}
                selectedId={selected?.id}
              />
            ))}
          </Section>

          {/* DEPOIS */}
          <Section title="Depois" count={laterTasks.length} accent="text-gray-500" defaultOpen>
            <DropList
              tasks={laterTasks} showUser={scope === 'team'}
              draggingId={draggingId} dropTarget={dropTarget}
              onDrop={applyDrop}
              onToggle={toggleDone} onDelete={removeTask}
              onSelect={t => setSelected(s => s?.id === t.id ? null : t)}
              selectedId={selected?.id}
            />
          </Section>

          {/* CONCLUÍDAS */}
          {done.length > 0 && (
            <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
              <button onClick={() => setDoneOpen(o => !o)}
                className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-100">
                <span className="text-xs font-bold text-emerald-600">✓ Concluídas</span>
                <span className="text-xs text-gray-400">{done.length}</span>
                <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 ml-auto transition-transform', !doneOpen && '-rotate-90')} />
              </button>
              {doneOpen && (
                <div className="divide-y divide-gray-100">
                  {done.map(task => (
                    <TaskRow key={task.id} task={task} showUser={scope === 'team'} isDone
                      isSelected={selected?.id === task.id}
                      onToggle={() => toggleDone(task)}
                      onDelete={() => removeTask(task.id)}
                      onSelect={() => setSelected(s => s?.id === task.id ? null : task)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <DetailPanel
          key={selected.id} task={selected}
          onClose={() => setSelected(null)}
          onToggle={() => toggleDone(selected)}
          onDelete={() => removeTask(selected.id)}
          onChange={updates => changeTask(selected.id, updates)}
        />
      )}
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ title, count, accent, defaultOpen, children }: {
  title: string; count: number; accent: string; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen ?? true)
  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100">
        <span className={cn('text-sm font-bold', accent)}>{title}</span>
        {count > 0 && <span className="text-xs text-gray-400 font-medium">{count}</span>}
        <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 ml-auto transition-transform', !open && '-rotate-90')} />
      </button>
      {open && <>{children}</>}
    </div>
  )
}

// ── Priority group ────────────────────────────────────────────────────────────

function PriorityGroup({ priority, tasks, showUser, draggingId, dropTarget, onDrop, onToggle, onDelete, onSelect, selectedId }: {
  priority: Priority; tasks: Task[]; showUser: boolean
  draggingId: React.MutableRefObject<string | null>
  dropTarget: React.MutableRefObject<{ section: 'today' | 'later'; priority: Priority | null; insertBeforeId: string | null }>
  onDrop: () => void
  onToggle: (t: Task) => void; onDelete: (id: string) => void
  onSelect: (t: Task) => void; selectedId?: string
}) {
  const cfg = P[priority]
  const [overIdx, setOverIdx] = useState<number | null>(null)

  function aim(insertBeforeId: string | null, idx: number | null) {
    dropTarget.current = { section: 'today', priority, insertBeforeId }
    setOverIdx(idx)
  }

  return (
    <div className={cn('border-l-2', cfg.lborder)}>
      {/* Sub-header — sempre visível, mesmo vazio */}
      <div className={cn('flex items-center gap-2 px-4 py-1.5', cfg.bg)}>
        <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dot)} />
        <span className={cn('text-[11px] font-bold uppercase tracking-wide', cfg.text)}>{cfg.label}</span>
        <span className="text-[11px] text-gray-400">{tasks.length}</span>
      </div>

      {/* Drop container */}
      <div
        onDragOver={e => { e.preventDefault(); if (tasks.length === 0) aim(null, 0) }}
        onDrop={e => { e.preventDefault(); onDrop(); setOverIdx(null) }}
        className="min-h-[8px]"
      >
        {tasks.map((task, idx) => (
          <div key={task.id}>
            <Line active={overIdx === idx} />
            <TaskRow
              task={task} showUser={showUser}
              isSelected={selectedId === task.id}
              draggingId={draggingId}
              onAim={(id, i) => aim(id, i)}
              onAimIdx={idx}
              onDragStart={() => { draggingId.current = task.id; setOverIdx(null) }}
              onDragEnd={() => { draggingId.current = null; setOverIdx(null) }}
              onToggle={() => onToggle(task)}
              onDelete={() => onDelete(task.id)}
              onSelect={() => onSelect(task)}
            />
          </div>
        ))}
        <Line active={overIdx === tasks.length} />
        {/* Padding zone at bottom of group to drop at end */}
        <div className="h-3" onDragOver={e => { e.preventDefault(); aim(null, tasks.length) }} />
      </div>
    </div>
  )
}

// ── Drop list ─────────────────────────────────────────────────────────────────

function DropList({ tasks, showUser, draggingId, dropTarget, onDrop, onToggle, onDelete, onSelect, selectedId }: {
  tasks: Task[]; showUser: boolean
  draggingId: React.MutableRefObject<string | null>
  dropTarget: React.MutableRefObject<{ section: 'today' | 'later'; priority: Priority | null; insertBeforeId: string | null }>
  onDrop: () => void
  onToggle: (t: Task) => void; onDelete: (id: string) => void
  onSelect: (t: Task) => void; selectedId?: string
}) {
  const [overIdx, setOverIdx] = useState<number | null>(null)

  function aim(insertBeforeId: string | null, idx: number | null) {
    dropTarget.current = { section: 'later', priority: null, insertBeforeId }
    setOverIdx(idx)
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); if (tasks.length === 0) aim(null, 0) }}
      onDrop={e => { e.preventDefault(); onDrop(); setOverIdx(null) }}
      className="min-h-[8px]"
    >
      {tasks.map((task, idx) => (
        <div key={task.id}>
          <Line active={overIdx === idx} />
          <TaskRow
            task={task} showUser={showUser} showPriorityPill
            isSelected={selectedId === task.id}
            draggingId={draggingId}
            onAim={(id, i) => aim(id, i)}
            onAimIdx={idx}
            onDragStart={() => { draggingId.current = task.id; setOverIdx(null) }}
            onDragEnd={() => { draggingId.current = null; setOverIdx(null) }}
            onToggle={() => onToggle(task)}
            onDelete={() => onDelete(task.id)}
            onSelect={() => onSelect(task)}
          />
        </div>
      ))}
      <Line active={overIdx === tasks.length} />
      <div className="h-3" onDragOver={e => { e.preventDefault(); aim(null, tasks.length) }} />
    </div>
  )
}

// ── Line indicator ────────────────────────────────────────────────────────────

function Line({ active }: { active: boolean }) {
  return <div className={cn('mx-4 h-0.5 rounded-full transition-all', active ? 'bg-brand-400' : 'opacity-0')} />
}

// ── Task Row ──────────────────────────────────────────────────────────────────

function TaskRow({ task, showUser, showPriorityPill, isDone, isSelected,
  draggingId, onAim, onAimIdx, onDragStart, onDragEnd,
  onToggle, onDelete, onSelect,
}: {
  task: Task; showUser?: boolean; showPriorityPill?: boolean; isDone?: boolean; isSelected?: boolean
  draggingId?: React.MutableRefObject<string | null>
  onAim?: (insertBeforeId: string, idx: number) => void
  onAimIdx?: number
  onDragStart?: () => void; onDragEnd?: () => void
  onToggle: () => void; onDelete: () => void; onSelect: () => void
}) {
  const done    = task.status === 'done'
  const due     = task.due_date ? parseISO(task.due_date) : null
  const overdue = due && isPast(due) && !isToday(due) && !done
  const dueLabel = due ? (isToday(due) ? 'Hoje' : format(due, 'dd/MM', { locale: ptBR })) : null

  // Drag: só permitido a partir do handle
  const canDrag = useRef(false)

  return (
    <div
      draggable={!!draggingId}
      onDragStart={e => {
        if (!canDrag.current) { e.preventDefault(); return }
        e.dataTransfer.effectAllowed = 'move'
        onDragStart?.()
      }}
      onDragEnd={() => { canDrag.current = false; onDragEnd?.() }}
      onDragOver={e => { e.preventDefault(); if (onAim && onAimIdx !== undefined) onAim(task.id, onAimIdx) }}
      onClick={onSelect}
      className={cn(
        'group flex items-center gap-2 px-3 py-3 border-b border-gray-100 last:border-0 cursor-pointer transition-colors select-none',
        isSelected ? 'bg-brand-50' : 'hover:bg-gray-50/80',
        done && 'opacity-50'
      )}
    >
      {/* Drag handle — único elemento que ativa o drag */}
      {draggingId && (
        <div
          onMouseDown={() => { canDrag.current = true }}
          onMouseUp={() => { canDrag.current = false }}
          className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0"
          onClick={e => e.stopPropagation()}
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <circle cx="7" cy="5"  r="1.3"/><circle cx="13" cy="5"  r="1.3"/>
            <circle cx="7" cy="10" r="1.3"/><circle cx="13" cy="10" r="1.3"/>
            <circle cx="7" cy="15" r="1.3"/><circle cx="13" cy="15" r="1.3"/>
          </svg>
        </div>
      )}

      {/* Checkbox */}
      <button
        onClick={e => { e.stopPropagation(); onToggle() }}
        className={cn(
          'w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all hover:scale-110',
          done ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-emerald-400 bg-white'
        )}
      >
        {done && <span className="text-white text-[9px] font-bold leading-none">✓</span>}
      </button>

      {/* Title */}
      <span className={cn('flex-1 text-sm text-gray-800 min-w-0 truncate', done && 'line-through text-gray-400')}>
        {task.title}
      </span>

      {/* Meta — largura fixa, sem layout shift no hover */}
      <div className="flex items-center gap-2 shrink-0">
        {showPriorityPill && (
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', P[task.priority].pill)}>
            {P[task.priority].label}
          </span>
        )}
        {task.quote && (
          <span className="text-[11px] text-brand-400 hidden sm:flex items-center gap-1">
            <Link2 className="w-3 h-3" />#{task.quote.number}
          </span>
        )}
        <span className={cn(
          'text-[11px] font-medium w-10 text-right',
          !dueLabel && 'invisible',
          overdue ? 'text-red-500' : due && isToday(due) ? 'text-orange-500' : 'text-gray-400'
        )}>
          {dueLabel ?? '—'}
        </span>
        {showUser && (
          <div className="w-6 flex justify-center">
            {task.users ? <Avatar user={task.users} size={22} /> : null}
          </div>
        )}
        {/* Delete: espaço fixo, só opacity muda */}
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function DetailPanel({ task, onClose, onToggle, onDelete, onChange }: {
  task: Task; onClose: () => void
  onToggle: () => void; onDelete: () => void
  onChange: (u: Partial<Task>) => void
}) {
  const [title, setTitle] = useState(task.title)
  const [desc, setDesc]   = useState(task.description ?? '')
  const done = task.status === 'done'
  const prg  = (() => {
    const items = task.checklist ?? task.subtasks ?? []
    if (!items.length) return null
    return { done: items.filter((i: any) => i.done).length, total: items.length }
  })()

  return (
    <div className="w-72 shrink-0 flex flex-col bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
      {/* Top */}
      <div className={cn('flex items-center gap-2 px-4 py-3 border-b border-gray-100',
        { 'bg-red-50': task.priority === 'high', 'bg-amber-50': task.priority === 'mid', 'bg-gray-50': task.priority === 'low' })}>
        <span className={cn('w-2 h-2 rounded-full', P[task.priority].dot)} />
        <span className={cn('text-xs font-bold flex-1 uppercase tracking-wide', P[task.priority].text)}>{P[task.priority].label}</span>
        <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Checkbox + título */}
        <div className="flex items-start gap-2.5">
          <button onClick={onToggle}
            className={cn('mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all hover:scale-110',
              done ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-emerald-400')}>
            {done && <span className="text-white text-[9px] font-bold">✓</span>}
          </button>
          <textarea value={title} onChange={e => setTitle(e.target.value)}
            onBlur={() => title.trim() && onChange({ title: title.trim() })}
            rows={2} className={cn(
              'flex-1 text-base font-semibold text-gray-900 resize-none bg-transparent outline-none leading-snug',
              done && 'line-through text-gray-400'
            )} />
        </div>

        {/* Quote */}
        {task.quote && (
          <div className="flex items-center gap-2 bg-brand-50 border border-brand-100 rounded-xl px-3 py-2">
            <Link2 className="w-3.5 h-3.5 text-brand-500 shrink-0" />
            <span className="flex-1 text-xs font-medium text-brand-700 truncate">#{task.quote.number} · {task.quote.client_name}</span>
          </div>
        )}

        {/* Fields */}
        <div className="space-y-2.5">
          <Row2 label="Status">
            <select value={task.status} onChange={e => onChange({ status: e.target.value as Status })}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700">
              <option value="todo">A fazer</option>
              <option value="doing">Em andamento</option>
              <option value="paused">Pausada</option>
              <option value="done">Concluída</option>
            </select>
          </Row2>
          <Row2 label="Prioridade">
            <div className="flex gap-1.5 flex-1">
              {(['high', 'mid', 'low'] as Priority[]).map(p => (
                <button key={p} onClick={() => onChange({ priority: p })}
                  className={cn('flex-1 text-xs font-semibold py-1.5 rounded-lg border transition-all',
                    task.priority === p ? `${P[p].dot} border-transparent text-white` : 'border-gray-200 text-gray-500 hover:border-gray-300')}>
                  {P[p].label}
                </button>
              ))}
            </div>
          </Row2>
          <Row2 label="Prazo">
            <input type="date" defaultValue={task.due_date ?? ''}
              onChange={e => onChange({ due_date: e.target.value || null })}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700" />
          </Row2>
          {task.users && (
            <Row2 label="Responsável">
              <div className="flex items-center gap-2">
                <Avatar user={task.users} size={22} />
                <span className="text-sm text-gray-700">{task.users.name}</span>
              </div>
            </Row2>
          )}
        </div>

        {/* Progress */}
        {prg && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-gray-500">
              <span className="font-semibold">Checklist</span>
              <span>{prg.done}/{prg.total}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full">
              <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${(prg.done / prg.total) * 100}%` }} />
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Notas</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)}
            onBlur={() => onChange({ description: desc })}
            placeholder="Adicionar notas..." rows={4}
            className="w-full mt-1.5 text-sm text-gray-700 resize-none border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-brand-200 placeholder-gray-300 leading-relaxed" />
        </div>

        <p className="text-[11px] text-gray-300 border-t border-gray-100 pt-3">
          Criada em {format(parseISO(task.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
        </p>
      </div>
    </div>
  )
}

function Row2({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-400 font-medium w-20 shrink-0">{label}</span>
      {children}
    </div>
  )
}
