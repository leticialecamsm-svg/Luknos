import { handleOptions, json } from './_shared/cors.ts'
import { isInternalCall } from './_shared/internal.ts'
import { createServiceClient } from './_shared/supabase.ts'
import { sendTextMessage, sendMediaMessage, sendVoiceNote, deleteMessageForEveryone, editTextMessage, evolutionFetch, sendReactionMessage, sendContactMessage, sendStickerMessage, fetchGroupParticipants, type Quoted } from './_shared/evolution.ts'
import { onlyDigits } from './_shared/phone.ts'
import { env } from './_shared/env.ts'

interface ContactToSend {
  name: string
  phone: string
  company?: string | null
  email?: string | null
}

interface Payload {
  action?: 'send' | 'delete' | 'edit' | 'fetch_media' | 'react' | 'send_contact' | 'send_sticker' | 'group_participants' | 'resolve_number' | 'presence' | 'webhook_presence' | 'watch' | 'sync_edits'
  // watch: true = o CRM está com a conversa aberta e à vista (fica online e acompanha o contato)
  online?: boolean
  // watch: identifica a aba (várias abas/atendentes podem acompanhar o mesmo número)
  viewer?: string
  // "digitando…" para o contato: composing | recording | paused
  presence?: string
  // webhook_presence: false = só mostra a configuração atual; true = liga o evento PRESENCE_UPDATE
  apply?: boolean
  // webhook_presence: eventos a ligar (padrão: PRESENCE_UPDATE)
  events?: string[]
  instance_id?: string
  phone?: string
  conversation_id?: string
  sender_user_id?: string
  acted_by_user_id?: string | null
  text?: string
  storage_path?: string
  file_name?: string
  mime_type?: string
  is_voice_note?: boolean
  // resposta (cita uma mensagem da conversa)
  quoted_provider_id?: string | null
  quoted_text?: string | null
  // mencoes em grupo: JIDs dos mencionados (o texto traz "@<numero>") ou "todos"
  mentioned?: string[]
  mention_all?: boolean
  // apagar para todos
  message_id?: string
  deleted_by_user_id?: string
  // reagir (emoji vazio = tirar a reacao)
  emoji?: string
  // enviar cartao(oes) de contato
  contacts?: ContactToSend[]
  // mensagem encaminhada (selo "Encaminhada")
  forwarded?: boolean
  // quem digita prefere não assinar (preferência da pessoa no CRM)
  no_signature?: boolean
}

Deno.serve(async (req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ sent: false, error: 'method_not_allowed' }, 405)
  if (!isInternalCall(req)) return json({ sent: false, error: 'unauthorized' }, 401)

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return json({ sent: false, error: 'invalid_json' }, 400)
  }

  try {
    if (payload.action === 'delete') return json(await deleteMessage(payload))
    if (payload.action === 'edit') return json(await editMessage(payload))
    if (payload.action === 'fetch_media') return await fetchMedia(payload)
    if (payload.action === 'resolve_number') return json(await resolveNumber(payload))
    if (payload.action === 'react') return json(await reactToMessage(payload))
    if (payload.action === 'send_contact') return json(await sendContact(payload))
    if (payload.action === 'send_sticker') return json(await sendSticker(payload))
    if (payload.action === 'group_participants') return json(await groupParticipants(payload))
    if (payload.action === 'presence') return json(await sendPresence(payload))
    if (payload.action === 'webhook_presence') return json(await webhookPresence(!!payload.apply, payload.events))
    if (payload.action === 'watch') return json(await watchConversation(payload))
    if (payload.action === 'sync_edits') return json(await syncEdits(payload))

    const { conversation_id, sender_user_id } = payload
    if (!conversation_id || !sender_user_id) return json({ sent: false, error: 'missing_fields' }, 400)
    if (!payload.text?.trim() && !payload.storage_path) return json({ sent: false, error: 'empty_message' }, 400)
    return json(await send(payload as Required<Pick<Payload, 'conversation_id' | 'sender_user_id'>> & Payload))
  } catch (err) {
    console.error('crm-send-message erro:', err)
    return json({ sent: false, error: String((err as Error)?.message ?? err) }, 500)
  }
})

