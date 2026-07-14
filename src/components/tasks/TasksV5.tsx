'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import {
  updateTaskStatus, deleteTask, createTask,
  updateTask, updateTasksOrder, getQuotesList,
} from '@/lib/actions'
import { useToast } from '@/components/ui/Toast'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import { Plus, X, Search, ChevronDown, Link2, Trash2, Users, GripVertical, Calendar, Check } from 'lucide-react'
import { format, isToday, isPast, isTomorrow, startOfWeek, addDays, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { QuoteQuickViewModal } from '@/components/quotes/QuoteQuickViewModal'

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
  subtasks?: { id: string; title?: string; text?: string; done: boolean; completed?: boolean }[]
}

interface User { id: string; name: string; avatar_color: string; avatar_url?: string | null }

const P = {
  high: { label: 'Alta',  dot: 'bg-red-500',   text: 'text-red-600',   bg: 'bg-red-50',   pill: 'bg-red-100 text-red-600',    lborder: 'border-l-red-400' },
  mid:  { label: 'Média', dot: 'bg-amber-400', text: 'text-amber-600', bg: 'bg-amber-50', pill: 'bg-amber-100 text-amber-600', lborder: 'border-l-amber-400' },
  low:  { label: 'Baixa', dot: 'bg-gray-300',  text: 'text-gray-500',  bg: 'bg-gray-50',  pill: 'bg-gray-100 text-gray-500',   lborder: 'border-l-gray-300' },
}

const STATUS_CFG: Record<Status, { label: string; cls: string }> = {
  todo:   { label: 'A fazer',      cls: 'bg-gray-100 text-gray-500' },
  doing:  { label: 'Em andamento', cls: 'bg-blue-100 text-blue-600' },
  paused: { label: 'Pausada',      cls: 'bg-amber-100 text-amber-600' },
  done:   { label: 'Concluída',    cls: 'bg-emerald-100 text-emerald-600' },
}

const TODAY    = new Date().toISOString().split('T')[0]
const TOMORROW = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] })()

// Parseia datas evitando bug de fuso horário com strings "YYYY-MM-DD"
function parseLocalDate(s: string): Date {
  // Extrai apenas a parte da data (antes do T) para evitar offset UTC
  const datePart = s.split('T')[0]
  const [y, m, d] = datePart.split('-').map(Number)
  if (!y || !m || !d) return new Date(s) // fallback para ISO completo
  return new Date(y, m - 1, d)
}

