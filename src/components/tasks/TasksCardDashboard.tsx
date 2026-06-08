'use client'

import { useEffect, useState } from 'react'
import { getTasks } from '@/lib/actions'
import Link from 'next/link'
import { CheckCircle2, AlertCircle, Clock } from 'lucide-react'

interface Task {
  id: string
  title: string
  status: 'todo' | 'doing' | 'pending' | 'done'
  priority: 'high' | 'mid' | 'low'
  due_date?: string
}

export function TasksCardDashboard() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadTasks = async () => {
      const data = await getTasks()
      setTasks(data)
      setLoading(false)
    }
    loadTasks()
  }, [])

  const todoCount = tasks.filter(t => t.status === 'todo').length
  const doingCount = tasks.filter(t => t.status === 'doing').length
  const pendingCount = tasks.filter(t => t.status === 'pending').length
  const doneCount = tasks.filter(t => t.status === 'done').length
  const progressPercent = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0

  const recentTasks = tasks
    .filter(t => t.status !== 'done')
    .sort((a, b) => new Date(b.due_date || '').getTime() - new Date(a.due_date || '').getTime())
    .slice(0, 5)

  const highPriorityTasks = tasks
    .filter(t => t.priority === 'high' && t.status !== 'done')
    .slice(0, 3)

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="h-64 flex items-center justify-center">
          <p className="text-gray-500">Carregando tarefas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-yellow-50 border-2 border-yellow-300 rounded-2xl p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <div>
            <h3 className="font-bold text-gray-900">Minhas tarefas</h3>
            <p className="text-sm text-orange-600 font-semibold">{pendingCount} pendentes</p>
          </div>
          <span className="ml-auto px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-full">NOVO</span>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">Progresso hoje</span>
          <span className="text-sm font-bold text-green-600">{doneCount}/4 concluídas</span>
        </div>
        <div className="h-2 bg-gray-300 rounded-full overflow-hidden">
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
          <div className="space-y-2">
            {highPriorityTasks.map((task) => (
              <div key={task.id} className="bg-white rounded-lg p-3 flex items-start gap-2">
                <input type="checkbox" className="w-4 h-4 rounded border-gray-300 mt-0.5 cursor-pointer" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{task.title}</p>
                </div>
                <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                  <span className="text-xs font-semibold text-red-700">Alta</span>
                  {task.due_date && (
                    <span className={`text-xs font-semibold ${
                      new Date(task.due_date) < new Date() ? 'text-red-600' : 'text-gray-600'
                    }`}>
                      {new Date(task.due_date) < new Date() ? '⚠ ' : ''}{new Date(task.due_date).toLocaleDateString('pt-BR', { month: '2-digit', day: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other Tasks Section */}
      {recentTasks.filter(t => t.priority !== 'high').length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-400"></span>
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">OUTRAS TAREFAS</h4>
          </div>
          <div className="space-y-2">
            {recentTasks.filter(t => t.priority !== 'high').slice(0, 3).map((task) => (
              <div key={task.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="w-4 h-4 rounded border-gray-300 cursor-pointer" />
                <span className="flex-1 text-gray-700">{task.title}</span>
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

      {/* Completed Task */}
      {doneCount > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500"></span>
            <h4 className="text-xs font-bold text-green-700 uppercase tracking-wider">FEITA</h4>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <span className="flex-1 line-through text-gray-400">Follow-up cliente Beatriz</span>
            <span className="text-xs font-semibold text-green-600">Feita</span>
          </div>
        </div>
      )}

      {/* New Task Button */}
      <div className="border-2 border-dashed border-blue-400 rounded-lg p-3 text-center hover:bg-blue-50 transition-colors">
        <button className="text-blue-600 font-semibold text-sm w-full">+ Nova tarefa</button>
      </div>

      {/* View All Link */}
      <Link href="/dashboard/tasks" className="block text-right text-blue-600 text-sm font-semibold hover:text-blue-700">
        Ver todas →
      </Link>
    </div>
  )
}