// Grupos usam o JID inteiro (ex.: 1203...@g.us); contatos, so os digitos.
function targetNumber(remoteJid: string): string {
  return remoteJid.endsWith('@g.us') ? remoteJid : onlyDigits(remoteJid.split('@')[0])
}

// Membros do grupo da conversa (nome, telefone e identificador para mencionar).
async function groupParticipants(payload: Payload) {
  if (!payload.conversation_id) return { ok: false, error: 'missing_fields' }
  const db = createServiceClient()
  const { data: conv } = await db
    .from('crm_conversations')
    .select('id, remote_jid, crm_instances(instance_name)')
    .eq('id', payload.conversation_id)
    .maybeSingle()
  if (!conv || !conv.remote_jid.endsWith('@g.us')) return { ok: false, error: 'Esta conversa não é um grupo.' }
  const instanceName = (conv as any).crm_instances?.instance_name as string | undefined
  if (!instanceName) return { ok: false, error: 'instance_not_found' }
  const res = await fetchGroupParticipants(instanceName, conv.remote_jid)
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, participants: res.participants }
}

async function send(payload: Required<Pick<Payload, 'conversation_id' | 'sender_user_id'>> & Payload) {
  const db = createServiceClient()

  const { data: conv } = await db
    .from('crm_conversations')
    .select('id, remote_jid, instance_id, hide_signature, crm_instances(instance_name)')
    .eq('id', payload.conversation_id)
    .maybeSingle()
  if (!conv) return { sent: false, error: 'conversation_not_found' }

  const instanceName = (conv as any).crm_instances?.instance_name as string | undefined
  if (!instanceName) return { sent: false, error: 'instance_not_found' }

  const { data: sender } = await db.from('users').select('name').eq('id', payload.sender_user_id).maybeSingle()
  const senderName = sender?.name ?? 'Equipe Luknos'
  // Conversa marcada "sem assinatura": a mensagem vai sem o "*Nome:*" no comeco.
  const signature = conv.hide_signature || payload.no_signature ? '' : `*${senderName}:*`

  const number = targetNumber(conv.remote_jid)
  const text = payload.text?.trim() || null
  const quoted: Quoted | undefined = payload.quoted_provider_id
    ? { id: payload.quoted_provider_id, remoteJid: conv.remote_jid, text: payload.quoted_text ?? '' }
    : undefined
  const isGroup = conv.remote_jid.endsWith('@g.us')
  const mentions = isGroup
    ? { mentioned: (payload.mentioned ?? []).filter((j) => /^\d+@(lid|s\.whatsapp\.net)$/.test(j)).slice(0, 30), everyone: !!payload.mention_all }
    : undefined

  let result: { sent: boolean; providerMessageId?: string; error?: string }
  let messageType: string

  if (payload.storage_path) {
    const { data: blob, error } = await db.storage.from('crm-attachments').download(payload.storage_path)
    if (error || !blob) return { sent: false, error: error?.message ?? 'arquivo nao encontrado' }
    const base64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()))
    const mimeType = payload.mime_type || 'application/octet-stream'
    messageType = mimeType.startsWith('image/') ? 'image'
      : mimeType.startsWith('audio/') ? 'audio'
      : mimeType.startsWith('video/') ? 'video'
      : 'document'
    if (messageType === 'audio') {
      // Todo audio sai pelo endpoint de nota de voz (a Evolution converte para ogg/opus).
      // Testado ao vivo: sendMedia com audio/webm ou audio/ogg e aceito pela Evolution
      // (201) mas NAO e entregue pelo WhatsApp — por isso nao ha plano B por sendMedia.
      result = await sendVoiceNote(instanceName, number, base64, quoted)
    } else {
      const caption = [signature, text].filter(Boolean).join('\n') || undefined
      result = await sendMediaMessage(instanceName, number, {
        mediatype: messageType as 'image' | 'document' | 'video',
        base64,
        fileName: payload.file_name || 'arquivo',
        mimetype: mimeType,
        caption,
        ptt: false,
        quoted,
      })
    }
  } else {
    messageType = 'text'
    result = await sendTextMessage(instanceName, number, signature ? `${signature}\n${text}` : (text ?? ''), quoted, mentions)
  }

  if (!result.sent) return { sent: false, error: result.error }

  const { data: msg, error: insErr } = await db
    .from('crm_messages')
    .insert({
      conversation_id: payload.conversation_id,
      direction: 'outbound',
      sender_user_id: payload.sender_user_id,
      // quando um administrador responde "como" outro atendente
      acted_by_user_id: payload.acted_by_user_id ?? null,
      message_type: messageType,
      body: text,
      storage_path: payload.storage_path ?? null,
      file_name: payload.file_name ?? null,
      mime_type: payload.mime_type ?? null,
      provider_message_id: result.providerMessageId ?? null,
      reply_to_provider_id: payload.quoted_provider_id ?? null,
      reply_to_preview: payload.quoted_provider_id ? (payload.quoted_text ?? '').slice(0, 300) : null,
      is_forwarded: payload.forwarded ?? false,
      // áudio não leva legenda/assinatura
      signed: !!signature && messageType !== 'audio',
    })
    .select('id')
    .single()
  if (insErr) console.error('falha ao registrar outbound em crm_messages', insErr)

  await db.from('crm_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', payload.conversation_id)

  return { sent: true, provider_message_id: result.providerMessageId ?? null, message_id: msg?.id ?? null }
}

