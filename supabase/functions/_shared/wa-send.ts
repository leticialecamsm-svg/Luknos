import { createServiceClient } from './supabase.ts'
import { evolutionFetch } from './evolution.ts'
import { onlyDigits } from './phone.ts'

// Envio de mensagem de saída do robô via Evolution API + registro em wa_messages
// como outbound. Fonte única usada tanto pela Edge Function send-whatsapp-message
// quanto pelo bot-conversation-engine (evita um hop HTTP por resposta do bot).

export interface SendResult {
  sent: boolean
  providerMessageId?: string
  error?: string
}

export async function sendWhatsappMessage(opts: {
  conversationId?: string | null
  toPhoneE164: string
  text: string
  instanceName?: string | null
}): Promise<SendResult> {
  const db = createServiceClient()

  let instance = opts.instanceName ?? null
  if (!instance) {
    const { data: cfg } = await db
      .from('wa_bot_config')
      .select('evolution_instance_name')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    instance = cfg?.evolution_instance_name ?? null
  }
  if (!instance) return { sent: false, error: 'no_instance' }

  const number = onlyDigits(opts.toPhoneE164)
  let providerMessageId: string | undefined

  try {
    const res = await evolutionFetch(`/message/sendText/${instance}`, {
      method: 'POST',
      body: JSON.stringify({ number, text: opts.text }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('sendText falhou', res.status, body)
      return { sent: false, error: `evolution_${res.status}` }
    }
    const parsed = (await res.json().catch(() => null)) as
      | { key?: { id?: string }; messageId?: string }
      | null
    providerMessageId = parsed?.key?.id ?? parsed?.messageId ?? undefined
  } catch (e) {
    console.error('sendText erro', e)
    return { sent: false, error: String((e as Error)?.message ?? e) }
  }

  if (opts.conversationId) {
    const { error } = await db.from('wa_messages').insert({
      conversation_id: opts.conversationId,
      direction: 'outbound',
      message_type: 'text',
      body: opts.text,
      provider_message_id: providerMessageId ?? null,
    })
    if (error) console.error('falha ao registrar outbound em wa_messages', error)
  }

  return { sent: true, providerMessageId }
}
