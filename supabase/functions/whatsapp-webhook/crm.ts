import { fetchContact, getMediaBase64, getProfilePicture, evolutionFetch } from './_shared/evolution.ts'
import { samePhone } from './_shared/phone.ts'
import {
  base64ToBytes,
  extractBody,
  extractMediaFileName,
  extractMediaMimeType,
  inferMessageType,
  mapMessageType,
} from './_shared/wa-parse.ts'
import type { SupabaseClient } from '@supabase/supabase-js'

interface EvolutionWebhook {
  event?: string
  instance?: string
  data?: {
    key?: { remoteJid?: string; id?: string; fromMe?: boolean; participant?: string }
    message?: Record<string, unknown>
    messageType?: string
    pushName?: string
    profilePicUrl?: string
    contextInfo?: ContextInfo
  }
}

interface ContextInfo {
  stanzaId?: string
  participant?: string
  quotedMessage?: Record<string, unknown>
  isForwarded?: boolean
  forwardingScore?: number
}

interface CrmInstanceRow {
  id: string
  instance_name: string
  default_user_id: string | null
}

// Video e figurinha so existem no CRM (o robo de orcamentos trata como 'other').
// Figurinha vira 'image' (webp) para aparecer como miniatura.
function crmMessageType(rawType: string): string {
  if (rawType === 'videoMessage') return 'video'
  if (rawType === 'stickerMessage') return 'image'
  return mapMessageType(rawType)
}

// Tipos que nao sao mensagem de verdade (apagar/editar, chaves de criptografia, cabecalho de
// album, atualizacoes cifradas de enquete/evento): nao entram no historico.
// Reacao tem tratamento proprio (handleReaction).
const IGNORED_TYPES = new Set([
  'protocolMessage',
  'senderKeyDistributionMessage',
  'messageContextInfo',
  'editedMessage',
  'albumMessage',
  'secretEncryptedMessage',
])

// Telefone de um cartao de contato (vCard): TEL;waid=5582... ou TEL:+55 82 ...
function vcardPhone(vcard?: string): string | null {
  const v = vcard ?? ''
  const m = v.match(/waid=(\d+)/) ?? v.match(/TEL[^:]*:([+\d\s().-]+)/)
  const digits = m ? m[1].replace(/\D/g, '') : ''
  return digits ? `+${digits}` : null
}

// Texto curto para os tipos que o CRM ainda nao mostra por inteiro (contato, localizacao,
// enquete, produto...). No fim, se for desconhecido, guarda o nome do tipo para diagnostico.
// Contato: 1a linha "👤 Contato" (ou "Contatos") e uma linha "Nome · +55..." por pessoa.
// deno-lint-ignore no-explicit-any
function describeOther(message: Record<string, any> | undefined, rawType: string): string {
  const m = message ?? {}
  if (m.contactMessage) {
    const phone = vcardPhone(m.contactMessage.vcard)
    return `👤 Contato\n${m.contactMessage.displayName ?? 'Sem nome'}${phone ? ` · ${phone}` : ''}`
  }
  if (m.contactsArrayMessage) {
    const lines = (m.contactsArrayMessage.contacts ?? []).map((c: { displayName?: string; vcard?: string }) => {
      const phone = vcardPhone(c.vcard)
      return `${c.displayName ?? 'Sem nome'}${phone ? ` · ${phone}` : ''}`
    })
    return `👤 Contatos\n${lines.join('\n')}`
  }
  const loc = m.locationMessage ?? m.liveLocationMessage
  if (loc) {
    const link = loc.degreesLatitude != null ? ` https://maps.google.com/?q=${loc.degreesLatitude},${loc.degreesLongitude}` : ''
    return `📍 Localização${loc.name ? `: ${loc.name}` : ''}${link}`
  }
  const poll = m.pollCreationMessage ?? m.pollCreationMessageV2 ?? m.pollCreationMessageV3
  if (poll) return `📊 Enquete: ${poll.name ?? ''}`.trim()
  if (m.pollUpdateMessage) return '📊 Voto em enquete'
  if (m.productMessage) return `🛍️ Produto: ${m.productMessage.product?.title ?? 'do catálogo'}`
  if (m.orderMessage) return '🧾 Pedido'
  if (m.listMessage) return `📋 Lista: ${m.listMessage.title ?? ''}`.trim()
  if (m.listResponseMessage) return `📋 ${m.listResponseMessage.title ?? 'Resposta de lista'}`
  if (m.buttonsMessage || m.templateMessage || m.interactiveMessage) return '🔘 Mensagem com botões'
  if (m.buttonsResponseMessage) return `🔘 ${m.buttonsResponseMessage.selectedDisplayText ?? 'Resposta de botão'}`
  if (m.viewOnceMessage || m.viewOnceMessageV2 || m.viewOnceMessageV2Extension) return '👁️ Mensagem de visualização única'
  if (m.ptvMessage) return '🎥 Vídeo curto'
  if (m.call || m.scheduledCallCreationMessage) return '📞 Chamada'
  return `Mensagem não suportada (${rawType || 'tipo desconhecido'})`
}

