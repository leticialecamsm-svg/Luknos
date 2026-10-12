'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'

import { getAvatarColor } from '@/lib/crm-ui'
import { InstanceFilter, useInstanceFilter } from './InstanceFilter'
import { ConvAvatar } from './ConvAvatar'
import { threadLayout } from '@/lib/crm-thread-layout'
import { WhatsappIcon } from './WhatsappIcon'
import { DealValue } from './DealValue'
import { ContactInfoPanel } from './ContactInfoPanel'
import { WaText } from './WaText'
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
  setConversationArchived,
  reactToMessage,
  saveMessageAsSticker,
  getGroupParticipants,
  setConversationPinned,
  setConversationSignature,
  type ConversationAccessInfo,
  type CrmLabel,
  getCrmLabels,
  deleteCrmMessage,
  editCrmMessage,
  downloadCrmMedia,
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
import { StickerPicker } from './StickerPicker'
import { activeMention, applyMentionsToSend, buildMentionNames, filterMembers, memberLabel, renderMentions, type GroupMember, type MentionPick } from '@/lib/crm-mentions'
import { parseContactCard, prettyPhone } from '@/lib/crm-contact-card'
import { QUICK_REACTIONS, type ReactionChip } from '@/lib/crm-reactions'
import {
  Send, Paperclip, Loader2, UserCog, Link2, Search, MessageSquareText, Inbox, Users as UsersIcon, X,
  Mic, Trash2, Square, RefreshCw, Info, Play as PlayIcon, CheckCheck, Reply, ChevronDown, CalendarClock, Lock, MailOpen, ContactRound, Sticker as StickerIcon, Pin, PinOff, PenLine, Pencil, MoreVertical, Download, Image as ImageIcon, Archive, ArchiveRestore, ChevronLeft,
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
  file_name: string | null
  mime_type: string | null
  is_system: boolean
  created_at: string
}

