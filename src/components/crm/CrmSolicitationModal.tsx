'use client'

import { useState, useMemo } from 'react'
import { X, Loader2, FileText, Plus, Check, Image, FileAudio, MapPin, User, File, AlignLeft, ChevronRight, ChevronLeft, Tag, Folder } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import {
  listSolicitationsForCrmContact,
  createSolicitationFromCrm,
  linkCrmMessagesToSolicitationStage,
  type CrmSolicitation,
  type SolicMessageLink,
} from '@/lib/crm-actions'

// ── Tipos de campo ────────────────────────────────────────────────────────

type LinkField = 'file' | 'observation' | 'location' | 'contact'

const FIELD_LABELS: Record<LinkField, string> = {
  file: 'Arquivo',
  observation: 'Observação',
  location: 'Localização',
  contact: 'Contato',
}

const FIELD_ICONS: Record<LinkField, React.ReactNode> = {
  file: <File className="w-3.5 h-3.5" />,
  observation: <AlignLeft className="w-3.5 h-3.5" />,
  location: <MapPin className="w-3.5 h-3.5" />,
  contact: <User className="w-3.5 h-3.5" />,
}

function defaultField(messageType: string): LinkField {
  if (['image', 'video', 'document', 'audio'].includes(messageType)) return 'file'
  if (messageType === 'location') return 'location'
  if (messageType === 'contact') return 'contact'
  return 'observation'
}

// ── Etapas ────────────────────────────────────────────────────────────────

