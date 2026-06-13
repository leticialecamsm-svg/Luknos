'use client'

import { useEffect, useState } from 'react'
import { getTasks } from '@/lib/actions'
import Link from 'next/link'
import { CheckCircle2, AlertCircle, Clock } from 'lucide-react'

interface Task {
  id: string
  title: string
  status: 'todo' | 'doing' | 'paused' | 'done'
  priority: 'high' | 'mid' | 'low'
  due_date?: string
  completed_at?: string | null
}

export function TasksCard() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadTasks = async () => {
      const data = await getTasks()
      setTasks(data.slice(0, 5))
      setLoading(false)
    }
    loadTasks()
  }, [])

  const todoCount = tasks.filter(t => t.status === 'todo').length
  const doingCount = tasks.filter(t => t.status === 'doing').length
  const pendingCount = tasks.filter(t => t.status === 'paused').length
  const doneCount = tasks.filter(t => t.status === 'done').length

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
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h3 className="font-bold text-gray-900">Minhas Tarefas</h3>
        <Link href="/dashboard/tasks" className="text-blue-600 text-sm font-semibold hover:text-blue-700">
          Ver tudo
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 p-4 border-b border-gray-200 bg-gray-50">
        <div className="text-center">
          <div className="text-xl font-bold text-blue-600">{todoCount}</div>
          <div className="text-xs text-gray-600">A Fazer</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-yellow-600">{doingCount}</div>
          <div className="text-xs text-gray-600">Fazendo</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-orange-600">{pendingCount}</div>
          <div className="text-xs text-gray-600">Pausada</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-green-600">{doneCount}</div>
          <div className="text-xs text-gray-600">Concluída</div>
        </div>
      </div>

      {/* Tasks List */}
      {tasks.length === 0 ? (
        <div className="p-6 text-center text-gray-500">
          <p>Nenhuma tarefa ainda</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200">
          {tasks.map((task) => (
            <div key={task.id} className="p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  {task.status === 'done' ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : task.priority === 'high' ? (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  ) : (
                    <Clock className="w-5 h-5 text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                      task.status === 'todo' ? 'bg-blue-50 text-blue-700' :
                      task.status === 'doing' ? 'bg-yellow-50 text-yellow-700' :
                      task.status === 'paused' ? 'bg-orange-50 text-orange-700' :
                      'bg-green-50 text-green-700'
                    }`}>
                      {task.status === 'todo' && 'A Fazer'}
                      {task.status === 'doing' && 'Fazendo'}
                      {task.status === 'paused' && 'Pausada'}
                      {task.status === 'done' && 'Concluída'}
                    </span>
                    {task.due_date && (
                      <span className="text-xs text-gray-600">
                        {new Date(task.due_date).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
