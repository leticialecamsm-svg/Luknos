'use client'

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'

import { getAvatarColor } from '@/lib/crm-ui'
import { InstanceFilter, useInstanceFilter, readSavedInstanceSelection } from './InstanceFilter'
import { LabelFilter, useLabelFilter, readSavedLabelSelection } from './LabelFilter'
import { ConvAvatar } from './ConvAvatar'
import { threadLayout } from '@/lib/crm-thread-layout'
import { WhatsappIcon } from './WhatsappIcon'
import { DealValue } from './DealValue'
import { ContactInfoPanel } from './ContactInfoPanel'
import { WaText } from './WaText'
import { splitButtons } from '@/lib/crm-buttons'
import { LinkPreviewCard, firstUrl } from './LinkPreviewCard'
import { AdCard, type AdContext } from './AdCard'
import { ConvTags } from './ConvTags'
import { FollowupPopover, DUE_STYLE } from './FollowupPopover'
import { dueState, formatDue } from '@/lib/crm-followup'
import { LabelPicker } from './LabelPicker'
import { canDeleteForEveryone, canEditMessage, messagePreview } from '@/lib/crm-preview'
import { AudioPlayer } from './AudioPlayer'
import { FileBadge } from './FileBadge'
import { MediaLightbox, type LightboxItem } from './MediaLightbox'
import { applyFormat } from '@/lib/wa-format'
import { FormatToolbar } from './FormatToolbar'
import {
  reassignConversation,
  setConversationValue,
  getConversationAccessInfo,
  shareConversation,
  unshareConversation,
  setConversationRestricted,
  markConversationRead,
  markConversationUnread,
  setConversationArchived,
  saveMessageAsSticker,
  getGroupParticipants,
  setConversationPinned,
  setConversationSignature, getMySignaturePref, setMySignaturePref,
  type ConversationAccessInfo,
  type CrmLabel,
  getCrmLabels,
  deleteCrmMessage,
  editCrmMessage,
  downloadCrmMedia,
  startCrmConversation,
  completeFollowup,
  linkCrmMessagesToSolicitationStage,
  linkConversationContact,
  setConversationDisplayName,
  searchContactsForCrm,
  getCrmAttachmentUrl,
  getConversationAttachmentUrls,
  syncCrmContactInfo,
  getCrmConversationRow,
  type ConversationRow,
} from '@/lib/crm-actions'
import { uploadCrmFile } from '@/lib/crm-upload'
import { fetchCrmMessages, fetchCrmSnapshot, postCrmSend, postCrmForward, postCrmReact } from '@/lib/crm-fetch'
import { ConversationListSkeleton, ThreadSkeleton, LuknosSpinner, LoadError } from '@/components/ui/LuknosLoader'
import { useToast } from '@/components/ui/Toast'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import { stripFormatting } from '@/lib/wa-format'
import { CRM_AWAITING_REFRESH } from '@/lib/use-crm-awaiting'
import { formatListTime } from '@/lib/crm-time'
import { setOpenConversationId } from '@/lib/crm-open-conversation'
import { subscribeCrmMessages, subscribeCrmPresence } from '@/lib/crm-realtime'
import { GroupPicker } from './GroupPicker'
import { SendContactModal } from './SendContactModal'
import { NewConversationModal, ForwardModal, OtherNumberModal } from './CrmConversationModals'
import { QuickReplies } from './QuickReplies'
import { SignatureSettings } from './SignatureSettings'
import { CrmSolicitationModal, type SolicSelection, SOLIC_STAGES } from './CrmSolicitationModal'
import { MediaComposer, type ComposedFile } from './MediaComposer'
import { StickerPicker } from './StickerPicker'
import { activeMention, applyMentionsToSend, buildMentionNames, filterMembers, memberLabel, renderMentions, type GroupMember, type MentionPick } from '@/lib/crm-mentions'
import { parseContactCard, prettyPhone } from '@/lib/crm-contact-card'
import { type ReactionChip } from '@/lib/crm-reactions'
import { ReactionPicker } from './ReactionPicker'
import { useReactionFavorites } from './useReactionFavorites'
import {
  Send, Paperclip, Loader2, UserCog, Smartphone, Hash, ArrowRightLeft, Link2, Search, ExternalLink, Phone, List, MessageSquareText, Inbox, Users as UsersIcon, X,
  Mic, Trash2, Square, RefreshCw, Info, Play as PlayIcon, CheckCheck, Reply, ChevronDown, CalendarClock, Lock, MailOpen, ContactRound, Sticker as StickerIcon, Pin, PinOff, PenLine, Pencil, MoreVertical, Download, Image as ImageIcon, Forward, Plus, Clock, AlertCircle, Smile, Archive, ArchiveRestore, ChevronLeft, Folder, Zap,
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
  edited_at?: string | null
  is_forwarded?: boolean
  ad_context?: AdContext | null
  // Envio otimista: aparece na hora com relógio (pending); se falhar, fica marcada (failed) com
  // "Tentar de novo". realId = id gravado no banco, para trocar pela mensagem real sem duplicar.
  pending?: boolean
  failed?: boolean
  realId?: string | null
  local_url?: string | null // prévia do arquivo enquanto sobe
  retry?: () => Promise<{ error?: string; messageId?: string | null }>
  drive_file_id?: string | null
  media_size?: number | null
  media_seconds?: number | null
  thumb?: string | null
  reactions?: ReactionChip[]
  participant_name?: string | null
  participant_jid?: string | null
  acted_by_name?: string | null
  acted_by_avatar_url?: string | null
  acted_by_avatar_color?: string | null
  message_type: string
  body: string | null
  storage_path: string | null
  signed?: boolean | null
  file_name: string | null
  mime_type: string | null
  is_system: boolean
  created_at: string
}

const isUnread = (c: { unread_count: number; marked_unread: boolean }) => c.unread_count > 0 || c.marked_unread

const MSG_PAGE = 50 // mensagens por página (as mais recentes; as antigas vêm ao rolar para cima)
const isTemp = (m: Msg) => m.id.startsWith('temp-')

// A mensagem otimista (temp) já virou esta mensagem real? Pelo id devolvido no envio ou, se o
// tempo real chegou antes da resposta, pelo conteúdo (mesmo autor, tipo, texto/arquivo, ~2 min).
function tempMatches(t: Msg, r: Msg): boolean {
  if (t.failed || isTemp(r)) return false
  if (t.realId) return t.realId === r.id
  return r.direction === 'outbound' && r.sender_user_id === t.sender_user_id && r.message_type === t.message_type &&
    (r.body ?? '') === (t.body ?? '') && (r.file_name ?? '') === (t.file_name ?? '') &&
    Math.abs(Date.parse(r.created_at) - Date.parse(t.created_at)) < 120_000
}

// Tira as otimistas que já têm a versão real na lista (cada real "consome" uma otimista só).
function dropConfirmedTemps(temps: Msg[], real: Msg[]): Msg[] {
  const used = new Set<string>()
  return temps.filter((t) => {
    const hit = real.find((r) => !used.has(r.id) && tempMatches(t, r))
    if (hit) { used.add(hit.id); if (t.local_url) URL.revokeObjectURL(t.local_url); return false }
    return true
  })
}

// Junta a página mais recente com o que já estava na tela: mantém as antigas já carregadas
// (rolagem para cima) e as otimistas ainda sem confirmação. Se chegou mais coisa do que cabe
// numa página desde a última vez (buraco), recomeça só com a página nova.
function mergeLatest(cur: Msg[], page: Msg[], pageHasMore: boolean): { items: Msg[]; keptOlder: boolean } {
  const real = cur.filter((m) => !isTemp(m))
  const temps = dropConfirmedTemps(cur.filter(isTemp), page)
  if (!page.length) return { items: [...real, ...temps], keptOlder: real.length > 0 }
  const oldest = page[0].created_at
  const pageIds = new Set(page.map((m) => m.id))
  const newestCur = real[real.length - 1]
  const gap = pageHasMore && !!newestCur && newestCur.created_at < oldest
  const older = gap ? [] : real.filter((m) => !pageIds.has(m.id) && m.created_at <= oldest)
  return { items: [...older, ...page, ...temps], keptOlder: older.length > 0 }
}

// Minha reação numa mensagem: uma só por pessoa (trocar substitui; '' tira), como no WhatsApp.
function withMyReaction(chips: ReactionChip[], emoji: string): ReactionChip[] {
  const out = chips
    .map((c) => (c.mine ? { ...c, mine: false, count: c.count - 1 } : c))
    .filter((c) => c.count > 0)
  if (emoji) {
    const i = out.findIndex((c) => c.emoji === emoji)
    if (i >= 0) out[i] = { ...out[i], mine: true, count: out[i].count + 1 }
    else out.push({ emoji, count: 1, mine: true, names: [] })
  }
  return out
}

const MSG_FIELDS = ['id', 'direction', 'sender_user_id', 'message_type', 'body', 'storage_path', 'file_name', 'mime_type', 'is_system', 'created_at', 'provider_message_id', 'reply_to_provider_id', 'reply_to_preview', 'deleted_at', 'edited_at', 'is_forwarded', 'drive_file_id', 'media_size', 'media_seconds', 'thumb', 'participant_name', 'participant_jid', 'signed', 'ad_context'] as const

const DRAFTS_KEY = 'crm-drafts'
function readDrafts(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? '{}') ?? {} } catch { return {} }
}
function readDraft(convId: string): string {
  return readDrafts()[convId] ?? ''
}
function writeDraft(convId: string, text: string) {
  try {
    const all = readDrafts()
    if (text.trim()) all[convId] = text
    else delete all[convId]
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(all))
  } catch { /* sem armazenamento: segue sem rascunho */ }
}

interface SystemUser { id: string; name: string; role: string; role_label?: string; has_crm?: boolean; avatar_url?: string | null; avatar_color?: string | null }