// Evita estourar a memoria da funcao com videos enormes (base64 ~ 4/3 do tamanho).
const MAX_VIDEO_BASE64_CHARS = 30_000_000

function normName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Contexto de resposta (a mensagem citada), venha onde vier no payload.
function findContext(data: NonNullable<EvolutionWebhook['data']>): ContextInfo | undefined {
  if (data.contextInfo?.stanzaId) return data.contextInfo
  const msg = data.message ?? {}
  for (const node of Object.values(msg)) {
    const ci = (node as { contextInfo?: ContextInfo } | null)?.contextInfo
    if (ci?.stanzaId) return ci
  }
  return undefined
}

// Mensagem encaminhada: o WhatsApp marca isForwarded/forwardingScore no contextInfo
// (no topo do payload ou dentro do nó da mensagem).
function isForwardedMessage(data: NonNullable<EvolutionWebhook['data']>): boolean {
  const ci = data.contextInfo
  if (ci?.isForwarded || (ci?.forwardingScore ?? 0) > 0) return true
  const msg = data.message ?? {}
  for (const node of Object.values(msg)) {
    const c = (node as { contextInfo?: ContextInfo } | null)?.contextInfo
    if (c?.isForwarded || (c?.forwardingScore ?? 0) > 0) return true
  }
  return false
}

function quotedPreview(q?: Record<string, unknown>): string | null {
  if (!q) return null
  if (typeof q.conversation === 'string') return q.conversation.slice(0, 300)
  const ext = q.extendedTextMessage as { text?: string } | undefined
  if (ext?.text) return ext.text.slice(0, 300)
  const img = q.imageMessage as { caption?: string } | undefined
  if (img) return img.caption ? `📷 ${img.caption}`.slice(0, 300) : '📷 Foto'
  if (q.videoMessage) return '🎥 Vídeo'
  if (q.audioMessage) return '🎤 Áudio'
  const doc = q.documentMessage as { fileName?: string } | undefined
  if (doc) return `📄 ${doc.fileName ?? 'Documento'}`
  return null
}

// Nome do grupo (subject). Falha silenciosa: fica "Grupo".
async function fetchGroupSubject(instanceName: string, groupJid: string): Promise<string | null> {
  try {
    const r = await evolutionFetch(`/group/findGroupInfos/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`)
    if (!r.ok) return null
    const d = await r.json().catch(() => null)
    const subject = d?.subject ?? d?.[0]?.subject ?? null
    return typeof subject === 'string' && subject.trim() ? subject.trim() : null
  } catch { return null }
}

// Reacao a uma mensagem (de quem for, inclusive a nossa feita pelo celular).
// emoji vazio = a pessoa tirou a reacao. So vale para conversas que ja existem no CRM.
async function handleReaction(
  db: SupabaseClient,
  crmInstance: CrmInstanceRow,
  remoteJid: string,
  data: NonNullable<EvolutionWebhook['data']>,
) {
  const r = (data.message?.reactionMessage ?? {}) as { key?: { id?: string }; text?: string }
  const targetId = r.key?.id
  if (!targetId) return { handled: false, skipped: 'reaction_without_target' }

  const { data: conv } = await db
    .from('crm_conversations')
    .select('id')
    .eq('instance_id', crmInstance.id)
    .eq('remote_jid', remoteJid)
    .maybeSingle()
  if (!conv) return { handled: false, skipped: 'reaction_no_conversation' }

  const fromMe = !!data.key?.fromMe
  const reactor = fromMe ? 'me' : (data.key?.participant ?? remoteJid)
  const emoji = (r.text ?? '').trim()

  if (!emoji) {
    await db.from('crm_message_reactions').delete()
      .eq('conversation_id', conv.id).eq('target_provider_id', targetId).eq('reactor', reactor)
    return { handled: true, reaction: 'removed' }
  }
  await db.from('crm_message_reactions').upsert({
    conversation_id: conv.id,
    target_provider_id: targetId,
    reactor,
    from_me: fromMe,
    emoji,
    reactor_name: fromMe ? null : (data.pushName ?? null),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'conversation_id,target_provider_id,reactor' })
  return { handled: true, reaction: 'saved' }
}

