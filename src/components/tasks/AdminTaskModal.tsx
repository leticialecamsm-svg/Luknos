'use client'

import { useState } from 'react'
import { createTaskForUser } from '@/lib/actions'
import { X } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface User {
  id: string
  name: string
  avatar_color: string
}

interface AdminTaskModalProps {
  users: User[]
  defaultUserId?: string
  onClose: () => void
  onSuccess: () => void
}

export function AdminTaskModal({ users, defaultUserId, onClose, onSuccess }: AdminTaskModalProps) {
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    userId: defaultUserId || users[0]?.id || '',
    title: '',
    description: '',
    priority: 'mid',
    status: 'todo',
    due_date: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim()) return
    if (!formData.userId) return

    const getTodayString = () => {
      const today = new Date()
      return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    }

    setLoading(true)
    const result = await createTaskForUser(formData.userId, {
      title: formData.title,
      description: formData.description || undefined,
      priority: formData.priority,
      status: formData.status,
      due_date: formData.due_date || getTodayString(),
    })
    setLoading(false)

    if (result.error) {
      toast.error('OCORREU UM ERRO', 'Não foi possível criar a tarefa.')
    } else {
      toast.success('TUDO CERTO!', 'Tarefa criada e atribuída com sucesso.')
      onSuccess()
    }
  }

  const selectedUser = users.find(u => u.id === formData.userId)

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Nova tarefa para colaborador</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Colaborador */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Colaborador <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                value={formData.userId}
                onChange={e => setFormData({ ...formData, userId: e.target.value })}
                className="w-full px-3 py-2 pl-10 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 appearance-none"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              {selectedUser && (
                <div
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold pointer-events-none"
                  style={{ backgroundColor: selectedUser.avatar_color || '#6366f1' }}
                >
                  {selectedUser.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </div>

          {/* Título */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Título <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              placeholder="Digite o título da tarefa"
              autoFocus
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Descrição</label>
            <textarea
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descrição detalhada (opcional)"
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
            />
          </div>

          {/* Prioridade */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Prioridade</label>
            <div className="flex gap-2">
              {(['high', 'mid', 'low'] as const).map(pri => (
                <button
                  key={pri}
                  type="button"
                  onClick={() => setFormData({ ...formData, priority: pri })}
                  className={`flex-1 py-2 rounded-lg font-semibold text-sm transition-colors ${
                    formData.priority === pri
                      ? pri === 'high' ? 'bg-red-100 text-red-700 border border-red-200'
                        : pri === 'mid' ? 'bg-amber-100 text-amber-700 border border-amber-200'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                      : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {pri === 'high' ? 'Alta' : pri === 'mid' ? 'Média' : 'Baixa'}
                </button>
              ))}
            </div>
          </div>

          {/* Data */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Data de vencimento</label>
            <input
              type="date"
              value={formData.due_date}
              onChange={e => setFormData({ ...formData, due_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </form>

        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-gray-700 font-semibold rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit as any}
            disabled={loading || !formData.title.trim()}
            className="flex-1 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Criando...' : 'Criar tarefa'}
          </button>
        </div>
      </div>
    </div>
  )
}