// Figurinha: o arquivo .webp (512x512) vai como base64 para o endpoint de sticker.
async function sendSticker(payload: Payload) {
  const { conversation_id, sender_user_id, storage_path } = payload
  if (!conversation_id || !sender_user_id || !storage_path) return { sent: false, error: 'missing_fields' }
  const db = createServiceClient()
  const { data: conv } = await db
    .from('crm_conversations')
    .select('id, remote_jid, instance_id, crm_instances(instance_name)')
    .eq('id', conversation_id)
    .maybeSingle()
  if (!conv) return { sent: false, error: 'conversation_not_found' }
  const instanceName = (conv as any).crm_instances?.instance_name as string | undefined
  if (!instanceName) return { sent: false, error: 'instance_not_found' }

  const { data: blob, error } = await db.storage.from('crm-attachments').download(storage_path)
  if (error || !blob) return { sent: false, error: error?.message ?? 'arquivo nao encontrado' }
  const base64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()))

  const res = await sendStickerMessage(instanceName, targetNumber(conv.remote_jid), base64)
  if (!res.sent) return { sent: false, error: res.error }

  const { data: msg, error: insErr } = await db
    .from('crm_messages')
    .insert({
      conversation_id,
      direction: 'outbound',
      sender_user_id,
      acted_by_user_id: payload.acted_by_user_id ?? null,
      message_type: 'image',
      body: null,
      storage_path,
      file_name: 'figurinha.webp',
      mime_type: 'image/webp',
      provider_message_id: res.providerMessageId ?? null,
    })
    .select('id')
    .single()
  if (insErr) console.error('falha ao registrar figurinha enviada', insErr)
  await db.from('crm_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversation_id)
  return { sent: true, provider_message_id: res.providerMessageId ?? null, message_id: msg?.id ?? null }
}

// Telefone no formato do WhatsApp: so digitos, com DDI (55 quando vier sem).
function waPhone(raw: string): string {
  const d = onlyDigits(raw)
  return d.length >= 12 ? d : (d.length >= 10 ? '55' + d : d)
}

