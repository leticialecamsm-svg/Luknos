// whatsapp-webhook — ponto de entrada das mensagens do número dedicado do robô.
//
// Auth: webhook assinado (x-evolution-webhook-secret ou ?secret=) + confere o
//       `instance` contra wa_bot_config.evolution_instance_name.
// Fluxo:
//   1. valida assinatura e evento (messages.upsert)
//   2. extrai phone_e164 do remoteJid e valida contra wa_collaborators ativos
//      (fora da whitelist -> ignora silenciosamente)
//   3. dedupe por provider_message_id (índice único parcial em wa_messages)
//   4. cria/recupera a wa_conversations ativa do colaborador
//   5. grava a mensagem em wa_messages (direction = inbound)
//   6. [background] baixa documento/imagem para o bucket wa-attachments +
//      wa_attachments com detected_kind; toca last_message_at; delega ao
//      bot-conversation-engine
//   Sempre responde 200 rápido para não gerar reentrega da Evolution.

import { handleOptions, json } from '../_shared/cors.ts'
import { verifyWebhookSecret, getMediaBase64 } from '../_shared/evolution.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { samePhone } from '../_shared/phone.ts'
import { invokeFunction, runBackground } from '../_shared/internal.ts'
import type { SupabaseClient } from '@supabase/supabase-js'

Deno.serve(async (req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  if (!verifyWebhookSecret(req)) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }

  let payload: EvolutionWebhook
  try {
    payload = await req.json()
  } catch {
    return json({ ok: true, handled: false, skipped: 'invalid_json' })
  }

  try {
    const result = await handle(payload)
    return json({ ok: true, ...result })
  } catch (err) {
    // Erro interno: loga e ainda responde 200 (Evolution não deve reentregar).
    console.error('whatsapp-webhook erro:', err)
    return json({ ok: true, handled: false, error: String((err as Error)?.message ?? err) })
  }
})

// ───────────────────────────────────────────────────────────────────────────

interface EvolutionWebhook {
  event?: string
  instance?: string
  data?: {
    key?: { remoteJid?: string; id?: string; fromMe?: boolean }
    message?: Record<string, unknown>
    messageType?: string
    pushName?: string
  }
}

