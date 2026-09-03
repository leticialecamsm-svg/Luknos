'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import {
  updateTaskStatus, deleteTask, createTask,
  updateTask, updateTasksOrder, getQuotesList,
  createSubtask, updateSubtask, deleteSubtask,
  getMyDoneTasksWeek, getTeamDoneTasksWeek,
} from '@/lib/actions'
import { useToast } from '@/components/ui/Toast'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import { Plus, X, Search, ChevronDown, ChevronLeft, ChevronRight, Link2, Trash2, Users, GripVertical, StickyNote, Loader2 } from 'lucide-react'
import { format, isToday, isPast, isTomorrow } from 'date-fns'
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

// Segunda da semana corrente + weekOffset semanas, só pra exibir o rótulo
// (o cálculo de verdade, com fuso de Brasília, é feito no servidor).
function weekLabel(weekOffset: number): string {
  if (weekOffset === 0) return 'Esta semana'
  if (weekOffset === -1) return 'Semana passada'
  const now = new Date()
  const day = (now.getDay() + 6) % 7 // 0 = segunda
  const monday = new Date(now); monday.setDate(now.getDate() - day + weekOffset * 7)
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
  const fmt = (d: Date) => format(d, 'dd/MM')
  return `${fmt(monday)} — ${fmt(sunday)}`
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function TasksV5({ myTasks, allTasks, allUsers, currentUser, isAdmin }: {
  myTasks: Task[]; allTasks: Task[]; allUsers: User[]
  currentUser: User; isAdmin: boolean
}) {
  const toast = useToast()
  const [scope, setScope]   = useState<'mine' | 'team'>('mine')
  const [memberFilter, setMemberFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState<Priority>('mid')
  const [doneOpen, setDoneOpen] = useState(false)
  const [showAllEarlier, setShowAllEarlier] = useState(false)
  const [selected, setSelected] = useState<Task | null>(null)
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null)

  // As concluídas só vêm da semana selecionada (weekOffset 0 = atual) — o
  // resto do histórico não é carregado de cara, pra nunca esbarrar de novo
  // no limite de 1000 linhas do Supabase. As ativas continuam sempre inteiras.
  const [weekOffset, setWeekOffset] = useState(0)
  const [completedLoading, setCompletedLoading] = useState(false)

  // Estado local de tarefas (optimistic) — separado em ativas e concluídas
  // porque agora vêm de fontes diferentes (ativas: sempre; concluídas: por semana).
  const [tasks, setTasks] = useState<Task[]>(() => myTasks.filter(t => t.status !== 'done'))
  const [completed, setCompleted] = useState<Task[]>(() => myTasks.filter(t => t.status === 'done'))

  useEffect(() => {
    const src = scope === 'mine' ? myTasks : allTasks
    setTasks(src.filter(t => t.status !== 'done'))
    setCompleted(src.filter(t => t.status === 'done'))
    setWeekOffset(0)
    if (scope === 'mine') setMemberFilter('all')
  }, [scope])

  async function loadCompletedWeek(offset: number) {
    if (offset === 0) {
      const src = scope === 'mine' ? myTasks : allTasks
      setCompleted(src.filter(t => t.status === 'done'))
      return
    }
    setCompletedLoading(true)
    try {
      const data = await (scope === 'mine' ? getMyDoneTasksWeek(offset) : getTeamDoneTasksWeek(offset))
      setCompleted(data as Task[])
    } catch {
      toast.error('Não foi possível carregar', 'Tente selecionar a semana de novo.')
    } finally {
      setCompletedLoading(false)
    }
  }

  function goWeek(delta: number) {
    const next = Math.min(0, weekOffset + delta) // não deixa navegar pro futuro
    if (next === weekOffset) return
    setWeekOffset(next)
    loadCompletedWeek(next)
  }

  const activeFiltered = useMemo(() => {
    let t = tasks
    if (search) t = t.filter(x => x.title.toLowerCase().includes(search.toLowerCase()))
    if (scope === 'team' && memberFilter !== 'all') t = t.filter(x => x.user_id === memberFilter)
    return t
  }, [tasks, search, scope, memberFilter])

  const doneFiltered = useMemo(() => {
    let t = completed
    if (search) t = t.filter(x => x.title.toLowerCase().includes(search.toLowerCase()))
    if (scope === 'team' && memberFilter !== 'all') t = t.filter(x => x.user_id === memberFilter)
    return t
  }, [completed, search, scope, memberFilter])

  const todayTasks = sortedBy(activeFiltered.filter(isInToday))
  const laterTasks = sortedBy(activeFiltered.filter(t => !isInToday(t)))

  const byCompletedDesc = (a: Task, b: Task) =>
    (b.completed_at ?? b.created_at).localeCompare(a.completed_at ?? a.created_at)
  const wasCompletedToday = (t: Task) => !!t.completed_at && isToday(new Date(t.completed_at))
  const done         = doneFiltered
  const doneToday    = done.filter(wasCompletedToday).sort(byCompletedDesc)
  const doneEarlier  = done.filter(t => !wasCompletedToday(t)).sort(byCompletedDesc)

  // Acha uma tarefa em qualquer uma das duas listas (ativa ou concluída) e
  // aplica uma mudança nela onde quer que esteja — usado por edições que não
  // mexem em status (título, prioridade, checklist etc).
  function findTask(id: string): Task | undefined {
    return tasks.find(t => t.id === id) ?? completed.find(t => t.id === id)
  }
  function mapTask(id: string, fn: (t: Task) => Task) {
    setTasks(prev => prev.map(t => t.id === id ? fn(t) : t))
    setCompleted(prev => prev.map(t => t.id === id ? fn(t) : t))
  }

  // ── Mutations (optimistic, DB em background) ──────────────────────────────

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    setNewTitle('')
    const tmp: Task = { id: '__tmp__' + Date.now(), title, status: 'todo', priority: newPriority, created_at: new Date().toISOString(), due_date: TODAY, sort_order: -1 }
    setTasks(prev => [tmp, ...prev])
    const res = await createTask({ title, priority: newPriority, status: 'todo', due_date: TODAY })
    if (res?.error) {
      toast.error('Erro', res.error)
      setTasks(prev => prev.filter(t => t.id !== tmp.id))
    } else if (res?.data?.id) {
      // Troca o id temporário pelo id real assim que o servidor confirma —
      // sem isso, uma ação rápida (marcar como feita, editar) na tarefa recém
      // criada tentaria salvar usando o id fake e falharia.
      setTasks(prev => prev.map(t => t.id === tmp.id ? { ...t, id: res.data.id } : t))
    }
  }

  async function toggleDone(task: Task) {
    const goingDone = task.status !== 'done'
    const prevStatus = task.status
    const prevCompletedAt = task.completed_at
    const nextCompletedAt = goingDone ? new Date().toISOString() : null
    const moved = { ...task, status: (goingDone ? 'done' : 'todo') as Status, completed_at: nextCompletedAt }

    // Move otimisticamente entre as duas listas. Uma tarefa marcada como
    // feita só aparece na lista de concluídas se a semana atual estiver
    // selecionada — senão ela some da tela (foi pra "hoje", que não é a
    // semana que está sendo visualizada), o que é o comportamento esperado.
    if (goingDone) {
      setTasks(prev => prev.filter(t => t.id !== task.id))
      if (weekOffset === 0) setCompleted(prev => [moved, ...prev])
    } else {
      setCompleted(prev => prev.filter(t => t.id !== task.id))
      setTasks(prev => [moved, ...prev])
    }
    if (selected?.id === task.id) setSelected(p => p ? { ...p, ...moved } : p)

    try {
      const res = await updateTaskStatus(task.id, moved.status)
      if (res?.error) throw new Error(res.error)
    } catch (e: any) {
      const reverted = { ...task, status: prevStatus, completed_at: prevCompletedAt }
      if (goingDone) {
        setCompleted(prev => prev.filter(t => t.id !== task.id))
        setTasks(prev => [reverted, ...prev])
      } else {
        setTasks(prev => prev.filter(t => t.id !== task.id))
        setCompleted(prev => [reverted, ...prev])
      }
      if (selected?.id === task.id) setSelected(p => p ? { ...p, ...reverted } : p)
      toast.error('Não foi possível salvar', 'Tente marcar a tarefa novamente.')
    }
  }

  async function removeTask(id: string) {
    const prevTask = findTask(id)
    const wasCompleted = prevTask?.status === 'done'
    setTasks(prev => prev.filter(t => t.id !== id))
    setCompleted(prev => prev.filter(t => t.id !== id))
    if (selected?.id === id) setSelected(null)
    try {
      const res = await deleteTask(id)
      if (res?.error) throw new Error(res.error)
    } catch (e: any) {
      if (prevTask) (wasCompleted ? setCompleted : setTasks)(prev => [...prev, prevTask])
      toast.error('Não foi possível excluir', 'Tente novamente.')
    }
  }

  async function changeTask(id: string, updates: Partial<Task>) {
    const prevTask = findTask(id)
    const prevSnapshot: Partial<Task> = prevTask
      ? Object.fromEntries(Object.keys(updates).map(k => [k, (prevTask as any)[k]]))
      : {}
    mapTask(id, t => ({ ...t, ...updates }))
    if (selected?.id === id) setSelected(p => p ? { ...p, ...updates } : p)
    // `quote` é só um campo de exibição local (join com quotes) — não existe
    // como coluna na tabela tasks, então não pode ir no payload do updateTask.
    const { quote, ...dbUpdates } = updates as any
    try {
      const res = await updateTask(id, dbUpdates)
      if (res?.error) throw new Error(res.error)
    } catch (e: any) {
      mapTask(id, t => ({ ...t, ...prevSnapshot }))
      if (selected?.id === id) setSelected(p => p ? { ...p, ...prevSnapshot } : p)
      toast.error('Não foi possível salvar', 'Tente novamente.')
    }
  }

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  const draggingId = useRef<string | null>(null)
  const dropTarget = useRef<{ section: 'today' | 'later'; priority: Priority | null; insertBeforeId: string | null }>({
    section: 'today', priority: null, insertBeforeId: null,
  })

  async function applyDrop() {
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

    // Snapshot pra poder desfazer tudo (posição + campos movidos) se a gravação falhar
    const prevOrder = orderUpdates.map(u => ({ id: u.id, sort_order: tasks.find(t => t.id === u.id)?.sort_order }))
    const prevTaskFields: Partial<Task> = Object.fromEntries(Object.keys(updates).map(k => [k, (task as any)[k]]))

    // Optimistic instantâneo
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) return { ...t, ...updates, sort_order: orderUpdates.find(u => u.id === taskId)?.sort_order ?? t.sort_order }
      const ou = orderUpdates.find(u => u.id === t.id)
      return ou ? { ...t, sort_order: ou.sort_order } : t
    }))
    if (selected?.id === taskId) setSelected(p => p ? { ...p, ...updates } : p)

    try {
      const results = await Promise.all([
        updateTasksOrder(orderUpdates),
        Object.keys(updates).length ? updateTask(taskId, updates as any) : Promise.resolve(null),
      ])
      const err = results.find((r: any) => r?.error)
      if (err) throw new Error((err as any).error)
    } catch (e: any) {
      setTasks(prev => prev.map(t => {
        const po = prevOrder.find(o => o.id === t.id)
        const base = po ? { ...t, sort_order: po.sort_order } : t
        return t.id === taskId ? { ...base, ...prevTaskFields } : base
      }))
      if (selected?.id === taskId) setSelected(p => p ? { ...p, ...prevTaskFields } : p)
      toast.error('Não foi possível salvar', 'A tarefa voltou pra posição anterior. Tente arrastar novamente.')
    }
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
            {isAdmin && scope === 'team' && (
              <select
                value={memberFilter}
                onChange={e => setMemberFilter(e.target.value)}
                className="bg-white border border-gray-200 rounded-xl px-3 text-sm font-medium text-gray-700 outline-none"
              >
                <option value="all">Todo mundo</option>
                {allUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            )}
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

          <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
              <button onClick={() => setDoneOpen(o => !o)} className="flex items-center gap-2 hover:opacity-70 transition-opacity">
                <span className="text-xs font-bold text-emerald-600">✓ Concluídas</span>
                <span className="text-xs text-gray-400">{done.length} {weekOffset === 0 ? 'nesta semana' : 'nessa semana'}{doneToday.length > 0 ? ` · ${doneToday.length} hoje` : ''}</span>
              </button>
              {weekOffset === 0 && <span className="text-[11px] text-gray-300 italic">não são apagadas, só ficam na semana em que foram concluídas</span>}
              <div className="flex items-center gap-1 ml-auto">
                <button onClick={() => goWeek(-1)} disabled={completedLoading}
                  className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-40"
                  title="Semana anterior">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-medium text-gray-600 w-28 text-center select-none">
                  {completedLoading ? 'Carregando...' : weekLabel(weekOffset)}
                </span>
                <button onClick={() => goWeek(1)} disabled={completedLoading || weekOffset === 0}
                  className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-40"
                  title="Próxima semana">
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <button onClick={() => setDoneOpen(o => !o)}>
                <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 transition-transform', !doneOpen && '-rotate-90')} />
              </button>
            </div>
            {doneOpen && (
              done.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-gray-400">
                  {completedLoading ? 'Carregando...' : 'Nenhuma tarefa concluída nessa semana.'}
                </p>
              ) : (
                <div>
                  {doneToday.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-[11px] font-bold text-gray-400 uppercase tracking-wide">Hoje</p>
                      <div className="divide-y divide-gray-100">
                        {doneToday.map(task => (
                          <TaskRow key={task.id} task={task} showUser={scope === 'team'} isDone
                            isSelected={selected?.id === task.id}
                            onToggle={() => toggleDone(task)}
                            onDelete={() => removeTask(task.id)}
                            onSelect={() => setSelected(s => s?.id === task.id ? null : task)}
                            onQuoteClick={setSelectedQuoteId}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {doneEarlier.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-[11px] font-bold text-gray-400 uppercase tracking-wide">Anteriores</p>
                      <div className="divide-y divide-gray-100">
                        {(showAllEarlier ? doneEarlier : doneEarlier.slice(0, 3)).map(task => (
                          <TaskRow key={task.id} task={task} showUser={scope === 'team'} isDone
                            isSelected={selected?.id === task.id}
                            onToggle={() => toggleDone(task)}
                            onDelete={() => removeTask(task.id)}
                            onSelect={() => setSelected(s => s?.id === task.id ? null : task)}
                            onQuoteClick={setSelectedQuoteId}
                          />
                        ))}
                      </div>
                      {doneEarlier.length > 3 && (
                        <button
                          onClick={() => setShowAllEarlier(v => !v)}
                          className="w-full text-center py-2 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 border-t border-gray-100 transition-colors"
                        >
                          {showAllEarlier ? 'Mostrar menos' : `Mostrar tudo (${doneEarlier.length})`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {selected && (
        <DetailPanel
          key={selected.id} task={selected}
          onClose={() => setSelected(null)}
          onToggle={() => toggleDone(selected)}
          onDelete={() => removeTask(selected.id)}
          onChange={updates => changeTask(selected.id, updates)}
          onSubtasksSync={subtasks => {
            setTasks(prev => prev.map(t => t.id === selected.id ? { ...t, subtasks } : t))
            setSelected(p => p ? { ...p, subtasks } : p)
          }}
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
  // Tarefa recém-criada, ainda esperando o servidor confirmar o id real —
  // qualquer ação nela (concluir, excluir, abrir) usaria um id falso e
  // falharia, então trava a interação até o id de verdade chegar.
  const isPending = task.id.startsWith('__tmp__')
  const done      = task.status === 'done'
  const due       = task.due_date ? parseLocalDate(task.due_date) : null
  const overdue   = due && isPast(due) && !isToday(due) && !done
  const completed = task.completed_at ? new Date(task.completed_at) : null
  const dueLabel  = done
    ? (completed ? (isToday(completed) ? 'Hoje' : format(completed, 'dd/MM', { locale: ptBR })) : null)
    : (due ? (isToday(due) ? 'Hoje' : isTomorrow(due) ? 'Amanhã' : format(due, 'dd/MM', { locale: ptBR })) : null)

  const canDrag = useRef(false)

  const allItems = [
    ...(task.subtasks ?? []),
    ...(task.checklist ?? []).map(c => ({ done: c.done })),
  ]
  const subtaskDone = (task.subtasks?.filter(s => s.done || s.completed).length ?? 0) +
                      (task.checklist?.filter(c => c.done).length ?? 0)

  return (
    <div
      draggable={!!draggingId && !isPending}
      onDragStart={e => {
        if (!canDrag.current || isPending) { e.preventDefault(); return }
        e.dataTransfer.effectAllowed = 'move'
        onDragStart?.()
      }}
      onDragEnd={() => { canDrag.current = false; onDragEnd?.() }}
      onDragOver={onRowDragOver}
      onDrop={onRowDrop}
      onClick={isPending ? undefined : onSelect}
      className={cn(
        'group flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 last:border-0 transition-colors select-none',
        isPending ? 'opacity-60 cursor-default' : 'cursor-pointer',
        isSelected ? 'bg-brand-50' : 'hover:bg-gray-50/80'
      )}
    >
      {/* Drag handle — único ponto que inicia o drag */}
      {draggingId && (
        <div
          onMouseDown={() => { if (!isPending) canDrag.current = true }}
          onMouseUp={() => { canDrag.current = false }}
          onClick={e => e.stopPropagation()}
          className={cn('w-5 flex items-center justify-center text-gray-300 shrink-0',
            isPending ? 'cursor-wait' : 'hover:text-gray-500 cursor-grab active:cursor-grabbing')}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>
      )}

      {/* Checkbox */}
      <button
        onClick={e => { e.stopPropagation(); if (!isPending) onToggle() }}
        disabled={isPending}
        title={isPending ? 'Aguarde a tarefa terminar de ser criada...' : undefined}
        className={cn(
          'w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all',
          isPending ? 'border-gray-200 bg-gray-50 cursor-wait' : 'hover:scale-110',
          done ? 'bg-emerald-500 border-emerald-500' : !isPending && 'border-gray-300 hover:border-emerald-400 bg-white'
        )}
      >
        {isPending
          ? <Loader2 className="w-3 h-3 text-gray-300 animate-spin" />
          : done && <span className="text-white text-[9px] font-bold leading-none">✓</span>}
      </button>

      {/* Title + sub-info */}
      <div className="flex-1 min-w-0">
        <span className={cn('text-sm text-gray-800 truncate block', done && 'line-through text-gray-500')}>
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
          {task.description?.trim() && (
            <span className="text-[10px] text-gray-400 flex items-center gap-1 min-w-0" title={task.description}>
              <StickyNote className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate max-w-[160px]">{task.description.trim()}</span>
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
          overdue ? 'text-red-500'
            : done ? (completed && isToday(completed) ? 'text-sky-500' : 'text-gray-500')
            : due && isToday(due) ? 'text-sky-500' : 'text-gray-400'
        )}>
          {dueLabel ?? '—'}
        </span>
        {showUser && (
          <div className="w-6 flex justify-center">
            {task.users ? <Avatar user={task.users} size={22} /> : null}
          </div>
        )}
        <button
          onClick={e => { e.stopPropagation(); if (!isPending) onDelete() }}
          disabled={isPending}
          className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all disabled:cursor-wait"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function DetailPanel({ task, onClose, onToggle, onDelete, onChange, onSubtasksSync }: {
  task: Task; onClose: () => void
  onToggle: () => void; onDelete: () => void
  onChange: (u: Partial<Task>) => void
  onSubtasksSync?: (subtasks: { id: string; title: string; done: boolean }[]) => void
}) {
  const [title, setTitle] = useState(task.title)
  const [desc, setDesc]   = useState(task.description ?? '')
  const [subtasks, setSubtasks] = useState<{ id: string; title: string; done: boolean }[]>(
    (task.subtasks ?? []).map(s => ({ id: s.id ?? '', title: s.title ?? s.text ?? '', done: s.done || !!s.completed }))
  )

  // Sincroniza com a linha da lista (badge "X/Y subtarefas") sem gravar no banco de novo —
  // cada mutação de subtarefa já se persiste sozinha via createSubtask/updateSubtask/deleteSubtask.
  useEffect(() => {
    onSubtasksSync?.(subtasks)
  }, [subtasks])
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
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null)
  const [editingSubtaskText, setEditingSubtaskText] = useState('')
  const descRef = useRef<HTMLTextAreaElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  const handleDescChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target
    setDesc(textarea.value)
    textarea.style.height = 'auto'
    textarea.style.height = Math.max(100, textarea.scrollHeight) + 'px'
  }

  const toast = useToast()

  const saveSubtaskEdit = async (index: number) => {
    const newTitle = editingSubtaskText.trim()
    const prevTitle = subtasks[index]?.title
    const id = subtasks[index]?.id
    setEditingSubtaskId(null)
    setEditingSubtaskText('')
    if (!newTitle || !id || newTitle === prevTitle) return
    setSubtasks(prev => prev.map((s, i) => i === index ? { ...s, title: newTitle } : s))
    try {
      const res = await updateSubtask(id, { title: newTitle })
      if (res?.error) throw new Error(res.error)
    } catch {
      setSubtasks(prev => prev.map((s, i) => i === index ? { ...s, title: prevTitle } : s))
      toast.error('Não foi possível salvar', 'Tente editar a subtarefa novamente.')
    }
  }

  const cancelSubtaskEdit = () => {
    setEditingSubtaskId(null)
    setEditingSubtaskText('')
  }

  async function toggleSubtask(index: number) {
    const item = subtasks[index]
    if (!item?.id) return
    const nextDone = !item.done
    setSubtasks(prev => prev.map((s, i) => i === index ? { ...s, done: nextDone } : s))
    try {
      const res = await updateSubtask(item.id, { done: nextDone })
      if (res?.error) throw new Error(res.error)
    } catch {
      setSubtasks(prev => prev.map((s, i) => i === index ? { ...s, done: !nextDone } : s))
      toast.error('Não foi possível salvar', 'Tente novamente.')
    }
  }

  async function removeSubtask(index: number) {
    const item = subtasks[index]
    if (!item?.id) return
    setSubtasks(prev => prev.filter((_, i) => i !== index))
    try {
      const res = await deleteSubtask(item.id)
      if (res?.error) throw new Error(res.error)
    } catch {
      setSubtasks(prev => {
        const restored = [...prev]
        restored.splice(index, 0, item)
        return restored
      })
      toast.error('Não foi possível excluir', 'Tente novamente.')
    }
  }

  async function addSubtask() {
    const title = newSubtask.trim()
    if (!title) return
    setNewSubtask('')
    try {
      const res = await createSubtask(task.id, title)
      if (res?.error || !res?.data) throw new Error(res?.error ?? 'Erro ao criar subtarefa')
      setSubtasks(prev => [...prev, { id: res.data.id, title: res.data.title, done: res.data.done }])
    } catch {
      setNewSubtask(title)
      toast.error('Não foi possível criar', 'Tente adicionar a subtarefa novamente.')
    }
  }

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
            <button onClick={() => onChange({ quote_id: null, quote: null })}
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
                        onChange({ quote_id: q.id, quote: { number: q.number, client_name: q.client_name } })
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
              value={task.due_date ? task.due_date.slice(0, 10) : ''}
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
                <button onClick={() => toggleSubtask(i)}
                  className={cn('mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-all',
                    item.done ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 bg-white hover:border-gray-400')}>
                  {item.done && <span className="text-white text-[8px] font-bold">✓</span>}
                </button>
                {editingSubtaskId === item.id ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editingSubtaskText}
                    onChange={e => setEditingSubtaskText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveSubtaskEdit(i)
                      if (e.key === 'Escape') cancelSubtaskEdit()
                    }}
                    onBlur={() => saveSubtaskEdit(i)}
                    autoFocus
                    className="flex-1 text-sm px-2 py-1 border border-brand-300 rounded-lg outline-none focus:ring-1 focus:ring-brand-300 bg-white"
                  />
                ) : (
                  <span
                    onClick={() => {
                      setEditingSubtaskId(item.id)
                      setEditingSubtaskText(item.title)
                    }}
                    className={cn('text-sm text-gray-700 leading-snug flex-1 cursor-pointer hover:bg-gray-100 px-2 py-1 rounded transition-colors', item.done && 'line-through text-gray-400')}>
                    {item.title}
                  </span>
                )}
                <button onClick={() => removeSubtask(i)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-300 hover:text-red-500 transition-all">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 pt-2">
            <input value={newSubtask} onChange={e => setNewSubtask(e.target.value)} onKeyDown={e => {
              if (e.key === 'Enter') addSubtask()
            }}
              placeholder="Adicionar subtarefa..."
              className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-brand-300" />
            <button onClick={addSubtask}
              className="px-2 py-1 text-xs font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition-colors">
              +
            </button>
          </div>
        </div>

        <div>
          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Notas</label>
          <textarea ref={descRef} value={desc} onChange={handleDescChange}
            onBlur={() => onChange({ description: desc })}
            placeholder="Adicionar notas..." rows={4}
            className="w-full mt-1.5 text-sm text-gray-700 resize-none border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-brand-200 placeholder-gray-300 leading-relaxed max-h-[60vh] overflow-y-auto" />
        </div>

        <p className="text-[11px] text-gray-300 border-t border-gray-100 pt-3">
          Criada em {format(new Date(task.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          {done && task.completed_at && (
            <> · Concluída em {format(new Date(task.completed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</>
          )}
        </p>
      </div>
    </div>

    {task.quote_id && showQuoteModal && (
      <QuoteQuickViewModal quoteId={task.quote_id} onClose={() => setShowQuoteModal(false)} />
    )}
    </>
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
