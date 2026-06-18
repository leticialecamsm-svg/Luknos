'use client'

import { useState, useEffect, useRef } from 'react'
import { updateTask, getQuotesList } from '@/lib/actions'
import { X, Search, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

interface Task {
  id: string
  title: string
  description?: string
  status: string
  priority: string
  due_date?: string
  quote_id?: string | null
  quote?: { number: number; client_name: string } | null
}

interface Props {
  task: Task
  onClose: () => void
  onSuccess: () => void
}

export function TasksEditModal({ task, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false)
  const [quotes, setQuotes] = useState<{ id: string; number: number; client_name: string }[]>([])
  const initialLabel = task.quote ? `#${task.quote.number} · ${task.quote.client_name}` : ''
  const [quoteSearch, setQuoteSearch] = useState(initialLabel)
  const [quoteId, setQuoteId] = useState(task.quote_id ?? '')
  const [showQuoteList, setShowQuoteList] = useState(false)
  const quoteRef = useRef<HTMLDivElement>(null)
  const toast = useToast()

  const [form, setForm] = useState({
    title: task.title,
    description: task.description ?? '',
    priority: task.priority,
    status: task.status,
    due_date: task.due_date?.split('T')[0] ?? '',
  })

  useEffect(() => {
    getQuotesList().then(q => setQuotes(q as any[]))
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (quoteRef.current && !quoteRef.current.contains(e.target as Node)) setShowQuoteList(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filteredQuotes = quotes.filter(q =>
    !quoteSearch ||
    String(q.number).includes(quoteSearch) ||
    q.client_name?.toLowerCase().includes(quoteSearch.toLowerCase())
  )

  const selectQuote = (q: { id: string; number: number; client_name: string }) => {
    setQuoteId(q.id)
    setQuoteSearch(`#${q.number} · ${q.client_name}`)
    setShowQuoteList(false)
  }

  const clearQuote = () => { setQuoteId(''); setQuoteSearch('') }

  const getTodayString = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  const handleSubmit = async () => {
    if (!form.title.trim()) { toast.error('ERRO', 'Título é obrigatório'); return }
    setLoading(true)
    const result = await updateTask(task.id, {
      title: form.title, description: form.description || undefined,
      priority: form.priority, status: form.status,
      due_date: form.due_date || getTodayString(),
      quote_id: quoteId || null,
    })
    setLoading(false)
    if (result?.error) toast.error('OCORREU UM ERRO', 'Não foi possível salvar as alterações.')
    else { toast.success('TUDO CERTO!', 'Tarefa atualizada com sucesso.'); onSuccess() }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-surface-border px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-base font-semibold text-gray-900">Editar Tarefa</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">

          {/* Título */}
          <div>
            <label className="label">Título *</label>
            <input type="text" value={form.title} onChange={e => setForm({...form, title: e.target.value})}
              placeholder="Digite o título da tarefa" className="input mt-1" />
          </div>

          {/* Descrição */}
          <div>
            <label className="label">Descrição</label>
            <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
              placeholder="Descrição detalhada (opcional)" rows={3}
              className="input mt-1 resize-none" />
          </div>

          {/* Prioridade + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Prioridade</label>
              <div className="flex gap-1.5 mt-1">
                {(['high','mid','low'] as const).map(p => (
                  <button key={p} type="button" onClick={() => setForm({...form, priority: p})}
                    className={cn('flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center justify-center gap-1',
                      form.priority === p
                        ? p === 'high' ? 'bg-red-100 text-red-700 border-red-300'
                          : p === 'mid' ? 'bg-amber-100 text-amber-700 border-amber-300'
                          : 'bg-gray-100 text-gray-600 border-gray-300'
                        : 'bg-white text-gray-400 border-surface-border hover:border-gray-300'
                    )}>
                    <span className={cn('w-2 h-2 rounded-full', p === 'high' ? 'bg-red-500' : p === 'mid' ? 'bg-amber-400' : 'bg-gray-400')} />
                    {p === 'high' ? 'Alta' : p === 'mid' ? 'Média' : 'Baixa'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Status</label>
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                {([
                  ['todo',    'A fazer',      'bg-slate-100 text-slate-600 border-slate-200'],
                  ['doing',   'Em andamento', 'bg-blue-100 text-blue-700 border-blue-200'],
                  ['pending', 'Pausada',      'bg-amber-100 text-amber-700 border-amber-200'],
                  ['done',    'Concluído',    'bg-green-100 text-green-700 border-green-200'],
                ] as const).map(([val, lbl, active]) => (
                  <button key={val} type="button" onClick={() => setForm({...form, status: val})}
                    className={cn('py-1.5 rounded-lg text-xs font-semibold border transition-all',
                      form.status === val ? active : 'bg-white text-gray-400 border-surface-border hover:border-gray-300'
                    )}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Data de vencimento */}
          <div>
            <label className="label">Data de vencimento</label>
            <input type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} className="input mt-1" />
          </div>

          {/* Orçamento */}
          <div>
            <label className="label">Orçamento (opcional)</label>
            <div ref={quoteRef} className="relative mt-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={quoteSearch}
                  onChange={e => { setQuoteSearch(e.target.value); setQuoteId(''); setShowQuoteList(true) }}
                  onFocus={() => setShowQuoteList(true)}
                  placeholder="Buscar por número ou cliente..."
                  className="input pl-9 pr-8"
                />
                {quoteId ? (
                  <button onClick={clearQuote} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                )}
              </div>
              {showQuoteList && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-surface-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-surface-border cursor-pointer hover:bg-gray-50"
                    onClick={clearQuote}>— Nenhum orçamento —</div>
                  {filteredQuotes.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-gray-400">Nenhum resultado</div>
                  ) : filteredQuotes.slice(0, 50).map(q => (
                    <div key={q.id} onClick={() => selectQuote(q)}
                      className="px-3 py-2 text-sm hover:bg-brand-50 cursor-pointer flex items-center gap-2">
                      <span className="text-xs font-semibold text-brand-600 shrink-0">#{q.number}</span>
                      <span className="text-gray-700 truncate">{q.client_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-surface-border px-6 py-4 flex gap-2 rounded-b-2xl">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={handleSubmit} disabled={loading} className="btn-primary flex-1">
            {loading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
