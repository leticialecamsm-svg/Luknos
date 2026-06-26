'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getActiveUsers, getCurrentUser } from '@/lib/actions'
import { QuoteForm } from './QuoteForm'
import { X, Loader2 } from 'lucide-react'

export function NewQuoteModal({ onClose, onCreated }: { onClose: () => void; onCreated?: (id?: string) => void }) {
  const router = useRouter()
  const [users, setUsers] = useState<any[]>([])
  const [uid, setUid] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    Promise.all([getActiveUsers(), getCurrentUser()]).then(([u, me]) => {
      if (!alive) return
      setUsers(u as any[]); setUid((me as any)?.id ?? ''); setLoading(false)
    }).catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  function handleSuccess(id?: string) {
    onClose()
    if (onCreated) onCreated(id)
    else if (id) { router.push(`/quotes/${id}`); router.refresh() }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="shrink-0 bg-white border-b border-surface-border px-5 py-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Novo orçamento</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
          ) : (
            <QuoteForm users={users} currentUserId={uid} inModal onCancel={onClose} onSuccess={handleSuccess} />
          )}
        </div>
      </div>
    </div>
  )
}
