'use client'

import { useEffect, useState } from 'react'
import { getTasks, updateTaskStatus } from '@/lib/actions'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface Task {
  id: string
  title: string
  status: 'todo' | 'doing' | 'paused' | 'done'
  priority: 'high' | 'mid' | 'low'
  due_date?: string
  completed_at?: string | null
}

interface TasksCardProps {
  onNewTaskClick?: () => void
}

const PRIORITY_LABEL: Record<Task['priority'], string> = { high: 'Alta', mid: 'Média', low: 'Baixa' }
const PRIORITY_CLS: Record<Task['priority'], string> = {
  high: 'bg-red-50 text-red-600',
  mid: 'bg-amber-50 text-amber-600',
  low: 'bg-gray-100 text-gray-500',
}

export function TasksCardDashboard({ onNewTaskClick }: TasksCardProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  const loadTasks = async () => {
    const data = await getTasks()
    setTasks(data)
    setLoading(false)
  }

  useEffect(() => {
    loadTasks()
  }, [])

  const handleCheckboxChange = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'done' ? 'doing' : 'done'
    await updateTaskStatus(taskId, newStatus)
    loadTasks()
  }

  const pendingCount = tasks.filter(t => t.status === 'paused').length
  const doneCount = tasks.filter(t => t.status === 'done').length
  const progressPercent = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0

  const pendingTasks = tasks
    .filter(t => t.status !== 'done')
    .sort((a, b) => (a.priority === 'high' ? -1 : 1) - (b.priority === 'high' ? -1 : 1))
    .slice(0, 5)

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="h-64 flex items-center justify-center">
          <p className="text-gray-400 text-sm">Carregando tarefas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Minhas tarefas</h3>
          {pendingCount > 0 && (
            <p className="text-xs text-orange-600 font-medium mt-0.5">{pendingCount} pausadas</p>
          )}
        </div>
        <Link href="/dashboard/tasks" className="text-xs font-medium text-blue-600 hover:text-blue-700">
          Ver todas →
        </Link>
      </div>

      <div className="px-4 pt-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-gray-500">Progresso hoje</span>
          <span className="text-xs font-semibold text-emerald-600">{doneCount}/{tasks.length} concluídas</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div className="p-2 space-y-0.5">
        {pendingTasks.length > 0 ? (
          pendingTasks.map(task => (
            <div key={task.id} className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50/80 transition-colors">
              <button
                onClick={() => handleCheckboxChange(task.id, task.status)}
                className="w-5 h-5 rounded-full border-2 border-gray-300 hover:border-emerald-400 bg-white shrink-0 flex items-center justify-center transition-all hover:scale-110"
              />
              <span className="text-sm text-gray-800 truncate flex-1">{task.title}</span>
              <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0', PRIORITY_CLS[task.priority])}>
                {PRIORITY_LABEL[task.priority]}
              </span>
              {task.due_date && (
                <span className={cn('text-[10px] font-medium shrink-0', new Date(task.due_date) < new Date() ? 'text-red-600' : 'text-gray-400')}>
                  {new Date(task.due_date).toLocaleDateString('pt-BR', { month: '2-digit', day: '2-digit' })}
                </span>
              )}
            </div>
          ))
        ) : (
          <p className="text-sm text-gray-400 text-center py-6">Nenhuma tarefa pendente 🎉</p>
        )}
      </div>

      <div className="p-2 pt-0">
        <Link
          href="/dashboard/tasks"
          className="flex items-center justify-center gap-1.5 border-2 border-dashed border-gray-200 hover:border-brand-300 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-brand-600 transition-colors"
        >
          + Nova tarefa
        </Link>
      </div>
    </div>
  )
}