async function handle(payload: EvolutionWebhook) {
  const event = payload.event ?? ''
  if (event && !/messages[._]upsert/i.test(event)) {
    return { handled: false, skipped: 'event', event }
  }

  const db = createServiceClient()

  const { data: config } = await db
    .from('wa_bot_config')
    .select('evolution_instance_name')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const instance = payload.instance ?? ''
  if (config?.evolution_instance_name && instance && instance !== config.evolution_instance_name) {
    return { handled: false, skipped: 'instance_mismatch', instance }
  }

  const data = payload.data ?? {}
  const key = data.key ?? {}
  if (key.fromMe) return { handled: false, skipped: 'from_me' }

  const remoteJid = key.remoteJid ?? ''
  if (!remoteJid.endsWith('@s.whatsapp.net')) {
    // grupos (@g.us), broadcast, @lid — fora do escopo do robô
    return { handled: false, skipped: 'not_individual', remoteJid }
  }

  const senderDigits = remoteJid.split('@')[0]
  const providerMessageId = key.id ?? null

  // ── whitelist ────────────────────────────────────────────────────────────
  const { data: collaborators } = await db
    .from('wa_collaborators')
    .select('id, phone_e164, display_name, system_user_id, is_active')
    .eq('is_active', true)

  const collaborator = (collaborators ?? []).find((c) => samePhone(c.phone_e164, senderDigits))
  if (!collaborator) {
    // Remetente fora da whitelist é ignorado silenciosamente (não cria conversa).
    return { handled: false, skipped: 'not_whitelisted' }
  }

  // ── dedupe ───────────────────────────────────────────────────────────────
  if (providerMessageId) {
    const { data: dup } = await db
      .from('wa_messages')
      .select('id')
      .eq('provider_message_id', providerMessageId)
      .maybeSingle()
    if (dup) return { handled: true, deduped: true, provider_message_id: providerMessageId }
  }

  // ── conversa ativa ───────────────────────────────────────────────────────
  let conversation = (
    await db
      .from('wa_conversations')
      .select('id, status')
      .eq('collaborator_id', collaborator.id)
      .in('status', ['collecting', 'awaiting_confirmation'])
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ).data

  if (!conversation) {
    const { data: created, error } = await db
      .from('wa_conversations')
      .insert({ collaborator_id: collaborator.id, remote_jid: remoteJid, status: 'collecting' })
      .select('id, status')
      .single()
    if (error) throw error
    conversation = created
  }

  // ── mensagem ─────────────────────────────────────────────────────────────
  const rawType = data.messageType ?? inferMessageType(data.message)
  const messageType = mapMessageType(rawType)
  const body = extractBody(data.message)

  const { data: msg, error: msgErr } = await db
    .from('wa_messages')
    .insert({
      conversation_id: conversation.id,
      direction: 'inbound',
      message_type: messageType,
      body,
      provider_message_id: providerMessageId,
    })
    .select('id')
    .single()

  if (msgErr) {
    if (msgErr.code === '23505') return { handled: true, deduped: true }
    throw msgErr
  }

  // ── restante em background (responde rápido) ─────────────────────────────
  const conversationId = conversation.id
  await runBackground(
    (async () => {
      if (messageType === 'document' || messageType === 'image') {
        try {
          await saveAttachment(db, conversationId, instance, data)
        } catch (e) {
          console.error('falha ao salvar anexo', e)
        }
      }
      await db
        .from('wa_conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId)

      const engine = await invokeFunction('bot-conversation-engine', {
        conversation_id: conversationId,
        last_inbound_message_id: msg.id,
      })
      if (!engine.ok) console.warn('engine respondeu', engine.status, engine.body)
    })(),
  )

  return { handled: true, conversation_id: conversationId, message_id: msg.id }
}

// ── anexos ─────────────────────────────────────────────────────────────────

async function saveAttachment(
  db: SupabaseClient,
  conversationId: string,
  instance: string,
  data: NonNullable<EvolutionWebhook['data']>,
) {
  const media = await getMediaBase64(instance, data.key)
  if (!media?.base64) {
    console.warn('sem base64 de mídia para conversa', conversationId)
    return null
  }

  const bytes = base64ToBytes(media.base64)
  const msg = (data.message ?? {}) as Record<string, unknown>

  // Fallbacks caso getBase64FromMediaMessage não traga fileName/mimetype.
  const docWithCaption = msg.documentWithCaptionMessage as
    | { message?: { documentMessage?: { fileName?: string; mimetype?: string } } }
    | undefined
  const docNode =
    (msg.documentMessage as { fileName?: string; mimetype?: string } | undefined) ??
    docWithCaption?.message?.documentMessage
  const imgNode = msg.imageMessage as { mimetype?: string } | undefined

  const fileName =
    media.fileName ??
    docNode?.fileName ??
    `arquivo-${Date.now()}${extForMime(media.mimetype)}`
  const mimeType = media.mimetype ?? docNode?.mimetype ?? imgNode?.mimetype ?? null

  const detectedKind = detectKind(fileName, mimeType)
  const safeName = fileName.replace(/[^\w.\- ]+/g, '_').trim().slice(-120) || `arquivo-${Date.now()}`
  const path = `${conversationId}/${Date.now()}-${safeName}`

  const { error: upErr } = await db.storage.from('wa-attachments').upload(path, bytes, {
    contentType: mimeType ?? 'application/octet-stream',
    upsert: false,
  })
  if (upErr) throw upErr

  const { data: att, error } = await db
    .from('wa_attachments')
    .insert({
      conversation_id: conversationId,
      storage_path: path,
      file_name: fileName,
      mime_type: mimeType,
      detected_kind: detectedKind,
      size_bytes: bytes.byteLength,
    })
    .select('id')
    .single()
  if (error) throw error
  return att.id
}

function detectKind(fileName: string, mime: string | null): string {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase()
  const m = (mime ?? '').toLowerCase()
  if (ext === 'pdf' || m === 'application/pdf') return 'plant_pdf'
  if (ext === 'dwg' || m.includes('dwg') || m.includes('acad')) return 'dwg'
  if (['skp', 'skb'].includes(ext) || m.includes('sketchup')) return 'sketchup'
  if (
    ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'heic'].includes(ext) ||
    m.startsWith('image/')
  ) {
    return 'image_3d'
  }
  return 'other'
}

function extForMime(mime?: string): string {
  if (!mime) return ''
  if (mime === 'application/pdf') return '.pdf'
  if (mime.startsWith('image/')) return '.' + mime.split('/')[1]
  return ''
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(',') ? b64.split(',')[1] : b64
  const bin = atob(clean)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// ── parsing de mensagem ────────────────────────────────────────────────────

function inferMessageType(message?: Record<string, unknown>): string {
  if (!message) return 'unknown'
  if (message.conversation || message.extendedTextMessage) return 'conversation'
  if (message.imageMessage) return 'imageMessage'
  if (message.documentMessage || message.documentWithCaptionMessage) return 'documentMessage'
  if (message.audioMessage) return 'audioMessage'
  return 'unknown'
}

function mapMessageType(t: string): 'text' | 'document' | 'image' | 'audio' | 'other' {
  switch (t) {
    case 'conversation':
    case 'extendedTextMessage':
      return 'text'
    case 'documentMessage':
    case 'documentWithCaptionMessage':
      return 'document'
    case 'imageMessage':
      return 'image'
    case 'audioMessage':
    case 'pttMessage':
      return 'audio'
    default:
      return 'other'
  }
}

function extractBody(message?: Record<string, unknown>): string | null {
  if (!message) return null
  if (typeof message.conversation === 'string') return message.conversation
  const ext = message.extendedTextMessage as { text?: string } | undefined
  if (ext?.text) return ext.text
  const img = message.imageMessage as { caption?: string } | undefined
  if (img?.caption) return img.caption
  const doc = message.documentMessage as { caption?: string } | undefined
  if (doc?.caption) return doc.caption
  const docCap = message.documentWithCaptionMessage as
    | { message?: { documentMessage?: { caption?: string } } }
    | undefined
  if (docCap?.message?.documentMessage?.caption) return docCap.message.documentMessage.caption
  return null
}