const isUnread = (c: { unread_count: number; marked_unread: boolean }) => c.unread_count > 0 || c.marked_unread

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
  const [showStickers, setShowStickers] = useState(false)
  const [headerMenu, setHeaderMenu] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<Msg | null>(null)
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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
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
  const [contactQuery, setContactQuery] = useState('')
  const [contactResults, setContactResults] = useState<any[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [counts, setCounts] = useState({ mine: 0, unassigned: 0, all: 0, groups: 0 })
  const filter = useInstanceFilter()
  // com um WhatsApp só na tela, a etiqueta dele em cada linha é repetição (a borda colorida já diz)
  const showInstanceChip = filter.options.length > 1 && filter.selected.length !== 1
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
  const lastUserScrollRef = useRef(0)
  const onThreadScroll = () => {
    const el = threadRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40 // só "no fim" de verdade
    if (stickRef.current) setNewBelow((n) => (n ? 0 : n))
  }
  // Quem está rolando a tela (roda do mouse, dedo, teclado) está lendo: a tela não pode se mexer sozinha.
  const markReading = () => { lastUserScrollRef.current = Date.now() }
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

  // arquivo no Drive: sai pela rota do sistema; no Supabase: link assinado
  const mediaUrlOf = (m: Msg) => (m.drive_file_id ? `/api/crm/media/${m.id}` : m.storage_path ? attUrls[m.storage_path] : undefined)
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
    if (editing) {
      const target = editing
      const newText = text
      setText(''); setEditing(null)
      startTransition(async () => {
        const r = await editCrmMessage(target.id, newText)
        if ('error' in r && r.error) { toast.error('NÃO FOI POSSÍVEL EDITAR', r.error); setEditing(target); setText((cur) => cur || newText) }
        else refreshThread(selectedId, true)
      })
      return
    }
    const msg = text
    const reply = replyTo
    const out = selectedIsGroup ? applyMentionsToSend(msg, picks) : { text: msg, mentioned: [] as string[], all: false }
    setText('')
    setPicks([]); setMention(null)
    startTransition(async () => {
      const res = await sendCrmMessage({ conversationId: selectedId, text: out.text, replyToMessageId: reply?.id, mentioned: out.mentioned, mentionAll: out.all })
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
    <div className="flex h-[calc(100vh-8rem)] gap-0 bg-white">
      {/* ──────────────────────────────────────────────────────────────────────
          SIDEBAR - Conversas
          ────────────────────────────────────────────────────────────────────── */}
      <div className="w-80 shrink-0 flex flex-col border-r border-gray-200 bg-white">
        {/* Header com tabs */}
        <div className="px-3 pt-3 pb-2 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
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
          <InstanceFilter options={filter.options} selected={filter.selected} onChange={filter.setSelected} className="mb-2" />
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
            {(['mine', 'unassigned', 'all', 'groups'] as const).map((key) => (
              <button
                key={key}
                role="tab"
                aria-selected={scope === key}
                onClick={() => setScope(key)}
                className={cn(
                  'flex-1 min-w-0 whitespace-nowrap px-1 py-1 text-[12.5px] font-medium rounded-full transition-colors',
                  scope === key
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {key === 'mine' ? 'Minhas' : key === 'unassigned' ? 'Pendentes' : key === 'all' ? 'Todas' : 'Grupos'}
                {counts[key] > 0 && (
                  <span className={cn('ml-0.5 text-[11px]', key === 'unassigned' && scope !== key ? 'text-amber-700 font-semibold' : 'opacity-70')}>{counts[key]}</span>
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
                      {c.last_direction === 'outbound' && <CheckCheck className="w-4 h-4 shrink-0 text-sky-500" aria-label="Última mensagem enviada por nós" />}
                      <span className="truncate">{c.last_body || 'Sem mensagens'}</span>
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
            <div className="px-4 py-2 border-b border-gray-200 bg-[#F7F8FA] flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer" onClick={() => setShowInfo(true)}>
                <ConvAvatar id={selected.id} name={selected.contact_name ?? selected.remote_jid.split('@')[0]} photo={selected.contact_photo_url} isGroup={selected.is_group} size={40} />
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate leading-5">
                    {selected.is_restricted && <Lock className="inline w-3.5 h-3.5 mr-1 -mt-0.5 text-amber-600" aria-label="Grupo restrito" />}
                    {selected.contact_name ?? selected.remote_jid.split('@')[0]}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                    <span className={cn('shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-px rounded-full border', filter.colorOf(selected.instance_id).chip)}>
                      <WhatsappIcon className="w-3 h-3" />{selected.instance_label}
                    </span>
                    <ConvTags type={selected.contact_type} labels={selected.labels} className="min-w-0 overflow-hidden flex-nowrap" />
                  </div>
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
            <div ref={threadRef} data-thread onScroll={onThreadScroll} onWheel={markReading} onTouchMove={markReading} onKeyDown={markReading} className="flex-1 overflow-y-auto px-[4%] py-3 bg-[#EFEAE2]" style={{ backgroundImage: 'radial-gradient(rgba(0,0,0,0.035) 1px, transparent 1px)', backgroundSize: '18px 18px' }}>
              {loadingThread && (
                <div className="text-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400 mx-auto" />
                </div>
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
                <div className={layout[i]?.first ? 'mt-2.5' : 'mt-0.5'}>
                <MessageBubble
                  msg={m}
                  first={layout[i]?.first ?? true}
                  currentUserId={currentUserId}
                  url={mediaUrlOf(m)}
                  onDownload={async () => {
                    const r = await downloadCrmMedia(m.id)
                    if ('error' in r && r.error) toast.error('NÃO FOI POSSÍVEL BAIXAR', r.error)
                    else refreshThread(selectedId!, true)
                  }}
                  onOpenMedia={() => setLightboxId(m.id)}
                  onOpenAttachment={openAttachment}
                  contact={{ id: selected.id, name: selected.contact_name ?? selected.remote_jid.split('@')[0], photo: selected.contact_photo_url }}
                  isGroup={selected.is_group}
                  parent={m.reply_to_provider_id ? messages.find((x) => x.provider_message_id === m.reply_to_provider_id) ?? null : null}
                  onReply={() => { setReplyTo(m); textareaRef.current?.focus() }}
                  mentionNames={selectedIsGroup ? mentionNames : undefined}
                  onSaveSticker={async () => {
                    const r = await saveMessageAsSticker(m.id)
                    if ('error' in r && r.error) toast.error('NÃO FOI POSSÍVEL GUARDAR', r.error)
                    else toast.success('FIGURINHA GUARDADA', 'Já está na biblioteca da equipe')
                  }}
                  onReact={async (emoji) => {
                    const r = await reactToMessage(m.id, emoji)
                    if ('error' in r && r.error) toast.error('NÃO FOI POSSÍVEL REAGIR', r.error)
                    else refreshThread(selectedId!, true)
                  }}
                  canDelete={canDeleteForEveryone(m as any) && (m.sender_user_id === currentUserId || isAdmin || !m.sender_user_id)}
                  canEdit={canEditMessage(m as any) && (m.sender_user_id === currentUserId || isAdmin)}
                  onEdit={() => { setReplyTo(null); setEditing(m); setText(m.body ?? ''); requestAnimationFrame(() => textareaRef.current?.focus()) }}
                  onDelete={async () => {
                    if (!window.confirm('Apagar esta mensagem para todos? Ela some da conversa do cliente também.')) return
                    const r = await deleteCrmMessage(m.id)
                    if (r.error) toast.error('NÃO FOI POSSÍVEL APAGAR', r.error)
                    else { toast.success('MENSAGEM APAGADA'); refreshThread(selectedId!) }
                  }}
                />
                </div>
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
              {showFormat && <FormatToolbar textareaRef={textareaRef} value={text} setValue={setText} disabled={pending || sendingVoice} />}
              <div className={cn('flex items-end gap-1', showFormat && 'mt-1')}>
                <button
                  type="button"
                  onClick={() => setShowFormat((v) => !v)}
                  className={cn('p-2.5 rounded-lg transition-colors text-sm font-semibold leading-5 w-10', showFormat ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100')}
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
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowStickers((v) => !v)}
                    disabled={pending || sendingVoice}
                    className={cn('p-2.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-600', showStickers && 'bg-gray-100')}
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
                <button
                  type="button"
                  onClick={handleToggleSignature}
                  disabled={pending || sendingVoice}
                  className={cn('p-2.5 rounded-lg transition-colors', selected?.hide_signature ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'text-gray-600 hover:bg-gray-100')}
                  title={selected?.hide_signature ? 'Sem assinatura nesta conversa (clique para voltar a assinar)' : 'Mensagens vão com o seu nome no começo (clique para enviar sem assinatura)'}
                  aria-label="Assinatura"
                  aria-pressed={!!selected?.hide_signature}
                >
                  <span className="relative inline-flex">
                    <PenLine className="w-5 h-5" />
                    {selected?.hide_signature && <span className="absolute left-0 right-0 top-1/2 h-0.5 -rotate-45 bg-amber-700 rounded" />}
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => { handleFile(e.target.files); e.target.value = '' }}
                />

                {/* Input */}
                <div className="relative flex-1 flex">
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
                  onChange={(e) => { setText(e.target.value); if (selectedIsGroup) { setMention(activeMention(e.target.value, e.target.selectionStart)); setMentionIdx(0) } }}
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
                  placeholder={actingAsName ? `Respondendo como ${actingAsName}…` : 'Escreva uma mensagem…'}
                  rows={1}
                  className="flex-1 px-4 py-2.5 bg-white text-gray-900 placeholder-gray-500 rounded-lg border-0 resize-none focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-0 max-h-36"
                />
                </div>

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

// Cor do nome de quem falou no grupo (fixa por pessoa), como no WhatsApp
const SPEAKER_COLORS = ['text-[#1f7aec]', 'text-[#d6336c]', 'text-[#0b8a5f]', 'text-[#a35a00]', 'text-[#7048e8]', 'text-[#c92a2a]', 'text-[#0c8599]', 'text-[#5c940d]']
function speakerColor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return SPEAKER_COLORS[h % SPEAKER_COLORS.length]
}

function MessageBubble({
  msg, first, currentUserId, url, onDownload, onOpenMedia, onOpenAttachment, contact, isGroup, parent, onReply, onReact, onSaveSticker, mentionNames, canDelete, onDelete, canEdit, onEdit,
}: {
  msg: Msg
  first: boolean
  currentUserId: string
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
}) {
  const [thumbFailed, setThumbFailed] = useState(false)
  const [menu, setMenu] = useState(false)
  const [menuUp, setMenuUp] = useState(false)
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

  // Sem avatar a cada mensagem: só nos grupos, ao lado da primeira de cada sequência de quem falou.
  const groupAvatar = !isOutbound && isGroup ? (
    first ? (
      <span title={speaker ?? ''} className={`w-7 h-7 mt-0.5 rounded-full bg-gradient-to-br ${getAvatarColor(msg.participant_jid ?? msg.participant_name ?? msg.id)} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
        {(speaker ?? '?').charAt(0).toUpperCase()}
      </span>
    ) : <span className="w-7 shrink-0" aria-hidden />
  ) : null
  // Nas enviadas, o nome de quem respondeu aparece só quando não foi você (ou veio do celular)
  const outLabel = isOutbound && first && !acted && msg.sender_user_id !== currentUserId
    ? (msg.sender_name ?? 'Pelo celular')
    : null
  const meta = (
    <span className={cn('inline-flex items-center gap-0.5 text-[11px] leading-none whitespace-nowrap', acted ? 'text-amber-800/70' : 'text-gray-500')}>
      {msg.edited_at && <span className="mr-0.5 italic" title={`Editada em ${new Date(msg.edited_at).toLocaleString('pt-BR')}`}>Editada</span>}
      {time}
      {isOutbound && <CheckCheck className="w-4 h-4 text-gray-400" aria-hidden />}
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
  const hasFile = !!(msg.storage_path || msg.drive_file_id)
  // foto, áudio, vídeo ou documento que ainda não foi baixado: mostra o botão "Baixar"
  const needsDownload = !hasFile && ['image', 'video', 'audio', 'document'].includes(msg.message_type)
  const caption = msg.body && !card && ['image', 'video', 'document', 'other'].includes(msg.message_type) ? msg.body : null

  if (msg.deleted_at) {
    return (
      <div id={`msg-${msg.id}`} className={cn('flex items-start gap-1.5', isOutbound ? 'justify-end' : 'justify-start')}>
        {groupAvatar}
        <div className={cn('relative max-w-[65%] rounded-lg px-2.5 pt-1.5 pb-2 text-[14px] leading-[19px] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] italic text-gray-500', bubbleTone, tailCorner)}>
          🚫 Mensagem apagada{msg.deleted_by_name ? ` por ${msg.deleted_by_name}` : ''}{tail}
          <span className="absolute bottom-1 right-2 not-italic">{meta}</span>
        </div>
      </div>
    )
  }

  const parentName = parent
    ? (parent.direction === 'outbound' ? (parent.sender_name ?? 'Nós') : (isGroup ? (parent.participant_name ?? 'Participante') : contact.name))
    : null
  const canReply = !!msg.provider_message_id
  const canSaveSticker = msg.message_type === 'image' && !!msg.storage_path && (msg.mime_type ?? '').includes('webp')

  return (
    <div id={`msg-${msg.id}`} className={cn('flex items-start gap-1.5', isOutbound ? 'justify-end' : 'justify-start')}>
      {groupAvatar}
      <div
        title={who}
        className={cn(
          'group relative max-w-[65%] rounded-lg px-2.5 pt-1.5 pb-2 text-[14px] leading-[19px] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]',
          msg.reactions?.length ? 'mb-4' : '',
          bubbleTone, tailCorner
        )}
      >
        {(canReply || canDelete || canSaveSticker || canEdit) && (
          <div className="absolute top-1 right-1">
            <button
              type="button"
              aria-label="Opções da mensagem"
              aria-haspopup="menu"
              onClick={(e) => {
                e.stopPropagation()
                // perto do fim da conversa o menu abre para cima, senão ele fica cortado
                const box = e.currentTarget.closest('[data-thread]')?.getBoundingClientRect()
                const at = e.currentTarget.getBoundingClientRect()
                setMenuUp(!!box && box.bottom - at.bottom < 240)
                setMenu((v) => !v)
              }}
              className="p-1 rounded-full bg-white/80 text-gray-500 hover:text-gray-900 opacity-0 group-hover:opacity-100 focus:opacity-100 shadow-sm"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            {menu && (
              <div role="menu" onClick={(e) => e.stopPropagation()} className={cn('absolute right-0 z-30 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-sm text-gray-800 not-italic', menuUp ? 'bottom-7' : 'top-7')}>
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
                {canEdit && <button role="menuitem" className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50" onClick={() => { setMenu(false); onEdit() }}><Pencil className="w-4 h-4" /> Editar</button>}
                {canSaveSticker && <button role="menuitem" className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50" onClick={() => { setMenu(false); onSaveSticker() }}><StickerIcon className="w-4 h-4" /> Salvar como figurinha</button>}
                {canDelete && <button role="menuitem" className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-red-50 text-red-600" onClick={() => { setMenu(false); onDelete() }}><Trash2 className="w-4 h-4" /> Apagar para todos</button>}
              </div>
            )}
          </div>
        )}

        {speaker && first && <p className={cn('text-[12.5px] font-semibold leading-4 mb-0.5', speakerColor(msg.participant_jid ?? msg.participant_name ?? ''))}>{speaker}</p>}
        {outLabel && <p className="text-[12.5px] font-semibold leading-4 mb-0.5 text-emerald-700">{outLabel}</p>}

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

        {msg.message_type === 'text' && msg.body && <WaText text={mentionNames ? renderMentions(msg.body, mentionNames) : msg.body} tail={tail} />}

        {needsDownload && <DownloadCard msg={msg} onDownload={onDownload} />}

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
