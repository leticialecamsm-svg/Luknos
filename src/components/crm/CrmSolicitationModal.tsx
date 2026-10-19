'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, Plus, ChevronRight, ChevronLeft, Folder, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import {
  listSolicitationsForCrmContact,
  searchSolicitationsForCrm,
  createSolicitationFromCrm,
  type CrmSolicitation,
} from '@/lib/crm-actions'

function SolicRow({ s, contactId, onPick }: { s: CrmSolicitation; contactId: string | null; onPick: (s: CrmSolicitation) => void }) {
  const stageObj = SOLIC_STAGES.find((st) => st.id === s.work_stage)
  const relation = !contactId ? null : s.client_id === contactId ? 'Cliente' : s.architect_id === contactId ? 'Arquiteto(a)' : null
  return (
    <button onClick={() => onPick(s)}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-left">
      <span className="shrink-0 w-9 h-9 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center justify-center">
        #{s.number}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-gray-900 truncate">{s.title || `Solicitação #${s.number}`}</span>
        <span className="block text-xs text-gray-500 truncate">
          {s.client_name ? `Cliente: ${s.client_name}` : 'Sem cliente'}
          {s.architect_name ? ` · Arq.: ${s.architect_name}` : ''}
        </span>
        <span className="flex items-center gap-1 mt-0.5">
          {stageObj && (
            <span className={cn('inline-flex items-center text-[11px] font-medium px-1.5 py-0.5 rounded border', stageObj.color)}>
              {stageObj.label}
            </span>
          )}
          {relation && (
            <span className="inline-flex items-center text-[11px] font-medium px-1.5 py-0.5 rounded border bg-gray-50 text-gray-600 border-gray-200">
              Este contato é {relation.toLowerCase()}
            </span>
          )}
        </span>
      </span>
      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
    </button>
  )
}

// ── Etapas ────────────────────────────────────────────────────────────────