// Enviar cartao(oes) de contato (vCard) pelo numero da conversa.
async function sendContact(payload: Payload) {
  const { conversation_id, sender_user_id } = payload
  const contacts = (payload.contacts ?? []).filter((c) => c?.name?.trim() && onlyDigits(c.phone ?? '').length >= 8).slice(0, 5)
  if (!conversation_id || !sender_user_id) return { sent: false, error: 'missing_fields' }
  if (!contacts.length) return { sent: false, error: 'O contato precisa ter nome e telefone.' }
  const db = createServiceClient()

  const { data: conv } = await db
    .from('crm_conversations')
    .select('id, remote_jid, instance_id, crm_instances(instance_name)')
    .eq('id', conversation_id)
    .maybeSingle()
  if (!conv) return { sent: false, error: 'conversation_not_found' }
  const instanceName = (conv as any).crm_instances?.instance_name as string | undefined
  if (!instanceName) return { sent: false, error: 'instance_not_found' }

  const prepared = contacts.map((c) => {
    const wuid = waPhone(c.phone)
    return {
      fullName: c.name.trim(),
      wuid,
      phoneNumber: `+${wuid}`,
      organization: c.company?.trim() || undefined,
      email: c.email?.trim() || undefined,
    }
  })
  const res = await sendContactMessage(instanceName, targetNumber(conv.remote_jid), prepared)
  if (!res.sent) return { sent: false, error: res.error }

  const body = `👤 ${prepared.length > 1 ? 'Contatos' : 'Contato'}\n` + prepared.map((c) => `${c.fullName} · ${c.phoneNumber}`).join('\n')
  const { data: msg, error: insErr } = await db
    .from('crm_messages')
    .insert({
      conversation_id,
      direction: 'outbound',
      sender_user_id,
      acted_by_user_id: payload.acted_by_user_id ?? null,
      message_type: 'other',
      body,
      provider_message_id: res.providerMessageId ?? null,
    })
    .select('id')
    .single()
  if (insErr) console.error('falha ao registrar contato enviado', insErr)
  await db.from('crm_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversation_id)
  return { sent: true, provider_message_id: res.providerMessageId ?? null, message_id: msg?.id ?? null }
}

// Apagar para todos: so mensagens nossas (direction=outbound) que tem id do WhatsApp.
async function deleteMessage(payload: Payload) {
  if (!payload.message_id) return { deleted: false, error: 'missing_message_id' }
  const db = createServiceClient()
  const { data: msg } = await db
    .from('crm_messages')
    .select('id, direction, provider_message_id, deleted_at, conversation_id, crm_conversations(remote_jid, crm_instances(instance_name))')
    .eq('id', payload.message_id)
    .maybeSingle()
  if (!msg) return { deleted: false, error: 'message_not_found' }
  if (msg.deleted_at) return { deleted: true, already: true }
  if (msg.direction !== 'outbound') return { deleted: false, error: 'Só é possível apagar mensagens enviadas por nós.' }
  if (!msg.provider_message_id) return { deleted: false, error: 'Esta mensagem não tem identificador do WhatsApp para ser apagada.' }
  const conv = (msg as any).crm_conversations
  const instanceName = conv?.crm_instances?.instance_name as string | undefined
  if (!instanceName) return { deleted: false, error: 'instance_not_found' }

  const res = await deleteMessageForEveryone(instanceName, { id: msg.provider_message_id, remoteJid: conv.remote_jid })
  if (!res.ok) return { deleted: false, error: res.error }

  await db.from('crm_messages').update({ deleted_at: new Date().toISOString(), deleted_by_user_id: payload.deleted_by_user_id ?? null }).eq('id', payload.message_id)
  return { deleted: true }
}

// Editar texto enviado por nos (o WhatsApp aceita ate 15 min depois do envio).
// A assinatura "*Nome:*" volta no comeco, como no envio, salvo se a conversa estiver sem assinatura.
async function editMessage(payload: Payload) {
  const text = payload.text?.trim()
  if (!payload.message_id || !text) return { edited: false, error: 'missing_fields' }
  const db = createServiceClient()
  const { data: msg } = await db
    .from('crm_messages')
    .select('id, direction, message_type, provider_message_id, deleted_at, created_at, sender_user_id, crm_conversations(remote_jid, hide_signature, crm_instances(instance_name))')
    .eq('id', payload.message_id)
    .maybeSingle()
  if (!msg) return { edited: false, error: 'message_not_found' }
  if (msg.direction !== 'outbound' || msg.message_type !== 'text' || msg.deleted_at) return { edited: false, error: 'Só dá para editar mensagens de texto enviadas por nós.' }
  if (!msg.provider_message_id) return { edited: false, error: 'Esta mensagem não tem identificador do WhatsApp.' }
  if (Date.now() - new Date(msg.created_at).getTime() > 15 * 60 * 1000) return { edited: false, error: 'O WhatsApp só permite editar até 15 minutos depois do envio.' }
  const conv = (msg as any).crm_conversations
  const instanceName = conv?.crm_instances?.instance_name as string | undefined
  if (!instanceName) return { edited: false, error: 'instance_not_found' }

  let full = text
  if (!conv.hide_signature && !payload.no_signature && msg.sender_user_id) {
    const { data: sender } = await db.from('users').select('name').eq('id', msg.sender_user_id).maybeSingle()
    full = `*${sender?.name ?? 'Equipe Luknos'}:*\n${text}`
  }
  const res = await editTextMessage(instanceName, targetNumber(conv.remote_jid), { id: msg.provider_message_id, remoteJid: conv.remote_jid }, full)
  if (!res.ok) return { edited: false, error: res.error }

  await db.from('crm_messages').update({ body: text, edited_at: new Date().toISOString() }).eq('id', payload.message_id)
  return { edited: true }
}

// Baixar a midia de uma mensagem (quando alguem pede no CRM). A resposta da Evolution
// ({ base64, mimetype, fileName }) e repassada como chega, sem montar o arquivo na memoria
// desta funcao (arquivos grandes estouravam o limite). Quem guarda no Drive e o sistema.
async function fetchMedia(payload: Payload): Promise<Response> {
  if (!payload.message_id) return json({ ok: false, error: 'missing_message_id' })
  const db = createServiceClient()
  const { data: msg } = await db
    .from('crm_messages')
    .select('id, direction, provider_message_id, participant_jid, crm_conversations(remote_jid, crm_instances(instance_name))')
    .eq('id', payload.message_id)
    .maybeSingle()
  if (!msg) return json({ ok: false, error: 'message_not_found' })
  if (!msg.provider_message_id) return json({ ok: false, error: 'Esta mensagem não tem identificador do WhatsApp.' })
  const conv = (msg as any).crm_conversations
  const instanceName = conv?.crm_instances?.instance_name as string | undefined
  if (!instanceName) return json({ ok: false, error: 'instance_not_found' })
  const key: Record<string, unknown> = { id: msg.provider_message_id, remoteJid: conv.remote_jid, fromMe: msg.direction === 'outbound' }
  if (msg.participant_jid) key.participant = msg.participant_jid
  const res = await evolutionFetch(`/chat/getBase64FromMediaMessage/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({ message: { key }, convertToMp4: false }),
  })
  if (!res.ok || !res.body) {
    console.warn('getBase64 falhou', res.status, await res.text().catch(() => ''))
    return json({ ok: false, error: 'O WhatsApp não liberou este arquivo (pode ter expirado). Peça para reenviarem.' })
  }
  return new Response(res.body, { status: 200, headers: { 'Content-Type': 'application/json' } })
}

// Confere se um numero tem WhatsApp e devolve o JID canonico (evita conversa duplicada pelo 9o digito).
async function resolveNumber(payload: Payload) {
  if (!payload.instance_id || !payload.phone) return { ok: false, error: 'missing_fields' }
  const db = createServiceClient()
  const { data: inst } = await db.from('crm_instances').select('instance_name').eq('id', payload.instance_id).maybeSingle()
  const instanceName = (inst as any)?.instance_name as string | undefined
  if (!instanceName) return { ok: false, error: 'instance_not_found' }
  const digits = onlyDigits(payload.phone)
  if (digits.length < 8) return { ok: false, error: 'numero_invalido' }
  try {
    const res = await evolutionFetch(`/chat/whatsappNumbers/${instanceName}`, { method: 'POST', body: JSON.stringify({ numbers: [digits] }) })
    if (!res.ok) return { ok: false, error: `evolution_${res.status}` }
    const data = await res.json().catch(() => null)
    const arr: any[] = Array.isArray(data) ? data : (data?.numbers ?? [])
    const first = arr[0]
    if (!first) return { ok: true, exists: false, jid: null }
    const exists = first.exists !== false
    const num = onlyDigits(String(first.jid ?? first.number ?? digits))
    const jid = String(first.jid ?? '').includes('@') ? String(first.jid) : (exists ? `${num}@s.whatsapp.net` : null)
    return { ok: true, exists, jid, number: num }
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) }
  }
}

// Reagir a uma mensagem (do cliente ou nossa). emoji vazio = tirar a reacao.
async function reactToMessage(payload: Payload) {
  if (!payload.message_id) return { reacted: false, error: 'missing_message_id' }
  const emoji = (payload.emoji ?? '').trim()
  const db = createServiceClient()
  const { data: msg } = await db
    .from('crm_messages')
    .select('id, direction, provider_message_id, participant_jid, deleted_at, conversation_id, crm_conversations(remote_jid, crm_instances(instance_name))')
    .eq('id', payload.message_id)
    .maybeSingle()
  if (!msg) return { reacted: false, error: 'message_not_found' }
  if (msg.deleted_at) return { reacted: false, error: 'Não é possível reagir a uma mensagem apagada.' }
  if (!msg.provider_message_id) return { reacted: false, error: 'Esta mensagem não tem identificador do WhatsApp para receber reação.' }
  const conv = (msg as any).crm_conversations
  const instanceName = conv?.crm_instances?.instance_name as string | undefined
  if (!instanceName) return { reacted: false, error: 'instance_not_found' }

  const key: { remoteJid: string; fromMe: boolean; id: string; participant?: string } = {
    remoteJid: conv.remote_jid,
    fromMe: msg.direction === 'outbound',
    id: msg.provider_message_id,
  }
  if (msg.direction !== 'outbound' && msg.participant_jid) key.participant = msg.participant_jid

  const res = await sendReactionMessage(instanceName, key, emoji)
  if (!res.ok) return { reacted: false, error: res.error }

  if (emoji) {
    await db.from('crm_message_reactions').upsert({
      conversation_id: msg.conversation_id,
      target_provider_id: msg.provider_message_id,
      reactor: 'me',
      from_me: true,
      emoji,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'conversation_id,target_provider_id,reactor' })
  } else {
    await db.from('crm_message_reactions').delete()
      .eq('conversation_id', msg.conversation_id).eq('target_provider_id', msg.provider_message_id).eq('reactor', 'me')
  }
  return { reacted: true }
}

// "Digitando…" do atendente aparece para o contato no WhatsApp. A Evolution segura a resposta
// pelo tempo do aviso (delay) e depois manda "paused"; por isso roda por trás e a resposta é imediata.
// O CRM repete o aviso a cada ~4 s enquanto a pessoa digita.
async function sendPresence(payload: Payload) {
  const presence = payload.presence ?? 'composing'
  if (!payload.conversation_id || !['composing', 'recording', 'paused'].includes(presence)) return { ok: false, error: 'missing_fields' }
  const db = createServiceClient()
  const { data: conv } = await db
    .from('crm_conversations')
    .select('remote_jid, instance_id, crm_instances(instance_name)')
    .eq('id', payload.conversation_id)
    .maybeSingle()
  const instanceName = (conv as any)?.crm_instances?.instance_name as string | undefined
  if (!conv || !instanceName) return { ok: false, error: 'conversation_not_found' }
  const task = evolutionFetch(`/chat/sendPresence/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({ number: targetNumber(conv.remote_jid), presence, delay: presence === 'paused' ? 0 : 6000 }),
  }).then(async (r) => { if (!r.ok) console.warn('sendPresence falhou', r.status, (await r.text().catch(() => '')).slice(0, 200)) })
  const er = (globalThis as Record<string, unknown>).EdgeRuntime as { waitUntil?: (p: Promise<unknown>) => void } | undefined
  if (er?.waitUntil) er.waitUntil(task.catch((e) => console.error('sendPresence erro', e)))
  else await task.catch(() => {})
  return { ok: true }
}

