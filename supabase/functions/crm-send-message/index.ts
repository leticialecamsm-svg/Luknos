// crm-send-message — envia uma mensagem de saída do CRM multiatendente
// (vendedor respondendo um cliente pelo sistema).
//
// Auth: interna (service role) — chamada pelo server action do painel
// (src/lib/crm-actions.ts), nunca direto do browser (teria que expor a
// Evolution API key).
//
// Assinatura: NÃO fica salva no banco — é montada aqui, na hora do envio
// (`*Nome:*\ntexto`), lendo o nome do atendente (sender_user_id) em public.users.
// Assim, se amanhã outra pessoa responder na mesma conversa, a assinatura já
// sai certa sozinha, sem precisar editar nada.
//
// A linha em crm_messages só é gravada DEPOIS do envio dar certo, usando o
// provider_message_id que a Evolution devolve — é esse id que deduplica
// quando o webhook recebe o eco (fromMe=true) da própria mensagem.

import { handleOptions, json } from '../_shared/cors.ts'
import { isInternalCall } from '../_shared/internal.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { sendMediaMessage, sendTextMessage } from '../_shared/evolution.ts'
import { onlyDigits } from '../_shared/phone.ts'

Deno.serve(async (req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ sent: false, error: 'method_not_allowed' }, 405)
  if (!isInternalCall(req)) return json({ sent: false, error: 'unauthorized' }, 401)

  let payload: {
    conversation_id?: string
    sender_user_id?: string
    text?: string
    storage_path?: string
    file_name?: string
    mime_type?: string
    is_voice_note?: boolean
  }
  try {
    payload = await req.json()
  } catch {
    return json({ sent: false, error: 'invalid_json' }, 400)
  }

  const { conversation_id, sender_user_id } = payload
  if (!conversation_id || !sender_user_id) {
    return json({ sent: false, error: 'missing_fields' }, 400)
  }
  if (!payload.text?.trim() && !payload.storage_path) {
    return json({ sent: false, error: 'empty_message' }, 400)
  }

  try {
    return json(await send(payload as Required<Pick<typeof payload, 'conversation_id' | 'sender_user_id'>> & typeof payload))
  } catch (err) {
    console.error('crm-send-message erro:', err)
    return json({ sent: false, error: String((err as Error)?.message ?? err) }, 500)
  }
})

async function send(payload: {
  conversation_id: string
  sender_user_id: string
  text?: string
  storage_path?: string
  file_name?: string
  mime_type?: string
  is_voice_note?: boolean
}) {
  const db = createServiceClient()

  const { data: conv } = await db
    .from('crm_conversations')
    .select('id, remote_jid, instance_id, crm_instances(instance_name)')
    .eq('id', payload.conversation_id)
    .maybeSingle()
  if (!conv) return { sent: false, error: 'conversation_not_found' }

  const instanceName = (conv as any).crm_instances?.instance_name as string | undefined
  if (!instanceName) return { sent: false, error: 'instance_not_found' }

  const { data: sender } = await db.from('users').select('name').eq('id', payload.sender_user_id).maybeSingle()
  const senderName = sender?.name ?? 'Equipe Luknos'

  const number = onlyDigits(conv.remote_jid.split('@')[0])
  const text = payload.text?.trim() || null

  let result: { sent: boolean; providerMessageId?: string; error?: string }
  let messageType: string

  if (payload.storage_path) {
    const { data: blob, error } = await db.storage.from('crm-attachments').download(payload.storage_path)
    if (error || !blob) return { sent: false, error: error?.message ?? 'arquivo não encontrado' }
    const base64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()))
    const mimeType = payload.mime_type || 'application/octet-stream'
    messageType = mimeType.startsWith('image/')
      ? 'image'
      : mimeType.startsWith('audio/')
        ? 'audio'
        : mimeType.startsWith('video/')
          ? 'video'
          : 'document'
    // voice note gravado na hora: sem assinatura em texto (ela já fica no
    // cabeçalho da mensagem pra quem olha o painel; no WhatsApp, a voz é a
    // própria assinatura) e pede o visual de PTT.
    const caption = payload.is_voice_note ? undefined : (text ? `*${senderName}:*\n${text}` : `*${senderName}:*`)
    result = await sendMediaMessage(instanceName, number, {
      mediatype: messageType as 'image' | 'document' | 'audio' | 'video',
      base64,
      fileName: payload.file_name || 'arquivo',
      mimetype: mimeType,
      caption,
      ptt: !!payload.is_voice_note,
    })
  } else {
    messageType = 'text'
    result = await sendTextMessage(instanceName, number, `*${senderName}:*\n${text}`)
  }

  if (!result.sent) return { sent: false, error: result.error }

  const { data: msg, error: insErr } = await db
    .from('crm_messages')
    .insert({
      conversation_id: payload.conversation_id,
      direction: 'outbound',
      sender_user_id: payload.sender_user_id,
      message_type: messageType,
      body: text,
      storage_path: payload.storage_path ?? null,
      file_name: payload.file_name ?? null,
      mime_type: payload.mime_type ?? null,
      provider_message_id: result.providerMessageId ?? null,
    })
    .select('id')
    .single()
  if (insErr) console.error('falha ao registrar outbound em crm_messages', insErr)

  return { sent: true, provider_message_id: result.providerMessageId ?? null, message_id: msg?.id ?? null }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