export const SOLIC_STAGES = [
  { id: 'visita', label: 'Visita', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { id: 'projeto', label: 'Projeto', color: 'bg-indigo-100 text-indigo-900 border-indigo-300' },
  { id: 'orcamento', label: 'Orçamento', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  { id: 'negociacao', label: 'Negociação', color: 'bg-amber-100 text-amber-900 border-amber-300' },
  { id: 'compra', label: 'Compra', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  { id: 'expedicao', label: 'Separação e entrega', color: 'bg-orange-100 text-orange-900 border-orange-300' },
  { id: 'instalacao', label: 'Instalação', color: 'bg-sky-100 text-sky-800 border-sky-200' },
  { id: 'posVenda', label: 'Pós-venda', color: 'bg-sky-100 text-sky-900 border-sky-300' },
]

export interface SolicSelection {
  solicitationId: string
  solicitationNumber: number
  stage: string
  stageLabel: string
}

interface Props {
  contactId: string | null
  contactName: string
  onClose: () => void
  onStartSelecting: (sel: SolicSelection) => void
}

export function CrmSolicitationModal({ contactId, contactName, onClose, onStartSelecting }: Props) {
  const toast = useToast()

  const [step, setStep] = useState<'solicitation' | 'stage'>('solicitation')
  const [solicitations, setSolicitations] = useState<CrmSolicitation[] | null>(null)
  const [loadingSolics, setLoadingSolics] = useState(false)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [chosenSolic, setChosenSolic] = useState<{ id: string; number: number; workStage?: string | null; label?: string } | null>(null)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<CrmSolicitation[] | null>(null)
  const [searching, setSearching] = useState(false)

  function loadSolics() {
    if (loadedOnce) return
    if (!contactId) { setLoadedOnce(true); setSolicitations([]); return }
    setLoadingSolics(true)
    setLoadedOnce(true)
    listSolicitationsForCrmContact(contactId)
      .then((rows) => { setSolicitations(rows); setLoadingSolics(false) })
      .catch(() => { setSolicitations([]); setLoadingSolics(false) })
  }

  if (!loadedOnce) loadSolics()

  useEffect(() => {
    const q = search.trim()
    if (!q) { setResults(null); setSearching(false); return }
    setSearching(true)
    let alive = true
    const t = setTimeout(() => {
      searchSolicitationsForCrm(q)
        .then((rows) => { if (alive) setResults(rows) })
        .catch(() => { if (alive) setResults([]) })
        .finally(() => { if (alive) setSearching(false) })
    }, 300)
    return () => { alive = false; clearTimeout(t) }
  }, [search])

  async function handleCreateNew() {
    if (!newTitle.trim() || !contactId) return
    setCreating(true)
    const r = await createSolicitationFromCrm({ contactId, title: newTitle.trim(), stage: 'visita' })
    setCreating(false)
    if ('error' in r) { toast.error('ERRO', r.error); return }
    setChosenSolic({ id: r.id, number: r.number })
    setStep('stage')
  }

  function pickExisting(s: CrmSolicitation) {
    setChosenSolic({ id: s.id, number: s.number, workStage: s.work_stage, label: [s.title, s.client_name].filter(Boolean).join(' · ') })
    setStep('stage')
  }

  function pickStage(stageId: string, stageLabel: string) {
    if (!chosenSolic) return
    onStartSelecting({ solicitationId: chosenSolic.id, solicitationNumber: chosenSolic.number, stage: stageId, stageLabel })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label="Registrar solicitação" className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[85vh]">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            {step === 'stage' && (
              <button onClick={() => setStep('solicitation')} className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <Folder className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-gray-900">
              {step === 'solicitation' ? 'Registrar solicitação' : 'Escolher etapa'}
            </h3>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Indicador de passo */}
        <div className="flex items-center gap-1.5 px-5 pb-3 shrink-0 text-xs text-gray-400">
          <span className={step === 'solicitation' ? 'text-indigo-700 font-medium' : 'text-gray-400'}>1. Solicitação</span>
          <ChevronRight className="w-3 h-3" />
          <span className={step === 'stage' ? 'text-indigo-700 font-medium' : 'text-gray-400'}>2. Etapa</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-300">3. Selecionar na conversa</span>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 min-h-0">

          {/* ── Step 1: Solicitation ── */}
          {step === 'solicitation' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Contato: <span className="font-medium text-gray-800">{contactName}</span></p>

              {contactId && <div className="border border-gray-200 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nova solicitação</p>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateNew() }}
                  placeholder="Ex: Sala de estar, Hall de entrada…"
                  className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <button
                  disabled={!newTitle.trim() || creating}
                  onClick={handleCreateNew}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Criar e continuar
                </button>
              </div>}

              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar outra solicitação: nº, título, cliente ou arquiteto"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              {search.trim() ? (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-1">Resultados da busca</p>
                  {searching && (
                    <div className="flex items-center justify-center py-4 text-gray-400 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Buscando…
                    </div>
                  )}
                  {!searching && results?.map((s) => <SolicRow key={s.id} s={s} contactId={contactId} onPick={pickExisting} />)}
                  {!searching && results?.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">Nenhuma solicitação encontrada.</p>
                  )}
                </div>
              ) : (
                <>
                  {loadingSolics && (
                    <div className="flex items-center justify-center py-6 text-gray-400">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando…
                    </div>
                  )}
                  {solicitations && solicitations.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-1">Solicitações deste contato</p>
                      {solicitations.map((s) => <SolicRow key={s.id} s={s} contactId={contactId} onPick={pickExisting} />)}
                    </div>
                  )}
                  {solicitations && solicitations.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">{contactId ? 'Este contato não é cliente nem arquiteto de nenhuma solicitação. Use a busca acima para registrar em outra.' : 'Busque acima a solicitação onde registrar estas mensagens.'}</p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Step 2: Stage ── */}
          {step === 'stage' && (
            <div className="space-y-2">
              <p className="text-sm text-gray-500 mb-3">
                Solicitação <span className="font-semibold text-gray-800">#{chosenSolic?.number}</span>
                {chosenSolic?.label && <span className="text-gray-700"> ({chosenSolic.label})</span>} — em qual etapa ficam essas informações?
              </p>
              {SOLIC_STAGES.map((s) => (
                <button key={s.id} onClick={() => pickStage(s.id, s.label)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 text-left">
                  <span className={cn('inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border', s.color)}>
                    {s.label}
                  </span>
                  {chosenSolic?.workStage === s.id && <span className="text-[11px] text-gray-500">etapa atual</span>}
                  <span className="flex-1" />
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
