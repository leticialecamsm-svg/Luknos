'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Plus, Trash2, Clock, User, ExternalLink, Search, Loader2 } from 'lucide-react'
import { createDocument, deleteDocument, type DocumentSummary } from '@/lib/documents/actions'
import { formatDate, cn } from '@/lib/utils'
import { useConfirm } from '@/components/ui/useConfirm'
import Link from 'next/link'

function DocCard({ doc, onDelete }: { doc: DocumentSummary; onDelete: () => void }) {
  const { confirm, ConfirmDialog } = useConfirm()

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    const yes = await confirm(`Excluir "${doc.title}"? Essa ação não pode ser desfeita.`, 'Excluir')
    if (!yes) return
    await deleteDocument(doc.id)
    onDelete()
  }

  const updatedAt = new Date(doc.updated_at)
  const isToday = new Date().toDateString() === updatedAt.toDateString()
  const timeLabel = isToday
    ? updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : formatDate(doc.updated_at)

  return (
    <>
      <Link
        href={`/documentos/${doc.id}`}
        className="group flex items-start gap-3 p-4 rounded-xl border border-gray-100 bg-white hover:border-brand-200 hover:shadow-sm transition-all"
      >
        <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center">
          <FileText className="w-4 h-4 text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{doc.title || 'Sem título'}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
            {doc.solicitation_number && (
              <span className="text-brand-600 font-medium">
                Sol. #{doc.solicitation_number}{doc.solicitation_title ? ` · ${doc.solicitation_title}` : ''}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {timeLabel}
            </span>
            {doc.updater_name && (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" /> {doc.updater_name.split(' ')[0]}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          className="shrink-0 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </Link>
      {ConfirmDialog}
    </>
  )
}

export function DocumentsClient({ initialDocs }: { initialDocs: DocumentSummary[] }) {
  const router = useRouter()
  const [docs, setDocs] = useState(initialDocs)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')

  async function handleNew() {
    setCreating(true)
    const res = await createDocument({ title: 'Sem título' })
    setCreating(false)
    if ('error' in res) return
    router.push(`/documentos/${res.id}`)
  }

  const filtered = search.trim()
    ? docs.filter(d =>
        d.title.toLowerCase().includes(search.toLowerCase()) ||
        (d.solicitation_title ?? '').toLowerCase().includes(search.toLowerCase()) ||
        String(d.solicitation_number ?? '').includes(search)
      )
    : docs

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Documentos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Notas, anotações e documentos internos</p>
        </div>
        <button
          onClick={handleNew}
          disabled={creating}
          className="btn-primary flex items-center gap-2 px-4 py-2 text-sm"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Novo documento
        </button>
      </div>

      <div className="relative mb-5">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por título ou solicitação..."
          className="input w-full pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">
            {search ? 'Nenhum documento encontrado' : 'Nenhum documento ainda'}
          </p>
          {!search && (
            <button onClick={handleNew} disabled={creating} className="btn-secondary mt-4 text-sm px-4 py-2">
              Criar primeiro documento
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(doc => (
            <DocCard
              key={doc.id}
              doc={doc}
              onDelete={() => setDocs(ds => ds.filter(d => d.id !== doc.id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}
