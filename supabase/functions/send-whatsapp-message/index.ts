// send-whatsapp-message — envia mensagens de saída do robô via Evolution API.
// Auth: interna (service role) — chamada pelo bot-conversation-engine e pelo
// notification-worker.
// Input:  { conversation_id?: string|null, to_phone_e164: string, text: string }
// Output: { sent: boolean, provider_message_id: string|null, error?: string }

import { handleOptions, json } from '../_shared/cors.ts'
import { isInternalCall } from '../_shared/internal.ts'
import { sendWhatsappMessage } from '../_shared/wa-send.ts'

Deno.serve(async (req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ sent: false, error: 'method_not_allowed' }, 405)
  if (!isInternalCall(req)) return json({ sent: false, error: 'unauthorized' }, 401)

  let payload: { conversation_id?: string | null; to_phone_e164?: string; text?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ sent: false, error: 'invalid_json' }, 400)
  }

  const { conversation_id, to_phone_e164, text } = payload ?? {}
  if (!to_phone_e164 || !text) return json({ sent: false, error: 'missing_fields' }, 400)

  const r = await sendWhatsappMessage({
    conversationId: conversation_id ?? null,
    toPhoneE164: to_phone_e164,
    text,
  })

  return json(
    { sent: r.sent, provider_message_id: r.providerMessageId ?? null, error: r.error },
    r.sent ? 200 : 502,
  )
})
