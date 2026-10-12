import { handleOptions, json } from './_shared/cors.ts'
import { isInternalCall } from './_shared/internal.ts'
import { createServiceClient } from './_shared/supabase.ts'
import { sendTextMessage, sendMediaMessage, sendVoiceNote, deleteMessageForEveryone, editTextMessage, sendReactionMessage, sendContactMessage, sendStickerMessage, fetchGroupParticipants, type Quoted } from './_shared/evolution.ts'
import { onlyDigits } from './_shared/phone.ts'

interface ContactToSend {
  name: string
  phone: string
  company?: string | null
  email?: string | null
}

interface Payload {
  action?: 'send' | 'delete' | 'edit' | 'react' | 'send_contact' | 'send_sticker' | 'group_participants'
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
    if (payload.action === 'react') return json(await reactToMessage(payload))
    if (payload.action === 'send_contact') return json(await sendContact(payload))
    if (payload.action === 'send_sticker') return json(await sendSticker(payload))
    if (payload.action === 'group_participants') return json(await groupParticipants(payload))

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
  const signature = conv.hide_signature ? '' : `*${senderName}:*`

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
  if (!conv.hide_signature && msg.sender_user_id) {
    const { data: sender } = await db.from('users').select('name').eq('id', msg.sender_user_id).maybeSingle()
    full = `*${sender?.name ?? 'Equipe Luknos'}:*\n${text}`
  }
  const res = await editTextMessage(instanceName, targetNumber(conv.remote_jid), { id: msg.provider_message_id, remoteJid: conv.remote_jid }, full)
  if (!res.ok) return { edited: false, error: res.error }

  await db.from('crm_messages').update({ body: text, edited_at: new Date().toISOString() }).eq('id', payload.message_id)
  return { edited: true }
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
