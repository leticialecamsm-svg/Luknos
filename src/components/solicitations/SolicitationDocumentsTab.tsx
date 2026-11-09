'use client'

import { useState, useEffect } from 'react'
import { FileText, Plus, Clock, Loader2, ExternalLink } from 'lucide-react'
import { createDocument, getDocuments, type DocumentSummary } from '@/lib/documents/actions'
import { formatDate } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export function SolicitationDocumentsTab({ solicitationId }: { solicitationId: string }) {
  const router = useRouter()
  const [docs, setDocs] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => { load() }, [solicitationId])

  async function load() {
    setLoading(true)
    const data = await getDocuments(solicitationId)
    setDocs(data)
    setLoading(false)
  }

  async function handleNew() {
    setCreating(true)
    const res = await createDocument({ solicitation_id: solicitationId })
    setCreating(false)
    if ('error' in res) return
    router.push(`/documentos/${res.id}`)
  }

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{docs.length} {docs.length === 1 ? 'documento' : 'documentos'}</span>
        <button
          onClick={handleNew}
          disabled={creating}
          className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Novo documento
        </button>
      </div>

      {docs.length === 0 ? (
        <div className="text-center py-10">
          <FileText className="w-8 h-8 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400 mb-4">Nenhum documento vinculado a esta solicitação.</p>
          <button onClick={handleNew} disabled={creating} className="btn-secondary text-sm px-4 py-2">
            Criar documento
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => {
            const updatedAt = new Date(doc.updated_at)
            const isToday = new Date().toDateString() === updatedAt.toDateString()
            const timeLabel = isToday
              ? updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              : formatDate(doc.updated_at)

            return (
              <Link
                key={doc.id}
                href={`/documentos/${doc.id}`}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 bg-white hover:border-brand-200 hover:shadow-sm transition-all group"
              >
                <div className="shrink-0 w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
                  <FileText className="w-3.5 h-3.5 text-brand-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{doc.title || 'Sem título'}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                    <Clock className="w-2.5 h-2.5" />
                    <span>{timeLabel}</span>
                    {doc.updater_name && <span>· {doc.updater_name.split(' ')[0]}</span>}
                  </div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-gray-300 group-hover:text-brand-500 transition-colors" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
