'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Save, Loader2, ExternalLink, Link as LinkIcon, X, ChevronDown } from 'lucide-react'
import { updateDocument, getSolicitationsList, type DocumentFull, type SolicitationOption } from '@/lib/documents/actions'
import { DocumentEditor } from '@/components/documents/DocumentEditor'
import { formatDate } from '@/lib/utils'
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
const STAGES = Object.entries(STAGE_LABELS)

export function DocumentDetailClient({ doc }: { doc: DocumentFull }) {
  const router = useRouter()
  const [title, setTitle] = useState(doc.title)
  const [content, setContent] = useState<any>(doc.content)
  const [solicitationId, setSolicitationId] = useState<string | null>(doc.solicitation_id)
  const [solicitationNumber, setSolicitationNumber] = useState<number | null>(doc.solicitation_number)
  const [solicitationTitle, setSolicitationTitle] = useState<string | null>(doc.solicitation_title)
  const [stage, setStage] = useState<string | null>(doc.stage)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  // Solicitation picker state
  const [solPickerOpen, setSolPickerOpen] = useState(false)
  const [solList, setSolList] = useState<SolicitationOption[]>([])
  const [solSearch, setSolSearch] = useState('')
  const [solLoading, setSolLoading] = useState(false)

  async function openSolPicker() {
    setSolPickerOpen(true)
    if (solList.length === 0) {
      setSolLoading(true)
      const list = await getSolicitationsList()
      setSolList(list)
      setSolLoading(false)
    }
  }

  function selectSolicitation(sol: SolicitationOption) {
    setSolicitationId(sol.id)
    setSolicitationNumber(sol.number)
    setSolicitationTitle(sol.title)
    setSolPickerOpen(false)
    setSolSearch('')
    setIsDirty(true)
  }

  function clearSolicitation() {
    setSolicitationId(null)
    setSolicitationNumber(null)
    setSolicitationTitle(null)
    setStage(null)
    setIsDirty(true)
  }

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTitle(e.target.value)
    setIsDirty(true)
  }

  function handleContentChange(json: any) {
    setContent(json)
    setIsDirty(true)
  }

  async function handleSave() {
    setSaving(true)
    await updateDocument(doc.id, {
      title,
      content,
      solicitation_id: solicitationId,
      stage,
    })
    setSaving(false)
    setSaved(true)
    setIsDirty(false)
    setTimeout(() => setSaved(false), 2500)
  }

  const filteredSols = solSearch.trim()
    ? solList.filter(s =>
        String(s.number).includes(solSearch) ||
        (s.title ?? '').toLowerCase().includes(solSearch.toLowerCase()) ||
        (s.client_name ?? '').toLowerCase().includes(solSearch.toLowerCase())
      )
    : solList

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
          <span className="text-xs text-gray-400">
            {saved ? (
              <span className="text-green-600 font-medium">Salvo</span>
            ) : isDirty ? (
              <span className="text-amber-500">Alterações não salvas</span>
            ) : (
              <span>Editado {timeLabel}{doc.updater_name ? ` por ${doc.updater_name.split(' ')[0]}` : ''}</span>
            )}
          </span>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-brand-600 text-white hover:bg-brand-700 disabled:bg-gray-200 disabled:text-gray-400"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Salvar
        </button>
      </div>

      {/* Título */}
      <input
        value={title}
        onChange={handleTitleChange}
        placeholder="Título do documento"
        className="w-full text-2xl font-bold text-gray-900 bg-transparent border-none outline-none mb-4 placeholder:text-gray-300"
      />

      {/* Metadados + vínculo com solicitação */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-400 mb-5 pb-5 border-b border-gray-100">
        {doc.creator_name && (
          <span>Criado por <span className="text-gray-600">{doc.creator_name.split(' ')[0]}</span></span>
        )}
        <span>em {formatDate(doc.created_at)}</span>

        {/* Vínculo com solicitação */}
        <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          {solicitationId ? (
            <>
              <Link
                href={`/solicitacoes/${solicitationId}`}
                className="flex items-center gap-1.5 text-brand-600 hover:text-brand-700 font-medium border border-brand-200 rounded-full px-3 py-1 bg-brand-50 hover:bg-brand-100 transition-colors"
              >
                <LinkIcon className="w-3 h-3" />
                Sol. #{solicitationNumber}{solicitationTitle ? ` · ${solicitationTitle}` : ''}
                <ExternalLink className="w-3 h-3" />
              </Link>

              {/* Seletor de etapa */}
              <div className="relative">
                <select
                  value={stage ?? ''}
                  onChange={e => { setStage(e.target.value || null); setIsDirty(true) }}
                  className="appearance-none text-xs border border-gray-200 rounded-full px-3 py-1 pr-6 bg-white text-gray-600 hover:border-gray-300 cursor-pointer outline-none"
                >
                  <option value="">Sem etapa</option>
                  {STAGES.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
              </div>

              <button
                onClick={clearSolicitation}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title="Remover vínculo"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <div className="relative">
              <button
                onClick={openSolPicker}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-200 rounded-full px-3 py-1 hover:border-gray-300 transition-colors"
              >
                <LinkIcon className="w-3 h-3" />
                Vincular a solicitação
              </button>

              {solPickerOpen && (
                <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-2">
                  <input
                    autoFocus
                    value={solSearch}
                    onChange={e => setSolSearch(e.target.value)}
                    placeholder="Buscar por número ou cliente…"
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 mb-2 outline-none focus:border-brand-400"
                  />
                  <div className="max-h-52 overflow-y-auto space-y-0.5">
                    {solLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
                      </div>
                    ) : filteredSols.length === 0 ? (
                      <p className="text-center text-xs text-gray-400 py-4">Nenhuma solicitação encontrada</p>
                    ) : filteredSols.map(sol => (
                      <button
                        key={sol.id}
                        onClick={() => selectSolicitation(sol)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-brand-50 transition-colors"
                      >
                        <span className="text-xs font-semibold text-brand-600">#{sol.number}</span>
                        {sol.title && <span className="text-xs text-gray-700 ml-1.5">{sol.title}</span>}
                        {sol.client_name && <p className="text-xs text-gray-400 mt-0.5">{sol.client_name}</p>}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => { setSolPickerOpen(false); setSolSearch('') }}
                    className="w-full mt-1 text-xs text-gray-400 hover:text-gray-600 py-1"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
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