export async function handleCrmMessage(
  db: SupabaseClient,
  crmInstance: CrmInstanceRow,
  payload: EvolutionWebhook,
) {
  const data = payload.data ?? {}
  const key = data.key ?? {}
  const remoteJid = key.remoteJid ?? ''
  const isGroup = remoteJid.endsWith('@g.us')
  if (!remoteJid.endsWith('@s.whatsapp.net') && !isGroup) {
    return { handled: false, skipped: 'not_individual', remoteJid }
  }

  const rawType = data.messageType ?? (data.message?.videoMessage ? 'videoMessage' : inferMessageType(data.message))
  if (rawType === 'reactionMessage') return await handleReaction(db, crmInstance, remoteJid, data)
  if (IGNORED_TYPES.has(rawType)) return { handled: false, skipped: 'ignored_type', rawType }

  // Grupos: so viram conversa os que foram ativados em CRM > Grupos > Escolher grupos.
  // Os demais so entram no cadastro (desativados) para aparecerem na lista de escolha.
  if (isGroup) {
    const { data: g } = await db
      .from('crm_groups')
      .select('id, enabled, name')
      .eq('instance_id', crmInstance.id)
      .eq('jid', remoteJid)
      .maybeSingle()
    if (!g) {
      const subject = await fetchGroupSubject(crmInstance.instance_name, remoteJid)
      await db.from('crm_groups').upsert(
        { instance_id: crmInstance.id, jid: remoteJid, name: subject, enabled: false, last_seen_at: new Date().toISOString() },
        { onConflict: 'instance_id,jid', ignoreDuplicates: true },
      )
      return { handled: false, skipped: 'group_not_enabled' }
    }
    if (!g.enabled) {
      const upd: Record<string, unknown> = { last_seen_at: new Date().toISOString() }
      if (!g.name) {
        const subject = await fetchGroupSubject(crmInstance.instance_name, remoteJid)
        if (subject) upd.name = subject
      }
      await db.from('crm_groups').update(upd).eq('id', g.id)
      return { handled: false, skipped: 'group_not_enabled' }
    }
    await db.from('crm_groups').update({ last_seen_at: new Date().toISOString() }).eq('id', g.id)
  }

  const providerMessageId = key.id ?? null
  const fromMe = !!key.fromMe

  let conversation = (
    await db
      .from('crm_conversations')
      .select('id, contact_id, assigned_user_id, status, contact_name_cache, contact_photo_url, contact_link_source, name_locked')
      .eq('instance_id', crmInstance.id)
      .eq('remote_jid', remoteJid)
      .maybeSingle()
  ).data

  // Vinculo automatico com o cadastro de contatos: primeiro pelo telefone, depois pelo
  // nome completo (so se for unico). O usuario pode trocar/desfazer na tela do contato.
  async function matchContact(): Promise<{ id: string; name: string; source: 'phone' | 'name' } | null> {
    if (isGroup) return null
    const senderDigits = remoteJid.split('@')[0]
    const { data: all } = await db.from('contacts').select('id, name, phone')
    const rows = (all ?? []) as { id: string; name: string; phone: string | null }[]
    const byPhone = rows.find((c) => c.phone && samePhone(c.phone, senderDigits))
    if (byPhone) return { id: byPhone.id, name: byPhone.name, source: 'phone' }
    const pn = data.pushName ? normName(data.pushName) : ''
    if (pn.split(' ').length >= 2) {
      const hits = rows.filter((c) => normName(c.name) === pn)
      if (hits.length === 1) return { id: hits[0].id, name: hits[0].name, source: 'name' }
    }
    return null
  }

  if (!conversation) {
    const contact = await matchContact()
    const groupName = isGroup ? await fetchGroupSubject(crmInstance.instance_name, remoteJid) : null

    // Mensagem NOSSA (fromMe): o pushName do payload e o do nosso proprio perfil, nao o do
    // contato. Nesse caso busca o nome do contato na Evolution e, se nao achar, deixa sem nome
    // (aparece o telefone) ate ele responder.
    let personName: string | null = null
    if (!isGroup) {
      if (contact) personName = contact.name
      else if (!fromMe) personName = data.pushName ?? null
      else {
        const c = await fetchContact(crmInstance.instance_name, remoteJid).catch(() => null)
        const n = (c?.name ?? c?.pushName ?? '').trim()
        personName = n || null
      }
    }

    const { data: created, error } = await db
      .from('crm_conversations')
      .insert({
        instance_id: crmInstance.id,
        remote_jid: remoteJid,
        contact_id: contact?.id ?? null,
        contact_link_source: contact?.source ?? null,
        contact_name_cache: isGroup ? (groupName ?? 'Grupo') : personName,
        contact_photo_url: (!isGroup && !fromMe && data.profilePicUrl) ? data.profilePicUrl : null,
        assigned_user_id: crmInstance.default_user_id,
        status: 'open',
      })
      .select('id, contact_id, assigned_user_id, status, contact_name_cache, contact_photo_url, contact_link_source, name_locked')
      .single()
    if (error) throw error
    conversation = created
  } else {
    const convUpdates: Record<string, unknown> = {}
    if (conversation.status === 'closed') convUpdates.status = 'open'
    if (!isGroup && !fromMe && !conversation.name_locked && data.pushName && !conversation.contact_id && data.pushName !== conversation.contact_name_cache) {
      convUpdates.contact_name_cache = data.pushName
    }
    // Captura foto do payload se ainda não tiver
    if (!isGroup && !fromMe && data.profilePicUrl && !conversation.contact_photo_url) {
      convUpdates.contact_photo_url = data.profilePicUrl
    }
    // Ainda sem decisao sobre o contato (nunca vinculado nem desvinculado a mao): tenta vincular.
    if (!isGroup && !fromMe && !conversation.contact_id && !conversation.contact_link_source) {
      const contact = await matchContact()
      if (contact) {
        convUpdates.contact_id = contact.id
        convUpdates.contact_link_source = contact.source
        convUpdates.contact_name_cache = null
      }
    }
    if (Object.keys(convUpdates).length > 0) {
      await db.from('crm_conversations').update(convUpdates).eq('id', conversation.id)
    }
  }

  await db
    .from('crm_conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversation.id)

  const messageType = crmMessageType(rawType)
  const videoCaption = (data.message?.videoMessage as { caption?: string } | undefined)?.caption ?? null
  let body = extractBody(data.message) ?? videoCaption
  if (messageType === 'other' && !body) body = describeOther(data.message, rawType)

  const ctx = findContext(data)

  const { data: msg, error: msgErr } = await db
    .from('crm_messages')
    .insert({
      conversation_id: conversation.id,
      direction: fromMe ? 'outbound' : 'inbound',
      sender_user_id: fromMe ? crmInstance.default_user_id : null,
      message_type: messageType,
      body,
      provider_message_id: providerMessageId,
      reply_to_provider_id: ctx?.stanzaId ?? null,
      reply_to_preview: ctx ? quotedPreview(ctx.quotedMessage) : null,
      participant_jid: isGroup ? (key.participant ?? null) : null,
      participant_name: isGroup && !fromMe ? (data.pushName ?? null) : null,
      is_forwarded: isForwardedMessage(data),
    })
    .select('id')
    .single()

  if (msgErr) {
    if (msgErr.code === '23505') return { handled: true, deduped: true }
    throw msgErr
  }

  if (messageType === 'document' || messageType === 'image' || messageType === 'audio' || messageType === 'video') {
    try {
      // Figurinha e pequena: ja guarda. O resto (foto, audio, video, documento) so e baixado
      // quando alguem pede no CRM — aqui fica so nome, tipo, tamanho e miniatura.
      if (rawType === 'stickerMessage') await saveCrmAttachment(db, conversation.id, msg.id, crmInstance.instance_name, data)
      else await saveMediaInfo(db, msg.id, data.message)
    } catch (e) {
      console.error('falha ao salvar anexo CRM', e)
    }
  }

  // Background: tenta buscar foto via API se ainda não tiver (não bloqueia a resposta)
  if (!isGroup && !fromMe && !conversation.contact_photo_url && !data.profilePicUrl) {
    syncContactPhoto(db, conversation.id, crmInstance.instance_name, remoteJid).catch(() => {})
  }

  return { handled: true, conversation_id: conversation.id, message_id: msg.id }
}

async function saveCrmAttachment(
  db: SupabaseClient,
  conversationId: string,
  messageId: string,
  instanceName: string,
  data: NonNullable<EvolutionWebhook['data']>,
) {
  const media = await getMediaBase64(instanceName, data.key)
  if (!media?.base64) return
  if (media.base64.length > MAX_VIDEO_BASE64_CHARS) {
    console.warn('midia grande demais para guardar no CRM', conversationId, media.base64.length)
    return
  }

  const bytes = base64ToBytes(media.base64)
  let fileName = extractMediaFileName(data.message, media)
  const mimeType = extractMediaMimeType(data.message, media)
  if (mimeType?.startsWith('video/') && !/\.[a-z0-9]{2,4}$/i.test(fileName)) fileName += '.mp4'
  const safeName = fileName.replace(/[^\w.\- ]+/g, '_').trim().slice(-120) || `arquivo-${Date.now()}`
  const path = `${conversationId}/${Date.now()}-${safeName}`

  const { error: upErr } = await db.storage.from('crm-attachments').upload(path, bytes, {
    contentType: mimeType ?? 'application/octet-stream',
    upsert: false,
  })
  if (upErr) throw upErr

  await db
    .from('crm_messages')
    .update({ storage_path: path, file_name: fileName, mime_type: mimeType })
    .eq('id', messageId)
}

// Dados da midia sem baixar o arquivo: nome, tipo, tamanho, duracao e a miniatura que o
// proprio WhatsApp manda junto (fotos e videos).
// deno-lint-ignore no-explicit-any
function mediaNode(message: Record<string, any> | undefined): Record<string, any> | null {
  const m = message ?? {}
  return m.imageMessage ?? m.videoMessage ?? m.audioMessage ?? m.documentMessage ?? m.documentWithCaptionMessage?.message?.documentMessage ?? null
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v)
  // deno-lint-ignore no-explicit-any
  const o = v as any
  if (o && typeof o.low === 'number') return (o.high ?? 0) * 2 ** 32 + (o.low >>> 0)
  return null
}

