'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Check, Loader2, ExternalLink, Link as LinkIcon } from 'lucide-react'
import { updateDocument, type DocumentFull } from '@/lib/documents/actions'
import { DocumentEditor } from '@/components/documents/DocumentEditor'
import { cn, formatDate } from '@/lib/utils'
import Link from 'next/link'

const AUTOSAVE_DELAY = 1500

export function DocumentDetailClient({ doc }: { doc: DocumentFull }) {
  const router = useRouter()
  const [title, setTitle] = useState(doc.title)
  const [content, setContent] = useState<any>(doc.content)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function scheduleSave(newTitle?: string, newContent?: any) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveState('saving')
    saveTimer.current = setTimeout(async () => {
      await updateDocument(doc.id, {
        title: newTitle ?? title,
        content: newContent ?? content,
      })
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    }, AUTOSAVE_DELAY)
  }

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTitle(e.target.value)
    scheduleSave(e.target.value, content)
  }

  function handleContentChange(json: any) {
    setContent(json)
    scheduleSave(title, json)
  }

  const updatedAt = new Date(doc.updated_at)
  const isToday = new Date().toDateString() === updatedAt.toDateString()
  const timeLabel = isToday
    ? `hoje às ${updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : `em ${formatDate(doc.updated_at)}`

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 mb-5">
        <Link href="/documentos" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {saveState === 'saving' && (
                <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Salvando…</span>
              )}
              {saveState === 'saved' && (
                <span className="flex items-center gap-1 text-green-600"><Check className="w-3 h-3" /> Salvo</span>
              )}
              {saveState === 'idle' && (
                <span>Editado {timeLabel}{doc.updater_name ? ` por ${doc.updater_name.split(' ')[0]}` : ''}</span>
              )}
            </span>
          </div>
        </div>
        {doc.solicitation_id && (
          <Link
            href={`/solicitacoes/${doc.solicitation_id}`}
            className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium border border-brand-200 rounded-full px-3 py-1 bg-brand-50 hover:bg-brand-100 transition-colors"
          >
            <LinkIcon className="w-3 h-3" />
            Sol. #{doc.solicitation_number}
            <ExternalLink className="w-3 h-3" />
          </Link>
        )}
      </div>

      {/* Título */}
      <input
        value={title}
        onChange={handleTitleChange}
        placeholder="Título do documento"
        className="w-full text-2xl font-bold text-gray-900 bg-transparent border-none outline-none mb-4 placeholder:text-gray-300"
      />

      {/* Metadados */}
      <div className="flex items-center gap-4 text-xs text-gray-400 mb-5 pb-5 border-b border-gray-100">
        {doc.creator_name && (
          <span>Criado por <span className="text-gray-600">{doc.creator_name.split(' ')[0]}</span></span>
        )}
        <span>em {formatDate(doc.created_at)}</span>
      </div>

      {/* Editor */}
      <DocumentEditor
        content={doc.content}
        onChange={handleContentChange}
        placeholder="Comece a escrever…"
      />
    </div>
  )
}