export function CrmInboxPage({ currentUserId, users, initialConversationId = null, actingAsName = null, isAdmin = false }: { currentUserId: string; users: SystemUser[]; initialConversationId?: string | null; actingAsName?: string | null; isAdmin?: boolean }) {
  const toast = useToast()
  const [scope, setScope] = useState<ScopeTab>('all')
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
  const [showStickers, setShowStickers] = useState(false)
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [showSig, setShowSig] = useState(false)
  // assinar as mensagens: preferência de quem digita (vem do perfil)
  const [iSign, setISign] = useState(true)
  useEffect(() => { getMySignaturePref().then(setISign).catch(() => {}) }, [])
  const [headerMenu, setHeaderMenu] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<Msg | null>(null)
  const [forwarding, setForwarding] = useState<Msg | null>(null)
  // destinos do encaminhar: todas as conversas que a pessoa enxerga (não só as da aba/WhatsApp filtrados)
  const [forwardTargets, setForwardTargets] = useState<ConversationRow[] | null>(null)
  useEffect(() => {
    if (!forwarding) { setForwardTargets(null); return }
    let alive = true
    // o escopo 'all' não traz grupos: busca os dois e junta
    Promise.all([fetchCrmSnapshot('all', 500), fetchCrmSnapshot('groups', 200)]).then(([a, g]) => {
      const items = [...(a.items ?? []), ...(g.items ?? [])]
      if (alive && items.length) setForwardTargets(items)
    }).catch(() => {})
    return () => { alive = false }
  }, [forwarding])
  const [showNewConv, setShowNewConv] = useState(false)
  // trocar de conversa cancela a edição em andamento
  useEffect(() => { setEditing(null) }, [selectedId])

  // Rascunho por conversa (como no WhatsApp): o que está sendo digitado fica guardado no
  // navegador — trocar de conversa, recarregar ou um carregamento da tela não apaga o texto.
  const draftJustLoaded = useRef(false)
  useEffect(() => {
    draftJustLoaded.current = true
    setText(selectedId ? readDraft(selectedId) : '')
  }, [selectedId])
  useEffect(() => {
    if (draftJustLoaded.current) { draftJustLoaded.current = false; return }
    if (selectedId && !editing) writeDraft(selectedId, text)
  }, [text, selectedId, editing])
  const [showFormat, setShowFormat] = useState(false)
  useEffect(() => {
    if (!headerMenu) return
    const close = () => setHeaderMenu(false)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close() } }
    document.addEventListener('click', close)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', onKey) }
  }, [headerMenu])
  // menções em grupo
  const [members, setMembers] = useState<GroupMember[]>([])
  const [picks, setPicks] = useState<MentionPick[]>([])
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null)
  const [mentionIdx, setMentionIdx] = useState(0)
  const [showInfo, setShowInfo] = useState(false)
  const [attUrls, setAttUrls] = useState<Record<string, string>>({})
  const [labelCatalog, setLabelCatalog] = useState<CrmLabel[]>([])
  const [replyTo, setReplyTo] = useState<Msg | null>(null)
  const [followupOpen, setFollowupOpen] = useState(false)
  const loadLabels = useCallback(() => { getCrmLabels().then(setLabelCatalog) }, [])
  useEffect(() => { loadLabels() }, [loadLabels])
  useEffect(() => { setReplyTo(null); setFollowupOpen(false); setShowStickers(false) }, [selectedId])
  const [lightboxId, setLightboxId] = useState<string | null>(null)
  const [showLinkContact, setShowLinkContact] = useState(false)
  const [showOtherNumber, setShowOtherNumber] = useState(false)
  const [showSolicitation, setShowSolicitation] = useState(false)
  const [solicitacaoSelectMode, setSolicitacaoSelectMode] = useState<{
    solicitationId: string; solicitationNumber: number; stage: string; stageLabel: string
    selected: Map<string, 'file' | 'observation' | 'location' | 'contact'>
  } | null>(null)
  const [contactQuery, setContactQuery] = useState('')
  const [contactResults, setContactResults] = useState<any[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [counts, setCounts] = useState({ mine: 0, unassigned: 0, all: 0, groups: 0 })
  // "meu WhatsApp" de quem está logado (vem com a lista de canais): os grupos dele aparecem direto e os
  // que só existem em outros números ficam numa seção à parte
  const [myInstanceIds, setMyInstanceIds] = useState<string[]>([])
  const [otherChannelsOpen, setOtherChannelsOpen] = useState(false)
  // fotos de perfil de quem fala no grupo aberto (jid -> link)
  const [partPhotos, setPartPhotos] = useState<Record<string, string>>({})
  const filter = useInstanceFilter()
  // com um WhatsApp só na tela, a etiqueta dele em cada linha é repetição (a borda colorida já diz)
  const showInstanceChip = filter.options.length > 1 && filter.selected.length !== 1
  const selectedKey = filter.selected.join(',')
  const labelFilter = useLabelFilter()
  const labelKey = labelFilter.selected.join(',')
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
  const [previewAudio, setPreviewAudio] = useState<{ file: File; url: string } | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const recordStreamRef = useRef<MediaStream | null>(null)
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Lista ────────────────────────────────────────────────────────────────────
  // Leitura por GET (em paralelo; não entra na fila das ações, então não atrasa um envio).
  // Uma por vez, sem repintar quando nada mudou. O resultado fica guardado por aba/filtro:
  // voltar a uma aba mostra na hora o que já tinha e atualiza por trás.
  const listCache = useRef(new Map<string, { items: ConversationRow[]; counts: typeof counts }>())
  const listKey = `${scope}|${filter.loaded ? selectedKey : readSavedInstanceSelection().join(',')}|${filter.loaded ? labelKey : readSavedLabelSelection().join(',')}`
  const listKeyRef = useRef(listKey)
  listKeyRef.current = listKey
  const [listError, setListError] = useState<string | null>(null)
  const listInFlight = useRef(false)
  const listDirty = useRef(false)
  const lastListSig = useRef('')
  const refreshListRef = useRef<(silent?: boolean) => void>(() => {})
  const lastStartRef = useRef({ key: '', at: 0 })
  const refreshList = useCallback((silent = false) => {
    void silent // a lista nunca some da tela ao atualizar; o esqueleto só aparece quando não há nada guardado
    // antes de o filtro "carregar", usa a escolha salva direto (mesma chave que ele vai ter)
    const sel = filter.loaded ? selectedKey : readSavedInstanceSelection().join(',')
    const lab = filter.loaded ? labelKey : readSavedLabelSelection().join(',')
    const key = `${scope}|${sel}|${lab}`
    if (listInFlight.current) { listDirty.current = true; return }
    listInFlight.current = true
    lastStartRef.current = { key, at: Date.now() }
    const ids = sel ? sel.split(',') : undefined
    window.dispatchEvent(new Event(CRM_AWAITING_REFRESH)) // atualiza o contador do menu (limitado a 1 a cada 15 s)
    fetchCrmSnapshot(scope, 200, ids, false, undefined, lab ? lab.split(',') : undefined)
      .then((r) => {
        if (r.error && !r.items?.length) throw new Error(r.error)
        listCache.current.set(key, { items: r.items ?? [], counts: r.counts })
        if (r.myInstanceIds) setMyInstanceIds((prev) => (prev.join() === r.myInstanceIds!.join() ? prev : r.myInstanceIds!))
        if (listKeyRef.current !== key) return // trocou de aba no meio do caminho
        setListError(null)
        setCounts((prev) => (JSON.stringify(prev) === JSON.stringify(r.counts) ? prev : r.counts))
        const sig = `${key}|${JSON.stringify(r.items ?? [])}`
        if (sig !== lastListSig.current) { lastListSig.current = sig; setConversations(r.items ?? []) }
      })
      .catch((e: Error) => { if (listKeyRef.current === key) setListError(e.message || 'Falha ao carregar as conversas') })
      .finally(() => {
        listInFlight.current = false
        if (listKeyRef.current === key) setLoadingList(false)
        if (listDirty.current) { listDirty.current = false; setTimeout(() => refreshListRef.current(true), 300) }
      })
  }, [scope, selectedKey, labelKey, filter.loaded])
  refreshListRef.current = refreshList
  // Trocou de aba/filtro: mostra na hora o que já estava guardado (ou o esqueleto) e atualiza.
  useEffect(() => {
    const c = listCache.current.get(listKey)
    lastListSig.current = ''
    setConversations(c?.items ?? [])
    if (c) setCounts(c.counts)
    setLoadingList(!c)
    setListError(null)
  }, [listKey])

  // ── Conversa aberta ──────────────────────────────────────────────────────────
  // Cada conversa visitada fica guardada: voltar a ela é instantâneo (e atualiza por trás).
  // Só a página mais recente é buscada; as antigas vêm ao rolar para cima.
  const selectedIdRef = useRef<string | null>(selectedId)
  selectedIdRef.current = selectedId
  const threadCache = useRef(new Map<string, { items: Msg[]; hasMore: boolean }>())
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const loadingOlderRef = useRef(false)
  const [threadError, setThreadError] = useState<string | null>(null)
  const lastThreadSig = useRef('')
  const pendingReactionsRef = useRef(new Map<string, string>()) // reações ainda sem confirmação (ver reactNow)
  // grava a conversa no cache e, se for a que está aberta, na tela (sem repintar à toa)
  const commitThread = useCallback((id: string, items: Msg[], more?: boolean) => {
    const prev = threadCache.current.get(id)
    const hm = more ?? prev?.hasMore ?? false
    threadCache.current.set(id, { items, hasMore: hm })
    if (selectedIdRef.current !== id) return
    const sig = id + '|' + items.map((m) => `${m.id}${m.pending ? 'p' : ''}${m.failed ? 'f' : ''}${m.deleted_at ? 'd' : ''}${m.storage_path ? 's' : ''}${m.drive_file_id ? 'g' : ''}${m.edited_at ?? ''}${m.reactions?.map((x) => x.emoji + x.count).join('') ?? ''}`).join(',')
    if (sig !== lastThreadSig.current) { lastThreadSig.current = sig; setMessages(items) }
    setHasMore(hm)
  }, [])
  const updateThread = useCallback((id: string, fn: (cur: Msg[]) => Msg[]) => {
    commitThread(id, fn(threadCache.current.get(id)?.items ?? []))
  }, [commitThread])

  const refreshThread = useCallback((id: string, silent = false) => {
    void silent
    fetchCrmMessages(id, { limit: MSG_PAGE })
      .then((r) => {
        if (r.error) throw new Error(r.error)
        const cur = threadCache.current.get(id)?.items ?? []
        const merged = mergeLatest(cur, (r.items as Msg[]) ?? [], r.hasMore)
        const pend = pendingReactionsRef.current
        const items = pend.size ? merged.items.map((m) => (pend.has(m.id) ? { ...m, reactions: withMyReaction(m.reactions ?? [], pend.get(m.id)!) } : m)) : merged.items
        commitThread(id, items, merged.keptOlder ? undefined : r.hasMore)
        if (selectedIdRef.current === id) setThreadError(null)
      })
      .catch((e: Error) => {
        // com algo já na tela, uma falha de atualização não apaga nada (tenta de novo no próximo evento)
        if (selectedIdRef.current === id && !threadCache.current.get(id)?.items.length) setThreadError(e.message || 'Falha ao carregar as mensagens')
      })
      .finally(() => { if (selectedIdRef.current === id) setLoadingThread(false) })
  }, [commitThread])

  // Rolou até o topo: busca a página anterior, mantendo a posição de leitura.
  const prependRef = useRef<{ h: number; top: number } | null>(null)
  const loadOlder = useCallback(() => {
    const id = selectedIdRef.current
    if (!id || loadingOlderRef.current) return
    const cur = threadCache.current.get(id)
    const oldest = cur?.items.find((m) => !isTemp(m))
    if (!cur?.hasMore || !oldest) return
    loadingOlderRef.current = true
    setLoadingOlder(true)
    fetchCrmMessages(id, { before: oldest.created_at, limit: MSG_PAGE })
      .then((r) => {
        if (r.error) throw new Error(r.error)
        const latest = threadCache.current.get(id)?.items ?? []
        const have = new Set(latest.map((m) => m.id))
        const older = ((r.items as Msg[]) ?? []).filter((m) => !have.has(m.id))
        const el = threadRef.current
        if (selectedIdRef.current === id && el && older.length) prependRef.current = { h: el.scrollHeight, top: el.scrollTop }
        commitThread(id, [...older, ...latest], older.length ? r.hasMore : false)
      })
      .catch(() => { if (selectedIdRef.current === id) toast.error('NÃO FOI POSSÍVEL CARREGAR', 'Mensagens anteriores — role para cima para tentar de novo') })
      .finally(() => { loadingOlderRef.current = false; setLoadingOlder(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitThread])

  // Avisa o resto do sistema qual conversa está à vista (não notificar o que já se está lendo)
  useEffect(() => { setOpenConversationId(selectedId); return () => setOpenConversationId(null) }, [selectedId])

  // Esc fecha a conversa (como no WhatsApp Web) — antes fecha o painel de dados, se estiver aberto.
  // Com janela, menu ou lista de sugestões abertos, o Esc é deles.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !selectedId || lightboxId) return
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"], [aria-modal="true"]')) return
      if (editing) { setEditing(null); setText(''); return }
      if (replyTo) { setReplyTo(null); return }
      if (showInfo) { setShowInfo(false); return }
      setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, showInfo, lightboxId, editing, replyTo])

  // Ao trocar de conversa: mostra na hora o que já estava guardado dela (ou o esqueleto) e atualiza.
  useEffect(() => {
    const c = selectedId ? threadCache.current.get(selectedId) : undefined
    lastThreadSig.current = ''
    setMessages(c?.items ?? [])
    setHasMore(c?.hasMore ?? false)
    setThreadError(null)
    setLoadingThread(!!selectedId && !c)
    if (selectedId) refreshThread(selectedId, true)
  }, [selectedId, refreshThread])
  useEffect(() => {
    // o filtro terminar de carregar com a mesma escolha não dispara uma segunda busca igual
    const sel = filter.loaded ? selectedKey : readSavedInstanceSelection().join(',')
    const last = lastStartRef.current
    if (last.key === `${scope}|${sel}` && Date.now() - last.at < 5000) return
    refreshList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshList])

  // Rolagem: abre no fim; mensagem nova só desce a tela se você já estava no fim (ou se foi
  // você quem enviou). Se você subiu para ler o histórico, a tela fica onde está.
  const threadRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const openedRef = useRef<string | null>(null)
  const prevCountRef = useRef(0)
  const [newBelow, setNewBelow] = useState(0) // mensagens que chegaram enquanto você lia o histórico
  const lastUserScrollRef = useRef(0)
  const onThreadScroll = () => {
    const el = threadRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40 // só "no fim" de verdade
    if (stickRef.current) setNewBelow((n) => (n ? 0 : n))
    if (el.scrollTop < 300) loadOlder() // perto do topo: já traz as anteriores
  }
  // Quem está rolando a tela (roda do mouse, dedo, teclado) está lendo: a tela não pode se mexer sozinha.
  const markReading = () => { lastUserScrollRef.current = Date.now() }
  useEffect(() => { openedRef.current = null; prevCountRef.current = 0; stickRef.current = true; setNewBelow(0) }, [selectedId])
  // (antes da pintura, para a tela não "pular" ao abrir nem ao entrarem as mensagens antigas)
  useLayoutEffect(() => {
    const el = threadRef.current
    if (!el || !messages.length) return
    const prev = prevCountRef.current
    prevCountRef.current = messages.length
    const pre = prependRef.current
    if (pre) {
      // entraram mensagens antigas no topo: o que você lia continua no mesmo lugar
      prependRef.current = null
      el.scrollTop = pre.top + (el.scrollHeight - pre.h)
      return
    }
    if (openedRef.current !== selectedId) {
      openedRef.current = selectedId
      el.scrollTop = el.scrollHeight
      // mídias carregam depois e empurram o conteúdo: reajusta enquanto você não rolou
      const t1 = setTimeout(() => { if (stickRef.current && threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight }, 400)
      const t2 = setTimeout(() => { if (stickRef.current && threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight }, 1500)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
    const last = messages[messages.length - 1]
    const reading = Date.now() - lastUserScrollRef.current < 6000 && last.direction !== 'outbound'
    if (messages.length > prev && !reading && (stickRef.current || last.direction === 'outbound')) {
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

  // Tempo real (Supabase). O evento já traz a mensagem: ela entra na tela na hora, sem buscar a
  // conversa de novo; a lista ganha a prévia/ordem/contador localmente. Depois, uma conferência
  // com o servidor por rajada de eventos (debounce) acerta o que o evento não traz (fotos,
  // reações, contadores das abas). O canal é aberto UMA vez (antes era refeito a cada troca de
  // conversa) e o relógio de 45 s é só uma rede de segurança.
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const rowToMsg = useCallback((r: Record<string, any>, prev?: Msg): Msg => {
    const m: Record<string, any> = { ...(prev ?? { reactions: [] }) }
    // só os campos que vieram: num UPDATE, texto/miniatura grandes que não mudaram podem não vir
    for (const k of MSG_FIELDS) if (k in r) m[k] = r[k]
    if (!prev) {
      m.sender_name = r.sender_user_id ? usersById.get(r.sender_user_id)?.name ?? null : null
      m.sender_avatar_url = r.sender_user_id ? usersById.get(r.sender_user_id)?.avatar_url ?? null : null
      m.sender_avatar_color = r.sender_user_id ? usersById.get(r.sender_user_id)?.avatar_color ?? null : null
      m.acted_by_name = r.acted_by_user_id ? usersById.get(r.acted_by_user_id)?.name ?? null : null
      m.acted_by_avatar_url = r.acted_by_user_id ? usersById.get(r.acted_by_user_id)?.avatar_url ?? null : null
      m.acted_by_avatar_color = r.acted_by_user_id ? usersById.get(r.acted_by_user_id)?.avatar_color ?? null : null
    }
    if (r.deleted_by_user_id && !m.deleted_by_name) m.deleted_by_name = usersById.get(r.deleted_by_user_id)?.name ?? null
    if (m.deleted_at) { m.body = null; m.storage_path = null; m.file_name = null; m.reactions = [] }
    return m as Msg
  }, [usersById])

  const realtimeRef = useRef<(p: { eventType?: string; new?: Record<string, any> | null }) => void>(() => {})
  const timersRef = useRef<{ list?: ReturnType<typeof setTimeout>; thread?: ReturnType<typeof setTimeout> }>({})
  const scheduleListCheck = useCallback(() => {
    clearTimeout(timersRef.current.list)
    timersRef.current.list = setTimeout(() => refreshListRef.current(true), 1200)
  }, [])
  const scheduleThreadCheck = useCallback((cid: string) => {
    clearTimeout(timersRef.current.thread)
    timersRef.current.thread = setTimeout(() => { if (selectedIdRef.current === cid) refreshThread(cid, true) }, 1200)
  }, [refreshThread])

  realtimeRef.current = (payload) => {
    const r = payload.new
    const cid = r?.conversation_id as string | undefined
    if (!r || !cid) { scheduleListCheck(); return }
    const isInsert = payload.eventType === 'INSERT'
    const cached = threadCache.current.get(cid)
    if (cached) {
      const idx = cached.items.findIndex((m) => m.id === r.id)
      if (idx >= 0) {
        const items = cached.items.slice()
        items[idx] = rowToMsg(r, cached.items[idx])
        commitThread(cid, items)
      } else if (isInsert) {
        const msg = rowToMsg(r)
        const temps = dropConfirmedTemps(cached.items.filter(isTemp), [msg])
        const real = [...cached.items.filter((m) => !isTemp(m)), msg].sort((a, b) => a.created_at.localeCompare(b.created_at))
        commitThread(cid, [...real, ...temps])
      }
    }
    // conferência da conversa aberta só quando o evento não traz tudo (foto de quem enviou)
    if (cid === selectedIdRef.current && isInsert && r.direction === 'outbound' && r.sender_user_id) scheduleThreadCheck(cid)

    if (isInsert) {
      if (r.direction === 'inbound') clearTypingFor(cid, true)
      const open = cid === selectedIdRef.current && document.visibilityState === 'visible'
      setConversations((cs) => {
        const i = cs.findIndex((c) => c.id === cid)
        if (i < 0) return cs
        const c = cs[i]
        const shows = !r.is_system // aviso do sistema não vira prévia
        const upd: ConversationRow = {
          ...c,
          last_message_at: r.created_at,
          last_at: shows ? r.created_at : c.last_at,
          last_body: shows ? messagePreview({ message_type: r.message_type, body: r.body, file_name: r.file_name }) : c.last_body,
          last_direction: shows ? r.direction : c.last_direction,
          unread_count: shows && r.direction === 'inbound' && !open ? c.unread_count + 1 : c.unread_count,
          archived: r.direction === 'inbound' ? false : c.archived,
        }
        const rest = cs.filter((_, j) => j !== i)
        const at = upd.pinned ? 0 : rest.findIndex((x) => !x.pinned)
        rest.splice(at < 0 ? rest.length : at, 0, upd)
        lastListSig.current = '' // a tela saiu do que veio do servidor: a próxima conferência repinta
        return rest
      })
      scheduleListCheck()
    } else {
      // edição/apagamento: a prévia da lista só muda se for a última mensagem
      const row = conversationsRef.current.find((c) => c.id === cid)
      if (row && row.last_at && r.created_at >= row.last_at) scheduleListCheck()
    }
  }
  const conversationsRef = useRef(conversations)
  conversationsRef.current = conversations

  useEffect(() => {
    const unsubscribe = subscribeCrmMessages('crm:all', '*', (p) => realtimeRef.current(p))
    const resync = () => {
      if (document.hidden) return
      refreshListRef.current(true)
      if (selectedIdRef.current) refreshThreadRef.current(selectedIdRef.current, true)
    }
    const safety = setInterval(resync, 45000)
    document.addEventListener('visibilitychange', resync)
    const timers = timersRef.current
    return () => {
      clearTimeout(timers.list)
      clearTimeout(timers.thread)
      clearInterval(safety)
      document.removeEventListener('visibilitychange', resync)
      unsubscribe()
    }
  }, [])
  const refreshThreadRef = useRef(refreshThread)
  refreshThreadRef.current = refreshThread

  // Enquanto a lista da outra aba ainda carrega (vazia), a conversa aberta continua na tela.
  const selectedRowRef = useRef<ConversationRow | null>(null)
  const foundSelected = selectedId ? conversations.find((c) => c.id === selectedId) ?? null : null
  if (foundSelected) selectedRowRef.current = foundSelected
  // Aberta por link (atividade da equipe, quadro, avisos) mas fora da lista na tela — outro WhatsApp
  // no filtro ou fora das mais recentes: busca só ela e abre do mesmo jeito.
  const [linkedRow, setLinkedRow] = useState<ConversationRow | null>(null)
  const missingSelected = !!selectedId && !foundSelected && !loadingList && filter.loaded && linkedRow?.id !== selectedId
  useEffect(() => {
    if (!missingSelected || !selectedId) return
    let alive = true
    getCrmConversationRow(selectedId).then((row) => { if (alive && row) setLinkedRow(row) }).catch(() => {})
    return () => { alive = false }
  }, [missingSelected, selectedId])
  const selected = foundSelected
    ?? (selectedId && conversations.length === 0 && selectedRowRef.current?.id === selectedId ? selectedRowRef.current : null)
    ?? (linkedRow && linkedRow.id === selectedId ? linkedRow : null)

  // ── "Digitando…" ─────────────────────────────────────────────────────────────
  // Recebido: o contato (pelo WhatsApp) ou outro atendente (pelo CRM) digitando, via crm_presence
  // em tempo real. Cada aviso vale alguns segundos: some sozinho se o "parou" não chegar.
  type Typing = { actor: string; name: string | null; state: string; at: number }
  const [typing, setTyping] = useState<Record<string, Typing[]>>({})
  useEffect(() => subscribeCrmPresence((row) => {
    if (row.actor === currentUserId) return // o próprio atendente não se vê digitando
    setTyping((cur) => {
      const list = (cur[row.conversation_id] ?? []).filter((t) => t.actor !== row.actor)
      if (row.state !== 'paused') list.push({ actor: row.actor, name: row.actor_name, state: row.state, at: Date.now() })
      return { ...cur, [row.conversation_id]: list }
    })
  }), [currentUserId])
  // contato: até 25 s sem novo aviso (o WhatsApp repete enquanto a pessoa digita); atendente: 8 s
  const typingAlive = (t: Typing, now: number) => now - t.at < (t.actor === 'contact' || t.actor.includes('@') ? 25_000 : 8_000)
  const hasTyping = Object.values(typing).some((l) => l.length > 0)
  useEffect(() => {
    if (!hasTyping) return
    const iv = setInterval(() => {
      const now = Date.now()
      setTyping((cur) => {
        let changed = false
        const next: Record<string, Typing[]> = {}
        for (const [k, l] of Object.entries(cur)) {
          const keep = l.filter((t) => typingAlive(t, now))
          if (keep.length !== l.length) changed = true
          if (keep.length) next[k] = keep
        }
        return changed ? next : cur
      })
    }, 2000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTyping])
  // chegou mensagem de quem estava digitando: o aviso some na hora
  const clearTypingFor = useCallback((cid: string, inbound: boolean) => {
    setTyping((cur) => (cur[cid]?.length ? { ...cur, [cid]: inbound ? cur[cid].filter((t) => !(t.actor === 'contact' || t.actor.includes('@'))) : cur[cid] } : cur))
  }, [])
  const typingLabel = (cid: string): { text: string; contact: boolean } | null => {
    const l = typing[cid]
    if (!l?.length) return null
    const contact = l.find((t) => t.actor === 'contact' || t.actor.includes('@'))
    if (contact) {
      const verb = contact.state === 'recording' ? 'gravando áudio…' : 'digitando…'
      return { text: contact.actor.includes('@') && contact.name ? `${contact.name.split(' ')[0]} está ${verb}` : verb, contact: true }
    }
    const staff = l[0]
    return { text: `${staff.name?.split(' ')[0] ?? 'Outro atendente'} está digitando…`, contact: false }
  }

  // o balão de "digitando" entrou no fim da conversa: desce junto se você já estava no fim
  const selectedTyping = !!(selectedId && typing[selectedId]?.some((t) => t.actor === 'contact' || t.actor.includes('@')))
  useEffect(() => {
    const el = threadRef.current
    if (selectedTyping && el && stickRef.current) requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }))
  }, [selectedTyping])

  // Enviado: enquanto você digita, o contato vê "digitando…" no WhatsApp (e os colegas, no CRM).
  // Um aviso a cada 4 s no máximo; 3 s sem digitar (ou ao enviar/trocar de conversa) manda "parou".
  const myTyping = useRef<{ cid: string | null; lastSent: number; idle?: ReturnType<typeof setTimeout> }>({ cid: null, lastSent: 0 })
  const postTyping = (cid: string, state: 'composing' | 'paused') => {
    fetch('/api/crm/typing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ c: cid, state }), keepalive: true }).catch(() => {})
  }
  const stopTyping = useCallback(() => {
    const t = myTyping.current
    clearTimeout(t.idle)
    if (t.cid && t.lastSent) postTyping(t.cid, 'paused')
    t.cid = null; t.lastSent = 0
  }, [])
  const notifyTyping = () => {
    const cid = selectedIdRef.current
    if (!cid) return
    const t = myTyping.current
    if (t.cid && t.cid !== cid) stopTyping()
    const now = Date.now()
    if (t.cid !== cid || now - t.lastSent > 4000) { postTyping(cid, 'composing'); t.cid = cid; t.lastSent = now }
    clearTimeout(t.idle)
    t.idle = setTimeout(stopTyping, 3000)
  }
  useEffect(() => stopTyping, [selectedId, stopTyping]) // trocou de conversa ou saiu da tela: parou

  // Como o WhatsApp Web aberto: com a conversa aberta e a aba à vista, o número fica online e
  // acompanha o contato — só assim o WhatsApp manda o "digitando…" dele. Renova a cada 20 s (o WhatsApp derruba o "online" se ficar muito tempo sem aviso);
  // ao esconder a aba, trocar de conversa ou sair, volta para offline.
  const watchOff = useRef<{ timer?: ReturnType<typeof setTimeout>; instance?: string | null }>({})
  const watchViewer = useRef(Math.random().toString(36).slice(2) + Date.now().toString(36)) // uma por aba
  useEffect(() => {
    if (!selectedId) return
    const cid = selectedId
    const instance = conversationsRef.current.find((c) => c.id === cid)?.instance_id ?? null
    // trocou para outra conversa do MESMO número: o "offline" da anterior nem sai (senão poderia
    // chegar depois do "online" desta)
    if (watchOff.current.timer && watchOff.current.instance === instance) clearTimeout(watchOff.current.timer)
    const post = (online: boolean) => fetch('/api/crm/watch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ c: cid, online, v: watchViewer.current }), keepalive: true }).catch(() => {})
    let on = false
    const sync = () => {
      const visible = document.visibilityState === 'visible'
      if (visible) { post(true); on = true } else if (on) { post(false); on = false }
    }
    sync()
    const iv = setInterval(() => { if (document.visibilityState === 'visible') post(true) }, 20_000)
    document.addEventListener('visibilitychange', sync)
    const onHide = () => { if (on) post(false) }
    window.addEventListener('pagehide', onHide)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('pagehide', onHide)
      if (on) watchOff.current = { instance, timer: setTimeout(() => { post(false); watchOff.current = {} }, 400) }
    }
  }, [selectedId])

  // Membros do grupo aberto (para mencionar e para trocar "@número" pelo nome nas mensagens)
  const selectedIsGroup = !!selected?.is_group
  useEffect(() => {
    setMembers([]); setPicks([]); setMention(null)
    if (!selectedId || !selectedIsGroup) return
    let alive = true
    getGroupParticipants(selectedId).then((r) => { if (alive && 'members' in r) setMembers(r.members) })
    return () => { alive = false }
  }, [selectedId, selectedIsGroup])
  // Plano B se a lista do WhatsApp não vier: quem já falou neste grupo
  const speakerMembers = useMemo<GroupMember[]>(() => {
    const seen = new Map<string, GroupMember>()
    for (const m of messages) {
      if (m.participant_jid && !seen.has(m.participant_jid)) seen.set(m.participant_jid, { jid: m.participant_jid, phone: null, name: m.participant_name ?? null, admin: false })
    }
    return Array.from(seen.values())
  }, [messages])
  const mentionable = members.length ? members : speakerMembers
  const mentionNames = useMemo(
    () => buildMentionNames(members, messages.map((m) => ({ jid: m.participant_jid ?? null, name: m.participant_name ?? null }))),
    [members, messages],
  )
  const mentionOptions = mention && selectedIsGroup
    ? [
        ...('todos'.startsWith(mention.query.toLowerCase()) ? [{ all: true as const }] : []),
        ...filterMembers(mentionable, mention.query).map((m) => ({ all: false as const, m })),
      ]
    : []
  const pickMention = (opt: (typeof mentionOptions)[number]) => {
    if (!mention) return
    const el = textareaRef.current
    const caret = el?.selectionStart ?? text.length
    const label = opt.all ? 'todos' : memberLabel(opt.m)
    const next = text.slice(0, mention.start) + '@' + label + ' ' + text.slice(caret)
    setText(next)
    if (!opt.all) setPicks((p) => (p.some((x) => x.jid === opt.m.jid) ? p : [...p, { name: label, jid: opt.m.jid }]))
    setMention(null)
    const pos = mention.start + label.length + 2
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos, pos) })
  }

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
    // zera o contador na hora; o servidor só registra (sem recarregar a lista inteira depois)
    const id = selected.id
    setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, unread_count: 0, marked_unread: false } : c)))
    lastListSig.current = ''
    markConversationRead(id).then(() => window.dispatchEvent(new Event(CRM_AWAITING_REFRESH)))
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

  const handleArchive = () => {
    if (!selected) return
    const id = selected.id
    const archive = !selected.archived
    startTransition(async () => {
      const r = await setConversationArchived(id, archive)
      if ('error' in r && r.error) { toast.error('ERRO', r.error); return }
      setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, archived: archive } : c)))
      toast.success(archive ? 'CONVERSA ARQUIVADA' : 'CONVERSA DESARQUIVADA', archive ? 'Volta para a lista quando o contato escrever de novo' : undefined)
      if (archive) setSelectedId(null)
      refreshList(true)
    })
  }

  const handlePin = () => {
    if (!selected) return
    const id = selected.id
    const next = !selected.pinned
    startTransition(async () => {
      const r = await setConversationPinned(id, next)
      if ('error' in r && r.error) toast.error('NÃO FOI POSSÍVEL FIXAR', r.error)
      else { toast.success(next ? 'CONVERSA FIXADA' : 'CONVERSA DESAFIXADA', next ? 'Ela fica no topo da sua lista' : ''); refreshList(true) }
    })
  }

  const handleToggleMySignature = () => {
    const next = !iSign
    setISign(next)
    startTransition(async () => {
      const r = await setMySignaturePref(next)
      if ('error' in r && r.error) { setISign(!next); toast.error('ERRO', r.error) }
      else toast.success(next ? 'COM ASSINATURA' : 'SEM ASSINATURA', next ? 'Suas mensagens voltam a levar o seu nome no começo, em todas as conversas' : 'Suas mensagens vão sem nome no começo, em todas as conversas')
    })
  }
  const handleToggleSignature = () => {
    if (!selected) return
    const id = selected.id
    const hide = !selected.hide_signature
    startTransition(async () => {
      const r = await setConversationSignature(id, hide)
      if ('error' in r && r.error) toast.error('ERRO', r.error)
      else { toast.success(hide ? 'SEM ASSINATURA' : 'COM ASSINATURA', hide ? 'As mensagens desta conversa vão sem o seu nome no começo' : 'As mensagens voltam a levar o nome de quem enviou'); refreshList(true) }
    })
  }

  // Abre a conversa com o número (cria se não existir), no WhatsApp da conversa atual.
  const openContactConversation = (phone: string) => {
    const instId = selected?.instance_id ?? (filter.selected[0] ?? filter.options[0]?.id)
    if (!instId) { toast.error('ESCOLHA UM WHATSAPP'); return }
    startTransition(async () => {
      const r = await startCrmConversation({ phone, instanceId: instId })
      if ('error' in r && r.error) { toast.error('NÃO FOI POSSÍVEL ABRIR', r.error); return }
      if ('conversationId' in r && r.conversationId) { refreshList(true); setSelectedId(r.conversationId) }
    })
  }

  // Encaminhar: a janela fecha na hora; nas conversas de destino já abertas a mensagem aparece com
  // o relógio (como no WhatsApp) e vira ✓✓ quando o envio confirma. Se falhar, fica marcada com
  // "Tentar de novo". Arquivo ainda não baixado é baixado antes, sem travar a tela.
  const doForward = async (conversationIds: string[], contacts: { id: string; phone: string }[]) => {
    const msg = forwarding
    if (!msg) return
    setForwarding(null)
    const srcInst = selected?.instance_id ?? null
    const ids = [...conversationIds]
    for (const c of contacts) {
      if (!srcInst) continue
      const r = await startCrmConversation({ phone: c.phone, instanceId: srcInst, contactId: c.id })
      if ('conversationId' in r && r.conversationId) ids.push(r.conversationId)
    }
    const targets = ids.filter((id) => id !== selectedIdRef.current) // a própria conversa de origem fica de fora
    if (!targets.length) return
    const isMedia = ['image', 'video', 'audio', 'document'].includes(msg.message_type)
    const temps = targets.map((cid) => {
      const temp = makeTemp({
        message_type: msg.message_type, body: msg.body, file_name: msg.file_name, mime_type: msg.mime_type,
        is_forwarded: true, local_url: isMedia ? (mediaUrlOf(msg) ?? null) : null,
      }, null)
      if (threadCache.current.has(cid)) updateThread(cid, (cur) => [...cur, temp])
      return { cid, temp }
    })
    const each = (cid: string) => () => postCrmForward(msg.id, [cid]).then((r) => (r.error ? { error: r.error } : { messageId: null }))
    if (targets.length === 1) {
      const { cid, temp } = temps[0]
      runSend(cid, temp.id, each(cid))
      return
    }
    const res = await postCrmForward(msg.id, targets)
    for (const { cid, temp } of temps) {
      if (!threadCache.current.has(cid)) continue
      updateThread(cid, (cur) => cur.map((m) => (m.id === temp.id ? (res.error ? { ...m, pending: false, failed: true, retry: each(cid) } : { ...m, pending: false }) : m)))
    }
    if (res.error) toast.error('NÃO FOI POSSÍVEL ENCAMINHAR', res.error)
    else toast.success('ENCAMINHADA', `Para ${res.sent} conversa(s)`)
  }

  // arquivo no Drive: sai pela rota do sistema; no Supabase: link assinado
  const mediaUrlOf = (m: Msg) => (m.local_url ? m.local_url : m.drive_file_id ? `/api/crm/media/${m.id}` : m.storage_path ? attUrls[m.storage_path] : undefined)
  const lightboxItems: LightboxItem[] = messages
    .filter((m) => (m.message_type === 'image' || m.message_type === 'video') && mediaUrlOf(m))
    .map((m) => ({ id: m.id, url: mediaUrlOf(m) as string, kind: m.message_type as 'image' | 'video', name: m.file_name }))
  // primeira mensagem do contato que ainda não tinha sido lida quando a conversa foi aberta
  const openedUnread = openedUnreadRef.current?.id === selectedId ? openedUnreadRef.current?.n ?? 0 : 0
  const layout = useMemo(() => threadLayout(messages), [messages])
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
  const archivedCount = conversations.filter((c) => c.archived).length
  // a busca procura em todas; sem busca, a lista mostra as arquivadas OU as demais
  const shelf = q ? conversations : conversations.filter((c) => c.archived === showArchived)
  const visibleConversations = !q ? shelf : shelf.filter((c) =>
    (c.contact_name ?? '').toLocaleLowerCase('pt-BR').includes(q) ||
    (c.last_body ?? '').toLocaleLowerCase('pt-BR').includes(q) ||
    (qDigits.length >= 3 && c.remote_jid.includes(qDigits)),
  )

  // Canais da Empresa: o mesmo grupo existe em vários números (mesmo id no WhatsApp). Cada grupo aparece
  // uma vez só: na versão do meu WhatsApp; os que não existem no meu ficam em "Outros WhatsApps".
  const channels = useMemo(() => {
    if (scope !== 'groups') return null
    const mine = new Set(myInstanceIds)
    const byJid = new Map<string, ConversationRow[]>()
    for (const c of visibleConversations) {
      if (!c.is_group) continue
      byJid.set(c.remote_jid, [...(byJid.get(c.remote_jid) ?? []), c])
    }
    const at = (c: ConversationRow) => c.last_at ?? c.last_message_at
    const own: ConversationRow[] = []
    const other: ConversationRow[] = []
    for (const rows of Array.from(byJid.values())) {
      const mineRow = rows.find((r) => mine.has(r.instance_id))
      if (mineRow || mine.size === 0) own.push(mineRow ?? [...rows].sort((a, b) => at(b).localeCompare(at(a)))[0])
      else other.push([...rows].sort((a, b) => at(b).localeCompare(at(a)))[0])
    }
    const byRecent = (a: ConversationRow, b: ConversationRow) => at(b).localeCompare(at(a))
    return { own: own.sort(byRecent), other: other.sort(byRecent) }
  }, [scope, visibleConversations, myInstanceIds])

  // linha de um canal: # (ou a foto do grupo), nome, prévia, hora e contador de não lidas
  const renderChannel = (c: ConversationRow, withChip: boolean) => {
    const unread = isUnread(c)
    const name = c.contact_name ?? c.remote_jid.split('@')[0]
    return (
      <button
        key={c.id}
        onClick={() => setSelectedId(c.id)}
        className={cn('w-full text-left pl-3 pr-3 flex items-center gap-2.5 transition-colors', selectedId === c.id ? 'bg-gray-100' : 'hover:bg-gray-50')}
      >
        {c.contact_photo_url ? (
          <img src={c.contact_photo_url} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
        ) : (
          <span className="w-9 h-9 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center shrink-0"><Hash className="w-5 h-5" /></span>
        )}
        <div className="min-w-0 flex-1 py-2 border-b border-gray-100">
          <div className="flex items-center gap-1.5">
            <p className={cn('flex-1 min-w-0 truncate text-[14.5px] leading-5', unread ? 'font-semibold text-gray-950' : 'text-gray-800')}>
              {c.is_restricted && <Lock className="inline w-3 h-3 mr-1 -mt-0.5 text-amber-600" aria-label="Grupo restrito" />}
              {name}
            </p>
            {withChip && (
              <span title={`WhatsApp: ${c.instance_label}`} className={cn('shrink min-w-0 max-w-[5.5rem] truncate text-[10px] font-medium px-1.5 rounded-full border', filter.colorOf(c.instance_id).chip)}>{c.instance_label}</span>
            )}
            <span className={cn('shrink-0 text-xs whitespace-nowrap', unread ? 'font-semibold text-emerald-600' : 'text-gray-400')}>{formatListTime(c.last_at ?? c.last_message_at)}</span>
          </div>
          <div className="flex items-center gap-1.5 min-h-[18px]">
            <p className={cn('flex-1 min-w-0 truncate text-[12.5px] leading-[18px]', unread ? 'text-gray-900 font-medium' : 'text-gray-500')}>
              {(() => { const tl = typingLabel(c.id); return tl ? <span className={cn('font-medium', tl.contact ? 'text-emerald-600' : 'italic')}>{tl.text}</span> : (c.last_body || 'Sem mensagens') })()}
            </p>
            {unread && (
              <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center" aria-label={c.unread_count > 0 ? `${c.unread_count} mensagens não lidas` : 'Marcada como não lida'}>
                {c.unread_count > 0 ? (c.unread_count > 99 ? '99+' : c.unread_count) : ''}
              </span>
            )}
          </div>
        </div>
      </button>
    )
  }

  useEffect(() => {
    setPartPhotos({})
    if (!selectedId || !selected?.is_group) return
    let alive = true
    fetch(`/api/crm/participant-photos?c=${selectedId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (alive && d?.photos) setPartPhotos(d.photos) })
      .catch(() => {})
    return () => { alive = false }
  }, [selectedId, selected?.is_group])

  // ── Envio otimista (texto, arquivo, áudio) ───────────────────────────────────
  // A mensagem entra na tela na hora com o relógio; o campo continua livre para a próxima.
  // Confirmou: o relógio vira ✓✓ e a mensagem real assume o lugar (sem duplicar). Falhou:
  // fica marcada em vermelho com "Tentar de novo" — nada do que foi escrito se perde.
  const meName = actingAsName ?? users.find((u) => u.id === currentUserId)?.name ?? null
  const makeTemp = (fields: Partial<Msg>, reply: Msg | null): Msg => ({
    id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    direction: 'outbound', sender_user_id: currentUserId, sender_name: meName,
    sender_avatar_url: users.find((u) => u.id === currentUserId)?.avatar_url ?? null, sender_avatar_color: users.find((u) => u.id === currentUserId)?.avatar_color ?? null,
    message_type: 'text', body: null, storage_path: null, file_name: null, mime_type: null,
    signed: iSign && !selected?.hide_signature,
    is_system: false, created_at: new Date().toISOString(),
    reply_to_provider_id: reply?.provider_message_id ?? null,
    reply_to_preview: reply ? (messagePreview({ message_type: reply.message_type, body: reply.body, file_name: reply.file_name }) || null) : null,
    pending: true,
    ...fields,
  })
  const runSend = (cid: string, tempId: string, send: () => Promise<{ error?: string; messageId?: string | null }>) => {
    send()
      .catch((e: Error) => ({ error: e?.message || 'Sem conexão com o servidor', messageId: null }))
      .then((res) => {
        if (res.error) {
          toast.error('MENSAGEM NÃO ENVIADA', res.error)
          updateThread(cid, (cur) => cur.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true, retry: send } : m)))
          return
        }
        // se a versão real já chegou pelo tempo real, a otimista já saiu e o map não acha nada
        updateThread(cid, (cur) => cur.map((m) => (m.id === tempId ? { ...m, pending: false, realId: res.messageId ?? null } : m)))
        scheduleThreadCheck(cid)
      })
  }
  // Reação aparece na hora (como no WhatsApp); o envio segue por trás. Enquanto o servidor não
  // confirma, as atualizações da conversa mantêm a reação nova; se falhar, volta a anterior.
  const pendingReactions = pendingReactionsRef // id da mensagem -> emoji ('' = tirou)
  const reactNow = (m: Msg, emoji: string) => {
    const cid = selectedIdRef.current
    if (!cid) return
    const before = m.reactions ?? []
    pendingReactions.current.set(m.id, emoji)
    updateThread(cid, (cur) => cur.map((x) => (x.id === m.id ? { ...x, reactions: withMyReaction(x.reactions ?? [], emoji) } : x)))
    postCrmReact(m.id, emoji)
      .catch((e: Error) => ({ error: e?.message || 'Sem conexão com o servidor' }))
      .then((r) => {
        if (pendingReactions.current.get(m.id) !== emoji) return // outra reação veio depois: ela manda
        pendingReactions.current.delete(m.id)
        if ('error' in r && r.error) {
          toast.error('NÃO FOI POSSÍVEL REAGIR', r.error)
          updateThread(cid, (cur) => cur.map((x) => (x.id === m.id ? { ...x, reactions: before } : x)))
        } else scheduleThreadCheck(cid)
      })
  }

  const retrySend = (m: Msg) => {
    const cid = selectedIdRef.current
    if (!cid || !m.retry) return
    updateThread(cid, (cur) => cur.map((x) => (x.id === m.id ? { ...x, pending: true, failed: false } : x)))
    runSend(cid, m.id, m.retry)
  }
  const discardFailed = (m: Msg) => {
    const cid = selectedIdRef.current
    if (!cid) return
    if (m.local_url) URL.revokeObjectURL(m.local_url)
    updateThread(cid, (cur) => cur.filter((x) => x.id !== m.id))
  }
  const enqueue = (cid: string, temp: Msg) => {
    updateThread(cid, (cur) => [...cur, temp])
    requestAnimationFrame(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }) })
  }

  const fileKind = (mime: string) => (mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'document')
  const sendFiles = (items: ComposedFile[]) => {
    const cid = selectedId
    if (!cid) { toast.error('ERRO', 'Escolha uma conversa primeiro'); return }
    const reply = replyTo
    setReplyTo(null)
    items.forEach(({ file, caption }) => {
      const temp = makeTemp({ message_type: fileKind(file.type), body: caption || null, file_name: file.name, mime_type: file.type, local_url: URL.createObjectURL(file) }, reply)
      enqueue(cid, temp)
      runSend(cid, temp.id, async () => {
        const up = await uploadCrmFile(cid, file)
        if (up.error) return { error: up.error }
        return postCrmSend({ conversationId: cid, storagePath: up.storagePath, fileName: file.name, mimeType: file.type, text: caption || undefined, replyToMessageId: reply?.id })
      })
    })
  }
  // Arquivos escolhidos, colados ou arrastados passam antes pela tela de envio (legenda, girar, desenhar)
  const [composerFiles, setComposerFiles] = useState<File[] | null>(null)
  const handleFile = (files: FileList | null) => { if (files?.length) setComposerFiles(Array.from(files)) }

  // Colar (Ctrl+V) uma imagem do clipboard: envia como imagem, igual ao WhatsApp.
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    const imgs = Array.from(items).filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
    if (!imgs.length) return
    e.preventDefault()
    const files = imgs.map((it) => it.getAsFile()).filter(Boolean) as File[]
    const named = files.map((f) => new File([f], (f.name && f.name !== 'image.png') ? f.name : `print-${Date.now()}.png`, { type: f.type || 'image/png' }))
    setComposerFiles(named)
  }

  const handleSend = () => {
    if (!text.trim() || !selectedId) return
    if (editing) {
      const target = editing
      const newText = text
      setText(''); setEditing(null)
      const cid = selectedId
      // o texto novo aparece na hora; se o WhatsApp recusar, volta o anterior
      updateThread(cid, (cur) => cur.map((m) => (m.id === target.id ? { ...m, body: newText, edited_at: new Date().toISOString() } : m)))
      editCrmMessage(target.id, newText).then((r) => {
        if ('error' in r && r.error) {
          toast.error('NÃO FOI POSSÍVEL EDITAR', r.error)
          updateThread(cid, (cur) => cur.map((m) => (m.id === target.id ? { ...m, body: target.body, edited_at: target.edited_at ?? null } : m)))
          setEditing(target); setText((cur) => cur || newText)
        }
      })
      return
    }
    const cid = selectedId
    const reply = replyTo
    const out = selectedIsGroup ? applyMentionsToSend(text, picks) : { text, mentioned: [] as string[], all: false }
    setText('')
    setPicks([]); setMention(null); setReplyTo(null)
    stopTyping()
    const temp = makeTemp({ body: out.text }, reply)
    enqueue(cid, temp)
    runSend(cid, temp.id, () => postCrmSend({ conversationId: cid, text: out.text, replyToMessageId: reply?.id, mentioned: out.mentioned, mentionAll: out.all }))
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

  function sendPreviewAudio() {
    if (!previewAudio || !selectedId) return
    const { file } = previewAudio
    const cid = selectedId
    const reply = replyTo
    setPreviewAudio(null) // a prévia vira a mensagem otimista (o link local segue vivo até confirmar)
    setReplyTo(null)
    const temp = makeTemp({ message_type: 'audio', file_name: file.name, mime_type: file.type, local_url: previewAudio.url }, reply)
    enqueue(cid, temp)
    runSend(cid, temp.id, async () => {
      const up = await uploadCrmFile(cid, file)
      if (up.error) return { error: up.error }
      return postCrmSend({ conversationId: cid, storagePath: up.storagePath, fileName: file.name, mimeType: file.type, isVoiceNote: true, replyToMessageId: reply?.id })
    })
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
    <div className="flex h-[calc(100dvh-8rem)] gap-0 bg-white">
      {/* ──────────────────────────────────────────────────────────────────────
          SIDEBAR - Conversas
          ────────────────────────────────────────────────────────────────────── */}
      <div className={cn("w-full md:w-80 shrink-0 flex-col border-r border-gray-200 bg-white", selectedId ? "hidden md:flex" : "flex")}>
        {/* Header com tabs */}
        <div className="px-3 pt-3 pb-2 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-gray-900">Conversas</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowNewConv(true)}
                title="Nova conversa"
                aria-label="Nova conversa"
                className="p-1.5 rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={handleSyncContacts}
                disabled={syncingContacts}
                title="Sincronizar nomes e fotos dos contatos"
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn('w-4 h-4', syncingContacts && 'animate-spin')} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mb-2 min-w-0">
            <InstanceFilter options={filter.options} selected={filter.selected} onChange={filter.setSelected} className="min-w-0" />
            <LabelFilter labels={labelCatalog} selected={labelFilter.selected} onChange={labelFilter.setSelected} />
          </div>
          <div className="relative mb-2">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar nome, telefone ou mensagem"
              aria-label="Buscar conversa"
              className="w-full pl-9 pr-8 py-1.5 text-sm bg-gray-100 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Limpar busca" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {shortDigits && <p role="status" className="text-xs text-amber-700 mb-2">Digite ao menos 3 números para buscar por telefone</p>}
          <div className="flex gap-1" role="tablist">
            {(['all', 'mine', 'groups'] as const).map((key) => (
              <button
                key={key}
                role="tab"
                aria-selected={scope === key}
                title={key === 'groups' ? 'Canais da Empresa (grupos de WhatsApp)' : undefined}
                onClick={() => setScope(key)}
                className={cn(
                  'flex-1 min-w-0 whitespace-nowrap px-1 py-1 text-[12.5px] font-medium rounded-full transition-colors',
                  scope === key
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {key === 'mine' ? 'Minhas' : key === 'all' ? 'Todas' : 'Canais'}
                {counts[key] > 0 && (
                  <span className="ml-0.5 text-[11px] opacity-70">{counts[key]}</span>
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
          {(loadingList || !filter.loaded) && conversations.length === 0 && !listError && <ConversationListSkeleton />}
          {listError && conversations.length === 0 && (
            <LoadError message="Não foi possível carregar as conversas." onRetry={() => { setListError(null); setLoadingList(true); refreshList() }} />
          )}
          {!loadingList && filter.loaded && !listError && visibleConversations.length === 0 && (
            <div className="text-sm text-gray-500 p-4 text-center space-y-2">
              <p>{q ? `Nenhuma conversa encontrada para “${query.trim()}”` : labelFilter.selected.length ? 'Nenhuma conversa com essa etiqueta aqui' : 'Nenhuma conversa aqui'}</p>
            </div>
          )}
          {!q && (showArchived || archivedCount > 0) && (
            <button
              onClick={() => { setShowArchived((v) => !v); setSelectedId(null) }}
              className="w-full flex items-center gap-3 pl-[22px] pr-4 py-2.5 text-[15px] text-gray-700 hover:bg-gray-50 border-b border-gray-100"
            >
              {showArchived ? <ChevronLeft className="w-5 h-5 text-emerald-700" /> : <Archive className="w-5 h-5 text-emerald-700" />}
              <span className="flex-1 text-left">{showArchived ? 'Voltar para as conversas' : 'Arquivadas'}</span>
              {!showArchived && <span className="text-xs text-emerald-700 font-medium">{archivedCount}</span>}
            </button>
          )}
          {scope === 'groups' && channels ? (
            <div className="pb-3">
              <p className="px-4 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-gray-400">CANAIS DA EMPRESA</p>
              {channels.own.map((c) => renderChannel(c, false))}
              {channels.other.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setOtherChannelsOpen((v) => !v)}
                    aria-expanded={otherChannelsOpen}
                    className="mt-2 w-full flex items-center gap-2 px-4 py-2 text-[11px] font-semibold tracking-wider text-gray-400 hover:bg-gray-50"
                  >
                    <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', !otherChannelsOpen && '-rotate-90')} />
                    <span className="flex-1 text-left">OUTROS WHATSAPPS ({channels.other.length})</span>
                    {!otherChannelsOpen && channels.other.some(isUnread) && <span className="w-2 h-2 rounded-full bg-emerald-500" aria-label="Há mensagens não lidas" />}
                  </button>
                  {otherChannelsOpen && (
                    <>
                      <p className="px-4 pb-1 text-[11.5px] leading-4 text-gray-400">Grupos que não existem no seu WhatsApp, só em outros números.</p>
                      {channels.other.map((c) => renderChannel(c, true))}
                    </>
                  )}
                </>
              )}
            </div>
          ) : (
          <div>
            {visibleConversations.map((c) => {
              const unread = isUnread(c)
              const name = c.contact_name ?? c.remote_jid.split('@')[0]
              return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  'w-full text-left pl-2.5 pr-3 flex items-center gap-3 border-l-4 transition-colors',
                  filter.colorOf(c.instance_id).bar,
                  selectedId === c.id ? 'bg-gray-100' : 'hover:bg-gray-50'
                )}
              >
                <ConvAvatar id={c.id} name={name} photo={c.contact_photo_url} isGroup={c.is_group} size={48} />
                <div className="min-w-0 flex-1 py-2.5 border-b border-gray-100">
                  <div className="flex items-center gap-1.5">
                    <p className={cn('flex-1 min-w-0 truncate text-[15px] leading-5', unread ? 'font-semibold text-gray-950' : 'text-gray-900')}>
                      {c.is_restricted && <Lock className="inline w-3 h-3 mr-1 -mt-0.5 text-amber-600" aria-label="Grupo restrito" />}
                      {name}
                    </p>
                    {showInstanceChip && (
                      <span title={`WhatsApp: ${c.instance_label}`} className={cn('shrink min-w-0 max-w-[5.5rem] truncate text-[10px] font-medium px-1.5 rounded-full border', filter.colorOf(c.instance_id).chip)}>
                        {c.instance_label}
                      </span>
                    )}
                    <span className={cn('shrink-0 text-xs whitespace-nowrap', unread ? 'font-semibold text-emerald-600' : 'text-gray-500')} title={new Date(c.last_at ?? c.last_message_at).toLocaleString('pt-BR')}>
                      {formatListTime(c.last_at ?? c.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 min-h-[20px]">
                    <p className={cn('flex-1 min-w-0 flex items-center gap-1 text-[13px] leading-5', unread ? 'text-gray-900 font-medium' : 'text-gray-500')}>
                      {(() => {
                        const tl = typingLabel(c.id)
                        if (tl) return <span className={cn('truncate font-medium', tl.contact ? 'text-emerald-600' : 'text-gray-500 italic')}>{tl.text}</span>
                        return (
                          <>
                            {c.last_direction === 'outbound' && <CheckCheck className="w-4 h-4 shrink-0 text-sky-500" aria-label="Última mensagem enviada por nós" />}
                            <span className="truncate">{c.last_body || 'Sem mensagens'}</span>
                          </>
                        )
                      })()}
                    </p>
                    {c.next_followup && (
                      <span title={`Follow-up ${formatDue(c.next_followup.due_at)}${c.next_followup.note ? ` · ${c.next_followup.note}` : ''}`} className={cn('shrink-0 rounded-full p-0.5 border', DUE_STYLE[dueState(c.next_followup.due_at)])}>
                        <CalendarClock className="w-3 h-3" />
                      </span>
                    )}
                    {c.pinned && <Pin className="w-3.5 h-3.5 shrink-0 text-gray-400 rotate-45" aria-label="Fixada" />}
                    {!unread && c.stale_count > 0 && (
                      <span
                        className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full text-[11px] bg-red-500 text-white font-bold flex items-center justify-center"
                        title={`${c.stale_count} mensagem(ns) do contato aberta(s) e sem resposta há mais de 1 dia`}
                        aria-label={`${c.stale_count} mensagens sem resposta há mais de 1 dia`}
                      >
                        {c.stale_count > 99 ? '99+' : c.stale_count}
                      </span>
                    )}
                    {unread && (
                      <span
                        className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center"
                        title={c.unread_count > 0 ? `${c.unread_count} mensagem(ns) não lida(s)` : 'Marcada como não lida'}
                        aria-label={c.unread_count > 0 ? `${c.unread_count} mensagens não lidas` : 'Marcada como não lida'}
                      >
                        {c.unread_count > 0 ? (c.unread_count > 99 ? '99+' : c.unread_count) : ''}
                      </span>
                    )}
                  </div>
                </div>
              </button>
              )
            })}
          </div>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────
          MAIN - Thread de mensagens
          ────────────────────────────────────────────────────────────────────── */}
      <div className={cn("relative flex-1 flex-col overflow-hidden bg-gray-50 min-w-0", selectedId ? "flex" : "hidden md:flex")}>
        {/* tela de envio de arquivos: cobre só a área da conversa, como no WhatsApp Web */}
        {composerFiles && selected && (
          <MediaComposer
            initialFiles={composerFiles}
            contactName={selected.contact_name ?? selected.remote_jid.split('@')[0]}
            onClose={() => setComposerFiles(null)}
            onSend={(items) => { setComposerFiles(null); sendFiles(items) }}
          />
        )}


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
            <div className="px-2 md:px-4 py-2 border-b border-gray-200 bg-[#F7F8FA] flex items-center justify-between gap-1 md:gap-2">
              <button type="button" onClick={() => setSelectedId(null)} aria-label="Voltar para a lista de conversas" className="md:hidden -ml-2 p-2 rounded-full text-gray-600 hover:bg-gray-200/70 shrink-0">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer" onClick={() => setShowInfo(true)}>
                <ConvAvatar id={selected.id} name={selected.contact_name ?? selected.remote_jid.split('@')[0]} photo={selected.contact_photo_url} isGroup={selected.is_group} size={40} />
                <div className="min-w-0 overflow-hidden">
                  <h3 className="font-semibold text-gray-900 truncate leading-5">
                    {selected.is_restricted && <Lock className="inline w-3.5 h-3.5 mr-1 -mt-0.5 text-amber-600" aria-label="Grupo restrito" />}
                    {selected.contact_name ?? selected.remote_jid.split('@')[0]}
                  </h3>
                  {(() => {
                    // como no WhatsApp: "digitando…" toma o lugar da linha de baixo enquanto dura
                    const tl = typingLabel(selected.id)
                    if (tl) return <p role="status" aria-live="polite" className={cn('mt-0.5 text-[13px] leading-[20px] truncate', tl.contact ? 'text-emerald-600 font-medium' : 'text-gray-500 italic')}>{tl.text}</p>
                    return (
                      <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                        <span className={cn('shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-px rounded-full border', filter.colorOf(selected.instance_id).chip)}>
                          <WhatsappIcon className="w-3 h-3" />{selected.instance_label}
                        </span>
                        <ConvTags type={selected.contact_type} labels={selected.labels} className="min-w-0 overflow-hidden flex-nowrap" />
                      </div>
                    )
                  })()}
                </div>
                {!selected.is_group && <div className="max-md:hidden ml-2 pl-3 border-l border-gray-200 shrink-0 whitespace-nowrap">
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
                  onClick={() => setShowInfo((v) => !v)}
                  title="Dados do contato"
                  aria-label="Dados do contato"
                  aria-pressed={showInfo}
                  className={cn('px-2.5 py-2 text-sm rounded-lg transition-colors', showInfo ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-200/70')}
                >
                  <Info className="w-4 h-4" />
                </button>
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setHeaderMenu((v) => !v) }}
                    title="Mais opções"
                    aria-label="Mais opções da conversa"
                    aria-haspopup="menu"
                    aria-expanded={headerMenu}
                    className={cn('px-2.5 py-2 text-sm rounded-lg transition-colors text-gray-700', headerMenu ? 'bg-gray-200' : 'hover:bg-gray-200/70')}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {headerMenu && (
                    <div role="menu" onClick={(e) => e.stopPropagation()} className="absolute right-0 top-10 z-40 w-60 bg-white border border-gray-200 rounded-xl shadow-xl py-1 text-sm text-gray-800">
                      <button role="menuitem" disabled={pending} onClick={() => { setHeaderMenu(false); handlePin() }} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50">
                        {selected.pinned ? <PinOff className="w-4 h-4 text-amber-600" /> : <Pin className="w-4 h-4 text-gray-500" />}
                        {selected.pinned ? 'Desafixar do topo' : 'Fixar no topo da lista'}
                      </button>
                      <button role="menuitem" disabled={pending} onClick={() => { setHeaderMenu(false); handleArchive() }} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50">
                        {selected.archived ? <ArchiveRestore className="w-4 h-4 text-gray-500" /> : <Archive className="w-4 h-4 text-gray-500" />}
                        {selected.archived ? 'Desarquivar conversa' : 'Arquivar conversa'}
                      </button>
                      <button role="menuitem" disabled={pending} onClick={() => { setHeaderMenu(false); handleMarkUnread() }} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50">
                        <MailOpen className="w-4 h-4 text-gray-500" /> Marcar como não lida
                      </button>
                      {!selected.is_group && (
                        <button role="menuitem" onClick={() => { setHeaderMenu(false); setShowLinkContact(true) }} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50">
                          <Link2 className="w-4 h-4 text-gray-500" /> Vincular contato / dar um nome
                        </button>
                      )}
                      {!selected.is_group && filter.options.length > 1 && (
                        <button role="menuitem" onClick={() => { setHeaderMenu(false); setShowOtherNumber(true) }} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50">
                          <ArrowRightLeft className="w-4 h-4 text-gray-500" /> Iniciar em outro WhatsApp
                        </button>
                      )}
                      <button role="menuitem" onClick={() => { setHeaderMenu(false); setShowSolicitation(true) }} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50">
                        <Folder className="w-4 h-4 text-indigo-500" /> Registrar solicitação
                      </button>
                      <button role="menuitem" onClick={() => { setHeaderMenu(false); setShowReassign(true) }} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50">
                        <UserCog className="w-4 h-4 text-gray-500" /> Transferir ou liberar
                      </button>
                    </div>
                  )}
                </div>
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
            <div ref={threadRef} data-thread onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() }} onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setComposerFiles(Array.from(e.dataTransfer.files)) } }} onScroll={onThreadScroll} onWheel={markReading} onTouchMove={markReading} onKeyDown={markReading} className="flex-1 overflow-y-auto overflow-x-hidden px-[4%] py-3 bg-[#EFEAE2]" style={{ backgroundImage: 'radial-gradient(rgba(0,0,0,0.035) 1px, transparent 1px)', backgroundSize: '18px 18px' }}>
              {loadingThread && messages.length === 0 && !threadError && <ThreadSkeleton />}
              {threadError && messages.length === 0 && (
                <LoadError message="Não foi possível carregar as mensagens." onRetry={() => { setThreadError(null); setLoadingThread(true); refreshThread(selectedId!) }} />
              )}
              {/* sobreposto (altura zero): não empurra o que você está lendo enquanto as antigas chegam */}
              {loadingOlder && (
                <div className="sticky top-0 z-20 h-0 flex justify-center pointer-events-none">
                  <LuknosSpinner size="sm" label={null} delay={150} className="mt-2" />
                </div>
              )}
              {!hasMore && !loadingThread && messages.length >= MSG_PAGE && (
                <p className="text-center text-[11px] text-gray-500 py-2">Início da conversa</p>
              )}
              {messages.map((m, i) => (
                <Fragment key={m.id}>
                {layout[i]?.day && (
                  <div className="sticky top-0 z-10 flex justify-center py-2" role="separator">
                    <span className="px-3 py-1 rounded-lg bg-white text-[12px] font-medium text-gray-600 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">{layout[i].day}</span>
                  </div>
                )}
                {m.id === firstUnreadId && (
                  <div className="my-2 py-1 text-center bg-white/70 text-xs font-semibold text-emerald-700" role="separator">
                    {openedUnread} mensage{openedUnread === 1 ? 'm' : 'ns'} não lida{openedUnread === 1 ? '' : 's'}
                  </div>
                )}
                <div className={cn(layout[i]?.first ? 'mt-2.5' : 'mt-0.5', solicitacaoSelectMode && !m.is_system && !m.deleted_at && 'flex items-end gap-2')}>
                {solicitacaoSelectMode && !m.is_system && !m.deleted_at && (
                  <button
                    type="button"
                    aria-label={solicitacaoSelectMode.selected.has(m.id) ? 'Desmarcar mensagem' : 'Selecionar mensagem'}
                    onClick={() => {
                      setSolicitacaoSelectMode((prev) => {
                        if (!prev) return prev
                        const next = new Map(prev.selected)
                        if (next.has(m.id)) { next.delete(m.id) }
                        else {
                          const ft = m.message_type === 'location' ? 'location' : m.message_type === 'contact' ? 'contact' : ['image','video','audio','document'].includes(m.message_type) ? 'file' : 'observation'
                          next.set(m.id, ft as 'file'|'observation'|'location'|'contact')
                        }
                        return { ...prev, selected: next }
                      })
                    }}
                    className={cn(
                      'shrink-0 mb-1 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors',
                      solicitacaoSelectMode.selected.has(m.id)
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-white border-gray-400 hover:border-indigo-400'
                    )}
                  >
                    {solicitacaoSelectMode.selected.has(m.id) && (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    )}
                  </button>
                )}
                <div className={cn(solicitacaoSelectMode && !m.is_system && !m.deleted_at ? 'flex-1 min-w-0' : '')}>
                <MessageBubble
                  msg={m}
                  first={layout[i]?.first ?? true}
                  currentUserId={currentUserId}
                  hideSignature={!!selected.hide_signature}
                  participantPhoto={m.participant_jid ? partPhotos[m.participant_jid] : null}
                  url={mediaUrlOf(m)}
                  onDownload={async () => {
                    const r = await downloadCrmMedia(m.id)
                    if ('error' in r && r.error) toast.error('NÃO FOI POSSÍVEL BAIXAR', r.error)
                    else refreshThread(selectedId!, true)
                  }}
                  onOpenMedia={() => setLightboxId(m.id)}
                  onOpenAttachment={openAttachment}
                  contact={{ id: selected.id, name: selected.contact_name ?? selected.remote_jid.split('@')[0], photo: selected.contact_photo_url }}
                  onOpenContact={(phone) => openContactConversation(phone)}
                  isGroup={selected.is_group}
                  parent={m.reply_to_provider_id ? messages.find((x) => x.provider_message_id === m.reply_to_provider_id) ?? null : null}
                  onReply={() => { if (!solicitacaoSelectMode) { setReplyTo(m); textareaRef.current?.focus() } }}
                  mentionNames={selectedIsGroup ? mentionNames : undefined}
                  onSaveSticker={async () => {
                    const r = await saveMessageAsSticker(m.id)
                    if ('error' in r && r.error) toast.error('NÃO FOI POSSÍVEL GUARDAR', r.error)
                    else toast.success('FIGURINHA GUARDADA', 'Já está na biblioteca da equipe')
                  }}
                  onReact={(emoji) => { if (!solicitacaoSelectMode) reactNow(m, emoji) }}
                  canDelete={!solicitacaoSelectMode && !isTemp(m) && canDeleteForEveryone(m as any) && (m.sender_user_id === currentUserId || isAdmin || !m.sender_user_id)}
                  canForward={!solicitacaoSelectMode && !isTemp(m) && !m.deleted_at && (['image', 'video', 'audio', 'document'].includes(m.message_type) || !!(m.body && m.body.trim()))}
                  onRetry={() => retrySend(m)}
                  onDiscard={() => discardFailed(m)}
                  onForward={() => setForwarding(m)}
                  canEdit={!solicitacaoSelectMode && !isTemp(m) && canEditMessage(m as any) && (m.sender_user_id === currentUserId || isAdmin)}
                  onEdit={() => { setReplyTo(null); setEditing(m); setText(m.body ?? ''); requestAnimationFrame(() => textareaRef.current?.focus()) }}
                  onDelete={async () => {
                    if (!window.confirm('Apagar esta mensagem para todos? Ela some da conversa do cliente também.')) return
                    const r = await deleteCrmMessage(m.id)
                    if (r.error) toast.error('NÃO FOI POSSÍVEL APAGAR', r.error)
                    else { toast.success('MENSAGEM APAGADA'); refreshThread(selectedId!) }
                  }}
                />
                </div>
                </div>
                </Fragment>
              ))}
              {/* contato digitando: o balão com os três pontinhos, como no WhatsApp */}
              {(() => {
                const tl = typingLabel(selected.id)
                if (!tl?.contact) return null
                return (
                  <div className="mt-2.5 flex justify-start" role="status" aria-label={tl.text}>
                    <div className="rounded-lg rounded-tl-none bg-white px-3.5 py-3 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                      {selected.is_group && tl.text.includes(' está ') && <p className="mb-1 text-[12px] font-semibold text-emerald-700">{tl.text.split(' está ')[0]}</p>}
                      <span className="flex items-center gap-1" aria-hidden>
                        <span className="crm-typing-dot" /><span className="crm-typing-dot" /><span className="crm-typing-dot" />
                      </span>
                    </div>
                  </div>
                )
              })()}
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

            {/* Barra de seleção para solicitação */}
            {solicitacaoSelectMode && (() => {
              const mode = solicitacaoSelectMode
              const stageObj = SOLIC_STAGES.find((s) => s.id === mode.stage)
              const n = mode.selected.size
              return (
                <div className="border-t border-indigo-200 bg-indigo-50 px-4 py-3 flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Folder className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className="text-sm font-medium text-indigo-900 truncate">Solicitação #{mode.solicitationNumber}</span>
                    {stageObj && (
                      <span className={cn('inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border', stageObj.color)}>
                        {stageObj.label}
                      </span>
                    )}
                    <span className="text-xs text-indigo-700">{n} selecionada{n !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setSolicitacaoSelectMode(null)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-100"
                    >
                      Cancelar
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => {
                        const links = Array.from(mode.selected.entries()).map(([messageId, field]) => ({ messageId, field }))
                        const solicitationId = mode.solicitationId
                        const num = mode.solicitationNumber
                        startTransition(async () => {
                          const r = await linkCrmMessagesToSolicitationStage({ solicitationId, stage: mode.stage, links })
                          if ('error' in r) { toast.error('ERRO', r.error); return }
                          const msg = n === 0 ? `Etapa registrada na solicitação #${num}` : `${n} mensagem(ns) vinculada(s) à solicitação #${num}`
                          toast.success('REGISTRADO', msg, { action: { label: 'Ver solicitação', href: `/solicitacoes/${solicitationId}` } })
                          setSolicitacaoSelectMode(null)
                        })
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 inline-flex items-center gap-1.5"
                    >
                      {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Folder className="w-3 h-3" />}
                      Registrar
                    </button>
                  </div>
                </div>
              )
            })()}

            {/* Composer — oculto durante modo de seleção de solicitação */}
            {!solicitacaoSelectMode && (recording ? (
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

                  className="p-2 bg-gray-900 text-white hover:bg-gray-800 rounded-full transition-colors"
                  title="Enviar áudio"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="px-3 py-2 border-t border-gray-200 bg-[#F7F8FA]">
              {editing && (
                <div className="mb-2 flex items-start gap-2 rounded-lg bg-white border-l-4 border-emerald-500 px-3 py-2" role="status">
                  <Pencil className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold text-emerald-700 text-xs">Editando mensagem</p>
                    <p className="text-gray-600 truncate">{editing.body}</p>
                  </div>
                  <button type="button" onClick={() => { setEditing(null); setText('') }} aria-label="Cancelar edição" className="p-1 rounded hover:bg-gray-200 text-gray-500"><X className="w-4 h-4" /></button>
                </div>
              )}
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
              {showFormat && <FormatToolbar textareaRef={textareaRef} value={text} setValue={setText} />}
              <div className={cn('flex items-end gap-1', showFormat && 'mt-1')}>
                {/* Celular: o que não cabe na linha fica no menu "+" */}
                <div className="relative md:hidden">
                  <button
                    type="button"
                    onClick={() => setShowMore((v) => !v)}
                    className={cn('relative p-2.5 rounded-lg transition-colors text-gray-600 hover:bg-gray-100', showMore && 'bg-gray-100')}
                    aria-label="Mais opções"
                    aria-expanded={showMore}
                  >
                    <Plus className="w-5 h-5" />
                    {(!iSign || selected?.hide_signature) && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500" aria-hidden />}
                  </button>
                  {showMore && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowMore(false)} aria-hidden />
                      <div role="menu" className="absolute bottom-full left-0 mb-2 z-40 w-64 bg-white border border-gray-200 rounded-xl shadow-xl py-1 text-sm text-gray-800">
                        <button role="menuitem" type="button" onClick={() => { setShowMore(false); fileInputRef.current?.click() }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left">
                          <Paperclip className="w-5 h-5 text-gray-500" /> Anexar arquivo
                        </button>
                        <button role="menuitem" type="button" onClick={() => { setShowMore(false); setShowStickers(true) }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left">
                          <StickerIcon className="w-5 h-5 text-gray-500" /> Figurinhas
                        </button>
                        <button role="menuitem" type="button" onClick={() => { setShowMore(false); setShowSendContact(true) }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left">
                          <ContactRound className="w-5 h-5 text-gray-500" /> Enviar contato
                        </button>
                        <button role="menuitem" type="button" onClick={() => { setShowMore(false); setShowFormat((v) => !v) }} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left">
                          <span className="w-5 text-center font-semibold text-gray-500">Aa</span> {showFormat ? 'Esconder formatação' : 'Formatação'}
                        </button>
                        <div className="border-t border-gray-100">
                          <SignatureSettings iSign={iSign} convHidden={!!selected?.hide_signature} onToggleMine={() => { setShowMore(false); handleToggleMySignature() }} onToggleConv={() => { setShowMore(false); handleToggleSignature() }} />
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowFormat((v) => !v)}
                  className={cn('max-md:hidden p-2.5 rounded-lg transition-colors text-sm font-semibold leading-5 w-10', showFormat ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100')}
                  title={showFormat ? 'Esconder formatação' : 'Formatação (negrito, itálico, listas…)'}
                  aria-label="Formatação"
                  aria-pressed={showFormat}
                >
                  Aa
                </button>
                {/* Ícone de anexo */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="max-md:hidden p-2.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
                  title="Anexar arquivo"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowSendContact(true)}
                 
                  className="max-md:hidden p-2.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
                  title="Enviar contato do sistema"
                  aria-label="Enviar contato"
                >
                  <ContactRound className="w-5 h-5" />
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowQuickReplies((v) => !v)}
                    className={cn('p-2.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-600', showQuickReplies && 'bg-gray-100')}
                    title="Respostas rápidas"
                    aria-label="Respostas rápidas"
                    aria-expanded={showQuickReplies}
                  >
                    <Zap className="w-5 h-5" />
                  </button>
                  {showQuickReplies && (
                    <QuickReplies
                      onClose={() => setShowQuickReplies(false)}
                      onPick={(body) => {
                        setText((cur) => (cur.trim() ? `${cur.replace(/\s+$/, '')}\n${body}` : body))
                        requestAnimationFrame(() => textareaRef.current?.focus())
                      }}
                    />
                  )}
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowStickers((v) => !v)}
                    className={cn('max-md:hidden p-2.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-600', showStickers && 'bg-gray-100')}
                    title="Figurinhas"
                    aria-label="Figurinhas"
                    aria-expanded={showStickers}
                  >
                    <StickerIcon className="w-5 h-5" />
                  </button>
                  {showStickers && selected && (
                    <StickerPicker
                      conversationId={selected.id}
                      onClose={() => setShowStickers(false)}
                      onSent={() => { refreshThread(selected.id, true); refreshList(true) }}
                    />
                  )}
                </div>
                <div className="relative max-md:hidden">
                  <button
                    type="button"
                    onClick={() => setShowSig((v) => !v)}
                    className={cn('p-2.5 rounded-lg transition-colors', !iSign || selected?.hide_signature ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'text-gray-600 hover:bg-gray-100')}
                    title={!iSign ? 'Suas mensagens vão sem assinatura (clique para mudar)' : selected?.hide_signature ? 'Sem assinatura nesta conversa (clique para mudar)' : 'Mensagens vão com o seu nome no começo (clique para mudar)'}
                    aria-label="Assinatura"
                    aria-expanded={showSig}
                  >
                    <span className="relative inline-flex">
                      <PenLine className="w-5 h-5" />
                      {(!iSign || selected?.hide_signature) && <span className="absolute left-0 right-0 top-1/2 h-0.5 -rotate-45 bg-amber-700 rounded" />}
                    </span>
                  </button>
                  {showSig && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowSig(false)} aria-hidden />
                      <div role="menu" className="absolute bottom-full right-0 mb-2 z-40 w-72 bg-white border border-gray-200 rounded-xl shadow-xl py-1">
                        <SignatureSettings iSign={iSign} convHidden={!!selected?.hide_signature} onToggleMine={handleToggleMySignature} onToggleConv={handleToggleSignature} />
                      </div>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => { handleFile(e.target.files); e.target.value = '' }}
                />

                {/* Input */}
                <div className="relative flex-1 min-w-0 flex">
                {mention && mentionOptions.length > 0 && (
                  <div role="listbox" aria-label="Mencionar" className="absolute bottom-full left-0 mb-2 z-40 w-72 max-w-full bg-white border border-gray-200 rounded-xl shadow-xl py-1 max-h-64 overflow-y-auto">
                    {mentionOptions.map((o, i) => (
                      <button
                        key={o.all ? 'todos' : o.m.jid}
                        role="option"
                        aria-selected={i === mentionIdx}
                        onMouseDown={(e) => { e.preventDefault(); pickMention(o) }}
                        onMouseEnter={() => setMentionIdx(i)}
                        className={cn('w-full text-left px-3 py-1.5 text-sm flex items-center gap-2', i === mentionIdx ? 'bg-gray-100' : 'hover:bg-gray-50')}
                      >
                        <span className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 text-white text-xs font-bold flex items-center justify-center">
                          {o.all ? '@' : memberLabel(o.m).charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-gray-900">{o.all ? 'Todos' : memberLabel(o.m)}</span>
                          <span className="block truncate text-[11px] text-gray-500">{o.all ? 'Avisa todos do grupo' : (o.m.phone ? `+${o.m.phone}` : 'Membro do grupo')}{!o.all && o.m.admin ? ' · admin' : ''}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => { setText(e.target.value); if (e.target.value.trim()) notifyTyping(); else stopTyping(); if (selectedIsGroup) { setMention(activeMention(e.target.value, e.target.selectionStart)); setMentionIdx(0) } }}
                  onClick={(e) => { if (selectedIsGroup) setMention(activeMention(e.currentTarget.value, e.currentTarget.selectionStart)) }}
                  onKeyDown={(e) => {
                    if (mention && mentionOptions.length > 0) {
                      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx((i) => (i + 1) % mentionOptions.length); return }
                      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx((i) => (i - 1 + mentionOptions.length) % mentionOptions.length); return }
                      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mentionOptions[mentionIdx] ?? mentionOptions[0]); return }
                      if (e.key === 'Escape') { e.preventDefault(); setMention(null); return }
                    }
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
                  onPaste={handlePaste}
                  placeholder={actingAsName ? `Respondendo como ${actingAsName}…` : 'Escreva uma mensagem…'}
                  rows={1}
                  className="flex-1 min-w-0 px-4 py-2.5 text-base md:text-sm bg-white text-gray-900 placeholder-gray-500 rounded-lg border-0 resize-none focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-0 max-h-36"
                />
                </div>

                {/* Microfone ou enviar */}
                {text.trim() ? (
                  <button
                    onClick={handleSend}
                    className="shrink-0 p-2.5 bg-gray-900 text-white hover:bg-gray-800 rounded-full transition-colors"
                    title="Enviar mensagem"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="shrink-0 p-2.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
                    title="Gravar áudio"
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                )}
              </div>
              </div>
            ))}
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

      {showOtherNumber && selected && !selected.is_group && (
        <OtherNumberModal
          contactName={selected.contact_name ?? selected.remote_jid.split('@')[0]}
          phone={selected.remote_jid.split('@')[0]}
          contactId={selected.contact_id}
          currentInstanceId={selected.instance_id}
          instances={filter.options.map((o) => ({ id: o.id, label: o.label, chip: filter.colorOf(o.id).chip, isPrivate: o.is_private }))}
          onClose={() => setShowOtherNumber(false)}
          onStarted={(id, instanceId) => {
            setShowOtherNumber(false)
            // se o filtro de WhatsApps esconde o número escolhido, inclui para a conversa aparecer na lista
            if (filter.selected.length && !filter.selected.includes(instanceId)) filter.setSelected([...filter.selected, instanceId])
            refreshList(true)
            setSelectedId(id)
          }}
        />
      )}

      {showNewConv && (
        <NewConversationModal
          instances={filter.options.map((o) => ({ id: o.id, label: o.label }))}
          defaultInstanceId={selected?.instance_id ?? filter.selected[0] ?? filter.options[0]?.id ?? null}
          onClose={() => setShowNewConv(false)}
          onStarted={(id) => { setShowNewConv(false); refreshList(true); setSelectedId(id) }}
        />
      )}

      {forwarding && (
        <ForwardModal
          previewText={messagePreview({ message_type: forwarding.message_type, body: forwarding.body, file_name: forwarding.file_name }) || 'Mensagem'}
          sourceInstanceId={selected?.instance_id ?? null}
          conversations={(forwardTargets ?? conversations).map((c) => ({ id: c.id, name: c.contact_name ?? c.remote_jid.split('@')[0], photo: c.contact_photo_url, isGroup: c.is_group, instanceLabel: c.instance_label }))}
          onForward={doForward}
          onClose={() => setForwarding(null)}
        />
      )}

      {showSolicitation && selected && (
        <CrmSolicitationModal
          contactId={selected.is_group ? null : selected.contact_id}
          contactName={selected.contact_name ?? selected.remote_jid.split('@')[0]}
          onClose={() => setShowSolicitation(false)}
          onStartSelecting={(sel: SolicSelection) => {
            setShowSolicitation(false)
            setSolicitacaoSelectMode({ ...sel, selected: new Map() })
          }}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// Componentes auxiliares
// ════════════════════════════════════════════════════════════════════════════════════════════════

// Cor do nome de quem falou no grupo (fixa por pessoa), como no WhatsApp
const SPEAKER_COLORS = ['text-[#1f7aec]', 'text-[#d6336c]', 'text-[#0b8a5f]', 'text-[#a35a00]', 'text-[#7048e8]', 'text-[#c92a2a]', 'text-[#0c8599]', 'text-[#5c940d]']
function speakerColor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return SPEAKER_COLORS[h % SPEAKER_COLORS.length]
}

function MessageBubble({
  msg, first, currentUserId, hideSignature, participantPhoto, url, onDownload, onOpenMedia, onOpenAttachment, contact, isGroup, parent, onReply, onReact, onSaveSticker, mentionNames, canDelete, onDelete, canEdit, onEdit, canForward, onForward, onOpenContact, onRetry, onDiscard,
}: {
  msg: Msg
  first: boolean
  currentUserId: string
  hideSignature: boolean
  participantPhoto?: string | null
  url?: string
  onDownload: () => Promise<void>
  onOpenMedia: () => void
  onOpenAttachment: (p: string) => void
  contact: { id: string; name: string; photo: string | null }
  isGroup: boolean
  parent: Msg | null
  onReply: () => void
  onReact: (emoji: string) => void
  onSaveSticker: () => void
  mentionNames?: Record<string, string>
  canDelete: boolean
  onDelete: () => void
  canEdit: boolean
  onEdit: () => void
  canForward: boolean
  onForward: () => void
  onOpenContact?: (phone: string) => void
  onRetry?: () => void
  onDiscard?: () => void
}) {
  const [thumbFailed, setThumbFailed] = useState(false)
  // 'react' = só a fileira de reações (botão 🙂); 'full' = todas as opções (botão ⌄ ou clique direito)
  const [menu, setMenu] = useState<false | 'react' | 'full' | 'picker'>(false)
  const favorites = useReactionFavorites()
  const [menuPos, setMenuPos] = useState<{ left?: number; right?: number; top?: number; bottom?: number } | null>(null)
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(false)
    // o Esc fecha só o menu (preventDefault avisa o atalho da tela para não fechar a conversa)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close() } }
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
  const speaker = !isOutbound && isGroup ? (msg.participant_name ?? 'Participante') : null

  // Sem avatar a cada mensagem: só nos grupos, ao lado da primeira de cada sequência de quem falou.
  const groupAvatar = !isOutbound && isGroup ? (
    first ? (
      participantPhoto ? (
        <img src={participantPhoto} alt={speaker ?? ''} title={speaker ?? ''} className="w-7 h-7 mt-0.5 rounded-full object-cover shrink-0" />
      ) : (
        <span title={speaker ?? ''} className={`w-7 h-7 mt-0.5 rounded-full bg-gradient-to-br ${getAvatarColor(msg.participant_jid ?? msg.participant_name ?? msg.id)} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
          {(speaker ?? '?').charAt(0).toUpperCase()}
        </span>
      )
    ) : <span className="w-7 shrink-0" aria-hidden />
  ) : null
  // Nas enviadas, mostramos como chega ao cliente: "Nome:" no começo (texto e arquivo com legenda;
  // áudio, figurinha e cartão de contato não levam assinatura). Conversa "sem assinatura": sem o nome
  // no balão, mas o avatar de quem enviou continua ao lado.
  const isStickerMsg = msg.message_type === 'image' && (msg.mime_type ?? '').includes('webp')
  const carriesSignature = msg.message_type === 'text' || (['image', 'video', 'document'].includes(msg.message_type) && !isStickerMsg)
  const outLabel = !isOutbound ? null
    : msg.sender_name ? (carriesSignature && (msg.signed ?? !hideSignature) ? `${msg.sender_name}:` : null)
    : (first ? 'Pelo celular' : null)
  const outAvatar = isOutbound ? (
    msg.sender_name ? (
      msg.acted_by_name
        ? <Avatar user={{ name: msg.acted_by_name, avatar_url: msg.acted_by_avatar_url, avatar_color: msg.acted_by_avatar_color }} size={28} className="mt-0.5" title={`Enviada por ${msg.acted_by_name} (como ${msg.sender_name})`} />
        : <Avatar user={{ name: msg.sender_name, avatar_url: msg.sender_avatar_url, avatar_color: msg.sender_avatar_color }} size={28} className="mt-0.5" title={`Enviada por ${msg.sender_name}`} />
    ) : (
      <span title="Enviada pelo celular" className="w-7 h-7 mt-0.5 rounded-full bg-gray-300 text-white flex items-center justify-center shrink-0"><Smartphone className="w-4 h-4" /></span>
    )
  ) : null
  const meta = (
    <span className={cn('inline-flex items-center gap-0.5 text-[11px] leading-none whitespace-nowrap', acted ? 'text-amber-800/70' : 'text-gray-500')}>
      {msg.edited_at && <span className="mr-0.5 italic" title={`Editada em ${new Date(msg.edited_at).toLocaleString('pt-BR')}`}>Editada</span>}
      {time}
      {isOutbound && (msg.failed
        ? <AlertCircle className="w-3.5 h-3.5 text-red-600" aria-label="Não enviada" />
        : msg.pending
          ? <Clock className="w-3.5 h-3.5 text-gray-400" aria-label="Enviando…" />
          : <CheckCheck className="w-4 h-4 text-gray-400" aria-label="Enviada" />)}
    </span>
  )
  // espaço invisível no fim do texto para a hora caber na mesma linha
  const tail = <span aria-hidden className={cn('inline-block h-3', msg.edited_at ? 'w-[108px]' : isOutbound ? 'w-[62px]' : 'w-[44px]')} />
  const tailHere = (msg.message_type === 'text' && !!msg.body)
  const bubbleTone = isOutbound
    ? acted ? 'bg-[#FFF4DC] text-[#3b2a05] ring-1 ring-amber-300' : 'bg-[#D9FDD3] text-[#111b21]'
    : 'bg-white text-[#111b21]'
  const tailCorner = first ? (isOutbound ? 'rounded-tr-none' : 'rounded-tl-none') : ''

  const card = msg.message_type === 'other' ? parseContactCard(msg.body) : null
  const hasFile = !!(msg.storage_path || msg.drive_file_id || msg.local_url)
  // foto, áudio, vídeo ou documento que ainda não foi baixado: mostra o botão "Baixar"
  const isTempMsg = msg.id.startsWith('temp-')
  const needsDownload = !hasFile && !isTempMsg && ['image', 'video', 'audio', 'document'].includes(msg.message_type)
  // arquivo ainda saindo (ex.: encaminhado e ainda não baixado): só o nome, sem "Baixar"
  const pendingFile = !hasFile && isTempMsg && ['image', 'video', 'audio', 'document'].includes(msg.message_type)
  // mensagem de empresa com botões: texto em cima e os botões embaixo, como no WhatsApp
  const waButtons = msg.message_type === 'other' && !card ? splitButtons(msg.body) : null
  const captionText = waButtons?.buttons.length ? waButtons.text : msg.body
  const caption = captionText && !card && ['image', 'video', 'document', 'other'].includes(msg.message_type) ? captionText : null

  if (msg.deleted_at) {
    return (
      <div id={`msg-${msg.id}`} className={cn('flex items-start gap-1.5', isOutbound ? 'justify-end' : 'justify-start')}>
        {groupAvatar}
        <div className={cn('relative max-w-[85%] md:max-w-[65%] rounded-lg px-2.5 pt-1.5 pb-2 text-[14px] leading-[19px] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] italic text-gray-500', bubbleTone, tailCorner)}>
          🚫 Mensagem apagada{msg.deleted_by_name ? ` por ${msg.deleted_by_name}` : ''}{tail}
          <span className="absolute bottom-1 right-2 not-italic">{meta}</span>
        </div>
        {outAvatar}
      </div>
    )
  }

  const parentName = parent
    ? (parent.direction === 'outbound' ? (parent.sender_name ?? 'Nós') : (isGroup ? (parent.participant_name ?? 'Participante') : contact.name))
    : null
  const canReply = !!msg.provider_message_id && !msg.id.startsWith('temp-')
  const canSaveSticker = msg.message_type === 'image' && !!msg.storage_path && (msg.mime_type ?? '').includes('webp')

  const hasActions = canReply || canDelete || canSaveSticker || canEdit || canForward
  // abre o menu para baixo, ou para cima quando a mensagem está perto do fim da tela
  const openMenu = (kind: 'react' | 'full' | 'picker', anchor: Element) => {
    const box = anchor.closest('[data-thread]')?.getBoundingClientRect() ?? document.querySelector('[data-thread]')?.getBoundingClientRect()
    const at = anchor.getBoundingClientRect()
    const up = !!box && box.bottom - at.bottom < (kind === 'full' ? 260 : kind === 'picker' ? 440 : 80)
    // sempre dentro da tela: no celular o botão fica colado na borda e o menu saía para fora
    const w = Math.min(kind === 'full' ? 224 : kind === 'picker' ? 320 : 340, window.innerWidth - 16)
    const want = isOutbound ? at.right - w : at.left
    setMenuPos({
      left: Math.max(8, Math.min(want, window.innerWidth - w - 8)),
      ...(up ? { bottom: window.innerHeight - at.top + 4 } : { top: at.bottom + 4 }),
    })
    setMenu((cur) => (cur === kind ? false : kind))
  }
  const reactionRow = (
    <div className="flex items-center gap-0.5" role="group" aria-label="Reagir">
      {favorites.map((e) => {
        const mine = msg.reactions?.some((r) => r.mine && r.emoji === e)
        return (
          <button
            key={e}
            type="button"
            role="menuitem"
            aria-label={mine ? `Tirar reação ${e}` : `Reagir com ${e}`}
            aria-pressed={!!mine}
            onClick={() => { setMenu(false); onReact(mine ? '' : e) }}
            className={cn('w-9 h-9 rounded-full text-xl leading-none hover:bg-gray-100 hover:scale-110 transition-transform', mine && 'bg-sky-100 ring-1 ring-sky-300')}
          >{e}</button>
        )
      })}
      <button
        type="button"
        aria-label="Mais emojis"
        title="Mais emojis e editar favoritos"
        onClick={(ev) => { ev.stopPropagation(); openMenu('picker', ev.currentTarget) }}
        className="w-9 h-9 rounded-full text-gray-500 hover:bg-gray-100 flex items-center justify-center"
      ><Plus className="w-5 h-5" /></button>
    </div>
  )
  const item = 'w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-left'
  // Botões fora do balão (nunca em cima do texto ou da hora), com área de toque de 32 px.
  // Aparecem ao passar o mouse em qualquer ponto da linha da mensagem; no toque, ficam sempre visíveis.
  const actions = hasActions && !msg.pending && !msg.failed ? (
    <div
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'relative self-center shrink-0 flex items-center gap-1 transition-opacity',
        isOutbound ? 'flex-row-reverse' : '',
        menu ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100',
      )}
    >
      {canReply && (
        <button
          type="button"
          aria-label="Reagir"
          aria-haspopup="menu"
          aria-expanded={menu === 'react'}
          title="Reagir"
          onClick={(e) => openMenu('react', e.currentTarget)}
          className="w-8 h-8 rounded-full bg-white/95 text-gray-500 hover:text-gray-900 hover:bg-white shadow-sm ring-1 ring-black/5 flex items-center justify-center"
        >
          <Smile className="w-[18px] h-[18px]" />
        </button>
      )}
      <button
        type="button"
        aria-label="Mais opções da mensagem"
        aria-haspopup="menu"
        aria-expanded={menu === 'full'}
        title="Mais opções"
        onClick={(e) => openMenu('full', e.currentTarget)}
        className="w-8 h-8 rounded-full bg-white/95 text-gray-500 hover:text-gray-900 hover:bg-white shadow-sm ring-1 ring-black/5 flex items-center justify-center"
      >
        <ChevronDown className="w-5 h-5" />
      </button>
      {menu && menuPos && (
        <div
          role="menu"
          style={{ position: 'fixed', zIndex: 100, ...menuPos }}
          className={cn(
            'bg-white border border-gray-200 rounded-xl shadow-lg text-sm text-gray-800',
            menu === 'react' ? 'p-1 max-w-[calc(100vw-16px)] overflow-x-auto' : menu === 'picker' ? '' : 'w-56 py-1',
          )}
        >
          {menu === 'picker' ? (
            <ReactionPicker
              mine={(msg.reactions ?? []).filter((r) => r.mine).map((r) => r.emoji)}
              onPick={(e) => { setMenu(false); onReact(msg.reactions?.some((r) => r.mine && r.emoji === e) ? '' : e) }}
            />
          ) : menu === 'react' ? reactionRow : (
            <>
              {canReply && <div className="px-1.5 pb-1 mb-1 border-b border-gray-100">{reactionRow}</div>}
              {canReply && <button role="menuitem" className={item} onClick={() => { setMenu(false); onReply() }}><Reply className="w-4 h-4" /> Responder</button>}
              {canForward && <button role="menuitem" className={item} onClick={() => { setMenu(false); onForward() }}><Forward className="w-4 h-4" /> Encaminhar</button>}
              {canEdit && <button role="menuitem" className={item} onClick={() => { setMenu(false); onEdit() }}><Pencil className="w-4 h-4" /> Editar</button>}
              {canSaveSticker && <button role="menuitem" className={item} onClick={() => { setMenu(false); onSaveSticker() }}><StickerIcon className="w-4 h-4" /> Salvar como figurinha</button>}
              {canDelete && <button role="menuitem" className={cn(item, 'hover:bg-red-50 text-red-600')} onClick={() => { setMenu(false); onDelete() }}><Trash2 className="w-4 h-4" /> Apagar para todos</button>}
            </>
          )}
        </div>
      )}
    </div>
  ) : null

  return (
    <div id={`msg-${msg.id}`} className={cn('group/row flex items-start gap-1.5', isOutbound ? 'justify-end' : 'justify-start')}>
      {groupAvatar}
      {isOutbound && actions}
      <div
        onContextMenu={(e) => {
          if (!actions) return
          e.preventDefault() // clique direito no balão abre as opções, como no WhatsApp Web
          const btn = e.currentTarget.parentElement?.querySelector('[aria-label="Mais opções da mensagem"]')
          if (btn) openMenu('full', btn)
        }}
        className={cn(
          'relative max-w-[85%] md:max-w-[65%] rounded-lg px-2.5 pt-1.5 pb-2 text-[14px] leading-[19px] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]',
          msg.reactions?.length ? 'mb-4' : '',
          bubbleTone, tailCorner
        )}
      >
        {speaker && first && <p className={cn('text-[12.5px] font-semibold leading-4 mb-0.5', speakerColor(msg.participant_jid ?? msg.participant_name ?? ''))}>{speaker}</p>}
        {outLabel && <p className={cn('text-[12.5px] font-semibold leading-4 mb-0.5', msg.sender_name ? 'text-emerald-800' : 'text-gray-500 italic font-medium')}>{outLabel}</p>}
        {msg.is_forwarded && <p className="flex items-center gap-1 text-[11px] italic text-gray-400 mb-0.5"><Forward className="w-3 h-3" /> Encaminhada</p>}
        {msg.ad_context && !msg.deleted_at && <AdCard ad={msg.ad_context} />}

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

        {msg.message_type === 'text' && firstUrl(msg.body) && <LinkPreviewCard url={firstUrl(msg.body)!} />}
        {msg.message_type === 'text' && msg.body && <WaText text={mentionNames ? renderMentions(msg.body, mentionNames) : msg.body} tail={tail} />}

        {needsDownload && <DownloadCard msg={msg} onDownload={onDownload} />}
        {pendingFile && (
          <div className="flex items-center gap-3 rounded-lg bg-black/5 px-3 py-2 min-w-[200px] max-w-full">
            <FileBadge name={msg.file_name} size={32} />
            <span className="text-sm font-medium break-all line-clamp-2">{msg.file_name || 'Arquivo'}</span>
          </div>
        )}

        {msg.message_type === 'audio' && hasFile && (
          url ? (
            <AudioPlayer src={url} mimeType={msg.mime_type} fileName={msg.file_name} tone={isOutbound ? 'blue' : 'light'} />
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-500 min-w-[200px]">
              <Loader2 className="w-3 h-3 animate-spin" /><span>Carregando áudio…</span>
            </div>
          )
        )}

        {msg.message_type === 'image' && hasFile && (
          isStickerMsg ? (
            // Figurinha: sem frame, fundo transparente, não abre lightbox
            url && !thumbFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="Figurinha" loading="lazy" onError={() => setThumbFailed(true)}
                className="block w-[160px] h-[160px] object-contain" />
            ) : thumbFailed ? (
              <p className="text-xs italic text-gray-400">Figurinha indisponível</p>
            ) : (
              <div className="flex items-center gap-2 text-xs text-gray-400 w-[160px] h-[80px]">
                <Loader2 className="w-3 h-3 animate-spin shrink-0" /> Carregando figurinha…
              </div>
            )
          ) : (
            // Imagem normal
            url && !thumbFailed ? (
              <button type="button" onClick={onOpenMedia} className="block w-[260px] max-w-full min-h-[140px] rounded-md overflow-hidden bg-black/5" aria-label="Ampliar imagem">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={msg.file_name ?? 'Imagem'} loading="lazy" onError={() => setThumbFailed(true)} className="block w-full max-h-72 object-cover hover:opacity-90" />
              </button>
            ) : hasFile ? (
              <button type="button" onClick={() => { if (url) window.open(url, '_blank', 'noopener'); else if (msg.storage_path) onOpenAttachment(msg.storage_path) }} className="flex items-center gap-2 text-left hover:opacity-80">
                <FileBadge name={msg.file_name ?? 'imagem.jpg'} size={32} />
                <span className="underline text-sm break-all">{msg.file_name || 'Imagem'}</span>
              </button>
            ) : <p className="text-xs italic text-gray-400">Imagem indisponível</p>
          )
        )}

        {msg.message_type === 'video' && hasFile && (
          url ? (
            <button type="button" onClick={onOpenMedia} className="relative block w-[260px] max-w-full min-h-[140px] rounded-md overflow-hidden bg-black" aria-label="Reproduzir vídeo">
              <video src={url + '#t=0.1'} preload="metadata" muted playsInline className="block w-full max-h-72 object-cover pointer-events-none" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/25 hover:bg-black/35">
                <span className="w-12 h-12 rounded-full bg-black/60 text-white flex items-center justify-center"><PlayIcon className="w-6 h-6 ml-0.5" /></span>
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-3 h-3 animate-spin" />Carregando vídeo…</div>
          )
        )}

        {msg.message_type === 'document' && hasFile && (
          hasFile ? (
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

        {caption && <div className="mt-1.5"><WaText text={mentionNames ? renderMentions(caption, mentionNames) : caption} tail={tail} /></div>}

        {!!waButtons?.buttons.length && (
          <div className="mt-2 -mx-2.5 -mb-1 pt-3 border-t border-black/10 divide-y divide-black/10">
            {waButtons.buttons.map((b, i) => {
              const Icon = b.kind === 'url' ? ExternalLink : b.kind === 'call' ? Phone : b.kind === 'list' ? List : Reply
              const inner = <><Icon className="w-4 h-4 shrink-0" /><span className="truncate">{b.label}</span></>
              const cls = 'flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-[#027eb5]'
              return b.kind === 'url' && b.value && /^https?:\/\//.test(b.value)
                ? <a key={i} href={b.value} target="_blank" rel="noreferrer" className={cn(cls, 'hover:bg-black/5')} title={b.value}>{inner}</a>
                : <div key={i} className={cls} title={b.value ?? undefined}>{inner}</div>
            })}
          </div>
        )}

        {card && (
          <div className="space-y-1.5 min-w-[14rem]">
            {card.map((p, i) => (
              <div key={i} className="rounded-xl bg-black/5 overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-2">
                  <span className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 text-white flex items-center justify-center"><ContactRound className="w-4 h-4" /></span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-sm truncate">{p.name}</span>
                    {p.phone && <span className="block text-xs opacity-70">{prettyPhone(p.phone)}</span>}
                  </span>
                </div>
                {p.phone && onOpenContact && (
                  <button type="button" onClick={() => onOpenContact(p.phone!)} className="w-full border-t border-black/10 py-1.5 text-center text-sm font-medium text-sky-700 hover:bg-black/5">
                    Conversar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {msg.message_type === 'other' && !msg.body && (
          <p className="text-xs italic text-gray-400">Mensagem não suportada</p>
        )}

        {tailHere || caption
          ? <span className="absolute bottom-1 right-2">{meta}</span>
          : <div className="flex justify-end mt-1 -mb-1">{meta}</div>}

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
      {outAvatar}
      {!isOutbound && actions}
      {msg.failed && (
        <div className="order-first flex items-center gap-1 self-end mb-0.5" role="group" aria-label="Mensagem não enviada">
          <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] font-medium text-red-700 shadow-sm ring-1 ring-red-200 hover:bg-red-50">
            <RefreshCw className="w-3 h-3" /> Tentar de novo
          </button>
          <button type="button" onClick={onDiscard} aria-label="Descartar mensagem não enviada" title="Descartar" className="rounded-full bg-white p-1 text-gray-500 shadow-sm ring-1 ring-gray-200 hover:text-gray-800">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  )
}

function formatBytes(n?: number | null): string {
  if (!n) return ''
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

function formatSeconds(s?: number | null): string {
  if (!s) return ''
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Arquivo recebido que ainda não foi baixado: só baixa (e guarda no Drive) quando alguém pede.
function DownloadCard({ msg, onDownload }: { msg: Msg; onDownload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const run = async () => { if (busy) return; setBusy(true); try { await onDownload() } finally { setBusy(false) } }
  const size = formatBytes(msg.media_size)
  const label = busy ? 'Baixando…' : `Baixar${size ? ` · ${size}` : ''}`
  const icon = busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />

  if ((msg.message_type === 'image' || msg.message_type === 'video') && msg.thumb) {
    return (
      <button type="button" onClick={run} disabled={busy} className="relative block w-[260px] max-w-full rounded-md overflow-hidden bg-black/10" aria-label={label}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={msg.thumb} alt="" className="block w-full max-h-72 object-cover blur-[2px] scale-105" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/20">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 text-white text-xs font-medium">
            {icon}{msg.message_type === 'video' && !busy && <PlayIcon className="w-3.5 h-3.5" />}{label}
          </span>
        </span>
      </button>
    )
  }
  const kind = msg.message_type === 'audio' ? `Áudio${msg.media_seconds ? ` · ${formatSeconds(msg.media_seconds)}` : ''}`
    : msg.message_type === 'video' ? 'Vídeo' : msg.message_type === 'image' ? 'Foto' : (msg.file_name || 'Documento')
  return (
    <button type="button" onClick={run} disabled={busy} className="flex items-center gap-3 text-left rounded-lg bg-black/5 hover:bg-black/10 px-3 py-2 min-w-[220px] max-w-full" title="Baixar arquivo">
      {msg.message_type === 'document' ? <FileBadge name={msg.file_name} /> : (
        <span className="w-9 h-9 shrink-0 rounded-full bg-[#0A1F3B] text-white flex items-center justify-center">
          {msg.message_type === 'audio' ? <Mic className="w-4 h-4" /> : msg.message_type === 'video' ? <PlayIcon className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium break-all line-clamp-2">{kind}</span>
        <span className="flex items-center gap-1 text-xs text-emerald-700 font-medium">{icon}{label}</span>
      </span>
    </button>
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
