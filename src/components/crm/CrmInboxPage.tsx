'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getCrmConversations,
  getCrmMessages,
  reassignConversation,
  linkConversationContact,
  searchContactsForCrm,
  sendCrmMessage,
  getCrmAttachmentUrl,
  type ConversationRow,
} from '@/lib/crm-actions'
import { uploadCrmFile } from '@/lib/crm-upload'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import {
  Send, Paperclip, Loader2, UserCog, Link2, Search, MessageSquareText, Inbox, Users as UsersIcon, X,
  Mic, Trash2,
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

export function CrmInboxPage({ currentUserId, users }: { currentUserId: string; users: SystemUser[] }) {
  const toast = useToast()
  const [scope, setScope] = useState<ScopeTab>('mine')
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
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

  // Gravação de áudio (segurar/clicar no microfone, como no WhatsApp).
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [sendingVoice, setSendingVoice] = useState(false)
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

  // Rede de segurança: além do tempo real abaixo, confere sozinho a cada 6s
  // (silencioso, sem piscar "Carregando…") — assim a tela nunca fica presa
  // esperando o Realtime, mesmo se ele falhar por algum motivo.
  useEffect(() => {
    const t = setInterval(() => {
      refreshList(true)
      if (selectedId) refreshThread(selectedId, true)
    }, 6000)
    return () => clearInterval(t)
  }, [selectedId, refreshList, refreshThread])

  // Realtime: nova mensagem em qualquer conversa -> atualiza lista; se for a
  // conversa aberta, atualiza a thread também.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('crm-messages-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_messages' }, (payload) => {
        const row = payload.new as any
        refreshList(true)
        if (selectedId && row.conversation_id === selectedId) refreshThread(selectedId, true)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'crm_conversations' }, () => {
        refreshList(true)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const selected = conversations.find((c) => c.id === selectedId) ?? null

  async function handleSend() {
    if (!selectedId || !text.trim()) return
    const value = text
    setText('')
    const res = await sendCrmMessage({ conversationId: selectedId, text: value })
    if (res.error) { toast.error('NÃO FOI POSSÍVEL ENVIAR', res.error); setText(value); return }
    refreshThread(selectedId)
  }

  function handleFile(fileList: FileList | null) {
    if (!fileList?.length || !selectedId) return
    const file = fileList[0]
    startTransition(async () => {
      const up = await uploadCrmFile(selectedId, file)
      if (up.error) { toast.error('NÃO FOI POSSÍVEL ENVIAR', up.error); return }
      const res = await sendCrmMessage({
        conversationId: selectedId,
        text: text.trim() || undefined,
        storagePath: up.storagePath,
        fileName: file.name,
        mimeType: file.type,
      })
      if (res.error) toast.error('NÃO FOI POSSÍVEL ENVIAR', res.error)
      else { setText(''); refreshThread(selectedId) }
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
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t)) ?? ''
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
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
    if (!recorder || !selectedId) { setRecording(false); return }
    const convId = selectedId
    recorder.onstop = () => {
      stopRecordingTracks()
      const mimeType = recorder.mimeType || 'audio/webm'
      const blob = new Blob(recordedChunksRef.current, { type: mimeType })
      recordedChunksRef.current = []
      const ext = mimeType.includes('mp4') ? 'm4a' : 'webm'
      const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: mimeType })
      setSendingVoice(true)
      uploadCrmFile(convId, file).then(async (up) => {
        if (up.error) { toast.error('NÃO FOI POSSÍVEL ENVIAR', up.error); setSendingVoice(false); return }
        const res = await sendCrmMessage({
          conversationId: convId,
          storagePath: up.storagePath,
          fileName: file.name,
          mimeType: file.type,
          isVoiceNote: true,
        })
        setSendingVoice(false)
        if (res.error) toast.error('NÃO FOI POSSÍVEL ENVIAR', res.error)
        else refreshThread(convId)
      })
    }
    recorder.stop()
    mediaRecorderRef.current = null
    setRecording(false)
  }

  useEffect(() => () => { mediaRecorderRef.current?.stop(); stopRecordingTracks() }, [])

  async function openAttachment(path: string) {
    const res = await getCrmAttachmentUrl(path)
    if (res.error || !res.url) { toast.error('OCORREU UM ERRO', res.error ?? 'Não foi possível abrir.'); return }
    window.open(res.url, '_blank', 'noopener,noreferrer')
  }

  async function handleReassign(userId: string) {
    if (!selectedId) return
    const res = await reassignConversation(selectedId, userId)
    setShowReassign(false)
    if (res.error) toast.error('NÃO FOI POSSÍVEL TRANSFERIR', res.error)
    else { toast.success('TRANSFERIDO!', 'A conversa mudou de atendente.'); refreshList(); refreshThread(selectedId) }
  }

  async function handleLinkContact(contactId: string | null) {
    if (!selectedId) return
    const res = await linkConversationContact(selectedId, contactId)
    setShowLinkContact(false)
    if (res.error) toast.error('OCORREU UM ERRO', res.error)
    else { toast.success('VINCULADO!', 'Contato atualizado.'); refreshList() }
  }

  useEffect(() => {
    if (!contactQuery.trim()) { setContactResults([]); return }
    const t = setTimeout(() => { searchContactsForCrm(contactQuery).then(setContactResults) }, 300)
    return () => clearTimeout(t)
  }, [contactQuery])

  return (
    <div className="flex h-[calc(100vh-7.5rem)] gap-4">
      {/* Lista de conversas */}
      <div className="w-80 shrink-0 flex flex-col card p-0 overflow-hidden">
        <div className="p-3 border-b border-surface-border flex gap-1">
          {([
            ['mine', 'Minhas', MessageSquareText],
            ['unassigned', 'Sem atendente', Inbox],
            ['all', 'Todas', UsersIcon],
          ] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setScope(key)}
              className={cn(
                'flex-1 text-xs font-medium rounded-lg px-2 py-1.5 flex items-center justify-center gap-1',
                scope === key ? 'bg-brand-500 text-white' : 'text-gray-500 hover:bg-surface-secondary',
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingList && (
            <p className="text-xs text-gray-400 p-4 flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…
            </p>
          )}
          {!loadingList && conversations.length === 0 && (
            <p className="text-xs text-gray-400 p-4">Nenhuma conversa aqui.</p>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={cn(
                'w-full text-left px-3 py-2.5 border-b border-surface-border/60 hover:bg-surface-secondary transition-colors',
                selectedId === c.id && 'bg-brand-50',
              )}
            >
              <p className="text-sm font-medium text-gray-800 truncate">
                {c.contact_name ?? c.remote_jid.split('@')[0]}
              </p>
              <p className="text-xs text-gray-400 truncate">{c.last_body ?? '—'}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {c.instance_label}{c.assigned_user_name ? ` · ${c.assigned_user_name}` : ''}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Thread */}
      <div className="flex-1 card p-0 flex flex-col overflow-hidden">
        {!selected && (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
            Escolha uma conversa à esquerda.
          </div>
        )}

        {selected && (
          <>
            <div className="p-3 border-b border-surface-border flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">
                  {selected.contact_name ?? selected.remote_jid.split('@')[0]}
                </p>
                <p className="text-xs text-gray-400">{selected.instance_label}</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => setShowLinkContact(true)} className="btn-secondary text-xs px-2 py-1.5 flex items-center gap-1">
                  <Link2 className="w-3.5 h-3.5" /> Vincular contato
                </button>
                <button onClick={() => setShowReassign(true)} className="btn-secondary text-xs px-2 py-1.5 flex items-center gap-1">
                  <UserCog className="w-3.5 h-3.5" /> Mudar atendente
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-surface-secondary/30">
              {loadingThread && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
              {messages.map((m) => (
                <MessageBubble key={m.id} msg={m} onOpenAttachment={openAttachment} />
              ))}
              <div ref={bottomRef} />
            </div>

            {recording ? (
              <div className="p-3 border-t border-surface-border flex items-center gap-3">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                </span>
                <span className="text-sm text-gray-600 flex-1">
                  Gravando… {String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:{String(recordSeconds % 60).padStart(2, '0')}
                </span>
                <button type="button" onClick={cancelRecording} className="p-2 text-gray-400 hover:text-red-600" title="Cancelar">
                  <Trash2 className="w-5 h-5" />
                </button>
                <button type="button" onClick={finishRecording} className="btn-primary px-3 py-2" title="Enviar áudio">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="p-3 border-t border-surface-border flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={pending || sendingVoice}
                  className="p-2 text-gray-400 hover:text-brand-600"
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
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="Escreva uma mensagem…"
                  rows={1}
                  className="input flex-1 resize-none"
                />
                {text.trim() ? (
                  <button onClick={handleSend} className="btn-primary px-3 py-2">
                    <Send className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={sendingVoice}
                    className="btn-primary px-3 py-2"
                    title="Gravar áudio"
                  >
                    {sendingVoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {showReassign && selected && (
        <Modal onClose={() => setShowReassign(false)} title="Mudar atendente">
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => handleReassign(u.id)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-surface-secondary',
                  u.id === selected.assigned_user_id && 'bg-brand-50 font-medium',
                )}
              >
                {u.name}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {showLinkContact && selected && (
        <Modal onClose={() => setShowLinkContact(false)} title="Vincular contato">
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-2.5" />
              <input
                autoFocus
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                placeholder="Buscar por nome…"
                className="input pl-8"
              />
            </div>
            {selected.contact_id && (
              <button onClick={() => handleLinkContact(null)} className="text-xs text-red-600 hover:underline">
                Desvincular contato atual
              </button>
            )}
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {contactResults.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleLinkContact(c.id)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-surface-secondary"
                >
                  {c.name} <span className="text-xs text-gray-400">({c.type})</span>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function MessageBubble({ msg, onOpenAttachment }: { msg: Msg; onOpenAttachment: (path: string) => void }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  useEffect(() => {
    if (msg.message_type === 'audio' && msg.storage_path) {
      getCrmAttachmentUrl(msg.storage_path).then((r) => { if (r.url) setAudioUrl(r.url) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msg.storage_path, msg.message_type])

  if (msg.is_system) {
    return <p className="text-center text-[11px] text-gray-400 py-1">{msg.body}</p>
  }
  const mine = msg.direction === 'outbound'
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[70%] rounded-2xl px-3 py-2 text-sm',
        mine ? 'bg-brand-500 text-white rounded-br-sm' : 'bg-white border border-surface-border rounded-bl-sm',
      )}>
        {mine && msg.sender_name && (
          <p className="text-[11px] font-semibold opacity-80 mb-0.5">{msg.sender_name}</p>
        )}
        {msg.storage_path && msg.message_type === 'audio' && (
          audioUrl
            ? <audio controls src={audioUrl} className="h-9 max-w-[220px] mb-1" />
            : <p className="text-xs opacity-70 mb-1 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> áudio…</p>
        )}
        {msg.storage_path && msg.message_type !== 'audio' && (
          <button
            onClick={() => onOpenAttachment(msg.storage_path!)}
            className={cn('flex items-center gap-1.5 text-xs underline mb-1', mine ? 'text-white' : 'text-brand-600')}
          >
            <Paperclip className="w-3.5 h-3.5" /> {msg.file_name ?? 'arquivo'}
          </button>
        )}
        {msg.body && <p className="whitespace-pre-wrap">{msg.body}</p>}
        <p className={cn('text-[10px] mt-1', mine ? 'text-white/70' : 'text-gray-400')}>
          {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card p-4 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