function isInToday(t: Task) {
  if (t.pinned_to_today) return true
  if (!t.due_date) return false
  const d = parseLocalDate(t.due_date)
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
  const [scope, setScope]   = useState<'mine' | 'team'>('mine')
  const [search, setSearch] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState<Priority>('mid')
  const [doneOpen, setDoneOpen] = useState(false)
  const [selected, setSelected] = useState<Task | null>(null)
  const [view, setView] = useState<'day' | 'week'>('day')
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null)

  // Estado local de tarefas (optimistic)
  const [tasks, setTasks] = useState<Task[]>(() => myTasks)

  useEffect(() => {
    setTasks(scope === 'mine' ? myTasks : allTasks)
  }, [scope])

  const filtered = useMemo(() => {
    let t = tasks
    if (search) t = t.filter(x => x.title.toLowerCase().includes(search.toLowerCase()))
    return t
  }, [tasks, search])

  const active     = filtered.filter(t => t.status !== 'done')
  const done       = filtered.filter(t => t.status === 'done')
  const todayTasks = sortedBy(active.filter(isInToday))
  const laterTasks = sortedBy(active.filter(t => !isInToday(t)))

  // ── Mutations (optimistic, DB em background) ──────────────────────────────

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    setNewTitle('')
    const tmp: Task = { id: '__tmp__' + Date.now(), title, status: 'todo', priority: newPriority, created_at: new Date().toISOString(), due_date: TODAY, sort_order: -1 }
    setTasks(prev => [tmp, ...prev])
    const res = await createTask({ title, priority: newPriority, status: 'todo', due_date: TODAY })
    if (res?.error) { toast.error('Erro', res.error); setTasks(prev => prev.filter(t => t.id !== tmp.id)) }
  }

  function toggleDone(task: Task) {
    const next: Status = task.status === 'done' ? 'todo' : 'done'
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t))
    if (selected?.id === task.id) setSelected(p => p ? { ...p, status: next } : p)
    updateTaskStatus(task.id, next).catch(() => {})
  }

  function removeTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
    if (selected?.id === id) setSelected(null)
    deleteTask(id).catch(() => {})
  }

  function changeTask(id: string, updates: Partial<Task>) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
    if (selected?.id === id) setSelected(p => p ? { ...p, ...updates } : p)
    updateTask(id, updates as any).catch(() => {})
  }

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  const draggingId = useRef<string | null>(null)
  const dropTarget = useRef<{ section: 'today' | 'later'; priority: Priority | null; insertBeforeId: string | null }>({
    section: 'today', priority: null, insertBeforeId: null,
  })

  // Sem await — optimistic instantâneo, DB dispara em background
  function applyDrop() {
    const taskId = draggingId.current
    if (!taskId) return
    const { section: toSection, priority: toPriority, insertBeforeId } = dropTarget.current

    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    const updates: Partial<Task> = {}
    const wasToday = isInToday(task)

    if (toSection === 'today' && !wasToday) {
      updates.due_date = TODAY
      updates.pinned_to_today = true
    } else if (toSection === 'later' && wasToday) {
      updates.pinned_to_today = false
      if (!task.due_date || isToday(parseLocalDate(task.due_date)) || isPast(parseLocalDate(task.due_date))) {
        updates.due_date = TOMORROW
      }
    }
    if (toPriority && toPriority !== task.priority) {
      updates.priority = toPriority
    }

    const destList = toSection === 'today' ? todayTasks : laterTasks
    const without  = destList.filter(t => t.id !== taskId)
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

    // Optimistic instantâneo
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) return { ...t, ...updates, sort_order: orderUpdates.find(u => u.id === taskId)?.sort_order ?? t.sort_order }
      const ou = orderUpdates.find(u => u.id === t.id)
      return ou ? { ...t, sort_order: ou.sort_order } : t
    }))
    if (selected?.id === taskId) setSelected(p => p ? { ...p, ...updates } : p)

    // DB em background (sem bloquear UI)
    updateTasksOrder(orderUpdates).catch(() => {})
    if (Object.keys(updates).length) updateTask(taskId, updates as any).catch(() => {})
  }

  const todayByP: Record<Priority, Task[]> = {
    high: todayTasks.filter(t => t.priority === 'high'),
    mid:  todayTasks.filter(t => t.priority === 'mid'),
    low:  todayTasks.filter(t => t.priority === 'low'),
  }

  return (
    <>
    <div className="flex gap-5 h-full min-h-0">
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
          <div className="flex gap-2">
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
            <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5">
              {(['day', 'week'] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5',
                    view === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
                  {v === 'day' ? 'Dia' : <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Semana</span>}
                </button>
              ))}
            </div>
          </div>
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


        {/* Lists */}
        <div className="flex-1 overflow-y-auto space-y-3 pb-6">
          {view === 'day' ? (
            <>
              <Section title="Tarefas do dia" count={todayTasks.length} accent="text-orange-600" defaultOpen>
                {(['high', 'mid', 'low'] as Priority[]).map(p => (
                  <PriorityGroup
                    key={p} priority={p} tasks={todayByP[p]}
                    showUser={scope === 'team'}
                    draggingId={draggingId} dropTarget={dropTarget}
                    onDrop={applyDrop}
                    onToggle={toggleDone} onDelete={removeTask}
                    onSelect={t => setSelected(s => s?.id === t.id ? null : t)}
                    onQuoteClick={setSelectedQuoteId}
                    selectedId={selected?.id}
                  />
                ))}
              </Section>

              <Section title="Depois" count={laterTasks.length} accent="text-gray-500" defaultOpen>
                <DropList
                  tasks={laterTasks} showUser={scope === 'team'}
                  draggingId={draggingId} dropTarget={dropTarget}
                  onDrop={applyDrop}
                  onToggle={toggleDone} onDelete={removeTask}
                  onSelect={t => setSelected(s => s?.id === t.id ? null : t)}
                  onQuoteClick={setSelectedQuoteId}
                  selectedId={selected?.id}
                />
              </Section>
            </>
          ) : (
            <WeekView tasks={active} showUser={scope === 'team'} onToggle={toggleDone} onDelete={removeTask} onSelect={t => setSelected(s => s?.id === t.id ? null : t)} selectedId={selected?.id} />
          )}

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
                      onQuoteClick={setSelectedQuoteId}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

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

    {selectedQuoteId && (
      <QuoteQuickViewModal quoteId={selectedQuoteId} onClose={() => setSelectedQuoteId(null)} />
    )}
    </>
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

