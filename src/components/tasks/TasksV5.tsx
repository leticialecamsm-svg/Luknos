'use client'

/**
 * Tasks V5 — "Tarefas do dia" + "Depois"
 *
 * Persistência real: sort_order e pinned_to_today são salvos no banco.
 * Drag & drop nativo HTML5 — sem biblioteca externa.
 *
 * SQL necessário antes de usar:
 *   ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
 *   ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pinned_to_today BOOLEAN DEFAULT FALSE;
 */

import { useState, useMemo, useRef, useTransition } from 'react'
import {
  updateTaskStatus, deleteTask, createTask,
  updateTask, updateTasksOrder, pinTaskToToday,
} from '@/lib/actions'
import { useToast } from '@/components/ui/Toast'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import { Plus, X, Search, ChevronDown, Calendar, Link2, Trash2, Users } from 'lucide-react'
import { format, isToday, isPast, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Config ────────────────────────────────────────────────────────────────────

const P = {
  high: { label: 'Alta',  dot: 'bg-red-500',   text: 'text-red-600',   bg: 'bg-red-50',   border: 'border-red-200',   pill: 'bg-red-100 text-red-600' },
  mid:  { label: 'Média', dot: 'bg-amber-400', text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', pill: 'bg-amber-100 text-amber-600' },
  low:  { label: 'Baixa', dot: 'bg-gray-300',  text: 'text-gray-500',  bg: 'bg-gray-50',  border: 'border-gray-200',  pill: 'bg-gray-100 text-gray-500' },
}

const TODAY = new Date().toISOString().split('T')[0]
const TOMORROW = new Date(Date.now() + 86400000).toISOString().split('T')[0]

// ── Helpers ───────────────────────────────────────────────────────────────────

function isInToday(t: Task): boolean {
  if (t.pinned_to_today) return true
  if (!t.due_date) return false
  const d = parseISO(t.due_date)
  return isToday(d) || isPast(d)
}

function sorted(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function TasksV5({ myTasks, allTasks, allUsers, currentUser, isAdmin }: {
  myTasks: Task[]; allTasks: Task[]; allUsers: User[]
  currentUser: User; isAdmin: boolean
}) {
  const toast = useToast()
  const [, startTx] = useTransition()
  const [scope, setScope]  = useState<'mine' | 'team'>('mine')
  const [search, setSearch] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState<Priority>('mid')
  const [doneOpen, setDoneOpen] = useState(false)

  const source = scope === 'mine' ? myTasks : allTasks
  const [tasks, setTasks] = useState<Task[]>(source)

  function reload() {
    startTx(async () => {
      const { getTasks, getAllTasks } = await import('@/lib/actions')
      const data = await (scope === 'mine' ? getTasks() : getAllTasks())
      setTasks(data as Task[])
    })
  }

  // ── Filter ────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let t = scope === 'mine' ? myTasks : allTasks
    if (search) t = t.filter(x => x.title.toLowerCase().includes(search.toLowerCase()))
    return t
  }, [myTasks, allTasks, scope, search])

  const active = filtered.filter(t => t.status !== 'done')
  const done   = filtered.filter(t => t.status === 'done')

  // Seção Hoje: tarefas de hoje + atrasadas + pinned
  const todayTasks   = sorted(active.filter(isInToday))
  // Seção Depois: amanhã em diante + sem prazo (e não pinned)
  const laterTasks   = sorted(active.filter(t => !isInToday(t)))

  // ── Quick add ────────────────────────────────────────────────────────────

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    setNewTitle('')
    const tmp: Task = {
      id: '__tmp__' + Date.now(), title, status: 'todo', priority: newPriority,
      created_at: new Date().toISOString(), due_date: TODAY, sort_order: -1,
    }
    setTasks(prev => [tmp, ...prev])
    const res = await createTask({ title, priority: newPriority, status: 'todo', due_date: TODAY })
    if (res?.error) { toast.error('Erro', res.error); setTasks(prev => prev.filter(t => t.id !== tmp.id)); return }
    reload()
  }

  // ── Toggle done ──────────────────────────────────────────────────────────

  async function toggleDone(task: Task) {
    const next: Status = task.status === 'done' ? 'todo' : 'done'
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t))
    await updateTaskStatus(task.id, next)
  }

  async function removeTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
    await deleteTask(id)
  }

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  // Quando termina um drag, temos três tipos de mudança que persistem no banco:
  //   1. Mudança de seção (hoje ↔ depois)  → atualiza due_date + pinned_to_today
  //   2. Mudança de prioridade              → atualiza priority
  //   3. Mudança de posição                 → atualiza sort_order de todos afetados

  const draggingId = useRef<string | null>(null)

  async function applyDrop(taskId: string, toSection: 'today' | 'later', toPriority: Priority | null, insertBeforeId: string | null) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    const updates: Partial<Task> = {}
    let newPinned = task.pinned_to_today ?? false

    // Seção mudou?
    const wasToday = isInToday(task)
    if (toSection === 'today' && !wasToday) {
      updates.due_date = TODAY
      newPinned = true
      updates.pinned_to_today = true
    } else if (toSection === 'later' && wasToday) {
      // Remove pin, não altera due_date para não perder a data original
      newPinned = false
      updates.pinned_to_today = false
      // Se a data era hoje ou no passado, move para amanhã
      if (!task.due_date || isToday(parseISO(task.due_date)) || isPast(parseISO(task.due_date))) {
        updates.due_date = TOMORROW
      }
    }

    // Prioridade mudou?
    if (toPriority && toPriority !== task.priority) {
      updates.priority = toPriority
    }

    // Calcula nova ordem
    const listAfterMove = (() => {
      // Lista alvo após remover o item arrastado
      const srcList = toSection === 'today' ? todayTasks : laterTasks
      const without = srcList.filter(t => t.id !== taskId)
      const targetPriorityTasks = toPriority
        ? without.filter(t => (updates.priority ?? task.priority) === toPriority ? true : t.priority === toPriority)
        : without

      if (!insertBeforeId) return [...without, { ...task, ...updates }]
      const idx = without.findIndex(t => t.id === insertBeforeId)
      const inserted = [...without]
      inserted.splice(idx === -1 ? inserted.length : idx, 0, { ...task, ...updates })
      return inserted
    })()

    const orderUpdates = listAfterMove.map((t, i) => ({ id: t.id, sort_order: i * 10 }))

    // Optimistic state update
    setTasks(prev => {
      const next = prev.map(t => {
        if (t.id === taskId) return { ...t, ...updates, sort_order: orderUpdates.find(u => u.id === taskId)?.sort_order ?? t.sort_order }
        const ou = orderUpdates.find(u => u.id === t.id)
        return ou ? { ...t, sort_order: ou.sort_order } : t
      })
      return next
    })

    // Persist to DB
    const dbOps: Promise<any>[] = [updateTasksOrder(orderUpdates)]
    if (Object.keys(updates).length > 0) {
      dbOps.push(updateTask(taskId, updates as any))
    }
    await Promise.all(dbOps)
  }

  const todayByPriority: Record<Priority, Task[]> = {
    high: todayTasks.filter(t => t.priority === 'high'),
    mid:  todayTasks.filter(t => t.priority === 'mid'),
    low:  todayTasks.filter(t => t.priority === 'low'),
  }

  const todayCount  = todayTasks.length
  const laterCount  = laterTasks.length
  const doneCount   = done.length

  return (
    <div className="flex flex-col h-full min-h-0 gap-4 max-w-2xl mx-auto w-full">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tarefas</h1>
          <p className="text-sm text-gray-400">
            {todayCount > 0
              ? <><span className="text-orange-600 font-semibold">{todayCount}</span> para hoje · <span className="text-gray-600">{laterCount}</span> depois</>
              : laterCount > 0
                ? <><span className="text-emerald-600 font-medium">✓ Dia em dia!</span> · {laterCount} depois</>
                : <span className="text-emerald-600 font-medium">✓ Tudo em dia!</span>
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
        <input
          value={newTitle} onChange={e => setNewTitle(e.target.value)}
          placeholder="Adicionar tarefa de hoje... (Enter para salvar)"
          className="flex-1 text-sm text-gray-800 bg-transparent outline-none placeholder-gray-400"
        />
        <div className="flex items-center gap-1.5 shrink-0">
          {(['high', 'mid', 'low'] as Priority[]).map(p => (
            <button key={p} type="button" onClick={() => setNewPriority(p)}
              title={P[p].label}
              className={cn('w-4 h-4 rounded-full border-2 transition-all',
                newPriority === p ? `${P[p].dot} border-transparent scale-125` : 'border-gray-300 bg-white hover:border-gray-500'
              )} />
          ))}
        </div>
        {newTitle && (
          <button type="submit"
            className="shrink-0 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 px-3 py-1.5 rounded-lg transition-colors">
            Salvar
          </button>
        )}
      </form>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar tarefa..."
          className="input pl-9 h-9 text-sm w-full max-w-xs" />
        {search && <button onClick={() => setSearch('')} className="absolute left-[17rem] top-1/2 -translate-y-1/2 text-gray-400"><X className="w-3 h-3" /></button>}
      </div>

      {/* Lists */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-6">

        {/* ── TAREFAS DO DIA ── */}
        <Section
          title="Tarefas do dia"
          count={todayCount}
          accent="text-orange-600"
          emptyText="Nenhuma tarefa para hoje 🎉"
          defaultOpen
        >
          {(['high', 'mid', 'low'] as Priority[]).map(p => (
            <PriorityGroup
              key={p}
              priority={p}
              tasks={todayByPriority[p]}
              showUser={scope === 'team'}
              draggingId={draggingId}
              onDrop={(taskId, insertBeforeId) => applyDrop(taskId, 'today', p, insertBeforeId)}
              onToggle={toggleDone}
              onDelete={removeTask}
            />
          ))}
        </Section>

        {/* ── DEPOIS ── */}
        <Section
          title="Depois"
          count={laterCount}
          accent="text-gray-500"
          emptyText="Sem tarefas programadas"
          defaultOpen
        >
          <DropList
            tasks={laterTasks}
            section="later"
            showUser={scope === 'team'}
            draggingId={draggingId}
            onDrop={(taskId, insertBeforeId) => applyDrop(taskId, 'later', null, insertBeforeId)}
            onToggle={toggleDone}
            onDelete={removeTask}
          />
        </Section>

        {/* ── CONCLUÍDAS ── */}
        {doneCount > 0 && (
          <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
            <button onClick={() => setDoneOpen(o => !o)}
              className="w-full flex items-center gap-2 px-4 py-3 text-left bg-gray-50 hover:bg-gray-100 transition-colors">
              <span className="text-xs font-bold text-emerald-600">✓ Concluídas</span>
              <span className="text-xs text-gray-400 font-medium">{doneCount}</span>
              <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 ml-auto transition-transform', !doneOpen && '-rotate-90')} />
            </button>
            {doneOpen && (
              <div className="divide-y divide-gray-100">
                {done.map(task => (
                  <TaskRow key={task.id} task={task} showUser={scope === 'team'}
                    onToggle={() => toggleDone(task)} onDelete={() => removeTask(task.id)}
                    draggable={false}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, count, accent, emptyText, defaultOpen, children }: {
  title: string; count: number; accent: string; emptyText: string
  defaultOpen?: boolean; children: React.ReactNode
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
      {open && (
        count === 0
          ? <p className="px-4 py-5 text-sm text-gray-400 text-center">{emptyText}</p>
          : <>{children}</>
      )}
    </div>
  )
}

// ── Priority group (dentro de "Tarefas do dia") ───────────────────────────────

function PriorityGroup({ priority, tasks, showUser, draggingId, onDrop, onToggle, onDelete }: {
  priority: Priority; tasks: Task[]; showUser: boolean
  draggingId: React.MutableRefObject<string | null>
  onDrop: (taskId: string, insertBeforeId: string | null) => void
  onToggle: (t: Task) => void; onDelete: (id: string) => void
}) {
  const cfg = P[priority]
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  if (tasks.length === 0 && priority === 'low') {
    // Não renderiza grupo vazio de baixa prioridade (menos ruído)
    return (
      <DropZone
        onDragOver={() => setDragOverIndex(0)}
        onDragLeave={() => setDragOverIndex(null)}
        onDrop={() => { onDrop(draggingId.current!, null); setDragOverIndex(null) }}
        active={dragOverIndex !== null}
        className="h-2"
      />
    )
  }

  return (
    <div className={cn('border-l-2', {
      'border-l-red-400': priority === 'high',
      'border-l-amber-400': priority === 'mid',
      'border-l-gray-200': priority === 'low',
    })}>
      {/* Sub-header */}
      <div className={cn('flex items-center gap-2 px-4 py-2', cfg.bg)}>
        <span className={cn('w-2 h-2 rounded-full', cfg.dot)} />
        <span className={cn('text-[11px] font-bold uppercase tracking-wide', cfg.text)}>{cfg.label}</span>
        <span className="text-[11px] text-gray-400">{tasks.length}</span>
      </div>

      {/* Tasks */}
      <div>
        {tasks.map((task, idx) => (
          <div key={task.id}>
            {/* Drop indicator above */}
            <DropIndicator active={dragOverIndex === idx} />
            <TaskRow
              task={task}
              showUser={showUser}
              draggable
              onDragStart={() => { draggingId.current = task.id }}
              onDragEnd={() => { draggingId.current = null; setDragOverIndex(null) }}
              onDragEnterRow={() => setDragOverIndex(idx)}
              onToggle={() => onToggle(task)}
              onDelete={() => onDelete(task.id)}
            />
          </div>
        ))}
        {/* Drop indicator at end */}
        <DropIndicator active={dragOverIndex === tasks.length} />
      </div>

      {/* Drop zone for entire group (when empty or at bottom) */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOverIndex(tasks.length) }}
        onDragLeave={() => setDragOverIndex(null)}
        onDrop={e => { e.preventDefault(); onDrop(draggingId.current!, null); setDragOverIndex(null) }}
        className="h-2"
      />
    </div>
  )
}

// ── Drop list (para seção "Depois") ──────────────────────────────────────────

function DropList({ tasks, section, showUser, draggingId, onDrop, onToggle, onDelete }: {
  tasks: Task[]; section: string; showUser: boolean
  draggingId: React.MutableRefObject<string | null>
  onDrop: (taskId: string, insertBeforeId: string | null) => void
  onToggle: (t: Task) => void; onDelete: (id: string) => void
}) {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  return (
    <div
      onDragOver={e => { e.preventDefault(); if (dragOverIndex === null) setDragOverIndex(tasks.length) }}
      onDragLeave={() => setDragOverIndex(null)}
      onDrop={e => { e.preventDefault(); onDrop(draggingId.current!, null); setDragOverIndex(null) }}
      className="min-h-[2rem]"
    >
      {tasks.map((task, idx) => (
        <div key={task.id}>
          <DropIndicator active={dragOverIndex === idx} />
          <TaskRow
            task={task}
            showUser={showUser}
            draggable
            showPriorityPill
            onDragStart={() => { draggingId.current = task.id }}
            onDragEnd={() => { draggingId.current = null; setDragOverIndex(null) }}
            onDragEnterRow={() => setDragOverIndex(idx)}
            onToggle={() => onToggle(task)}
            onDelete={() => onDelete(task.id)}
          />
        </div>
      ))}
      <DropIndicator active={dragOverIndex === tasks.length} />
    </div>
  )
}

// ── Drop indicator line ───────────────────────────────────────────────────────

function DropIndicator({ active }: { active: boolean }) {
  return (
    <div className={cn('mx-4 h-0.5 rounded-full transition-all duration-100',
      active ? 'bg-brand-400 opacity-100' : 'opacity-0')} />
  )
}

function DropZone({ onDragOver, onDragLeave, onDrop, active, className }: {
  onDragOver: () => void; onDragLeave: () => void; onDrop: () => void
  active: boolean; className?: string
}) {
  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver() }}
      onDragLeave={onDragLeave}
      onDrop={e => { e.preventDefault(); onDrop() }}
      className={cn(active && 'bg-brand-50', className)}
    />
  )
}

// ── Task Row ──────────────────────────────────────────────────────────────────

function TaskRow({ task, showUser, draggable: isDraggable, showPriorityPill, onDragStart, onDragEnd, onDragEnterRow, onToggle, onDelete }: {
  task: Task; showUser: boolean
  draggable: boolean; showPriorityPill?: boolean
  onDragStart?: () => void; onDragEnd?: () => void; onDragEnterRow?: () => void
  onToggle: () => void; onDelete: () => void
}) {
  const done = task.status === 'done'
  const due  = task.due_date ? parseISO(task.due_date) : null
  const overdue = due && isPast(due) && !isToday(due!) && !done

  return (
    <div
      draggable={isDraggable}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.() }}
      onDragEnd={onDragEnd}
      onDragEnter={e => { e.preventDefault(); onDragEnterRow?.() }}
      onDragOver={e => e.preventDefault()}
      className={cn(
        'group flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0',
        isDraggable && 'cursor-grab active:cursor-grabbing',
        done && 'opacity-50',
        'hover:bg-gray-50/60 transition-colors'
      )}
    >
      {/* Drag handle — só aparece no hover, espaço fixo */}
      <div className="w-3 shrink-0 flex items-center justify-center">
        {isDraggable && (
          <svg className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 20 20">
            <circle cx="7" cy="6" r="1.2" /><circle cx="13" cy="6" r="1.2" />
            <circle cx="7" cy="10" r="1.2" /><circle cx="13" cy="10" r="1.2" />
            <circle cx="7" cy="14" r="1.2" /><circle cx="13" cy="14" r="1.2" />
          </svg>
        )}
      </div>

      {/* Checkbox */}
      <button
        onClick={onToggle}
        className={cn(
          'w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all hover:scale-110',
          done ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-emerald-400 bg-white'
        )}
      >
        {done && <span className="text-white text-[9px] font-bold leading-none">✓</span>}
      </button>

      {/* Title */}
      <span className={cn('flex-1 text-sm text-gray-800 min-w-0', done && 'line-through text-gray-400')}>
        {task.title}
      </span>

      {/* Meta — largura fixa, sem layout shift */}
      <div className="flex items-center gap-2.5 shrink-0">

        {/* Priority pill (só na seção "Depois") */}
        {showPriorityPill && (
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', P[task.priority].pill)}>
            {P[task.priority].label}
          </span>
        )}

        {/* Quote */}
        {task.quote && (
          <span className="text-[11px] text-brand-400 hidden sm:flex items-center gap-1">
            <Link2 className="w-3 h-3" />#{task.quote.number}
          </span>
        )}

        {/* Due date */}
        <span className={cn(
          'text-[11px] font-medium w-14 text-right',
          !task.due_date && 'opacity-0',
          overdue ? 'text-red-500' : isToday(due!) ? 'text-orange-500' : 'text-gray-400'
        )}>
          {task.due_date ? (isToday(parseISO(task.due_date)) ? 'Hoje' : format(parseISO(task.due_date), 'dd/MM', { locale: ptBR })) : '—'}
        </span>

        {/* Assignee */}
        {showUser && (
          <div className="w-6 flex justify-center">
            {task.users ? <Avatar user={task.users} size={22} /> : null}
          </div>
        )}

        {/* Delete — espaço sempre reservado, só opacity muda */}
        <button
          onClick={onDelete}
          className="w-6 h-6 flex items-center justify-center rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
