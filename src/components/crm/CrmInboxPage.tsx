'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'

// Gera cores diferentes para cada contato baseado no ID
function getAvatarColor(id: string): string {
  const colors = [
    'from-blue-400 to-blue-600',
    'from-green-400 to-green-600',
    'from-purple-400 to-purple-600',
    'from-pink-400 to-pink-600',
    'from-yellow-400 to-yellow-600',
    'from-red-400 to-red-600',
    'from-indigo-400 to-indigo-600',
    'from-cyan-400 to-cyan-600',
  ]
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return colors[hash % colors.length]
}
import {
  getCrmConversations,
  getCrmMessages,
  reassignConversation,
  linkConversationContact,
  setConversationDisplayName,
  searchContactsForCrm,
  sendCrmMessage,
  getCrmAttachmentUrl,
  syncCrmContactInfo,
  type ConversationRow,
} from '@/lib/crm-actions'
import { uploadCrmFile } from '@/lib/crm-upload'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import {
  Send, Paperclip, Loader2, UserCog, Link2, Search, MessageSquareText, Inbox, Users as UsersIcon, X,
  Mic, Trash2, Square, RefreshCw,
} from 'lucide-react'

type ScopeTab = 'mine' | 'unassigned' | 'all'

interface Msg {
  id: string
  direction: 'inbound' | 'outbound'
  sender_user_id: string | null
  sender_name: string | null
  message_type: string
  body: string | null
  storage_path: string | null
  file_name: string | null
  mime_type: string | null
  is_system: boolean
  created_at: string
}

interface SystemUser { id: string; name: string; role: string }

