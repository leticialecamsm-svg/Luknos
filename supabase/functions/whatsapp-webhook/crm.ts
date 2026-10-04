// CRM multiatendente — tratamento das mensagens recebidas (e ecoadas) numa
// instância que NÃO é o robô de orçamentos (ver crm_instances). Separado do
// fluxo do robô (que é uma máquina de estados de cadastro) porque aqui é
// chat livre: só grava a mensagem na conversa certa, sem engine nenhuma.
//
// fromMe: ao contrário do robô (que ignora), aqui TRATAMOS mensagens
// fromMe=true — podem ser (a) o eco de algo que o próprio sistema mandou via
// crm-send-message (que grava a própria linha logo após o envio, usando o id
// que a Evolution devolve; o eco cai no dedupe por provider_message_id) ou
// (b) o vendedor respondendo direto do celular dele,
// por fora do sistema — nesse caso vale registrar mesmo assim, pra a
// conversa no painel não ficar incompleta. Sem como saber o nome de quem
// mandou nesse caso (b): fica sender_user_id = default_user_id da instância.

import { getMediaBase64 } from '../_shared/evolution.ts'
import { samePhone } from '../_shared/phone.ts'
import {
  base64ToBytes,
  extractBody,
  extractMediaFileName,
  extractMediaMimeType,
  inferMessageType,
  mapMessageType,
} from '../_shared/wa-parse.ts'
import type { SupabaseClient } from '@supabase/supabase-js'

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

interface CrmInstanceRow {
  id: string
  instance_name: string
  default_user_id: string | null
}

export async function handleCrmMessage(
  db: SupabaseClient,
  crmInstance: CrmInstanceRow,
  payload: EvolutionWebhook,
) {
  const data = payload.data ?? {}
  const key = data.key ?? {}
  const remoteJid = key.remoteJid ?? ''
  if (!remoteJid.endsWith('@s.whatsapp.net')) {
    // grupos/broadcast fora do escopo por ora.
    return { handled: false, skipped: 'not_individual', remoteJid }
  }

  const providerMessageId = key.id ?? null
  const fromMe = !!key.fromMe

  // ── conversa (1 por instância+remote_jid, reaberta se já existir) ───────
  let conversation = (
    await db
      .from('crm_conversations')
      .select('id, contact_id, assigned_user_id, status')
      .eq('instance_id', crmInstance.id)
      .eq('remote_jid', remoteJid)
      .maybeSingle()
  ).data

  if (!conversation) {
    const senderDigits = remoteJid.split('@')[0]
    const { data: contactMatch } = await db
      .from('contacts')
      .select('id, name, phone')
      .not('phone', 'is', null)
    const contact = (contactMatch ?? []).find((c: any) => samePhone(c.phone, senderDigits))

    const { data: created, error } = await db
      .from('crm_conversations')
      .insert({
        instance_id: crmInstance.id,
        remote_jid: remoteJid,
        contact_id: contact?.id ?? null,
        contact_name_cache: contact?.name ?? data.pushName ?? null,
        assigned_user_id: crmInstance.default_user_id,
        status: 'open',
      })
      .select('id, contact_id, assigned_user_id, status')
      .single()
    if (error) throw error
    conversation = created
  } else if (conversation.status === 'closed') {
    await db.from('crm_conversations').update({ status: 'open' }).eq('id', conversation.id)
  }

  // ── mensagem ─────────────────────────────────────────────────────────────
  const rawType = data.messageType ?? inferMessageType(data.message)
  const messageType = mapMessageType(rawType)
  const body = extractBody(data.message)

  const { data: msg, error: msgErr } = await db
    .from('crm_messages')
    .insert({
      conversation_id: conversation.id,
      direction: fromMe ? 'outbound' : 'inbound',
      // fromMe aqui é sempre "mandado direto do celular" (o envio pelo
      // sistema já grava a própria linha antes de chamar a Evolution) —
      // melhor aproximação disponível é o dono padrão da instância.
      sender_user_id: fromMe ? crmInstance.default_user_id : null,
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

  if (messageType === 'document' || messageType === 'image' || messageType === 'audio') {
    try {
      await saveCrmAttachment(db, conversation.id, msg.id, crmInstance.instance_name, data)
    } catch (e) {
      console.error('falha ao salvar anexo do CRM', e)
    }
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
  if (!media?.base64) {
    console.warn('sem base64 de mídia para conversa CRM', conversationId)
    return
  }

  const bytes = base64ToBytes(media.base64)
  const fileName = extractMediaFileName(data.message, media)
  const mimeType = extractMediaMimeType(data.message, media)
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