function PriorityGroup({ priority, tasks, showUser, draggingId, dropTarget, onDrop, onToggle, onDelete, onSelect, onQuoteClick, selectedId }: {
  priority: Priority; tasks: Task[]; showUser: boolean
  draggingId: React.MutableRefObject<string | null>
  dropTarget: React.MutableRefObject<{ section: 'today' | 'later'; priority: Priority | null; insertBeforeId: string | null }>
  onDrop: () => void
  onToggle: (t: Task) => void; onDelete: (id: string) => void
  onSelect: (t: Task) => void; onQuoteClick?: (quoteId: string) => void; selectedId?: string
}) {
  const cfg = P[priority]
  const [overIdx, setOverIdx] = useState<number | null>(null)

  function aim(insertBeforeId: string | null, idx: number | null) {
    dropTarget.current = { section: 'today', priority, insertBeforeId }
    setOverIdx(idx)
  }

  function handleDragOver(e: React.DragEvent, insertBeforeId: string | null, idx: number | null) {
    e.preventDefault()
    aim(insertBeforeId, idx)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    onDrop()
    setOverIdx(null)
  }

  return (
    <div
      className={cn('border-l-2', cfg.lborder)}
      onDragOver={e => handleDragOver(e, null, tasks.length)}
      onDrop={handleDrop}
    >
      <div className={cn('flex items-center gap-2 px-4 py-1.5', cfg.bg)}>
        <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dot)} />
        <span className={cn('text-[11px] font-bold uppercase tracking-wide', cfg.text)}>{cfg.label}</span>
        <span className="text-[11px] text-gray-400">{tasks.length}</span>
      </div>

      <div className="min-h-[16px]">
        {tasks.map((task, idx) => (
          <div key={task.id}>
            <Line active={overIdx === idx} />
            <TaskRow
              task={task} showUser={showUser}
              isSelected={selectedId === task.id}
              draggingId={draggingId}
              onRowDragOver={e => handleDragOver(e, task.id, idx)}
              onRowDrop={handleDrop}
              onDragStart={() => { draggingId.current = task.id; setOverIdx(null) }}
              onDragEnd={() => { draggingId.current = null; setOverIdx(null) }}
              onToggle={() => onToggle(task)}
              onDelete={() => onDelete(task.id)}
              onSelect={() => onSelect(task)}
              onQuoteClick={onQuoteClick}
            />
          </div>
        ))}
        <Line active={overIdx === tasks.length} />
        <div className="h-4"
          onDragOver={e => handleDragOver(e, null, tasks.length)}
          onDrop={handleDrop}
        />
      </div>
    </div>
  )
}

// ── Drop list ─────────────────────────────────────────────────────────────────