function thumbDataUri(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 20 && v.length < 60_000) return `data:image/jpeg;base64,${v}`
  // deno-lint-ignore no-explicit-any
  const o = v as any
  const arr: number[] | null = Array.isArray(o?.data) ? o.data : (o && typeof o === 'object' && '0' in o ? Object.values(o) as number[] : null)
  if (!arr || !arr.length || arr.length > 45_000) return null
  let bin = ''
  for (const b of arr) bin += String.fromCharCode(b)
  return `data:image/jpeg;base64,${btoa(bin)}`
}

async function saveMediaInfo(db: SupabaseClient, messageId: string, message: Record<string, unknown> | undefined) {
  const node = mediaNode(message)
  if (!node) return
  const mime = typeof node.mimetype === 'string' ? node.mimetype : null
  let fileName = extractMediaFileName(message, null)
  if (!node.fileName) {
    const ext = mime?.includes('ogg') ? '.ogg' : mime?.includes('mp4') ? '.mp4' : mime?.includes('mpeg') ? '.mp3' : mime?.startsWith('image/') ? `.${mime.split('/')[1]}` : ''
    fileName = (node === (message as any)?.audioMessage ? 'audio' : node === (message as any)?.videoMessage ? 'video' : 'foto') + ext
  }
  await db.from('crm_messages').update({
    file_name: fileName,
    mime_type: mime,
    media_size: toNumber(node.fileLength),
    media_seconds: toNumber(node.seconds),
    thumb: thumbDataUri(node.jpegThumbnail),
  }).eq('id', messageId)
}

async function syncContactPhoto(
  db: SupabaseClient,
  conversationId: string,
  instanceName: string,
  remoteJid: string,
) {
  const photoUrl = await getProfilePicture(instanceName, remoteJid)
  if (photoUrl) {
    await db.from('crm_conversations').update({ contact_photo_url: photoUrl }).eq('id', conversationId)
  }
}
