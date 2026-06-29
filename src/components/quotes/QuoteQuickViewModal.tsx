'use client'

import { useEffect, useState } from 'react'
import { getQuoteById, getQuoteActivities } from '@/lib/actions'
import { QuoteDetail } from './QuoteDetail'
import { X, ExternalLink, Loader2 } from 'lucide-react'

export function QuoteQuickViewModal({ quoteId, onClose, onFlagChange }: { quoteId: string; onClose: () => void; onFlagChange?: () => void }) {
  const [quote, setQuote] = useState<any>(null)
  const [activities, setActivities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    Promise.all([getQuoteById(quoteId), getQuoteActivities(quoteId)]).then(([q, a]) => {
      if (!alive) return
      setQuote(q); setActivities((a as any[]) ?? []); setLoading(false)
    }).catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [quoteId])

  return (
    <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header fixo */}
        <div className="shrink-0 bg-white border-b border-surface-border px-5 py-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 truncate pr-2">
            {quote ? `Orçamento #${String(quote.number).padStart(3, '0')} · ${quote.client_name}` : 'Orçamento'}
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            <a href={`/quotes/${quoteId}`} className="btn-secondary text-xs py-1.5 gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> Abrir página
            </a>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body — rola só o conteúdo */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
          ) : quote ? (
            <QuoteDetail quote={quote} activities={activities} onFlagChange={onFlagChange} />
          ) : (
            <p className="text-center py-24 text-sm text-gray-400">Orçamento não encontrado</p>
          )}
        </div>
      </div>
    </div>
  )
}
