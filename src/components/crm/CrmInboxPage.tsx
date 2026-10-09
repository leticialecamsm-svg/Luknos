'use client'

import { Fragment, useCallback, useEffect, useRef, useState, useTransition } from 'react'

import { getAvatarColor } from '@/lib/crm-ui'
import { InstanceFilter, useInstanceFilter } from './InstanceFilter'
import { WhatsappIcon } from './WhatsappIcon'
import { DealValue } from './DealValue'
import { ContactInfoPanel } from './ContactInfoPanel'
import { WaText } from './WaText'
import { ConvTags } from './ConvTags'
import { FollowupPopover, DUE_STYLE } from './FollowupPopover'
import { dueState, formatDue } from '@/lib/crm-followup'
import { LabelPicker } from './LabelPicker'
import { canDeleteForEveryone, messagePreview } from '@/lib/crm-preview'
import { AudioPlayer } from './AudioPlayer'
import { FileBadge } from './FileBadge'
import { MediaLightbox, type LightboxItem } from './MediaLightbox'
import { applyFormat } from '@/lib/wa-format'
import { FormatToolbar } from './FormatToolbar'
import { Avatar } from '@/components/ui/Avatar'
import {
  getCrmSnapshot,
  getCrmMessages,
  reassignConversation,
  setConversationValue,
  getConversationAccessInfo,
  shareConversation,
  unshareConversation,
  setConversationRestricted,
  markConversationRead,
  markConversationUnread,
  reactToMessage,
  type ConversationAccessInfo,
  type CrmLabel,
  getCrmLabels,
  deleteCrmMessage,
  completeFollowup,
  linkConversationContact,
  setConversationDisplayName,
  searchContactsForCrm,
  sendCrmMessage,
  getCrmAttachmentUrl,
  getConversationAttachmentUrls,
  syncCrmContactInfo,
  type ConversationRow,
} from '@/lib/crm-actions'
import { uploadCrmFile } from '@/lib/crm-upload'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { stripFormatting } from '@/lib/wa-format'
import { CRM_AWAITING_REFRESH } from '@/lib/use-crm-awaiting'
import { formatListTime } from '@/lib/crm-time'
import { setOpenConversationId } from '@/lib/crm-open-conversation'
import { subscribeCrmMessages } from '@/lib/crm-realtime'
import { GroupPicker } from './GroupPicker'
import { SendContactModal } from './SendContactModal'
import { parseContactCard, prettyPhone } from '@/lib/crm-contact-card'
import { QUICK_REACTIONS, type ReactionChip } from '@/lib/crm-reactions'
import {
  Send, Paperclip, Loader2, UserCog, Link2, Search, MessageSquareText, Inbox, Users as UsersIcon, X,
  Mic, Trash2, Square, RefreshCw, Info, Play as PlayIcon, CheckCheck, ArrowDownLeft, Reply, ChevronDown, Users as GroupIcon, CalendarClock, Lock, MailOpen, ContactRound,
} from 'lucide-react'

type ScopeTab = 'mine' | 'unassigned' | 'all' | 'groups'

interface Msg {
  id: string
  direction: 'inbound' | 'outbound'
  sender_user_id: string | null
  sender_name: string | null
  sender_avatar_url?: string | null
  sender_avatar_color?: string | null
  provider_message_id?: string | null
  reply_to_provider_id?: string | null
  reply_to_preview?: string | null
  deleted_at?: string | null
  deleted_by_name?: string | null
  reactions?: ReactionChip[]
  participant_name?: string | null
  acted_by_name?: string | null
  acted_by_avatar_url?: string | null
  acted_by_avatar_color?: string | null
  message_type: string
  body: string | null
  storage_path: string | null
  file_name: string | null
  mime_type: string | null
  is_system: boolean
  created_at: string
}

const isUnread = (c: { unread_count: number; marked_unread: boolean }) => c.unread_count > 0 || c.marked_unread

interface SystemUser { id: string; name: string; role: string; role_label?: string; has_crm?: boolean }

