'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Plus, Trash2, Clock, User, ExternalLink, Search, Loader2, Link as LinkIcon } from 'lucide-react'
import { createDocument, deleteDocument, type DocumentSummary } from '@/lib/documents/actions'
import { formatDate, cn } from '@/lib/utils'
import { useConfirm } from '@/components/ui/useConfirm'
import Link from 'next/link'

const STAGE_LABELS: Record<string, string> = {
  visita: 'Visita',
  projeto: 'Projeto',
  orcamento: 'Orçamento',
  negociacao: 'Negociação',
  compra: 'Compra',
  expedicao: 'Expedição',
  instalacao: 'Instalação',
  posVenda: 'Pós-venda',
}

function DocRow({ doc, onDelete }: { doc: DocumentSummary; onDelete: () => void }) {
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
        className="group flex items-center gap-4 px-4 py-3 rounded-xl border border-transparent hover:border-gray-100 hover:bg-gray-50 transition-all"
      >
        <div className="shrink-0 w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
          <FileText className="w-3.5 h-3.5 text-brand-500" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{doc.title || 'Sem título'}</p>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {doc.solicitation_number && (
              <span className="text-xs text-brand-600 font-medium flex items-center gap-1">
                <LinkIcon className="w-2.5 h-2.5" />
                Sol. #{doc.solicitation_number}
                {doc.stage && <span className="text-brand-400">· {STAGE_LABELS[doc.stage] ?? doc.stage}</span>}
              </span>
            )}
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" /> {timeLabel}
            </span>
            {doc.updater_name && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <User className="w-2.5 h-2.5" /> {doc.updater_name.split(' ')[0]}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleDelete}
          className="shrink-0 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
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

  // Group by date
  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86400000).toDateString()

  function getGroup(doc: DocumentSummary) {
    const d = new Date(doc.updated_at).toDateString()
    if (d === today) return 'Hoje'
    if (d === yesterday) return 'Ontem'
    return formatDate(doc.updated_at)
  }

  const groups: { label: string; docs: DocumentSummary[] }[] = []
  for (const doc of filtered) {
    const label = search.trim() ? 'Resultados' : getGroup(doc)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.docs.push(doc)
    else groups.push({ label, docs: [doc] })
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-gray-900">Documentos</h1>
        <button
          onClick={handleNew}
          disabled={creating}
          className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-sm"
        >
          {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Novo
        </button>
      </div>

      {/* Busca */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar documentos…"
          className="input w-full pl-9 text-sm py-2"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-8 h-8 text-gray-200 mx-auto mb-3" />
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
        <div className="space-y-5">
          {groups.map(group => (
            <div key={group.label}>
              <p className="text-xs font-medium text-gray-400 px-4 mb-1">{group.label}</p>
              <div>
                {group.docs.map(doc => (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    onDelete={() => setDocs(ds => ds.filter(d => d.id !== doc.id))}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