const STAGES = [
  { id: 'visita', label: 'Visita', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { id: 'projeto', label: 'Projeto', color: 'bg-indigo-100 text-indigo-900 border-indigo-300' },
  { id: 'orcamento', label: 'Orçamento', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  { id: 'negociacao', label: 'Negociação', color: 'bg-amber-100 text-amber-900 border-amber-300' },
  { id: 'compra', label: 'Compra', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  { id: 'expedicao', label: 'Separação e entrega', color: 'bg-orange-100 text-orange-900 border-orange-300' },
  { id: 'instalacao', label: 'Instalação', color: 'bg-sky-100 text-sky-800 border-sky-200' },
  { id: 'posVenda', label: 'Pós-venda', color: 'bg-sky-100 text-sky-900 border-sky-300' },
]

// ── Props do modal ────────────────────────────────────────────────────────

export interface SolicMsg {
  id: string
  direction: 'inbound' | 'outbound'
  message_type: string
  body: string | null
  file_name: string | null
  mime_type: string | null
  is_system: boolean
  deleted_at: string | null
  created_at: string
  participant_name: string | null
  sender_name: string | null
}

interface Props {
  contactId: string
  contactName: string
  messages: SolicMsg[]
  onClose: () => void
  onLinked: (solicitationId: string, solicitationNumber: number) => void
}

// ── Modal principal ───────────────────────────────────────────────────────

export function CrmSolicitationModal({ contactId, contactName, messages, onClose, onLinked }: Props) {
  const toast = useToast()

  // step: 'solicitation' | 'stage' | 'messages'
  const [step, setStep] = useState<'solicitation' | 'stage' | 'messages'>('solicitation')

  // step 1 - solicitation
  const [solicitations, setSolicitations] = useState<CrmSolicitation[] | null>(null)
  const [loadingSolics, setLoadingSolics] = useState(false)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [chosenSolic, setChosenSolic] = useState<{ id: string; number: number } | null>(null)

  // step 2 - stage
  const [chosenStage, setChosenStage] = useState<string | null>(null)

  // step 3 - messages
  const [selected, setSelected] = useState<Map<string, LinkField>>(new Map())
  const [saving, setSaving] = useState(false)

  // Filtra mensagens que fazem sentido para vincular (não sistema, não apagadas)
  const attachable = useMemo(() =>
    messages.filter((m) =>
      !m.is_system &&
      !m.deleted_at &&
      m.message_type !== 'reaction' &&
      m.message_type !== 'ephemeral'
    ).slice(-80) // últimas 80 mensagens
  , [messages])

  // Carrega solicitations do contato quando chega no step 1
  function loadSolics() {
    if (loadedOnce) return
    setLoadingSolics(true)
    setLoadedOnce(true)
    listSolicitationsForCrmContact(contactId)
      .then((rows) => { setSolicitations(rows); setLoadingSolics(false) })
      .catch(() => { setSolicitations([]); setLoadingSolics(false) })
  }

  // Inicializa o step 1 na primeira renderização
  if (!loadedOnce) loadSolics()

  // ── Step 1: criar nova solicitation ─────────────────────────────────────
  async function handleCreateNew() {
    if (!newTitle.trim()) return
    setCreating(true)
    const r = await createSolicitationFromCrm({ contactId, title: newTitle.trim(), stage: 'visita' })
    setCreating(false)
    if ('error' in r) { toast.error('ERRO', r.error); return }
    setChosenSolic({ id: r.id, number: r.number })
    setStep('stage')
  }

  function pickExisting(s: CrmSolicitation) {
    setChosenSolic({ id: s.id, number: s.number })
    setStep('stage')
  }

  // ── Step 2: escolher etapa ───────────────────────────────────────────────
  function pickStage(id: string) {
    setChosenStage(id)
    setStep('messages')
  }

  // ── Step 3: toggles ──────────────────────────────────────────────────────
  function toggleMsg(msg: SolicMsg) {
    setSelected((m) => {
      const n = new Map(m)
      if (n.has(msg.id)) { n.delete(msg.id); return n }
      n.set(msg.id, defaultField(msg.message_type))
      return n
    })
  }

  function setField(msgId: string, field: LinkField) {
    setSelected((m) => { const n = new Map(m); n.set(msgId, field); return n })
  }

  // ── Salvar ───────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!chosenSolic || !chosenStage || !selected.size) return
    setSaving(true)
    const links: SolicMessageLink[] = Array.from(selected.entries()).map(([messageId, field]) => ({ messageId, field }))
    const r = await linkCrmMessagesToSolicitationStage({ solicitationId: chosenSolic.id, stage: chosenStage, links })
    setSaving(false)
    if ('error' in r) { toast.error('ERRO', r.error); return }
    toast.success('VINCULADO!', `${links.length} mensagem${links.length > 1 ? 's vinculadas' : ' vinculada'} à Solicitação #${chosenSolic.number}`)
    onLinked(chosenSolic.id, chosenSolic.number)
  }

  // ── Renderização ─────────────────────────────────────────────────────────
  const stageObj = STAGES.find((s) => s.id === chosenStage)

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label="Registrar solicitação" className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh]">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            {step !== 'solicitation' && (
              <button onClick={() => { if (step === 'messages') setStep('stage'); else setStep('solicitation') }} className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <Folder className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-gray-900">
              {step === 'solicitation' ? 'Registrar solicitação' : step === 'stage' ? 'Escolher etapa' : 'Selecionar mensagens'}
            </h3>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Breadcrumb de progresso */}
        <div className="flex items-center gap-1.5 px-5 pb-3 shrink-0 text-xs text-gray-400">
          <span className={step === 'solicitation' ? 'text-indigo-700 font-medium' : 'text-gray-400'}>Solicitação</span>
          <ChevronRight className="w-3 h-3" />
          <span className={step === 'stage' ? 'text-indigo-700 font-medium' : 'text-gray-400'}>Etapa</span>
          <ChevronRight className="w-3 h-3" />
          <span className={step === 'messages' ? 'text-indigo-700 font-medium' : 'text-gray-400'}>Mensagens</span>
        </div>

        {/* Conteúdo por step */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 min-h-0">

          {/* ── Step 1: Solicitation ── */}
          {step === 'solicitation' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Contato: <span className="font-medium text-gray-800">{contactName}</span></p>

              {/* Nova solicitação */}
              <div className="border border-gray-200 rounded-xl p-3 space-y-2">
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
              </div>

              {/* Solicitações existentes */}
              {loadingSolics && (
                <div className="flex items-center justify-center py-6 text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando…
                </div>
              )}
              {solicitations && solicitations.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-1">Solicitações existentes</p>
                  {solicitations.map((s) => {
                    const stageObj = STAGES.find((st) => st.id === s.work_stage)
                    return (
                      <button key={s.id} onClick={() => pickExisting(s)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-left">
                        <span className="shrink-0 w-9 h-9 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center justify-center">
                          #{s.number}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-gray-900 truncate">{s.title || `Solicitação #${s.number}`}</span>
                          {stageObj && (
                            <span className={cn('inline-flex items-center text-[11px] font-medium px-1.5 py-0.5 rounded border mt-0.5', stageObj.color)}>
                              {stageObj.label}
                            </span>
                          )}
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                      </button>
                    )
                  })}
                </div>
              )}
              {solicitations && solicitations.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Nenhuma solicitação vinculada a este contato ainda.</p>
              )}
            </div>
          )}

          {/* ── Step 2: Stage ── */}
          {step === 'stage' && (
            <div className="space-y-2">
              <p className="text-sm text-gray-500 mb-3">
                Solicitação <span className="font-semibold text-gray-800">#{chosenSolic?.number}</span> — em qual etapa ficam essas informações?
              </p>
              {STAGES.map((s) => (
                <button key={s.id} onClick={() => pickStage(s.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 text-left">
                  <span className={cn('inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border', s.color)}>
                    {s.label}
                  </span>
                  <span className="flex-1" />
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>
              ))}
            </div>
          )}

          {/* ── Step 3: Messages ── */}
          {step === 'messages' && (
            <div className="space-y-1">
              <p className="text-sm text-gray-500 mb-3">
                Etapa: {stageObj && <span className={cn('inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border ml-1', stageObj.color)}>{stageObj.label}</span>}
              </p>
              {attachable.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">Nenhuma mensagem disponível para vincular.</p>
              )}
              {attachable.map((msg) => {
                const isSelected = selected.has(msg.id)
                const field = selected.get(msg.id) ?? defaultField(msg.message_type)
                const preview = msgPreview(msg)
                const isMedia = ['image', 'video', 'document', 'audio'].includes(msg.message_type)
                const time = new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                const label = msg.direction === 'outbound'
                  ? (msg.sender_name ?? 'Nós')
                  : (msg.participant_name ?? 'Contato')

                return (
                  <div key={msg.id} className={cn('rounded-xl border transition-colors', isSelected ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white')}>
                    <button
                      onClick={() => toggleMsg(msg)}
                      className="w-full flex items-start gap-3 px-3 py-2.5 text-left"
                    >
                      {/* Checkbox */}
                      <span className={cn('mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center', isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300')}>
                        {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                      </span>
                      {/* Ícone de tipo */}
                      <span className="mt-0.5 shrink-0 text-gray-400">
                        {msgIcon(msg.message_type)}
                      </span>
                      {/* Conteúdo */}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="text-xs font-medium text-gray-500 truncate">{label}</span>
                          <span className="text-[11px] text-gray-400 shrink-0">{time}</span>
                        </span>
                        <span className="block text-sm text-gray-800 truncate">{preview}</span>
                      </span>
                    </button>

                    {/* Selector de campo (apenas quando selecionado) */}
                    {isSelected && (
                      <div className="px-3 pb-2.5 flex items-center gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
                        <Tag className="w-3.5 h-3.5 text-gray-400 mr-0.5" />
                        {((['file', 'observation', 'location', 'contact'] as LinkField[])
                          .filter((f) => {
                            // só mostra opções que fazem sentido para o tipo de mensagem
                            if (f === 'location' && msg.message_type !== 'location') return false
                            if (f === 'contact' && msg.message_type !== 'contact') return false
                            if (f === 'file' && !isMedia) return false
                            return true
                          })
                          .concat(
                            // sempre inclui o campo padrão e 'observation'
                            ['observation' as LinkField]
                          )
                          // dedupe
                          .filter((v, i, a) => a.indexOf(v) === i)
                        ).map((f) => (
                          <button key={f} onClick={() => setField(msg.id, f)}
                            className={cn('inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full border transition-colors',
                              field === f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
                            )}>
                            {FIELD_ICONS[f]}{FIELD_LABELS[f]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer com botão de salvar */}
        {step === 'messages' && (
          <div className="shrink-0 px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
            <span className="text-sm text-gray-500">
              {selected.size > 0
                ? `${selected.size} mensagem${selected.size > 1 ? 's' : ''} selecionada${selected.size > 1 ? 's' : ''}`
                : 'Selecione as mensagens'}
            </span>
            <button
              disabled={!selected.size || saving}
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Registrar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────

function msgPreview(msg: SolicMsg): string {
  const t = msg.message_type
  if (t === 'text') return msg.body?.slice(0, 100) ?? '(sem texto)'
  if (t === 'image') return msg.file_name ?? '📷 Imagem'
  if (t === 'video') return msg.file_name ?? '🎥 Vídeo'
  if (t === 'audio') return '🎤 Áudio'
  if (t === 'document') return msg.file_name ?? '📄 Documento'
  if (t === 'location') return msg.body ?? '📍 Localização'
  if (t === 'contact') return '👤 Cartão de contato'
  if (t === 'sticker') return '🎭 Figurinha'
  return msg.body ?? `(${t})`
}

function msgIcon(messageType: string) {
  if (['image', 'video', 'sticker'].includes(messageType)) return <Image className="w-4 h-4" />
  if (messageType === 'audio') return <FileAudio className="w-4 h-4" />
  if (messageType === 'document') return <FileText className="w-4 h-4" />
  if (messageType === 'location') return <MapPin className="w-4 h-4" />
  if (messageType === 'contact') return <User className="w-4 h-4" />
  return <AlignLeft className="w-4 h-4" />
}