export function CrmInboxPage({ currentUserId, users, initialConversationId = null, actingAsName = null, isAdmin = false }: { currentUserId: string; users: SystemUser[]; initialConversationId?: string | null; actingAsName?: string | null; isAdmin?: boolean }) {
  const toast = useToast()
  const [scope, setScope] = useState<ScopeTab>(initialConversationId ? 'all' : 'mine')
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId)
  const [messages, setMessages] = useState<Msg[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingThread, setLoadingThread] = useState(false)
  const [text, setText] = useState('')
  const [pending, startTransition] = useTransition()
  const [showReassign, setShowReassign] = useState(false)
  const [showGroupPicker, setShowGroupPicker] = useState(false)
  const [showSendContact, setShowSendContact] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [attUrls, setAttUrls] = useState<Record<string, string>>({})
  const [labelCatalog, setLabelCatalog] = useState<CrmLabel[]>([])
  const [replyTo, setReplyTo] = useState<Msg | null>(null)
  const [followupOpen, setFollowupOpen] = useState(false)
  const loadLabels = useCallback(() => { getCrmLabels().then(setLabelCatalog) }, [])
  useEffect(() => { loadLabels() }, [loadLabels])
  useEffect(() => { setReplyTo(null); setFollowupOpen(false) }, [selectedId])
  const [lightboxId, setLightboxId] = useState<string | null>(null)
  const [showLinkContact, setShowLinkContact] = useState(false)
  const [contactQuery, setContactQuery] = useState('')
  const [contactResults, setContactResults] = useState<any[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [counts, setCounts] = useState({ mine: 0, unassigned: 0, all: 0, groups: 0 })
  const filter = useInstanceFilter()
  const selectedKey = filter.selected.join(',')
  const [syncingContacts, setSyncingContacts] = useState(false)

  const handleSyncContacts = () => {
    setSyncingContacts(true)
    startTransition(async () => {
      const r = await syncCrmContactInfo()
      setSyncingContacts(false)
      if ('error' in r && r.error) toast.error('ERRO', r.error)
      else {
        toast.success('SINCRONIZADO', `${r.updated ?? 0} conversa(s) atualizadas`)
        refreshList()
      }
    })
  }

  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [sendingVoice, setSendingVoice] = useState(false)
  const [previewAudio, setPreviewAudio] = useState<{ file: File; url: string } | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const recordStreamRef = useRef<MediaStream | null>(null)
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Atualizações da lista/conversa: uma por vez, sem repintar quando nada mudou e sem
  // sobrepor chamadas (as ações do servidor entram numa fila: empilhar atrasa tudo).
  const listInFlight = useRef(false)
  const listDirty = useRef(false)
  const lastListSig = useRef('')
  const refreshListRef = useRef<(silent?: boolean) => void>(() => {})
  const refreshList = useCallback((silent = false) => {
    if (!filter.loaded) return // espera saber quais WhatsApps a pessoa enxerga
    if (listInFlight.current) { listDirty.current = true; return }
    listInFlight.current = true
    if (!silent) setLoadingList(true)
    const ids = selectedKey ? selectedKey.split(',') : undefined
    window.dispatchEvent(new Event(CRM_AWAITING_REFRESH)) // atualiza o contador do menu
    getCrmSnapshot(scope, 200, ids)
      .then((r) => {
        setCounts((prev) => (JSON.stringify(prev) === JSON.stringify(r.counts) ? prev : r.counts))
        const sig = `${scope}|${selectedKey}|${JSON.stringify(r.items ?? [])}`
        if (sig !== lastListSig.current) { lastListSig.current = sig; setConversations(r.items ?? []) }
      })
      .finally(() => {
        listInFlight.current = false
        if (!silent) setLoadingList(false)
        if (listDirty.current) { listDirty.current = false; setTimeout(() => refreshListRef.current(true), 300) }
      })
  }, [scope, selectedKey, filter.loaded])
  refreshListRef.current = refreshList

  const selectedIdRef = useRef<string | null>(selectedId)
  selectedIdRef.current = selectedId
  const lastThreadSig = useRef('')
  const refreshThread = useCallback((id: string, silent = false) => {
    if (!silent) setLoadingThread(true)
    getCrmMessages(id)
      .then((r) => {
        if (selectedIdRef.current !== id) return // trocou de conversa no meio do caminho
        const items = (r.items as Msg[]) ?? []
        const sig = id + '|' + items.map((m) => `${m.id}${m.deleted_at ? 'd' : ''}${m.storage_path ? 's' : ''}${m.reactions?.map((x) => x.emoji + x.count).join('') ?? ''}`).join(',')
        if (sig !== lastThreadSig.current) { lastThreadSig.current = sig; setMessages(items) }
      })
      .finally(() => { if (!silent) setLoadingThread(false) })
  }, [])

  // Avisa o resto do sistema qual conversa está à vista (não notificar o que já se está lendo)
  useEffect(() => { setOpenConversationId(selectedId); return () => setOpenConversationId(null) }, [selectedId])

  // Ao trocar de conversa: zera a anterior e carrega a nova.
  useEffect(() => { lastThreadSig.current = ''; setMessages([]) }, [selectedId])
  useEffect(() => { refreshList() }, [refreshList])
  useEffect(() => { if (selectedId) refreshThread(selectedId) }, [selectedId, refreshThread])

  // Rolagem: abre no fim; mensagem nova só desce a tela se você já estava no fim (ou se foi
  // você quem enviou). Se você subiu para ler o histórico, a tela fica onde está.
  const threadRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const openedRef = useRef<string | null>(null)
  const prevCountRef = useRef(0)
  const [newBelow, setNewBelow] = useState(0) // mensagens que chegaram enquanto você lia o histórico
  const onThreadScroll = () => {
    const el = threadRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140
    if (stickRef.current) setNewBelow((n) => (n ? 0 : n))
  }
  useEffect(() => { openedRef.current = null; prevCountRef.current = 0; stickRef.current = true; setNewBelow(0) }, [selectedId])
  useEffect(() => {
    const el = threadRef.current
    if (!el || !messages.length) return
    const prev = prevCountRef.current
    prevCountRef.current = messages.length
    if (openedRef.current !== selectedId) {
      openedRef.current = selectedId
      el.scrollTop = el.scrollHeight
      // mídias carregam depois e empurram o conteúdo: reajusta enquanto você não rolou
      const t1 = setTimeout(() => { if (stickRef.current && threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight }, 400)
      const t2 = setTimeout(() => { if (stickRef.current && threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight }, 1500)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
    const last = messages[messages.length - 1]
    if (messages.length > prev && (stickRef.current || last.direction === 'outbound')) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    } else if (messages.length > prev) {
      setNewBelow((n) => n + (messages.length - prev))
    }
  }, [messages, selectedId])
  // URLs das mídias da conversa aberta (miniaturas, vídeos, áudios), buscadas em lote
  useEffect(() => {
    if (!selectedId) return
    const missing = messages.filter((m) => m.storage_path && !attUrls[m.storage_path]).map((m) => m.storage_path as string)
    if (missing.length === 0) return
    let alive = true
    getConversationAttachmentUrls(selectedId, missing).then((r) => {
      if (alive && r.urls && Object.keys(r.urls).length) setAttUrls((prev) => ({ ...prev, ...r.urls }))
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, selectedId])
  useEffect(() => { setLightboxId(null) }, [selectedId])

  // o campo cresce com o texto (até ~6 linhas)
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 144) + 'px'
  }, [text])

  // Atualização em tempo real (Supabase) com poucos disparos: junta eventos próximos (debounce)
  // e só recarrega a conversa aberta quando o evento é dela. O relógio é só uma rede de segurança.
  useEffect(() => {
    let listTimer: ReturnType<typeof setTimeout> | null = null
    let threadTimer: ReturnType<typeof setTimeout> | null = null
    const scheduleList = () => { if (listTimer) clearTimeout(listTimer); listTimer = setTimeout(() => refreshList(true), 700) }
    const scheduleThread = () => { if (threadTimer) clearTimeout(threadTimer); threadTimer = setTimeout(() => { if (selectedId) refreshThread(selectedId, true) }, 500) }

    const unsubscribe = subscribeCrmMessages('crm:all', '*', (payload) => {
      scheduleList()
      const cid = (payload.new as { conversation_id?: string } | null)?.conversation_id
      if (selectedId && (!cid || cid === selectedId)) scheduleThread()
    })

    const safety = setInterval(() => {
      if (document.hidden) return
      refreshList(true)
      if (selectedId) refreshThread(selectedId, true)
    }, 45000)
    const onVisible = () => {
      if (document.hidden) return
      refreshList(true)
      if (selectedId) refreshThread(selectedId, true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (listTimer) clearTimeout(listTimer)
      if (threadTimer) clearTimeout(threadTimer)
      clearInterval(safety)
      document.removeEventListener('visibilitychange', onVisible)
      unsubscribe()
    }
  }, [selectedId, refreshList, refreshThread])

  const selected = selectedId ? conversations.find((c) => c.id === selectedId) : null

  // Abrir a conversa a marca como lida; chegou mensagem com ela aberta, marca de novo.
  // O contador que ela tinha ao ser aberta fica guardado para o aviso "N mensagens não lidas".
  const openedUnreadRef = useRef<{ id: string; n: number; prev: number } | null>(null)
  useEffect(() => {
    if (!selected) return
    const cur = openedUnreadRef.current
    if (cur?.id !== selected.id) openedUnreadRef.current = { id: selected.id, n: selected.unread_count, prev: selected.unread_count }
    else {
      if (selected.unread_count > cur.prev) cur.n += selected.unread_count - cur.prev
      cur.prev = selected.unread_count
    }
    if (selected.unread_count === 0 && !selected.marked_unread) return
    markConversationRead(selected.id).then(() => refreshList(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.unread_count, selected?.marked_unread])
  useEffect(() => { if (!selectedId) openedUnreadRef.current = null }, [selectedId])

  const handleMarkUnread = () => {
    if (!selected) return
    const id = selected.id
    startTransition(async () => {
      const r = await markConversationUnread(id)
      if ('error' in r && r.error) toast.error('ERRO', r.error)
      else { toast.success('MARCADA COMO NÃO LIDA'); setSelectedId(null); refreshList(true) }
    })
  }

  const lightboxItems: LightboxItem[] = messages
    .filter((m) => (m.message_type === 'image' || m.message_type === 'video') && m.storage_path && attUrls[m.storage_path])
    .map((m) => ({ id: m.id, url: attUrls[m.storage_path as string], kind: m.message_type as 'image' | 'video', name: m.file_name }))
  // primeira mensagem do contato que ainda não tinha sido lida quando a conversa foi aberta
  const openedUnread = openedUnreadRef.current?.id === selectedId ? openedUnreadRef.current?.n ?? 0 : 0
  const firstUnreadId = (() => {
    if (!openedUnread) return null
    const inbound = messages.filter((m) => m.direction === 'inbound' && !m.is_system && !m.deleted_at)
    return inbound.length >= openedUnread ? inbound[inbound.length - openedUnread].id : inbound[0]?.id ?? null
  })()
  const lightboxIndex = lightboxId ? lightboxItems.findIndex((x) => x.id === lightboxId) : -1

  // busca por nome, telefone (3+ números) ou texto da última mensagem
  const q = query.trim().toLocaleLowerCase('pt-BR')
  const qDigits = q.replace(/\D/g, '')
  const shortDigits = /^[\d\s()+-]+$/.test(q) && qDigits.length > 0 && qDigits.length < 3
  const visibleConversations = !q ? conversations : conversations.filter((c) =>
    (c.contact_name ?? '').toLocaleLowerCase('pt-BR').includes(q) ||
    (c.last_body ?? '').toLocaleLowerCase('pt-BR').includes(q) ||
    (qDigits.length >= 3 && c.remote_jid.includes(qDigits)),
  )

  const handleFile = (files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach((file) => {
      if (!selectedId) { toast.error('ERRO', 'Escolha uma conversa primeiro'); return }
      startTransition(async () => {
        const up = await uploadCrmFile(selectedId, file)
        if (up.error) { toast.error('ERRO AO ENVIAR', up.error); return }
        const res = await sendCrmMessage({
          conversationId: selectedId,
          storagePath: up.storagePath,
          fileName: file.name,
          mimeType: file.type,
          replyToMessageId: replyTo?.id,
        })
        if (res.error) toast.error('ERRO', res.error)
        else { setReplyTo(null); refreshThread(selectedId) }
      })
    })
  }

  const handleSend = () => {
    if (!text.trim() || !selectedId) return
    const msg = text
    const reply = replyTo
    setText('')
    startTransition(async () => {
      const res = await sendCrmMessage({ conversationId: selectedId, text: msg, replyToMessageId: reply?.id })
      if (res.error) {
        toast.error('ERRO', res.error)
        setText((cur) => cur || msg) // não perde o que foi digitado
      } else { setReplyTo(null); refreshThread(selectedId) }
    })
  }

  function stopRecordingTracks() {
    recordStreamRef.current?.getTracks().forEach((t) => t.stop())
    recordStreamRef.current = null
    if (recordTimerRef.current) clearInterval(recordTimerRef.current)
    recordTimerRef.current = null
  }

  async function startRecording() {
    if (!selectedId) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recordStreamRef.current = stream
      recordedChunksRef.current = []
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t)) ?? ''
      let recorder: MediaRecorder
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream, { mimeType: 'audio/webm' })
      } catch {
        recorder = new MediaRecorder(stream)
      }
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data) }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecordSeconds(0)
      setRecording(true)
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000)
    } catch {
      toast.error('MICROFONE INDISPONÍVEL', 'Autorize o acesso ao microfone no navegador e tente de novo.')
    }
  }

  function cancelRecording() {
    mediaRecorderRef.current?.stop()
    stopRecordingTracks()
    mediaRecorderRef.current = null
    recordedChunksRef.current = []
    setRecording(false)
  }

  function finishRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder) { setRecording(false); return }
    recorder.onstop = () => {
      stopRecordingTracks()
      let mimeType = recorder.mimeType || 'audio/webm'
      if (!mimeType.startsWith('audio/')) {
        mimeType = mimeType.includes('mp4') ? 'audio/mp4' : 'audio/webm'
      }
      const blob = new Blob(recordedChunksRef.current, { type: mimeType })
      recordedChunksRef.current = []
      const ext = mimeType.includes('mp4') ? 'm4a' : 'webm'
      const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: mimeType })
      setPreviewAudio({ file, url: URL.createObjectURL(blob) })
    }
    recorder.stop()
    mediaRecorderRef.current = null
    setRecording(false)
  }

  function discardPreviewAudio() {
    if (previewAudio) URL.revokeObjectURL(previewAudio.url)
    setPreviewAudio(null)
  }

  async function sendPreviewAudio() {
    if (!previewAudio || !selectedId) return
    const { file } = previewAudio
    discardPreviewAudio()
    setSendingVoice(true)
    const up = await uploadCrmFile(selectedId, file)
    if (up.error) { toast.error('NÃO FOI POSSÍVEL ENVIAR', up.error); setSendingVoice(false); return }
    const res = await sendCrmMessage({
      conversationId: selectedId,
      storagePath: up.storagePath,
      fileName: file.name,
      mimeType: file.type,
      isVoiceNote: true,
      replyToMessageId: replyTo?.id,
    })
    setSendingVoice(false)
    if (res.error) toast.error('NÃO FOI POSSÍVEL ENVIAR', res.error)
    else { setReplyTo(null); refreshThread(selectedId) }
  }

  async function openAttachment(path: string) {
    const r = await getCrmAttachmentUrl(path)
    if ('url' in r) window.open(r.url, '_blank')
  }

  useEffect(() => {
    if (!contactQuery.trim()) { setContactResults([]); return }
    const t = setTimeout(() => { searchContactsForCrm(contactQuery).then(setContactResults) }, 300)
    return () => clearTimeout(t)
  }, [contactQuery])

  return (
    <div className="flex h-[calc(100vh-10.5rem)] gap-0 bg-white">
      {/* ──────────────────────────────────────────────────────────────────────
          SIDEBAR - Conversas
          ────────────────────────────────────────────────────────────────────── */}
      <div className="w-80 shrink-0 flex flex-col border-r border-gray-200 bg-white">
        {/* Header com tabs */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900">Conversas</h2>
            <button
              onClick={handleSyncContacts}
              disabled={syncingContacts}
              title="Sincronizar nomes e fotos dos contatos"
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('w-4 h-4', syncingContacts && 'animate-spin')} />
            </button>
          </div>
          <InstanceFilter options={filter.options} selected={filter.selected} onChange={filter.setSelected} className="mb-3" />
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar nome, telefone ou mensagem"
              aria-label="Buscar conversa"
              className="w-full pl-9 pr-8 py-2 text-sm bg-gray-100 rounded-full border-0 focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Limpar busca" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {shortDigits && <p role="status" className="text-xs text-amber-700 mb-2">Digite ao menos 3 números para buscar por telefone</p>}
          <div className="flex flex-wrap gap-1.5">
            {(['mine', 'unassigned', 'all', 'groups'] as const).map((key) => (
              <button
                key={key}
                onClick={() => setScope(key)}
                className={cn(
                  'flex-1 whitespace-nowrap px-2.5 py-1.5 text-sm font-medium rounded-full transition-colors',
                  scope === key
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                {key === 'mine' ? 'Minhas' : key === 'unassigned' ? 'Pendentes' : key === 'all' ? 'Todas' : 'Grupos'}
                {counts[key] > 0 && (
                  <span className={cn('ml-1.5 text-xs rounded-full px-1.5 py-0.5', scope === key ? 'bg-white/20' : key === 'unassigned' ? 'bg-amber-200 text-amber-900' : 'bg-gray-200 text-gray-600')}>{counts[key]}</span>
                )}
              </button>
            ))}
          </div>
          {scope === 'groups' && isAdmin && (
            <button
              onClick={() => setShowGroupPicker(true)}
              className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              <UsersIcon className="w-4 h-4" /> Escolher grupos
            </button>
          )}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {loadingList && (
            <div className="p-8 text-center">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
            </div>
          )}
          {!loadingList && visibleConversations.length === 0 && (
            <div className="text-sm text-gray-500 p-4 text-center space-y-2">
              <p>{q ? `Nenhuma conversa encontrada para “${query.trim()}”` : 'Nenhuma conversa aqui'}</p>
              {!q && scope === 'mine' && counts.unassigned > 0 && (
                <button className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 underline" onClick={() => setScope('unassigned')}>
                  Há {counts.unassigned} conversa(s) sem responsável — ver pendentes
                </button>
              )}
            </div>
          )}
          <div className="p-2 space-y-1">
            {visibleConversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  'w-full text-left p-3 rounded-lg transition-all border-l-4',
                  filter.colorOf(c.instance_id).bar,
                  selectedId === c.id
                    ? 'bg-gray-100 ring-1 ring-gray-200'
                    : isUnread(c) ? 'bg-emerald-50/60 hover:bg-emerald-50' : 'hover:bg-gray-50'
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  {c.contact_photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.contact_photo_url}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : c.is_group ? (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 text-white flex items-center justify-center shrink-0" title="Grupo">
                      <GroupIcon className="w-5 h-5" />
                    </div>
                  ) : (
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarColor(c.id)} text-white text-sm font-bold flex items-center justify-center shrink-0`}>
                      {(c.contact_name ?? c.remote_jid.split('@')[0]).charAt(0).toUpperCase()}
                    </div>
                  )}

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={cn('truncate', isUnread(c) ? 'font-bold text-gray-950' : 'font-medium text-gray-600')}>
                        {c.is_restricted && <Lock className="inline w-3 h-3 mr-1 -mt-0.5 text-amber-600" aria-label="Grupo restrito" />}
                        {c.contact_name ?? c.remote_jid.split('@')[0]}
                      </p>
                      <span className={cn('shrink-0 text-[11px] whitespace-nowrap', isUnread(c) ? 'font-semibold text-emerald-600' : 'text-gray-400')} title={new Date(c.last_at ?? c.last_message_at).toLocaleString('pt-BR')}>
                        {formatListTime(c.last_at ?? c.last_message_at)}
                      </span>
                    </div>
                    <p className="mt-0.5">
                      <span className={cn('inline-flex max-w-full items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full border', filter.colorOf(c.instance_id).chip)}>
                        <WhatsappIcon className="w-3 h-3 shrink-0" />
                        <span className="truncate">{c.instance_label}</span>
                      </span>
                    </p>
                    <ConvTags type={c.contact_type} labels={c.labels} className="mt-1" />
                    {c.next_followup && (
                      <p className={cn('inline-flex items-center gap-1 text-[11px] font-medium mt-1 px-1.5 py-0.5 rounded border', DUE_STYLE[dueState(c.next_followup.due_at)])} title={c.next_followup.note ?? 'Follow-up agendado'}>
                        <CalendarClock className="w-3 h-3" /> {formatDue(c.next_followup.due_at)}
                      </p>
                    )}
                    <p className={cn('flex items-center gap-1 text-xs mt-1', isUnread(c) ? 'text-gray-900 font-semibold' : c.last_direction === 'inbound' ? 'text-gray-600' : 'text-gray-400')}>
                      {c.last_direction === 'outbound' && <CheckCheck className="w-3.5 h-3.5 shrink-0 text-sky-500" aria-label="Última mensagem enviada por nós" />}
                      {c.last_direction === 'inbound' && <ArrowDownLeft className="w-3.5 h-3.5 shrink-0 text-emerald-600" aria-label="Última mensagem do contato (aguardando resposta)" />}
                      <span className="line-clamp-1">{c.last_body || 'Sem mensagens'}</span>
                    </p>
                  </div>
                  {isUnread(c) && (
                    <span
                      className="shrink-0 self-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center"
                      title={c.unread_count > 0 ? `${c.unread_count} mensagem(ns) não lida(s)` : 'Marcada como não lida'}
                      aria-label={c.unread_count > 0 ? `${c.unread_count} mensagens não lidas` : 'Marcada como não lida'}
                    >
                      {c.unread_count > 0 ? (c.unread_count > 99 ? '99+' : c.unread_count) : ''}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────
          MAIN - Thread de mensagens
          ────────────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        {!selected && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-gray-400 text-center">
              <p className="text-lg font-medium text-gray-600 mb-1">Escolha uma conversa</p>
              <p className="text-sm text-gray-500">Selecione uma conversa na esquerda para começar</p>
            </div>
          </div>
        )}

        {selected && (
          <>
            {/* Header da conversa */}
            <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer" onClick={() => setShowInfo(true)}>
                <div className={`w-12 h-12 shrink-0 rounded-full bg-gradient-to-br ${getAvatarColor(selected.id)} text-white text-sm font-bold flex items-center justify-center`}>
                  {(selected.contact_name ?? selected.remote_jid.split('@')[0]).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">
                    {selected.is_restricted && <Lock className="inline w-3.5 h-3.5 mr-1 -mt-0.5 text-amber-600" aria-label="Grupo restrito" />}
                    {selected.contact_name ?? selected.remote_jid.split('@')[0]}
                  </h3>
                  <p>
                    <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border', filter.colorOf(selected.instance_id).chip)}>
                      <WhatsappIcon className="w-3.5 h-3.5" />{selected.instance_label}
                    </span>
                  </p>
                  <ConvTags type={selected.contact_type} labels={selected.labels} className="mt-1" />
                </div>
                {!selected.is_group && <div className="ml-2 pl-3 border-l border-gray-200 shrink-0 whitespace-nowrap">
                  <p className="text-[11px] text-gray-400 leading-none mb-0.5">Valor</p>
                  <DealValue
                    size="md"
                    cents={selected.deal_cents}
                    onSave={async (v) => {
                      const r = await setConversationValue(selected.id, v)
                      if ('error' in r && r.error) return r.error
                      refreshList(true)
                      return null
                    }}
                  />
                </div>}
              </div>

              {/* Ações */}
              <div className="flex gap-1 shrink-0">
                <FollowupPopover
                  conversationId={selected.id}
                  users={users}
                  defaultAssigneeId={selected.assigned_user_id}
                  open={followupOpen}
                  onOpenChange={setFollowupOpen}
                  onChanged={() => refreshList(true)}
                />
                <LabelPicker
                  conversationId={selected.id}
                  all={labelCatalog}
                  selectedIds={selected.labels.map((l) => l.id)}
                  isAdmin={isAdmin}
                  onChanged={() => refreshList(true)}
                  onCatalogChanged={loadLabels}
                />
                <button
                  onClick={handleMarkUnread}
                  disabled={pending}
                  title="Marcar como não lida"
                  aria-label="Marcar como não lida"
                  className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <MailOpen className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowInfo((v) => !v)}
                  title="Dados do contato"
                  aria-label="Dados do contato"
                  aria-pressed={showInfo}
                  className={cn('px-3 py-2 text-sm rounded-lg transition-colors', showInfo ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100')}
                >
                  <Info className="w-4 h-4" />
                </button>
                {!selected.is_group && <button
                  onClick={() => setShowLinkContact(true)}
                  title="Vincular contato / dar um nome"
                  aria-label="Vincular contato"
                  className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Link2 className="w-4 h-4" />
                </button>}
                <button
                  onClick={() => setShowReassign(true)}
                  title="Transferir ou liberar esta conversa"
                  aria-label="Transferir ou liberar esta conversa"
                  className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <UserCog className="w-4 h-4" />
                </button>
              </div>
            </div>

            {selected.next_followup && (() => {
              const f = selected.next_followup!
              const st = dueState(f.due_at)
              return (
                <div className={cn('flex items-start gap-2.5 px-4 py-2 border-b text-sm', DUE_STYLE[st])} role="status">
                  <CalendarClock className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{st === 'overdue' ? 'Follow-up atrasado' : 'Follow-up'} · {formatDue(f.due_at)}</p>
                    {f.note && <p className="text-gray-800 whitespace-pre-wrap break-words line-clamp-3">{f.note}</p>}
                  </div>
                  <button onClick={async () => {
                    const r = await completeFollowup(f.id)
                    if ('error' in r && r.error) toast.error('ERRO', r.error)
                    else { toast.success('FOLLOW-UP CONCLUÍDO'); refreshList(true); refreshThread(selected.id, true) }
                  }} className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/80 hover:bg-white border border-current/20 text-xs font-medium">Concluir</button>
                  <button onClick={() => setFollowupOpen(true)} className="shrink-0 px-2.5 py-1 rounded-full bg-white/80 hover:bg-white border border-current/20 text-xs font-medium">Ver</button>
                </div>
              )
            })()}

            {/* Mensagens */}
            <div ref={threadRef} onScroll={onThreadScroll} className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingThread && (
                <div className="text-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400 mx-auto" />
                </div>
              )}
              {messages.map((m) => (
                <Fragment key={m.id}>
                {m.id === firstUnreadId && (
                  <div className="flex items-center gap-3 text-xs font-semibold text-emerald-700" role="separator">
                    <span className="flex-1 border-t border-emerald-300" />
                    {openedUnread} mensage{openedUnread === 1 ? 'm' : 'ns'} não lida{openedUnread === 1 ? '' : 's'}
                    <span className="flex-1 border-t border-emerald-300" />
                  </div>
                )}
                <MessageBubble
                  msg={m}
                  url={m.storage_path ? attUrls[m.storage_path] : undefined}
                  onOpenMedia={() => setLightboxId(m.id)}
                  onOpenAttachment={openAttachment}
                  contact={{ id: selected.id, name: selected.contact_name ?? selected.remote_jid.split('@')[0], photo: selected.contact_photo_url }}
                  isGroup={selected.is_group}
                  parent={m.reply_to_provider_id ? messages.find((x) => x.provider_message_id === m.reply_to_provider_id) ?? null : null}
                  onReply={() => { setReplyTo(m); textareaRef.current?.focus() }}
                  onReact={async (emoji) => {
                    const r = await reactToMessage(m.id, emoji)
                    if ('error' in r && r.error) toast.error('NÃO FOI POSSÍVEL REAGIR', r.error)
                    else refreshThread(selectedId!, true)
                  }}
                  canDelete={canDeleteForEveryone(m as any) && (m.sender_user_id === currentUserId || isAdmin || !m.sender_user_id)}
                  onDelete={async () => {
                    if (!window.confirm('Apagar esta mensagem para todos? Ela some da conversa do cliente também.')) return
                    const r = await deleteCrmMessage(m.id)
                    if (r.error) toast.error('NÃO FOI POSSÍVEL APAGAR', r.error)
                    else { toast.success('MENSAGEM APAGADA'); refreshThread(selectedId!) }
                  }}
                />
                </Fragment>
              ))}
            </div>

            {newBelow > 0 && (
              <div className="relative">
                <button
                  onClick={() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' }); setNewBelow(0) }}
                  className="absolute -top-12 right-5 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-semibold shadow-lg hover:bg-emerald-700"
                >
                  <ChevronDown className="w-4 h-4" /> {newBelow} nova{newBelow > 1 ? 's' : ''} mensagem{newBelow > 1 ? 'ns' : ''}
                </button>
              </div>
            )}

            {/* Composer */}
            {recording ? (
              <div className="p-4 border-t border-gray-200 bg-white flex items-center gap-3">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                </span>
                <span className="text-sm text-gray-600 flex-1">
                  Gravando… {String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:{String(recordSeconds % 60).padStart(2, '0')}
                </span>
                <button type="button" onClick={cancelRecording} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4 text-gray-600" />
                </button>
                <button type="button" onClick={finishRecording} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <Square className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            ) : previewAudio ? (
              <div className="p-4 border-t border-gray-200 bg-white flex items-center gap-3">
                <audio controls src={previewAudio.url} className="h-10 flex-1" />
                <button type="button" onClick={discardPreviewAudio} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4 text-gray-600" />
                </button>
                <button
                  type="button"
                  onClick={sendPreviewAudio}
                  disabled={sendingVoice}
                  className="p-2 bg-gray-900 text-white hover:bg-gray-800 rounded-full transition-colors"
                  title="Enviar áudio"
                >
                  {sendingVoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            ) : (
              <div className="p-4 pt-2 border-t border-gray-200 bg-white">
              {replyTo && (
                <div className="mb-2 flex items-start gap-2 rounded-lg bg-gray-100 border-l-4 border-sky-500 px-3 py-2" role="status">
                  <Reply className="w-4 h-4 mt-0.5 text-sky-600 shrink-0" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold text-sky-700 text-xs">Respondendo a {replyTo.direction === 'outbound' ? (replyTo.sender_name ?? 'nós') : (selected.is_group ? (replyTo.participant_name ?? selected.contact_name) : (selected.contact_name ?? 'contato'))}</p>
                    <p className="text-gray-600 truncate">{messagePreview({ message_type: replyTo.message_type, body: replyTo.body, file_name: replyTo.file_name }) || '…'}</p>
                  </div>
                  <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancelar resposta" className="p-1 rounded hover:bg-gray-200 text-gray-500"><X className="w-4 h-4" /></button>
                </div>
              )}
              <FormatToolbar textareaRef={textareaRef} value={text} setValue={setText} disabled={pending || sendingVoice} />
              <div className="flex items-end gap-2 mt-1">
                {/* Ícone de anexo */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={pending || sendingVoice}
                  className="p-2.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
                  title="Anexar arquivo"
                >
                  {pending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSendContact(true)}
                  disabled={pending || sendingVoice}
                  className="p-2.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
                  title="Enviar contato do sistema"
                  aria-label="Enviar contato"
                >
                  <ContactRound className="w-5 h-5" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => { handleFile(e.target.files); e.target.value = '' }}
                />

                {/* Input */}
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); return }
                    // atalhos: Ctrl/Cmd+B negrito, Ctrl/Cmd+I itálico
                    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'b' || e.key === 'i')) {
                      e.preventDefault()
                      const el = e.currentTarget
                      const ed = applyFormat(text, el.selectionStart, el.selectionEnd, e.key === 'b' ? 'bold' : 'italic')
                      setText(ed.value)
                      requestAnimationFrame(() => { el.setSelectionRange(ed.start, ed.end) })
                    }
                  }}
                  placeholder={actingAsName ? `Respondendo como ${actingAsName}…` : 'Escreva uma mensagem…'}
                  rows={1}
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-900 placeholder-gray-500 rounded-lg border-0 resize-none focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-0 max-h-36"
                />

                {/* Microfone ou enviar */}
                {text.trim() ? (
                  <button
                    onClick={handleSend}
                    className="p-2.5 bg-gray-900 text-white hover:bg-gray-800 rounded-full transition-colors"
                    title="Enviar mensagem"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={sendingVoice}
                    className="p-2.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
                    title="Gravar áudio"
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                )}
              </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Dados do contato (painel lateral, como no WhatsApp) */}
      {showInfo && selected && (
        <div className="max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:shadow-2xl">
          <ContactInfoPanel
            conversationId={selected.id}
            onClose={() => setShowInfo(false)}
            onChanged={() => refreshList(true)}
            isAdmin={isAdmin}
          />
        </div>
      )}

      {lightboxIndex >= 0 && (
        <MediaLightbox
          items={lightboxItems}
          index={lightboxIndex}
          onIndex={(i) => setLightboxId(lightboxItems[i]?.id ?? null)}
          onClose={() => setLightboxId(null)}
        />
      )}

      {/* Modais... */}
      {showLinkContact && selected && (
        <LinkContactModal
          conversationId={selected.id}
          currentName={selected.contact_name ?? ''}
          onClose={() => setShowLinkContact(false)}
          onSuccess={() => { setShowLinkContact(false); refreshList() }}
          users={users}
          contactQuery={contactQuery}
          setContactQuery={setContactQuery}
          contactResults={contactResults}
        />
      )}

      {showSendContact && selected && (
        <SendContactModal
          conversationId={selected.id}
          onClose={() => setShowSendContact(false)}
          onSent={() => { setShowSendContact(false); refreshThread(selected.id, true); refreshList(true) }}
        />
      )}

      {showGroupPicker && (
        <GroupPicker onClose={() => setShowGroupPicker(false)} onChanged={() => { refreshList(true); setSelectedId((id) => (id && !conversations.find((c) => c.id === id) ? null : id)) }} />
      )}

      {showReassign && selected && (
        <ReassignModal
          conversationId={selected.id}
          currentUserId={selected.assigned_user_id ?? ''}
          selfId={currentUserId}
          onClose={() => setShowReassign(false)}
          onSuccess={() => { setShowReassign(false); refreshList() }}
          onChanged={() => refreshList(true)}
          users={users}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// Componentes auxiliares
// ════════════════════════════════════════════════════════════════════════════════════════════════

function MessageBubble({
  msg, url, onOpenMedia, onOpenAttachment, contact, isGroup, parent, onReply, onReact, canDelete, onDelete,
}: {
  msg: Msg
  url?: string
  onOpenMedia: () => void
  onOpenAttachment: (p: string) => void
  contact: { id: string; name: string; photo: string | null }
  isGroup: boolean
  parent: Msg | null
  onReply: () => void
  onReact: (emoji: string) => void
  canDelete: boolean
  onDelete: () => void
}) {
  const [thumbFailed, setThumbFailed] = useState(false)
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(false)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('click', close)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', onKey) }
  }, [menu])
  const isOutbound = msg.direction === 'outbound'
  const time = new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  if (msg.is_system) {
    return <div className="text-center py-2 text-xs text-gray-400">{msg.body}</div>
  }

  // Um administrador respondeu "como" o atendente: o balão é do atendente (assinatura),
  // mas mostramos também quem de fato enviou, com destaque âmbar.
  const acted = isOutbound && !!msg.acted_by_name && !!msg.sender_name
  const who = isOutbound
    ? acted
      ? `${msg.acted_by_name} (administrador) enviou em nome de ${msg.sender_name}`
      : (msg.sender_name ?? 'Enviada pelo celular do WhatsApp')
    : (isGroup ? (msg.participant_name ?? 'Participante do grupo') : contact.name)
  const speaker = !isOutbound && isGroup ? (msg.participant_name ?? 'Participante') : null

  const senderAvatar = isOutbound ? (
    msg.sender_name
      ? <Avatar user={{ name: msg.sender_name, avatar_url: msg.sender_avatar_url, avatar_color: msg.sender_avatar_color }} size={28} title={acted ? `Assinatura: ${msg.sender_name}` : msg.sender_name} />
      : <span title={who} className="w-7 h-7 rounded-full bg-gray-200 text-gray-500 text-xs flex items-center justify-center shrink-0">?</span>
  ) : isGroup ? (
    <span title={speaker ?? ''} className={`w-7 h-7 rounded-full bg-gradient-to-br ${getAvatarColor(msg.participant_name ?? msg.id)} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
      {(speaker ?? '?').charAt(0).toUpperCase()}
    </span>
  ) : contact.photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={contact.photo} alt={contact.name} title={contact.name} className="w-7 h-7 rounded-full object-cover shrink-0" />
  ) : (
    <span title={contact.name} className={`w-7 h-7 rounded-full bg-gradient-to-br ${getAvatarColor(contact.id)} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
      {contact.name.charAt(0).toUpperCase()}
    </span>
  )
  const avatar = acted ? (
    <span className="relative shrink-0" title={who}>
      {senderAvatar}
      <span className="absolute -bottom-1.5 -left-2 rounded-full ring-2 ring-amber-300 bg-white">
        <Avatar user={{ name: msg.acted_by_name, avatar_url: msg.acted_by_avatar_url, avatar_color: msg.acted_by_avatar_color }} size={18} title={`Enviou: ${msg.acted_by_name} (administrador)`} />
      </span>
    </span>
  ) : senderAvatar

  const card = msg.message_type === 'other' ? parseContactCard(msg.body) : null
  const caption = msg.body && !card && ['image', 'video', 'document', 'other'].includes(msg.message_type) ? msg.body : null

  if (msg.deleted_at) {
    return (
      <div id={`msg-${msg.id}`} className={cn('flex items-end gap-2', isOutbound ? 'justify-end' : 'justify-start')}>
        {!isOutbound && avatar}
        <div className="max-w-md rounded-2xl px-4 py-2 text-sm border border-dashed border-gray-300 bg-white/60 text-gray-500 italic">
          🚫 Mensagem apagada{msg.deleted_by_name ? ` por ${msg.deleted_by_name}` : ''}
          <p className="text-xs not-italic mt-0.5">{time}</p>
        </div>
        {isOutbound && avatar}
      </div>
    )
  }

  const parentName = parent
    ? (parent.direction === 'outbound' ? (parent.sender_name ?? 'Nós') : (isGroup ? (parent.participant_name ?? 'Participante') : contact.name))
    : null
  const canReply = !!msg.provider_message_id

  return (
    <div id={`msg-${msg.id}`} className={cn('flex items-end gap-2', isOutbound ? 'justify-end' : 'justify-start')}>
      {!isOutbound && avatar}
      <div
        title={who}
        className={cn(
          'group relative max-w-md rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          msg.reactions?.length ? 'mb-4' : '',
          isOutbound
            ? acted
              ? 'bg-[#FFF4DC] text-[#3b2a05] border border-amber-300 rounded-br-md'
              : 'bg-[#E6EEF8] text-[#0A1F3B] border border-[#D3E0F2] rounded-br-md'
            : 'bg-white text-gray-900 border border-gray-200 rounded-bl-md'
        )}
      >
        {(canReply || canDelete) && (
          <div className="absolute top-1 right-1">
            <button
              type="button"
              aria-label="Opções da mensagem"
              aria-haspopup="menu"
              onClick={(e) => { e.stopPropagation(); setMenu((v) => !v) }}
              className="p-1 rounded-full bg-white/80 text-gray-500 hover:text-gray-900 opacity-0 group-hover:opacity-100 focus:opacity-100 shadow-sm"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            {menu && (
              <div role="menu" onClick={(e) => e.stopPropagation()} className="absolute right-0 top-7 z-30 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-sm text-gray-800 not-italic">
                {canReply && (
                  <div className="flex items-center justify-between px-2 pb-1 mb-1 border-b border-gray-100" role="group" aria-label="Reagir">
                    {QUICK_REACTIONS.map((e) => {
                      const mine = msg.reactions?.some((r) => r.mine && r.emoji === e)
                      return (
                        <button
                          key={e}
                          type="button"
                          role="menuitem"
                          aria-label={`Reagir com ${e}`}
                          title={mine ? 'Tirar reação' : 'Reagir'}
                          onClick={() => { setMenu(false); onReact(mine ? '' : e) }}
                          className={cn('w-7 h-7 rounded-full text-base leading-none hover:bg-gray-100', mine && 'bg-sky-100 ring-1 ring-sky-300')}
                        >{e}</button>
                      )
                    })}
                  </div>
                )}
                {canReply && <button role="menuitem" className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50" onClick={() => { setMenu(false); onReply() }}><Reply className="w-4 h-4" /> Responder</button>}
                {canDelete && <button role="menuitem" className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-red-50 text-red-600" onClick={() => { setMenu(false); onDelete() }}><Trash2 className="w-4 h-4" /> Apagar para todos</button>}
              </div>
            )}
          </div>
        )}

        {speaker && <p className="text-xs font-semibold text-sky-700 mb-0.5">{speaker}</p>}

        {msg.reply_to_provider_id && (
          <button
            type="button"
            onClick={() => parent && document.getElementById(`msg-${parent.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="mb-1.5 w-full text-left rounded-lg bg-black/5 border-l-4 border-sky-500 px-2.5 py-1.5"
          >
            <span className="block text-xs font-semibold text-sky-700">{parentName ?? 'Mensagem citada'}</span>
            <span className="block text-xs text-gray-600 line-clamp-2">
              {parent ? (messagePreview({ message_type: parent.message_type, body: parent.body, file_name: parent.file_name, deleted: !!parent.deleted_at }) || '…') : (msg.reply_to_preview || 'Mensagem anterior')}
            </span>
          </button>
        )}

        {acted && (
          <p className="flex items-center gap-1 text-[11px] font-medium text-amber-800 mb-1">
            <UserCog className="w-3 h-3" /> {msg.acted_by_name} respondeu como {msg.sender_name}
          </p>
        )}

        {msg.message_type === 'text' && msg.body && <WaText text={msg.body} />}

        {msg.message_type === 'audio' && (
          url ? (
            <AudioPlayer src={url} mimeType={msg.mime_type} fileName={msg.file_name} tone={isOutbound ? 'blue' : 'light'} />
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-500 min-w-[200px]">
              <Loader2 className="w-3 h-3 animate-spin" /><span>Carregando áudio…</span>
            </div>
          )
        )}

        {msg.message_type === 'image' && (
          msg.storage_path && url && !thumbFailed ? (
            <button type="button" onClick={onOpenMedia} className="block rounded-lg overflow-hidden bg-black/5 max-w-[260px]" aria-label="Ampliar imagem">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={msg.file_name ?? 'Imagem'} loading="lazy" onError={() => setThumbFailed(true)} className="block w-full max-h-72 object-cover hover:opacity-90" />
            </button>
          ) : msg.storage_path ? (
            <button type="button" onClick={() => msg.storage_path && onOpenAttachment(msg.storage_path)} className="flex items-center gap-2 text-left hover:opacity-80">
              <FileBadge name={msg.file_name ?? 'imagem.jpg'} size={32} />
              <span className="underline text-sm break-all">{msg.file_name || 'Imagem'}</span>
            </button>
          ) : <p className="text-xs italic text-gray-400">Imagem indisponível</p>
        )}

        {msg.message_type === 'video' && (
          msg.storage_path && url ? (
            <button type="button" onClick={onOpenMedia} className="relative block rounded-lg overflow-hidden bg-black max-w-[260px]" aria-label="Reproduzir vídeo">
              <video src={url + '#t=0.1'} preload="metadata" muted playsInline className="block w-full max-h-72 object-cover pointer-events-none" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/25 hover:bg-black/35">
                <span className="w-12 h-12 rounded-full bg-black/60 text-white flex items-center justify-center"><PlayIcon className="w-6 h-6 ml-0.5" /></span>
              </span>
            </button>
          ) : msg.storage_path ? (
            <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-3 h-3 animate-spin" />Carregando vídeo…</div>
          ) : <p className="text-xs italic text-gray-400">Vídeo indisponível</p>
        )}

        {msg.message_type === 'document' && (
          msg.storage_path ? (
            <button
              type="button"
              onClick={() => { if (url) window.open(url, '_blank', 'noopener'); else if (msg.storage_path) onOpenAttachment(msg.storage_path) }}
              className="flex items-center gap-3 text-left rounded-lg bg-black/5 hover:bg-black/10 px-3 py-2 max-w-full"
              title="Abrir documento"
            >
              <FileBadge name={msg.file_name} />
              <span className="min-w-0">
                <span className="block text-sm font-medium break-all line-clamp-2">{msg.file_name || 'Documento'}</span>
                <span className="block text-xs text-gray-500">Clique para abrir</span>
              </span>
            </button>
          ) : <p className="text-xs italic text-gray-400">Documento indisponível</p>
        )}

        {caption && <div className="mt-1.5"><WaText text={caption} /></div>}

        {card && (
          <div className="space-y-1.5 min-w-[14rem]">
            {card.map((p, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl bg-black/5 px-3 py-2">
                <span className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 text-white flex items-center justify-center"><ContactRound className="w-4 h-4" /></span>
                <span className="min-w-0">
                  <span className="block font-semibold text-sm truncate">{p.name}</span>
                  {p.phone && <span className="block text-xs opacity-70">{prettyPhone(p.phone)}</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        {msg.message_type === 'other' && !msg.body && (
          <p className="text-xs italic text-gray-400">Mensagem não suportada</p>
        )}

        <p className="text-xs mt-1 text-gray-500">{time}</p>

        {!!msg.reactions?.length && (
          <div className={cn('absolute -bottom-3 flex gap-1', isOutbound ? 'right-3' : 'left-3')}>
            {msg.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => r.mine && onReact('')}
                title={[r.mine ? 'Você' : null, ...r.names].filter(Boolean).join(', ') + (r.mine ? ' (clique para tirar)' : '')}
                className={cn('inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white border text-xs shadow-sm', r.mine ? 'border-sky-300' : 'border-gray-200', !r.mine && 'cursor-default')}
              >
                <span>{r.emoji}</span>{r.count > 1 && <span className="text-gray-500 font-medium">{r.count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      {isOutbound && avatar}
    </div>
  )
}

function UserLabel({ u }: { u: SystemUser }) {
  return (
    <span className="flex flex-col leading-tight">
      <span>{u.name}</span>
      <span className="text-[11px] text-gray-400">
        {u.role_label ?? u.role}{u.has_crm === false ? ' · recebe acesso ao CRM' : ''}
      </span>
    </span>
  )
}

function ReassignModal({
  conversationId,
  currentUserId,
  selfId,
  onClose,
  onSuccess,
  onChanged,
  users,
}: {
  conversationId: string
  currentUserId: string
  selfId: string
  onClose: () => void
  onSuccess: () => void
  onChanged: () => void
  users: SystemUser[]
}) {
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [tab, setTab] = useState<'transfer' | 'share'>('transfer')
  const [info, setInfo] = useState<ConversationAccessInfo | { error: string } | null>(null)

  const loadInfo = useCallback(() => { getConversationAccessInfo(conversationId).then(setInfo) }, [conversationId])
  useEffect(() => { loadInfo() }, [loadInfo])

  const ok = info && !('error' in info) ? info : null
  const canManage = ok?.can_manage ?? false
  const sharedIds = new Set(ok?.shared.map((x) => x.user_id) ?? [])
  const others = users.filter((u) => u.id !== selfId)

  const handleReassign = (userId: string | null) => {
    startTransition(async () => {
      const res = await reassignConversation(conversationId, userId)
      if (res.error) toast.error('ERRO', res.error)
      else { toast.success('TRANSFERIDA!', 'Atendimento transferido'); onSuccess() }
    })
  }

  const handleShare = (userId: string, on: boolean) => {
    startTransition(async () => {
      const res = on ? await shareConversation(conversationId, userId) : await unshareConversation(conversationId, userId)
      if (res.error) toast.error('ERRO', res.error)
      else { toast.success(on ? 'LIBERADA!' : 'LIBERAÇÃO RETIRADA', on ? 'A pessoa já pode ver e responder esta conversa' : ''); loadInfo() }
    })
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="bg-white rounded-lg p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-900">Transferir ou liberar</h3>
          <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2 mb-3">
          {([['transfer', 'Transferir atendimento'], ['share', 'Liberar só esta conversa']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn('flex-1 px-2 py-1.5 text-xs font-medium rounded-full transition-colors', tab === k ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')}
            >
              {label}
            </button>
          ))}
        </div>

        {info === null && <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto my-6" />}
        {info && 'error' in info && <p role="alert" className="text-sm text-red-600">{info.error}</p>}

        {ok && !canManage && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Só quem atende esta conversa (ou administra este WhatsApp) pode transferi-la ou liberá-la.
          </p>
        )}

        {ok && canManage && tab === 'transfer' && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">A outra pessoa passa a ser a atendente. {ok.instance_private ? 'Quem não administra este WhatsApp deixa de ver a conversa.' : ''}</p>
            <button
              onClick={() => handleReassign(null)}
              disabled={pending}
              className={cn('w-full text-left px-3 py-2 rounded-lg text-sm transition-colors', !currentUserId ? 'bg-gray-200 text-gray-900 font-medium' : 'hover:bg-gray-100 text-gray-700')}
            >
              Sem atribuição
            </button>
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => handleReassign(u.id)}
                disabled={pending || u.id === currentUserId}
                className={cn('w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between gap-2', currentUserId === u.id ? 'bg-gray-200 text-gray-900 font-medium' : 'hover:bg-gray-100 text-gray-700')}
              >
                <UserLabel u={u} />{currentUserId === u.id && <span className="text-[11px] text-gray-500">(atual)</span>}
              </button>
            ))}
          </div>
        )}

        {ok && ok.is_group && ok.can_restrict && tab === 'share' && (
          <label className="flex items-start gap-2.5 mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={ok.restricted}
              disabled={pending}
              onChange={(e) => {
                const on = e.target.checked
                startTransition(async () => {
                  const res = await setConversationRestricted(conversationId, on)
                  if (res.error) toast.error('ERRO', res.error)
                  else { toast.success(on ? 'GRUPO RESTRITO' : 'RESTRIÇÃO REMOVIDA'); loadInfo(); onChanged() }
                })
              }}
            />
            <span className="text-sm text-amber-900">
              <b>Restringir este grupo</b><br />
              <span className="text-xs">Só administradores, o atendente e as pessoas liberadas abaixo veem o grupo, mesmo quem tem acesso ao WhatsApp.</span>
            </span>
          </label>
        )}
        {ok && ok.is_group && !ok.can_restrict && ok.restricted && tab === 'share' && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">Grupo restrito por um administrador.</p>
        )}

        {ok && canManage && tab === 'share' && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">
              A pessoa vê e responde <b>só esta conversa</b>; o resto deste WhatsApp continua restrito e você segue como atendente.
              {!ok.instance_private && !ok.restricted && ' (Este WhatsApp é aberto à equipe; a liberação vale para quando ele for privado.)'}
            </p>
            {others.filter((u) => u.id !== currentUserId).map((u) => {
              const on = sharedIds.has(u.id)
              return (
                <div key={u.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50">
                  <span className="flex-1 text-sm text-gray-800"><UserLabel u={u} /></span>
                  <button
                    onClick={() => handleShare(u.id, !on)}
                    disabled={pending}
                    className={cn('px-3 py-1 text-xs font-medium rounded-full', on ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-gray-900 text-white hover:bg-gray-700')}
                  >
                    {on ? 'Retirar' : 'Liberar'}
                  </button>
                </div>
              )
            })}
            {others.filter((u) => u.id !== currentUserId).length === 0 && (
              <p className="text-sm text-gray-500">Nenhum outro usuário ativo cadastrado.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function LinkContactModal({
  conversationId,
  currentName,
  onClose,
  onSuccess,
  users,
  contactQuery,
  setContactQuery,
  contactResults,
}: {
  conversationId: string
  currentName: string
  onClose: () => void
  onSuccess: () => void
  users: SystemUser[]
  contactQuery: string
  setContactQuery: (q: string) => void
  contactResults: any[]
}) {
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  const handleLink = (contactId: string | null) => {
    startTransition(async () => {
      const res = await linkConversationContact(conversationId, contactId)
      if (res.error) toast.error('ERRO', res.error)
      else { toast.success('VINCULADO!', 'Contato atualizado'); onSuccess() }
    })
  }

  const handleRename = (name: string) => {
    startTransition(async () => {
      const res = await setConversationDisplayName(conversationId, name)
      if (res.error) toast.error('ERRO', res.error)
      else { toast.success('SALVO!', 'Nome atualizado'); onSuccess() }
    })
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">Vincular contato</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <input
            autoFocus
            value={contactQuery}
            onChange={(e) => setContactQuery(e.target.value)}
            placeholder="Buscar contato…"
            className="w-full px-3 py-2 bg-gray-100 rounded-lg border-0 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />

          <div className="space-y-1 max-h-48 overflow-y-auto">
            {contactResults.map((c) => (
              <button
                key={c.id}
                onClick={() => handleLink(c.id)}
                disabled={pending}
                className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-100 transition-colors text-gray-700"
              >
                {c.name} <span className="text-xs text-gray-400">({c.type})</span>
              </button>
            ))}
          </div>

          <div className="border-t border-gray-200 pt-3">
            <p className="text-xs text-gray-500 mb-2">Ou digitar um nome:</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="ex.: João Silva"
                className="flex-1 px-3 py-2 bg-gray-100 rounded-lg border-0 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-900"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const name = (e.target as HTMLInputElement).value
                    if (name.trim()) {
                      handleRename(name)
                      ;(e.target as HTMLInputElement).value = ''
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