// Conversa aberta no CRM (como o WhatsApp Web aberto): o número fica "online" e passa a receber o
// "digitando…" do contato — o WhatsApp só entrega esse aviso para quem está online e acompanhando
// a conversa. online=false (aba escondida/fechada) volta para "offline".
async function watchConversation(payload: Payload) {
  if (!payload.conversation_id) return { ok: false, error: 'missing_fields' }
  const db = createServiceClient()
  const { data: conv } = await db
    .from('crm_conversations')
    .select('remote_jid, instance_id, crm_instances(instance_name)')
    .eq('id', payload.conversation_id)
    .maybeSingle()
  const instanceName = (conv as any)?.crm_instances?.instance_name as string | undefined
  if (!conv || !instanceName) return { ok: false, error: 'conversation_not_found' }
  const instanceId = (conv as any).instance_id as string
  const viewer = payload.viewer || 'anon'
  const task = (async () => {
    let online = !!payload.online
    if (online) {
      await db.from('crm_watch').upsert({ instance_id: instanceId, viewer, seen_at: new Date().toISOString() }, { onConflict: 'instance_id,viewer' })
    } else {
      await db.from('crm_watch').delete().eq('instance_id', instanceId).eq('viewer', viewer)
      // outra aba/atendente ainda acompanha este número (batimento nos últimos 60 s): continua online
      const since = new Date(Date.now() - 60_000).toISOString()
      const { count } = await db.from('crm_watch').select('viewer', { count: 'exact', head: true }).eq('instance_id', instanceId).gt('seen_at', since)
      if ((count ?? 0) > 0) return
    }
    const r = await evolutionFetch(`/instance/setPresence/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({ presence: online ? 'available' : 'unavailable' }),
    })
    if (!r.ok) console.warn('setPresence falhou', r.status, (await r.text().catch(() => '')).slice(0, 200))
    // acompanhar o contato (presenceSubscribe): a Evolution faz isso ao mandar um aviso de presença;
    // "paused" não aparece para o contato
    if (online && !conv.remote_jid.endsWith('@g.us')) {
      const s = await evolutionFetch(`/chat/sendPresence/${instanceName}`, {
        method: 'POST',
        body: JSON.stringify({ number: targetNumber(conv.remote_jid), presence: 'paused', delay: 0 }),
      })
      if (!s.ok) console.warn('subscribe (sendPresence) falhou', s.status, (await s.text().catch(() => '')).slice(0, 200))
    }
  })()
  const er = (globalThis as Record<string, unknown>).EdgeRuntime as { waitUntil?: (p: Promise<unknown>) => void } | undefined
  if (er?.waitUntil) er.waitUntil(task.catch((e) => console.error('watch erro', e)))
  else await task.catch(() => {})
  return { ok: true }
}

// Liga o evento PRESENCE_UPDATE (contato digitando) no webhook de cada número do CRM, mantendo
// o resto da configuração. apply=false só mostra como está (sem os cabeçalhos, que têm segredo).
async function webhookPresence(apply: boolean, wanted: string[] = ['PRESENCE_UPDATE']) {
  const db = createServiceClient()
  const { data: insts } = await db.from('crm_instances').select('instance_name').eq('is_active', true)
  const out: unknown[] = []
  for (const i of insts ?? []) {
    const name = i.instance_name as string
    try {
      const r = await evolutionFetch(`/webhook/find/${name}`)
      const cur = (await r.json().catch(() => null)) as any
      const w = cur?.webhook ?? cur ?? {}
      const events: string[] = Array.isArray(w.events) ? w.events : []
      const info = { instance: name, status: r.status, enabled: w.enabled, url: w.url, byEvents: w.webhookByEvents, events }
      const missing = wanted.filter((e) => !events.includes(e))
      if (!apply || !missing.length) { out.push({ ...info, changed: false }); continue }
      const url = w.url || `${env.supabaseUrl}/functions/v1/whatsapp-webhook`
      const set = await evolutionFetch(`/webhook/set/${name}`, {
        method: 'POST',
        body: JSON.stringify({
          webhook: {
            enabled: w.enabled ?? true,
            url,
            webhookByEvents: w.webhookByEvents ?? false,
            webhookBase64: w.webhookBase64 ?? false,
            events: [...events, ...missing],
            headers: w.headers && Object.keys(w.headers).length ? w.headers
              : (env.evolutionWebhookSecret ? { 'x-evolution-webhook-secret': env.evolutionWebhookSecret } : undefined),
          },
        }),
      })
      out.push({ ...info, changed: set.ok, setStatus: set.status, setBody: set.ok ? undefined : (await set.text().catch(() => '')).slice(0, 200) })
    } catch (e) {
      out.push({ instance: name, error: String((e as Error)?.message ?? e) })
    }
  }
  return { ok: true, instances: out }
}

// Edições/apagamentos feitos no WhatsApp que o CRM não registrou (antes do webhook tratar esse
// aviso): procura no histórico da Evolution desta conversa e aplica. Devolve quantos acertou.
async function syncEdits(payload: Payload) {
  if (!payload.conversation_id) return { ok: false, error: 'missing_fields' }
  const db = createServiceClient()
  const { data: conv } = await db
    .from('crm_conversations')
    .select('id, remote_jid, instance_id, crm_instances(instance_name)')
    .eq('id', payload.conversation_id)
    .maybeSingle()
  const instanceName = (conv as any)?.crm_instances?.instance_name as string | undefined
  if (!conv || !instanceName) return { ok: false, error: 'conversation_not_found' }
  const { data: lids } = await db.from('crm_lid_map').select('lid').eq('instance_id', conv.instance_id).eq('jid', conv.remote_jid)
  const jids = [conv.remote_jid, ...((lids ?? []).map((l) => l.lid as string))]
  let applied = 0
  const types: Record<string, number> = {}
  for (const jid of jids) {
    const r = await evolutionFetch(`/chat/findMessages/${instanceName}`, { method: 'POST', body: JSON.stringify({ where: { key: { remoteJid: jid } }, limit: 200 }) })
    if (!r.ok) continue
    const d = await r.json().catch(() => null)
    const records: any[] = d?.messages?.records ?? (Array.isArray(d) ? d : [])
    for (const rec of records) {
      types[rec?.messageType ?? '?'] = (types[rec?.messageType ?? '?'] ?? 0) + 1
      const m = rec?.message ?? {}
      const pm = m.protocolMessage ?? m.editedMessage?.message?.protocolMessage ?? null
      if (!pm?.key?.id) {
        // a Evolution também pode guardar a edição na própria mensagem: texto recebido diferente do nosso
        const txt = m.conversation ?? m.extendedTextMessage?.text ?? null
        if (txt && rec?.key?.id && rec.key.fromMe === false) {
          const { data: upd } = await db.from('crm_messages').update({ body: txt, edited_at: new Date().toISOString() })
            .eq('conversation_id', conv.id).eq('provider_message_id', String(rec.key.id)).eq('direction', 'inbound')
            .eq('message_type', 'text').is('deleted_at', null).neq('body', txt).select('id')
          applied += upd?.length ?? 0
        }
        continue
      }
      const t = pm.type
      if (t === 14 || t === 'MESSAGE_EDIT') {
        const em = pm.editedMessage ?? {}
        const text = em.conversation ?? em.extendedTextMessage?.text ?? em.imageMessage?.caption ?? em.videoMessage?.caption ?? null
        if (!text) continue
        const ts = rec.messageTimestamp ? new Date(Number(rec.messageTimestamp) * 1000).toISOString() : new Date().toISOString()
        const { data: upd } = await db.from('crm_messages').update({ body: text, edited_at: ts })
          .eq('conversation_id', conv.id).eq('provider_message_id', String(pm.key.id)).neq('body', text).select('id')
        applied += upd?.length ?? 0
      } else if (t === 0 || t === 'REVOKE') {
        const { data: upd } = await db.from('crm_messages').update({ deleted_at: new Date().toISOString() })
          .eq('conversation_id', conv.id).eq('provider_message_id', String(pm.key.id)).is('deleted_at', null).select('id')
        applied += upd?.length ?? 0
      }
    }
  }
  return { ok: true, applied, types }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
