'use client'

import { useState, useEffect } from 'react'
import { createTask, getQuotesList } from '@/lib/actions'
import { X } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface TasksModalProps {
  onClose: () => void
  onSuccess: () => void
  defaultQuoteId?: string
  defaultQuoteLabel?: string
}

export function TasksModal({ onClose, onSuccess, defaultQuoteId, defaultQuoteLabel }: TasksModalProps) {
  const [loading, setLoading] = useState(false)
  const [quotes, setQuotes] = useState<{ id: string; number: number; client_name: string }[]>([])
  const toast = useToast()
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'mid',
    status: 'todo',
    due_date: '',
    quote_id: defaultQuoteId ?? '',
  })

  useEffect(() => {
    getQuotesList().then(q => setQuotes(q as any[]))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim()) {
      alert('Título é obrigatório')
      return
    }

    // Se não forneceu data, usar data de hoje (timezone local do cliente)
    const getTodayString = () => {
      const today = new Date()
      const year = today.getFullYear()
      const month = String(today.getMonth() + 1).padStart(2, '0')
      const day = String(today.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    setLoading(true)
    const result = await createTask({
      title: formData.title,
      description: formData.description || undefined,
      priority: formData.priority,
      status: formData.status,
      due_date: formData.due_date || getTodayString(),
      quote_id: formData.quote_id || null,
    })

    setLoading(false)

    if (result.error) {
      toast.error('OCORREU UM ERRO', 'Não foi possível criar a tarefa.')
    } else {
      toast.success('TUDO CERTO!', 'Tarefa criada com sucesso.')
      onSuccess()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Nova Tarefa</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Título */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Título <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Digite o título da tarefa"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Descrição
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descrição detalhada da tarefa"
              rows={4}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
            />
          </div>

          {/* Prioridade */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Prioridade
            </label>
            <div className="flex gap-2">
              {['high', 'mid', 'low'].map((pri) => (
                <button
                  key={pri}
                  type="button"
                  onClick={() => setFormData({ ...formData, priority: pri })}
                  className={`flex-1 py-2 rounded-lg font-semibold text-sm transition-colors ${
                    formData.priority === pri
                      ? pri === 'high'
                        ? 'bg-red-100 text-red-700 border border-red-200'
                        : pri === 'mid'
                          ? 'bg-amber-100 text-amber-700 border border-amber-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {pri === 'high' && 'Alta'}
                  {pri === 'mid' && 'Média'}
                  {pri === 'low' && 'Baixa'}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Status
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="todo">A Fazer</option>
              <option value="doing">Fazendo</option>
              <option value="pending">Pausada</option>
              <option value="done">Concluído</option>
            </select>
          </div>

          {/* Data de Vencimento */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Data de Vencimento
            </label>
            <input
              type="date"
              value={formData.due_date}
              onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Orçamento vinculado */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Orçamento (opcional)
            </label>
            {defaultQuoteId && defaultQuoteLabel ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                <span className="font-medium">{defaultQuoteLabel}</span>
                <span className="text-blue-400 text-xs">(fixo)</span>
              </div>
            ) : (
              <select
                value={formData.quote_id}
                onChange={(e) => setFormData({ ...formData, quote_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">— Nenhum orçamento —</option>
                {quotes.map(q => (
                  <option key={q.id} value={q.id}>#{q.number} · {q.client_name}</option>
                ))}
              </select>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-gray-700 font-semibold rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={(e) => handleSubmit(e as any)}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Criando...' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  )
}