function DropList({ tasks, showUser, draggingId, dropTarget, onDrop, onToggle, onDelete, onSelect, onQuoteClick, selectedId }: {
  tasks: Task[]; showUser: boolean
  draggingId: React.MutableRefObject<string | null>
  dropTarget: React.MutableRefObject<{ section: 'today' | 'later'; priority: Priority | null; insertBeforeId: string | null }>
  onDrop: () => void
  onToggle: (t: Task) => void; onDelete: (id: string) => void
  onSelect: (t: Task) => void; onQuoteClick?: (quoteId: string) => void; selectedId?: string
}) {
  const [overIdx, setOverIdx] = useState<number | null>(null)

  function aim(insertBeforeId: string | null, idx: number | null) {
    dropTarget.current = { section: 'later', priority: null, insertBeforeId }
    setOverIdx(idx)
  }

  function handleDragOver(e: React.DragEvent, insertBeforeId: string | null, idx: number | null) {
    e.preventDefault()
    aim(insertBeforeId, idx)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    onDrop()
    setOverIdx(null)
  }

  return (
    <div
      className="min-h-[16px]"
      onDragOver={e => handleDragOver(e, null, tasks.length)}
      onDrop={handleDrop}
    >
      {tasks.map((task, idx) => (
        <div key={task.id}>
          <Line active={overIdx === idx} />
          <TaskRow
            task={task} showUser={showUser} showPriorityPill
            isSelected={selectedId === task.id}
            draggingId={draggingId}
            onRowDragOver={e => handleDragOver(e, task.id, idx)}
            onRowDrop={handleDrop}
            onDragStart={() => { draggingId.current = task.id; setOverIdx(null) }}
            onDragEnd={() => { draggingId.current = null; setOverIdx(null) }}
            onToggle={() => onToggle(task)}
            onDelete={() => onDelete(task.id)}
            onSelect={() => onSelect(task)}
            onQuoteClick={onQuoteClick}
          />
        </div>
      ))}
      <Line active={overIdx === tasks.length} />
      <div className="h-4"
        onDragOver={e => handleDragOver(e, null, tasks.length)}
        onDrop={handleDrop}
      />
    </div>
  )
}

// ── Line indicator ────────────────────────────────────────────────────────────

function Line({ active }: { active: boolean }) {
  return <div className={cn('mx-4 h-0.5 rounded-full transition-all', active ? 'bg-brand-400' : 'opacity-0')} />
}

// ── Task Row ──────────────────────────────────────────────────────────────────

