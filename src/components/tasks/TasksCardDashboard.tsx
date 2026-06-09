'use client'

import { useEffect, useState } from 'react'
import { getTasks, updateTaskStatus } from '@/lib/actions'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'

interface Task {
  id: string
  title: string
  status: 'todo' | 'doing' | 'pending' | 'done'
  priority: 'high' | 'mid' | 'low'
  due_date?: string
}

interface TasksCardProps {
  onNewTaskClick?: () => void
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

  const todoCount = tasks.filter(t => t.status === 'todo').length
  const doingCount = tasks.filter(t => t.status === 'doing').length
  const pendingCount = tasks.filter(t => t.status === 'pending').length
  const doneCount = tasks.filter(t => t.status === 'done').length
  const progressPercent = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0

  const highPriorityTasks = tasks
    .filter(t => t.priority === 'high' && t.status !== 'done')
    .slice(0, 3)

  const otherTasks = tasks
    .filter(t => t.priority !== 'high' && t.status !== 'done')
    .slice(0, 2)

  if (loading) {
    return (
      <div className="rounded-2xl p-0.5" style={{
        background: 'linear-gradient(135deg, #FCD34D 0%, #FBBF24 100%)',
      }}>
        <div className="bg-white rounded-2xl p-6">
          <div className="h-64 flex items-center justify-center">
            <p className="text-gray-500">Carregando tarefas...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl p-0.5" style={{
      background: 'linear-gradient(135deg, #FCD34D 0%, #FBBF24 100%)',
    }}>
      <div className="bg-white rounded-2xl p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <div>
              <h3 className="font-bold text-gray-900">Minhas tarefas</h3>
              <p className="text-sm text-orange-600 font-semibold">{pendingCount} pendentes</p>
            </div>
          </div>
          <Link href="/dashboard/tasks" className="text-blue-600 font-bold text-sm hover:text-blue-700">
            Ver todas →
          </Link>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Progresso hoje</span>
            <span className="text-sm font-bold text-green-600">{doneCount}/{tasks.length} concluídas</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progressPercent}%` }}></div>
          </div>
        </div>

        {/* High Priority Section */}
        {highPriorityTasks.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600"></span>
              <h4 className="text-xs font-bold text-red-700 uppercase tracking-wider">ALTA PRIORIDADE</h4>
            </div>
            <div className="space-y-1">
              {highPriorityTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded">
                  <input
                    type="checkbox"
                    checked={task.status === 'done'}
                    onChange={() => handleCheckboxChange(task.id, task.status)}
                    className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                  />
                  <p className={`text-sm flex-1 ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                    {task.title}
                  </p>
                  <span className="text-xs font-semibold text-red-700">Alta</span>
                  {task.due_date && (
                    <span className={`text-xs font-semibold ${
                      new Date(task.due_date) < new Date() ? 'text-red-600' : 'text-gray-600'
                    }`}>
                      {new Date(task.due_date).toLocaleDateString('pt-BR', { month: '2-digit', day: '2-digit' })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Other Tasks Section */}
        {otherTasks.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-400"></span>
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">OUTRAS TAREFAS</h4>
            </div>
            <div className="space-y-1">
              {otherTasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded">
                  <input
                    type="checkbox"
                    checked={task.status === 'done'}
                    onChange={() => handleCheckboxChange(task.id, task.status)}
                    className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                  />
                  <p className={`text-sm flex-1 ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                    {task.title}
                  </p>
                  <span className={`text-xs font-semibold ${
                    task.priority === 'mid' ? 'text-amber-600' : 'text-gray-600'
                  }`}>
                    {task.priority === 'mid' ? '🟡 Média' : '⚪ Baixa'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* New Task Button */}
        <div className="border-2 border-dashed border-blue-400 rounded-lg p-3 text-center hover:bg-blue-50 transition-colors">
          <Link href="/dashboard/tasks" className="text-blue-600 font-semibold text-sm w-full block">
            + Nova tarefa
          </Link>
        </div>
      </div>
    </div>
  )
}