export function CrmInboxPage({ currentUserId, users, initialConversationId = null }: { currentUserId: string; users: SystemUser[]; initialConversationId?: string | null }) {
  const toast = useToast()
  const [scope, setScope] = useState<ScopeTab>(initialConversationId ? 'all' : 'mine')
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId)
  const [messages, setMessages] = useState<Msg[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingThread, setLoadingThread] = useState(false)
  const [text, setText] = useState('')
  const [pending, startTransition] = useTransition()
  const [showReassign, setShowReassign] = useState(false)
  const [showLinkContact, setShowLinkContact] = useState(false)
  const [contactQuery, setContactQuery] = useState('')
  const [contactResults, setContactResults] = useState<any[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const refreshList = useCallback((silent = false) => {
    if (!silent) setLoadingList(true)
    getCrmConversations(scope)
      .then((r) => setConversations(r.items ?? []))
      .finally(() => { if (!silent) setLoadingList(false) })
  }, [scope])

  const refreshThread = useCallback((id: string, silent = false) => {
    if (!silent) setLoadingThread(true)
    getCrmMessages(id)
      .then((r) => setMessages((r.items as Msg[]) ?? []))
      .finally(() => { if (!silent) setLoadingThread(false) })
  }, [])

  useEffect(() => { refreshList() }, [refreshList])
  useEffect(() => { if (selectedId) refreshThread(selectedId) }, [selectedId, refreshThread])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    const t = setInterval(() => {
      refreshList(true)
      if (selectedId) refreshThread(selectedId, true)
    }, 6000)
    return () => clearInterval(t)
  }, [selectedId, refreshList, refreshThread])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel('crm:all')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'crm_messages',
      }, () => {
        refreshList(true)
        if (selectedId) refreshThread(selectedId, true)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [selectedId, refreshList, refreshThread])

  const selected = selectedId ? conversations.find((c) => c.id === selectedId) : null

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
        })
        if (res.error) toast.error('ERRO', res.error)
        else refreshThread(selectedId)
      })
    })
  }

  const handleSend = () => {
    if (!text.trim() || !selectedId) return
    const msg = text
    setText('')
    startTransition(async () => {
      const res = await sendCrmMessage({ conversationId: selectedId, text: msg })
      if (res.error) toast.error('ERRO', res.error)
      else refreshThread(selectedId)
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
    })
    setSendingVoice(false)
    if (res.error) toast.error('NÃO FOI POSSÍVEL ENVIAR', res.error)
    else refreshThread(selectedId)
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
          <div className="flex gap-2">
            {(['mine', 'unassigned', 'all'] as const).map((key) => (
              <button
                key={key}
                onClick={() => setScope(key)}
                className={cn(
                  'flex-1 px-3 py-1.5 text-sm font-medium rounded-full transition-colors',
                  scope === key
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                {key === 'mine' ? 'Minhas' : key === 'unassigned' ? 'Pendentes' : 'Todas'}
              </button>
            ))}
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {loadingList && (
            <div className="p-8 text-center">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
            </div>
          )}
          {!loadingList && conversations.length === 0 && (
            <p className="text-sm text-gray-500 p-4 text-center">Nenhuma conversa aqui</p>
          )}
          <div className="p-2 space-y-1">
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  'w-full text-left p-3 rounded-lg transition-all',
                  selectedId === c.id
                    ? 'bg-gray-100 border-l-4 border-gray-900'
                    : 'hover:bg-gray-50'
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
                  ) : (
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarColor(c.id)} text-white text-sm font-bold flex items-center justify-center shrink-0`}>
                      {(c.contact_name ?? c.remote_jid.split('@')[0]).charAt(0).toUpperCase()}
                    </div>
                  )}

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 truncate">
                      {c.contact_name ?? c.remote_jid.split('@')[0]}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{c.instance_label}</p>
                    <p className="text-xs text-gray-400 line-clamp-1 mt-1">
                      {c.last_body || 'Sem mensagens'}
                    </p>
                  </div>
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
            <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${getAvatarColor(selected.id)} text-white text-sm font-bold flex items-center justify-center`}>
                  {(selected.contact_name ?? selected.remote_jid.split('@')[0]).charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {selected.contact_name ?? selected.remote_jid.split('@')[0]}
                  </h3>
                  <p className="text-sm text-gray-500">{selected.instance_label}</p>
                </div>
              </div>

              {/* Ações */}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowLinkContact(true)}
                  className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Link2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowReassign(true)}
                  className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <UserCog className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingThread && (
                <div className="text-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400 mx-auto" />
                </div>
              )}
              {messages.map((m) => (
                <MessageBubble key={m.id} msg={m} onOpenAttachment={openAttachment} />
              ))}
              <div ref={bottomRef} />
            </div>

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
              <div className="p-4 border-t border-gray-200 bg-white flex items-end gap-2">
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
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => { handleFile(e.target.files); e.target.value = '' }}
                />

                {/* Input */}
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="Escreva uma mensagem…"
                  rows={1}
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-900 placeholder-gray-500 rounded-lg border-0 resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-0"
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
            )}
          </>
        )}
      </div>

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

      {showReassign && selected && (
        <ReassignModal
          conversationId={selected.id}
          currentUserId={selected.assigned_user_id ?? ''}
          onClose={() => setShowReassign(false)}
          onSuccess={() => { setShowReassign(false); refreshList() }}
          users={users}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// Componentes auxiliares
// ════════════════════════════════════════════════════════════════════════════════════════════════

function MessageBubble({ msg, onOpenAttachment }: { msg: Msg; onOpenAttachment: (p: string) => void }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioError, setAudioError] = useState(false)
  const [audioLoading, setAudioLoading] = useState(false)

  useEffect(() => {
    if (msg.message_type === 'audio' && msg.storage_path) {
      setAudioLoading(true)
      setAudioError(false)
      getCrmAttachmentUrl(msg.storage_path).then((r) => {
        if ('url' in r && r.url) {
          setAudioUrl(r.url)
        } else {
          setAudioError(true)
        }
      }).catch(() => setAudioError(true))
        .finally(() => setAudioLoading(false))
    }
  }, [msg.id, msg.storage_path])

  const isOutbound = msg.direction === 'outbound'
  const time = new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  if (msg.is_system) {
    return <div className="text-center py-2 text-xs text-gray-400">{msg.body}</div>
  }

  return (
    <div className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-xs rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isOutbound
            ? 'bg-gray-900 text-white'
            : 'bg-white text-gray-900 border border-gray-200'
        )}
      >
        {!isOutbound && msg.sender_name && (
          <p className="text-xs font-semibold text-gray-500 mb-1">{msg.sender_name}</p>
        )}

        {msg.message_type === 'text' && msg.body && (
          <p className="whitespace-pre-wrap">{msg.body}</p>
        )}

        {msg.message_type === 'audio' && (
          audioLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 min-w-[160px]">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Carregando áudio...</span>
            </div>
          ) : audioUrl ? (
            <div className="min-w-[200px]">
              <audio
                controls
                className="w-full"
                style={{ height: '36px' }}
                onError={() => setAudioError(true)}
              >
                <source src={audioUrl} type={msg.mime_type?.split(';')[0] || 'audio/ogg'} />
                <source src={audioUrl} type="audio/mpeg" />
                Seu navegador não suporta áudio.
              </audio>
              {audioError && (
                <a
                  href={audioUrl}
                  download={msg.file_name || 'audio.oga'}
                  className={cn('text-xs underline mt-1 block', isOutbound ? 'text-gray-300' : 'text-blue-600')}
                >
                  🎙️ Baixar áudio
                </a>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm min-w-[160px]">
              <span>🎙️</span>
              <span className={isOutbound ? 'text-gray-300' : 'text-gray-500'}>
                {audioError ? 'Áudio indisponível' : 'Mensagem de voz'}
              </span>
            </div>
          )
        )}

        {['image', 'document'].includes(msg.message_type) && msg.storage_path && (
          <button
            onClick={() => msg.storage_path && onOpenAttachment(msg.storage_path)}
            className={cn(
              'underline text-sm',
              isOutbound ? 'text-gray-200' : 'text-blue-600'
            )}
          >
            {msg.file_name || 'Arquivo'}
          </button>
        )}

        {msg.message_type === 'other' && (
          <p className={cn('text-xs italic', isOutbound ? 'text-gray-400' : 'text-gray-400')}>
            Mensagem não suportada
          </p>
        )}

        <p className={cn('text-xs mt-1 opacity-70', isOutbound ? 'text-gray-300' : 'text-gray-500')}>
          {time}
        </p>
      </div>
    </div>
  )
}

function ReassignModal({
  conversationId,
  currentUserId,
  onClose,
  onSuccess,
  users,
}: {
  conversationId: string
  currentUserId: string
  onClose: () => void
  onSuccess: () => void
  users: SystemUser[]
}) {
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  const handleReassign = (userId: string | null) => {
    startTransition(async () => {
      const res = await reassignConversation(conversationId, userId)
      if (res.error) toast.error('ERRO', res.error)
      else { toast.success('ATUALIZADO!', 'Conversa atribuída'); onSuccess() }
    })
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">Atribuir conversa</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => handleReassign(null)}
            disabled={pending}
            className={cn(
              'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
              !currentUserId
                ? 'bg-gray-200 text-gray-900 font-medium'
                : 'hover:bg-gray-100 text-gray-700'
            )}
          >
            Sem atribuição
          </button>
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => handleReassign(u.id)}
              disabled={pending}
              className={cn(
                'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                currentUserId === u.id
                  ? 'bg-gray-200 text-gray-900 font-medium'
                  : 'hover:bg-gray-100 text-gray-700'
              )}
            >
              {u.name}
            </button>
          ))}
        </div>
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
