'use client'

/**
 * Tasks V4 — "Bloco de notas inteligente"
 *
 * Princípio de design: zero atrito para registrar uma tarefa.
 * A captura é o mesmo gesto de escrever num bloco de notas:
 * digita → Enter → feito. Tudo mais é opcional e oculto.
 *
 * Mudanças vs versões anteriores:
 * - Sem hover que muda layout (ações ficam em botão fixo à direita)
 * - Sem colunas / sem cabeçalho de tabela
 * - Criação na primeira linha da lista, não num modal
 * - Checkbox clicável para concluir com um toque
 * - Prioridade como borda colorida (3px), não como chip
 * - Painel de detalhes só abre quando o usuário QUER ver mais
 */

import { useState, useMemo, useRef, useTransition, useEffect } from 'react'
import { updateTaskStatus, deleteTask, createTask, createTaskForUser, updateTask } from '@/lib/actions'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import {
  Plus, X, ChevronDown, Calendar, CheckCircle2,
  Clock, Circle, Link2, Users, Search, SlidersHorizontal,
  MoreVertical, Pencil, Trash2, ExternalLink,
} from 'lucide-react'
import { format, isToday, isTomorrow, isPast, parseISO, isThisWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type Status   = 'todo' | 'doing' | 'paused' | 'done'
type Priority = 'high' | 'mid' | 'low'

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

interface User { id: string; name: string; avatar_color: string; avatar_url?: string | null }

const P_BORDER = { high: 'border-l-red-500', mid: 'border-l-amber-400', low: 'border-l-gray-200' }
const P_DOT    = { high: 'bg-red-500', mid: 'bg-amber-400', low: 'bg-gray-300' }
const P_LABEL  = { high: 'Alta', mid: 'Média', low: 'Baixa' }

// ── Main ──────────────────────────────────────────────────────────────────────

export function TasksV4({ myTasks, allTasks, allUsers, currentUser, isAdmin }: {
  myTasks: Task[]; allTasks: Task[]; allUsers: User[]
  currentUser: User; isAdmin: boolean
}) {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [, startTx] = useTransition()

  const [scope, setScope]    = useState<'mine' | 'team'>('mine')
  const [search, setSearch]  = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filterP, setFilterP] = useState<Priority | ''>('')
  const [filterUser, setFilterU] = useState('')
  const [selected, setSelected] = useState<Task | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState<Priority>('mid')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(['done']))

  const source = scope === 'mine' ? myTasks : allTasks
  const [tasks, setTasks] = useState<Task[]>(source)

  // keep tasks in sync when scope changes
  useEffect(() => { setTasks(scope === 'mine' ? myTasks : allTasks) }, [scope, myTasks, allTasks])

  function reload() {
    startTx(async () => {
      const { getTasks, getAllTasks } = await import('@/lib/actions')
      const data = await (scope === 'mine' ? getTasks() : getAllTasks())
      setTasks(data as Task[])
    })
  }

  // ── Quick add ──────────────────────────────────────────────────────────────

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    setNewTitle('')
    // optimistic
    const tmp: Task = {
      id: '__tmp__' + Date.now(), title, status: 'todo', priority: newPriority,
      created_at: new Date().toISOString(),
    }
    setTasks(prev => [tmp, ...prev])
    const res = await createTask({ title, priority: newPriority, status: 'todo' })
    if (res?.error) { toast.error('Erro', res.error); setTasks(prev => prev.filter(t => t.id !== tmp.id)); return }
    reload()
  }

  // ── Toggle done ────────────────────────────────────────────────────────────

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

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let t = tasks
    if (search)   t = t.filter(x => x.title.toLowerCase().includes(search.toLowerCase()))
    if (filterP)  t = t.filter(x => x.priority === filterP)
    if (filterUser) t = t.filter(x => x.user_id === filterUser)
    return t
  }, [tasks, search, filterP, filterUser])

  // ── Groups: Hoje / Esta semana / Mais tarde / Concluídas ──────────────────

  const active = filtered.filter(t => t.status !== 'done')
  const done   = filtered.filter(t => t.status === 'done')

  const today    = active.filter(t => t.due_date && isToday(parseISO(t.due_date)))
  const overdue  = active.filter(t => t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)))
  const thisWeek = active.filter(t => t.due_date && isThisWeek(parseISO(t.due_date), { weekStartsOn: 0 }) && !isToday(parseISO(t.due_date)))
  const noDate   = active.filter(t => !t.due_date)
  const later    = active.filter(t => t.due_date && !isToday(parseISO(t.due_date)) && !isThisWeek(parseISO(t.due_date), { weekStartsOn: 0 }) && !isPast(parseISO(t.due_date)))

  type Group = { key: string; label: string; tasks: Task[]; accent: string; border: string; bg: string }
  const groups: Group[] = ([
    overdue.length  ? { key: 'overdue',   label: '⚠ Atrasadas',    tasks: overdue,  accent: 'text-red-600',    border: 'border-red-200',    bg: 'bg-red-50'    } : null,
    today.length    ? { key: 'today',     label: '📌 Hoje',         tasks: today,    accent: 'text-orange-600', border: 'border-orange-200', bg: 'bg-orange-50' } : null,
    thisWeek.length ? { key: 'week',      label: 'Esta semana',     tasks: thisWeek, accent: 'text-blue-600',   border: 'border-blue-100',   bg: 'bg-blue-50'   } : null,
    later.length    ? { key: 'later',     label: 'Mais tarde',      tasks: later,    accent: 'text-gray-500',   border: 'border-gray-200',   bg: 'bg-gray-50'   } : null,
    noDate.length   ? { key: 'nodate',    label: 'Sem prazo',       tasks: noDate,   accent: 'text-gray-400',   border: 'border-gray-200',   bg: 'bg-gray-50'   } : null,
  ] as (Group | null)[]).filter((g): g is Group => g !== null)

  // Se não há datas em nenhuma, só mostra uma lista plana
  const flatMode = active.every(t => !t.due_date)

  function toggle(key: string) {
    setCollapsed(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  const pendingCount = active.length
  const doneCount    = done.length

  return (
    <div className="flex gap-5 h-full min-h-0">

      {/* ── Lista principal ── */}
      <div className="flex flex-col flex-1 min-w-0 gap-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tarefas</h1>
            <p className="text-sm text-gray-400">
              {pendingCount > 0
                ? <><span className="text-gray-700 font-semibold">{pendingCount}</span> pendentes</>
                : <span className="text-emerald-600 font-medium">✓ Tudo em dia!</span>
              }
              {doneCount > 0 && <> · <span className="text-emerald-600">{doneCount} concluídas</span></>}
            </p>
          </div>

          {/* Scope (admin) */}
          {isAdmin && (
            <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5">
              {(['mine', 'team'] as const).map(s => (
                <button key={s} onClick={() => { setScope(s); setFilterU('') }}
                  className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                    scope === s ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
                  {s === 'mine' ? 'Minhas' : <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />Equipe</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Quick add ── */}
        <form onSubmit={handleAdd} className="flex items-center gap-2 bg-white rounded-2xl border-2 border-dashed border-gray-200 hover:border-brand-300 focus-within:border-brand-400 focus-within:shadow-sm transition-all px-4 py-3">
          <Plus className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Adicionar tarefa... (Enter para salvar)"
            className="flex-1 text-sm text-gray-800 bg-transparent outline-none placeholder-gray-400"
          />
          {/* Priority quick-select */}
          <div className="flex items-center gap-1 shrink-0">
            {(['high', 'mid', 'low'] as Priority[]).map(p => (
              <button key={p} type="button" onClick={() => setNewPriority(p)}
                className={cn('w-5 h-5 rounded-full border-2 transition-all',
                  newPriority === p ? `${P_DOT[p]} border-transparent scale-110` : 'border-gray-200 bg-white hover:border-gray-400'
                )}
                title={P_LABEL[p]}
              />
            ))}
          </div>
          {newTitle && (
            <button type="submit" className="text-xs font-semibold text-brand-600 hover:text-brand-700 shrink-0 px-2 py-1 rounded-lg bg-brand-50 transition-colors">
              Salvar
            </button>
          )}
        </form>

        {/* ── Barra de filtros (compacta) ── */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar tarefa..." className="input pl-8 h-8 text-sm" />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"><X className="w-3 h-3" /></button>}
          </div>

          <button onClick={() => setShowFilters(f => !f)}
            className={cn('flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-medium transition-all',
              showFilters || filterP || filterUser ? 'bg-brand-50 border-brand-200 text-brand-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300')}>
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filtros
            {(filterP || filterUser) && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 ml-0.5" />}
          </button>

          {showFilters && (
            <>
              {(['high', 'mid', 'low'] as Priority[]).map(p => (
                <button key={p} onClick={() => setFilterP(f => f === p ? '' : p)}
                  className={cn('flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-medium transition-all',
                    filterP === p ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300')}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', P_DOT[p])} />
                  {P_LABEL[p]}
                </button>
              ))}
              {scope === 'team' && allUsers.map(u => (
                <button key={u.id} onClick={() => setFilterU(f => f === u.id ? '' : u.id)}
                  className={cn('flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs font-medium transition-all',
                    filterUser === u.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300')}>
                  <Avatar user={u} size={16} />
                  {u.name.split(' ')[0]}
                </button>
              ))}
            </>
          )}
        </div>

        {/* ── Task list ── */}
        <div className="flex-1 overflow-y-auto space-y-2 pb-4">
          {filtered.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-gray-200" />
              <p className="text-sm font-medium">Nenhuma tarefa por aqui</p>
              <p className="text-xs mt-1">Use o campo acima para adicionar</p>
            </div>
          )}

          {/* Flat mode (nenhuma tem prazo) */}
          {flatMode && active.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
              {active.map(task => (
                <Row key={task.id} task={task} showUser={scope === 'team'}
                  onToggle={() => toggleDone(task)}
                  onSelect={() => setSelected(t => t?.id === task.id ? null : task)}
                  onDelete={() => removeTask(task.id)}
                  isSelected={selected?.id === task.id}
                />
              ))}
            </div>
          )}

          {/* Grouped mode */}
          {!flatMode && groups.map(g => (
            <div key={g.key} className={cn('rounded-2xl border overflow-hidden', g.border)}>
              <button onClick={() => toggle(g.key)}
                className={cn('w-full flex items-center gap-2 px-4 py-2.5 text-left', g.bg)}>
                <span className={cn('text-xs font-bold', g.accent)}>{g.label}</span>
                <span className="text-xs text-gray-400 font-medium">{g.tasks.length}</span>
                <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 ml-auto transition-transform', collapsed.has(g.key) && '-rotate-90')} />
              </button>
              {!collapsed.has(g.key) && (
                <div className="bg-white divide-y divide-gray-100">
                  {g.tasks.map(task => (
                    <Row key={task.id} task={task} showUser={scope === 'team'}
                      onToggle={() => toggleDone(task)}
                      onSelect={() => setSelected(t => t?.id === task.id ? null : task)}
                      onDelete={() => removeTask(task.id)}
                      isSelected={selected?.id === task.id}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Concluídas */}
          {done.length > 0 && (
            <div className="rounded-2xl border border-gray-200 overflow-hidden">
              <button onClick={() => toggle('done')}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-left bg-gray-50">
                <span className="text-xs font-bold text-emerald-600">✓ Concluídas</span>
                <span className="text-xs text-gray-400">{done.length}</span>
                <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 ml-auto transition-transform', collapsed.has('done') && '-rotate-90')} />
              </button>
              {!collapsed.has('done') && (
                <div className="bg-white divide-y divide-gray-100">
                  {done.map(task => (
                    <Row key={task.id} task={task} showUser={scope === 'team'}
                      onToggle={() => toggleDone(task)}
                      onSelect={() => setSelected(t => t?.id === task.id ? null : task)}
                      onDelete={() => removeTask(task.id)}
                      isSelected={selected?.id === task.id}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Painel de detalhes ── */}
      {selected && (
        <DetailPanel
          key={selected.id}
          task={selected}
          onClose={() => setSelected(null)}
          onToggle={() => toggleDone(selected)}
          onDelete={() => removeTask(selected.id)}
          onChange={updates => changeTask(selected.id, updates)}
        />
      )}
    </div>
  )
}

// ── Row ───────────────────────────────────────────────────────────────────────
// Layout FIXO — nada muda de tamanho no hover. Botões sempre ocupam
// o mesmo espaço (apenas opacity muda).

function Row({ task, showUser, isSelected, onToggle, onSelect, onDelete }: {
  task: Task; showUser: boolean; isSelected: boolean
  onToggle: () => void; onSelect: () => void; onDelete: () => void
}) {
  const done     = task.status === 'done'
  const due      = task.due_date ? parseISO(task.due_date) : null
  const overdue  = due && isPast(due) && !isToday(due) && !done
  const dueLabel = due
    ? (isToday(due) ? 'Hoje' : isTomorrow(due) ? 'Amanhã' : format(due, 'dd/MM', { locale: ptBR }))
    : null

  return (
    <div
      onClick={onSelect}
      className={cn(
        'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-l-[3px] group',
        P_BORDER[task.priority],
        isSelected ? 'bg-brand-50' : 'hover:bg-gray-50',
        done && 'opacity-50'
      )}
    >
      {/* Checkbox */}
      <button
        onClick={e => { e.stopPropagation(); onToggle() }}
        className={cn(
          'w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all hover:scale-110',
          done ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-emerald-400 bg-white'
        )}
      >
        {done && <span className="text-white text-[10px] font-bold">✓</span>}
      </button>

      {/* Title */}
      <span className={cn('flex-1 text-sm text-gray-800 min-w-0 truncate', done && 'line-through text-gray-400')}>
        {task.title}
      </span>

      {/* Meta — layout fixo, sempre ocupa espaço */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Quote */}
        {task.quote && (
          <span className="text-[11px] text-brand-500 hidden md:flex items-center gap-1">
            <Link2 className="w-3 h-3" />#{task.quote.number}
          </span>
        )}

        {/* Due date */}
        <span className={cn(
          'text-[11px] font-medium w-16 text-right',
          !dueLabel && 'opacity-0',
          overdue ? 'text-red-500' : isToday(due!) ? 'text-orange-500' : 'text-gray-400'
        )}>
          {dueLabel ?? '—'}
        </span>

        {/* Assignee */}
        {showUser && (
          <div className="w-6">
            {task.users ? <Avatar user={task.users} size={22} /> : null}
          </div>
        )}

        {/* Delete — sempre ocupa w-7, só muda opacity */}
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
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

  return (
    <div className="w-72 shrink-0 flex flex-col bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <button onClick={onToggle}
          className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110 shrink-0',
            done ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-emerald-400')}>
          {done && <span className="text-white text-[10px] font-bold">✓</span>}
        </button>
        <span className="text-xs font-semibold text-gray-500 flex-1">{done ? 'Concluída' : 'Em aberto'}</span>
        <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Priority stripe */}
        <div className={cn('h-1 rounded-full -mt-1', {
          'bg-red-400': task.priority === 'high',
          'bg-amber-400': task.priority === 'mid',
          'bg-gray-200': task.priority === 'low',
        })} />

        {/* Editable title */}
        <textarea
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={() => title.trim() && onChange({ title: title.trim() })}
          rows={2}
          className={cn(
            'w-full text-base font-semibold text-gray-900 resize-none bg-transparent outline-none leading-snug',
            done && 'line-through text-gray-400'
          )}
        />

        {/* Quote */}
        {task.quote && (
          <div className="flex items-center gap-2 bg-brand-50 border border-brand-100 rounded-xl px-3 py-2 text-sm text-brand-700">
            <Link2 className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 truncate text-xs font-medium">#{task.quote.number} · {task.quote.client_name}</span>
          </div>
        )}

        {/* Fields */}
        <div className="space-y-3">
          <Field label="Status">
            <select value={task.status} onChange={e => onChange({ status: e.target.value as Status })}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700">
              <option value="todo">A fazer</option>
              <option value="doing">Em andamento</option>
              <option value="paused">Pausada</option>
              <option value="done">Concluída</option>
            </select>
          </Field>
          <Field label="Prioridade">
            <div className="flex gap-2 flex-1">
              {(['high', 'mid', 'low'] as Priority[]).map(p => (
                <button key={p} onClick={() => onChange({ priority: p })}
                  className={cn('flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-lg border transition-all',
                    task.priority === p ? 'border-transparent text-white ' + {high:'bg-red-500',mid:'bg-amber-400',low:'bg-gray-400'}[p] : 'border-gray-200 text-gray-500 hover:border-gray-300')}>
                  {P_LABEL[p]}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Prazo">
            <input type="date" defaultValue={task.due_date ?? ''}
              onChange={e => onChange({ due_date: e.target.value || null })}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700" />
          </Field>
          {task.users && (
            <Field label="Responsável">
              <div className="flex items-center gap-2">
                <Avatar user={task.users} size={22} />
                <span className="text-sm text-gray-700">{task.users.name}</span>
              </div>
            </Field>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Notas</label>
          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            onBlur={() => onChange({ description: desc })}
            placeholder="Adicionar notas ou detalhes..."
            rows={4}
            className="w-full mt-1.5 text-sm text-gray-700 resize-none border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-300 placeholder-gray-300 leading-relaxed"
          />
        </div>

        {/* Checklist */}
        {task.checklist && task.checklist.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Checklist</p>
              <span className="text-xs text-gray-400">
                {task.checklist.filter(i => i.done).length}/{task.checklist.length}
              </span>
            </div>
            <div className="h-1 bg-gray-100 rounded-full">
              <div className="h-full bg-emerald-400 rounded-full transition-all"
                style={{ width: `${(task.checklist.filter(i => i.done).length / task.checklist.length) * 100}%` }} />
            </div>
            {task.checklist.map((item, i) => (
              <div key={i} className={cn('flex items-center gap-2 text-sm', item.done ? 'text-gray-400 line-through' : 'text-gray-700')}>
                <CheckCircle2 className={cn('w-4 h-4 shrink-0', item.done ? 'text-emerald-500' : 'text-gray-300')} />
                {item.text}
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-gray-300 border-t border-gray-100 pt-3">
          Criada em {format(parseISO(task.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
        </p>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-400 font-medium w-20 shrink-0">{label}</span>
      {children}
    </div>
  )
}