function TaskRow({ task, showUser, showPriorityPill, isDone, isSelected,
  draggingId, onRowDragOver, onRowDrop, onDragStart, onDragEnd,
  onToggle, onDelete, onSelect, onQuoteClick,
}: {
  task: Task; showUser?: boolean; showPriorityPill?: boolean; isDone?: boolean; isSelected?: boolean
  draggingId?: React.MutableRefObject<string | null>
  onRowDragOver?: (e: React.DragEvent) => void
  onRowDrop?: (e: React.DragEvent) => void
  onDragStart?: () => void; onDragEnd?: () => void
  onToggle: () => void; onDelete: () => void; onSelect: () => void; onQuoteClick?: (quoteId: string) => void
}) {
  const done    = task.status === 'done'
  const due     = task.due_date ? parseLocalDate(task.due_date) : null
  const overdue = due && isPast(due) && !isToday(due) && !done
  const dueLabel = due
    ? (isToday(due) ? 'Hoje' : isTomorrow(due) ? 'Amanhã' : format(due, 'dd/MM', { locale: ptBR }))
    : null

  const canDrag = useRef(false)

  const allItems = [
    ...(task.subtasks ?? []),
    ...(task.checklist ?? []).map(c => ({ done: c.done })),
  ]
  const subtaskDone = (task.subtasks?.filter(s => s.done || s.completed).length ?? 0) +
                      (task.checklist?.filter(c => c.done).length ?? 0)

  return (
    <div
      draggable={!!draggingId}
      onDragStart={e => {
        if (!canDrag.current) { e.preventDefault(); return }
        e.dataTransfer.effectAllowed = 'move'
        onDragStart?.()
      }}
      onDragEnd={() => { canDrag.current = false; onDragEnd?.() }}
      onDragOver={onRowDragOver}
      onDrop={onRowDrop}
      onClick={onSelect}
      className={cn(
        'group flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 last:border-0 cursor-pointer transition-colors select-none',
        isSelected ? 'bg-brand-50' : 'hover:bg-gray-50/80',
        done && 'opacity-50'
      )}
    >
      {/* Drag handle — único ponto que inicia o drag */}
      {draggingId && (
        <div
          onMouseDown={() => { canDrag.current = true }}
          onMouseUp={() => { canDrag.current = false }}
          onClick={e => e.stopPropagation()}
          className="w-5 flex items-center justify-center text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0"
        >
          <GripVertical className="w-3.5 h-3.5" />
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

      {/* Title + sub-info */}
      <div className="flex-1 min-w-0">
        <span className={cn('text-sm text-gray-800 truncate block', done && 'line-through text-gray-400')}>
          {task.title}
        </span>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {!done && (
            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-md', STATUS_CFG[task.status].cls)}>
              {STATUS_CFG[task.status].label}
            </span>
          )}
          {task.quote && (
            <button onClick={(e) => { e.stopPropagation(); onQuoteClick?.(task.quote_id!) }}
              className="text-[10px] text-brand-500 flex items-center gap-0.5 font-medium hover:text-brand-700 transition-colors cursor-pointer">
              <Link2 className="w-2.5 h-2.5" />#{task.quote.number} · {task.quote.client_name}
            </button>
          )}
          {allItems.length > 0 && (
            <span className="text-[10px] text-gray-400">
              {subtaskDone}/{allItems.length} subtarefas
            </span>
          )}
        </div>
      </div>

      {/* Right meta */}
      <div className="flex items-center gap-2 shrink-0">
        {showPriorityPill && (
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', P[task.priority].pill)}>
            {P[task.priority].label}
          </span>
        )}
        <span className={cn(
          'text-[11px] font-medium w-12 text-right',
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
  const [subtasks, setSubtasks] = useState<{ id: string; title: string; done: boolean }[]>(
    (task.subtasks ?? []).map(s => ({ id: s.id ?? '', title: s.title ?? s.text ?? '', done: s.done || !!s.completed }))
  )
  const [newSubtask, setNewSubtask] = useState('')
  const [quotes, setQuotes] = useState<{ id: string; number: number; client_name: string }[]>([])
  const [searchQuote, setSearchQuote] = useState('')
  const [showQuoteSearch, setShowQuoteSearch] = useState(false)
  const done = task.status === 'done'

  const filteredQuotes = quotes.filter(q =>
    !searchQuote ||
    String(q.number).includes(searchQuote) ||
    q.client_name?.toLowerCase().includes(searchQuote.toLowerCase())
  )

  useEffect(() => {
    getQuotesList().then(q => setQuotes(q as any[]))
  }, [])

  const allItems = [
    ...subtasks,
    ...(task.checklist ?? []).map(c => ({ text: c.text, done: c.done })),
  ]

  const [showQuoteModal, setShowQuoteModal] = useState(false)

  return (
    <>
      <div className="w-72 shrink-0 flex flex-col bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
      <div className={cn('flex items-center gap-2 px-4 py-3 border-b border-gray-100',
        task.priority === 'high' ? 'bg-red-50' : task.priority === 'mid' ? 'bg-amber-50' : 'bg-gray-50')}>
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

        {task.quote ? (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowQuoteModal(true)}
              className="flex-1 flex items-center gap-2 bg-brand-50 border border-brand-100 rounded-xl px-3 py-2 hover:bg-brand-100 transition-colors cursor-pointer">
              <Link2 className="w-3.5 h-3.5 text-brand-500 shrink-0" />
              <span className="flex-1 text-xs font-medium text-brand-700 truncate">#{task.quote.number} · {task.quote.client_name}</span>
            </button>
            <button onClick={() => onChange({ quote_id: null })}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Desatrelar orçamento">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={searchQuote}
                onChange={e => {
                  setSearchQuote(e.target.value)
                  setShowQuoteSearch(true)
                }}
                onFocus={() => setShowQuoteSearch(true)}
                onBlur={() => setTimeout(() => setShowQuoteSearch(false), 200)}
                placeholder="Buscar por número ou cliente..."
                className="w-full text-xs px-3 py-2 pl-9 border border-gray-200 rounded-xl outline-none focus:ring-1 focus:ring-brand-300 placeholder-gray-400"
              />
              {searchQuote && (
                <button
                  onClick={() => setSearchQuote('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {showQuoteSearch && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-64 overflow-y-auto">
                <div
                  onClick={() => {
                    onChange({ quote_id: null })
                    setSearchQuote('')
                    setShowQuoteSearch(false)
                  }}
                  className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-200 cursor-pointer hover:bg-gray-50">
                  — Nenhum orçamento —
                </div>
                {filteredQuotes.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-400">Nenhum resultado</div>
                ) : (
                  filteredQuotes.slice(0, 50).map(q => (
                    <div
                      key={q.id}
                      onClick={() => {
                        onChange({ quote_id: q.id })
                        setSearchQuote('')
                        setShowQuoteSearch(false)
                      }}
                      className="px-3 py-2 text-sm hover:bg-brand-50 cursor-pointer flex items-center gap-2 border-b border-gray-100 last:border-b-0">
                      <span className="text-xs font-semibold text-brand-600 shrink-0">#{q.number}</span>
                      <span className="text-gray-700 truncate">{q.client_name}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

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
                    task.priority === p
                      ? `${P[p].dot} text-white border-transparent`
                      : 'border-gray-200 text-gray-500 hover:border-gray-300')}>
                  {P[p].label}
                </button>
              ))}
            </div>
          </Row2>
          <Row2 label="Prazo">
            <input
              type="date"
              value={task.due_date ?? ''}
              onChange={e => onChange({ due_date: e.target.value || null })}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700"
            />
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

        {/* Subtarefas / checklist */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Subtarefas</span>
            {allItems.length > 0 && <span className="text-[11px] text-gray-400">{allItems.filter(i => i.done).length}/{allItems.length}</span>}
          </div>
          {allItems.length > 0 && (
            <div className="h-1.5 bg-gray-100 rounded-full">
              <div className="h-full bg-emerald-400 rounded-full transition-all"
                style={{ width: `${(allItems.filter(i => i.done).length / allItems.length) * 100}%` }} />
            </div>
          )}
          <div className="space-y-1 pt-1">
            {subtasks.map((item, i) => (
              <div key={item.id || i} className="flex items-start gap-2 py-0.5 group">
                <button onClick={() => {
                  const updated = [...subtasks]
                  updated[i].done = !updated[i].done
                  setSubtasks(updated)
                  onChange({ subtasks: updated })
                }}
                  className={cn('mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-all',
                    item.done ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 bg-white hover:border-gray-400')}>
                  {item.done && <span className="text-white text-[8px] font-bold">✓</span>}
                </button>
                <span className={cn('text-sm text-gray-700 leading-snug flex-1', item.done && 'line-through text-gray-400')}>
                  {item.title}
                </span>
                <button onClick={() => {
                  const updated = subtasks.filter((_, idx) => idx !== i)
                  setSubtasks(updated)
                  onChange({ subtasks: updated })
                }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-300 hover:text-red-500 transition-all">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 pt-2">
            <input value={newSubtask} onChange={e => setNewSubtask(e.target.value)} onKeyDown={e => {
              if (e.key === 'Enter' && newSubtask.trim()) {
                const updated = [...subtasks, { id: Date.now().toString(), title: newSubtask.trim(), done: false }]
                setSubtasks(updated)
                onChange({ subtasks: updated })
                setNewSubtask('')
              }
            }}
              placeholder="Adicionar subtarefa..."
              className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-brand-300" />
            <button onClick={() => {
              if (newSubtask.trim()) {
                const updated = [...subtasks, { id: Date.now().toString(), title: newSubtask.trim(), done: false }]
                setSubtasks(updated)
                onChange({ subtasks: updated })
                setNewSubtask('')
              }
            }}
              className="px-2 py-1 text-xs font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition-colors">
              +
            </button>
          </div>
        </div>

        <div>
          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Notas</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)}
            onBlur={() => onChange({ description: desc })}
            placeholder="Adicionar notas..." rows={4}
            className="w-full mt-1.5 text-sm text-gray-700 resize-none border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-brand-200 placeholder-gray-300 leading-relaxed" />
        </div>

        <p className="text-[11px] text-gray-300 border-t border-gray-100 pt-3">
          Criada em {format(new Date(task.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
        </p>
      </div>
    </div>

    {task.quote_id && showQuoteModal && (
      <QuoteQuickViewModal quoteId={task.quote_id} onClose={() => setShowQuoteModal(false)} />
    )}
    </>
  )
}


function WeekView({ tasks, showUser, onToggle, onDelete, onSelect, selectedId }: {
  tasks: Task[]
  showUser: boolean
  onToggle: (t: Task) => void
  onDelete: (id: string) => void
  onSelect: (t: Task) => void
  selectedId?: string
}) {
  const today = new Date()
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const [moveTaskId, setMoveTaskId] = useState<string | null>(null)

  const tasksByDay = days.reduce((acc, day) => {
    acc[day.toISOString().split('T')[0]] = tasks.filter(t => {
      if (!t.due_date) return false
      return isSameDay(parseLocalDate(t.due_date), day)
    }).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    return acc
  }, {} as Record<string, Task[]>)

  const backlogTasks = tasks.filter(t => !t.due_date).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  return (
    <div className="pb-6">
      {backlogTasks.length > 0 && (
        <div className="mb-6 bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Backlog ({backlogTasks.length})</h3>
          <div className="space-y-2">
            {backlogTasks.map(task => (
              <div key={task.id} className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 group">
                <button
                  onClick={() => onToggle(task)}
                  className={cn('w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center',
                    task.status === 'done' ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300')}
                >
                  {task.status === 'done' && <Check className="w-2.5 h-2.5 text-white" />}
                </button>
                <span className={cn('text-sm flex-1 truncate', task.status === 'done' && 'line-through text-gray-400')}>
                  {task.title}
                </span>
                <button
                  onClick={() => setMoveTaskId(task.id)}
                  className="text-xs px-2 py-1 text-gray-600 hover:bg-blue-50 hover:text-brand-600 rounded opacity-0 group-hover:opacity-100">
                  Agendar
                </button>
                <button
                  onClick={() => onDelete(task.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-7 gap-2">
        {days.map(day => {
          const dateStr = day.toISOString().split('T')[0]
          const dayTasks = tasksByDay[dateStr] || []
          const isToday_ = isSameDay(day, today)

          return (
            <div key={dateStr} className={cn('rounded-lg border p-3 min-h-80 flex flex-col',
              isToday_ ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200')}>
              <div className="mb-3 pb-2 border-b border-gray-200">
                <div className={cn('text-xs font-semibold uppercase', isToday_ ? 'text-brand-600' : 'text-gray-500')}>
                  {format(day, 'EEE', { locale: ptBR })}
                </div>
                <div className={cn('text-lg font-bold', isToday_ ? 'text-brand-700' : 'text-gray-900')}>
                  {format(day, 'dd')}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1">
                {dayTasks.length === 0 ? (
                  <div className="text-xs text-gray-300 text-center py-8">—</div>
                ) : (
                  dayTasks.map(task => (
                    <div key={task.id} onClick={() => onSelect(task)}
                      className={cn('p-2 rounded text-xs cursor-pointer group border',
                        task.status === 'done' ? 'bg-emerald-50 border-emerald-200' :
                        task.priority === 'high' ? 'bg-red-50 border-red-200' :
                        task.priority === 'mid' ? 'bg-amber-50 border-amber-200' :
                        'bg-gray-50 border-gray-200')}>
                      <div className={cn('font-medium truncate', task.status === 'done' && 'line-through text-gray-400')}>
                        {task.title}
                      </div>
                      {task.quote && <div className="text-[10px] text-brand-600 mt-0.5">#{task.quote.number}</div>}
                      <button
                        onClick={e => { e.stopPropagation(); setMoveTaskId(task.id) }}
                        className="text-[10px] mt-1 px-1.5 py-0.5 bg-white border rounded opacity-0 group-hover:opacity-100">
                        Mover
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      {moveTaskId && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 w-96 shadow-lg max-h-96 overflow-y-auto">
            <h3 className="font-semibold text-gray-900 mb-3">Mover para:</h3>
            <button
              onClick={() => { updateTask(moveTaskId, { due_date: null }).catch(() => {}); setMoveTaskId(null) }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded mb-2 border border-gray-200">
              📋 Backlog
            </button>
            {days.map(day => (
              <button key={day.toISOString()}
                onClick={() => { updateTask(moveTaskId, { due_date: day.toISOString().split('T')[0] }).catch(() => {}); setMoveTaskId(null) }}
                className={cn('w-full text-left px-3 py-2 text-sm rounded border mb-1',
                  isSameDay(day, today) ? 'border-brand-300 bg-brand-50 hover:bg-brand-100' : 'border-gray-200 hover:bg-gray-50')}>
                <div className="font-medium">{format(day, 'EEEE', { locale: ptBR })}</div>
                <div className="text-xs text-gray-500">{format(day, 'dd/MM')}</div>
              </button>
            ))}
            <button onClick={() => setMoveTaskId(null)}
              className="w-full mt-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded">
              Cancelar
            </button>
          </div>
        </div>
      )}
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
