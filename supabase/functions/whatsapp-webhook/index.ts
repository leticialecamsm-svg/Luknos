import { handleOptions, json } from './_shared/cors.ts'
import { verifyWebhookSecret, getMediaBase64, evolutionFetch } from './_shared/evolution.ts'
import { createServiceClient } from './_shared/supabase.ts'
import { samePhone, phoneVariants } from './_shared/phone.ts'
import { invokeFunction, runBackground } from './_shared/internal.ts'
import {
  base64ToBytes,
  detectKind,
  extractBody,
  extractMediaFileName,
  extractMediaMimeType,
  extForMime,
  inferMessageType,
  mapMessageType,
} from './_shared/wa-parse.ts'
import { handleCrmMessage, findProtocol, handleProtocol } from './crm.ts'
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
    console.error('whatsapp-webhook erro:', err)
    return json({ ok: true, handled: false, error: String((err as Error)?.message ?? err) })
  }
})

interface EvolutionWebhook {
  event?: string
  instance?: string
  data?: {
    key?: { remoteJid?: string; id?: string; fromMe?: boolean }
    message?: Record<string, unknown>
    messageType?: string
    pushName?: string
    profilePicUrl?: string
  }
}

async function handle(payload: EvolutionWebhook) {
  const event = payload.event ?? ''
  if (/presence[._]update/i.test(event)) return await handlePresence(payload)
  if (/messages[._](update|edited)/i.test(event)) return await handleMessageUpdate(payload)
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
  const isRobotInstance = !!config?.evolution_instance_name && instance === config.evolution_instance_name

  if (!isRobotInstance) {
    const { data: crmInstance } = await db
      .from('crm_instances')
      .select('id, instance_name, default_user_id')
      .eq('instance_name', instance)
      .eq('is_active', true)
      .maybeSingle()
    if (!crmInstance) return { handled: false, skipped: 'unknown_instance', instance }
    return await handleCrmMessage(db, crmInstance, payload)
  }

  const data = payload.data ?? {}
  const key = data.key ?? {}
  if (key.fromMe) return { handled: false, skipped: 'from_me' }

  const remoteJid = key.remoteJid ?? ''
  if (!remoteJid.endsWith('@s.whatsapp.net')) {
    return { handled: false, skipped: 'not_individual', remoteJid }
  }

  const senderDigits = remoteJid.split('@')[0]
  const providerMessageId = key.id ?? null

  const { data: collaborators } = await db
    .from('wa_collaborators')
    .select('id, phone_e164, display_name, system_user_id, is_active')
    .eq('is_active', true)

  const collaborator = (collaborators ?? []).find((c) => samePhone(c.phone_e164, senderDigits))
  if (!collaborator) {
    return { handled: false, skipped: 'not_whitelisted' }
  }

  if (providerMessageId) {
    const { data: dup } = await db
      .from('wa_messages')
      .select('id')
      .eq('provider_message_id', providerMessageId)
      .maybeSingle()
    if (dup) return { handled: true, deduped: true, provider_message_id: providerMessageId }
  }

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

async function saveAttachment(
  db: SupabaseClient,
  conversationId: string,
  instance: string,
  data: NonNullable<EvolutionWebhook['data']>,
) {
  const media = await getMediaBase64(instance, data.key)
  if (!media?.base64) return null

  const bytes = base64ToBytes(media.base64)
  const fileName = extractMediaFileName(data.message, media)
  const mimeType = extractMediaMimeType(data.message, media)

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

// "Digitando…" do contato (evento PRESENCE_UPDATE): grava o estado em crm_presence, que o CRM
// escuta em tempo real. data = { id: <jid da conversa>, presences: { <jid de quem>: { lastKnownPresence } } }.
// Em grupo, cada participante vira uma linha (actor = jid dele); em conversa individual, actor = 'contact'.
async function handlePresence(payload: EvolutionWebhook) {
  const d = (payload as unknown as { data?: { id?: string; presences?: Record<string, { lastKnownPresence?: string }> } }).data
  const chatJid = String(d?.id ?? '')
  const presences = d?.presences
  if (!chatJid || !presences || typeof presences !== 'object') return { handled: false, skipped: 'presence_empty' }
  const db = createServiceClient()
  const { data: inst } = await db.from('crm_instances').select('id').eq('instance_name', payload.instance ?? '').eq('is_active', true).maybeSingle()
  if (!inst) return { handled: false, skipped: 'unknown_instance' }
  // conversa individual chega com o id anônimo (…@lid): traduz para o número que o CRM usa
  const jid = chatJid.endsWith('@lid') ? await lidToJid(db, inst.id, payload.instance ?? '', chatJid) : chatJid
  if (!jid) return { handled: false, skipped: 'presence_lid_unknown' }
  let { data: conv } = await db.from('crm_conversations').select('id').eq('instance_id', inst.id).eq('remote_jid', jid).maybeSingle()
  if (!conv && jid.endsWith('@s.whatsapp.net')) {
    // mesmo número com/sem o 9 extra
    const variants = phoneVariants(jid.split('@')[0]).map((v) => `${v}@s.whatsapp.net`)
    conv = (await db.from('crm_conversations').select('id').eq('instance_id', inst.id).in('remote_jid', variants).limit(1).maybeSingle()).data
  }
  if (!conv) return { handled: false, skipped: 'presence_no_conversation' }
  const isGroup = chatJid.endsWith('@g.us')
  const now = new Date().toISOString()
  const rows = []
  for (const [jid, v] of Object.entries(presences)) {
    const p = v?.lastKnownPresence
    const state = p === 'composing' ? 'composing' : p === 'recording' ? 'recording' : 'paused'
    let actorName: string | null = null
    if (isGroup && state !== 'paused') {
      const { data: last } = await db.from('crm_messages').select('participant_name')
        .eq('conversation_id', conv.id).eq('participant_jid', jid).not('participant_name', 'is', null)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      actorName = (last?.participant_name as string | undefined) ?? null
    }
    rows.push({ conversation_id: conv.id, actor: isGroup ? jid : 'contact', actor_name: actorName, state, updated_at: now })
  }
  if (rows.length) {
    const { error } = await db.from('crm_presence').upsert(rows, { onConflict: 'conversation_id,actor' })
    if (error) return { handled: false, error: error.message }
  }
  return { handled: true, presence: rows.map((r) => r.state) }
}

// …@lid -> …@s.whatsapp.net. Primeiro no cache (crm_lid_map); senão pergunta à Evolution, que
// guarda o número em remoteJidAlt nas mensagens dessa conversa, e grava no cache.
async function lidToJid(db: SupabaseClient, instanceId: string, instanceName: string, lid: string): Promise<string | null> {
  const { data: hit } = await db.from('crm_lid_map').select('jid').eq('instance_id', instanceId).eq('lid', lid).maybeSingle()
  if (hit?.jid) return hit.jid as string
  try {
    const r = await evolutionFetch(`/chat/findMessages/${instanceName}`, { method: 'POST', body: JSON.stringify({ where: { key: { remoteJid: lid } }, limit: 5 }) })
    if (!r.ok) return null
    const d = await r.json().catch(() => null)
    const records: Array<{ key?: { remoteJidAlt?: string } }> = d?.messages?.records ?? (Array.isArray(d) ? d : [])
    const alt = records.map((m) => m?.key?.remoteJidAlt).find((j) => typeof j === 'string' && j.endsWith('@s.whatsapp.net'))
    if (!alt) return null
    await db.from('crm_lid_map').upsert({ instance_id: instanceId, lid, jid: alt, updated_at: new Date().toISOString() }, { onConflict: 'instance_id,lid' })
    return alt
  } catch { return null }
}

// Edição/apagamento feitos no WhatsApp chegam como atualização de mensagem (não como mensagem
// nova). Procura o aviso (protocolMessage/editedMessage) em qualquer ponto do payload.
// Status de entrega/leitura também chegam aqui: saem logo, sem consultar o banco.
// deno-lint-ignore no-explicit-any
function deepFind(o: any, depth = 0): Record<string, unknown> | null {
  if (!o || typeof o !== 'object' || depth > 6) return null
  if (o.protocolMessage || o.editedMessage) return o
  for (const v of Object.values(o)) {
    const hit = deepFind(v, depth + 1)
    if (hit) return hit
  }
  return null
}

async function handleMessageUpdate(payload: EvolutionWebhook) {
  // deno-lint-ignore no-explicit-any
  const d = (payload as any).data
  const holder = deepFind(d)
  if (!holder) return { handled: false, skipped: 'update_without_edit' }
  const proto = findProtocol(holder)
  console.log('messages.update com edição', payload.instance, JSON.stringify(d).slice(0, 600)) // TEMP: confirmar formato
  if (!proto) return { handled: false, skipped: 'update_unparsed' }
  const db = createServiceClient()
  const { data: inst } = await db.from('crm_instances').select('id, instance_name, default_user_id').eq('instance_name', payload.instance ?? '').eq('is_active', true).maybeSingle()
  if (!inst) return { handled: false, skipped: 'unknown_instance' }
  let jid = String(d?.key?.remoteJid ?? d?.remoteJid ?? '')
  if (jid.endsWith('@lid')) jid = (await lidToJid(db, inst.id, inst.instance_name, jid)) ?? jid
  return await handleProtocol(db, inst, jid, proto)
}
