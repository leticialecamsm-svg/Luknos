import type { SupabaseClient } from '@supabase/supabase-js'
import { invokeFunction, runBackground } from './internal.ts'
import { sendWhatsappMessage } from './wa-send.ts'

// Pós-processamento comum de uma gravação de orçamento bem-sucedida.
// Usado por submit-quote (1ª tentativa) e retry-failed-submissions (recuperação).

// Vendedor responsável -> telefone: procura no whitelist um colaborador mapeado
// ao mesmo system_user_id; senão usa o fallback (quem cadastrou).
export async function resolveSellerPhone(
  db: SupabaseClient,
  sellerId: string | null,
  fallbackPhone: string,
): Promise<string | null> {
  if (sellerId) {
    const { data } = await db
      .from('wa_collaborators')
      .select('phone_e164')
      .eq('system_user_id', sellerId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (data?.phone_e164) return data.phone_e164
  }
  return fallbackPhone || null
}

export interface QuoteResponseBody {
  id: string
  number?: number
  system_quote_id?: string
}

export async function finalizeQuoteSubmission(
  db: SupabaseClient,
  opts: {
    conversationId: string
    remoteJid: string
    collaboratorPhone: string | null
    sellerId: string | null
    responseBody: QuoteResponseBody
  },
): Promise<{ system_quote_id: string; notification_enqueued: boolean }> {
  const rb = opts.responseBody
  const systemQuoteId = rb.system_quote_id ?? rb.id
  const displayId = rb.number ? `#${rb.number}` : systemQuoteId
  const toPhone = String(opts.remoteJid ?? '').split('@')[0]

  await db
    .from('wa_conversations')
    .update({ status: 'submitted', system_quote_id: systemQuoteId })
    .eq('id', opts.conversationId)

  await db
    .from('wa_attachments')
    .update({ system_quote_id: systemQuoteId })
    .eq('conversation_id', opts.conversationId)
    .is('system_quote_id', null)

  // notificação (idempotente: uma por conversa)
  let notificationEnqueued = false
  const targetPhone = await resolveSellerPhone(
    db,
    opts.sellerId,
    opts.collaboratorPhone ?? toPhone,
  )
  if (targetPhone) {
    const { data: existing } = await db
      .from('wa_notifications')
      .select('id')
      .eq('conversation_id', opts.conversationId)
      .limit(1)
      .maybeSingle()
    if (existing) {
      notificationEnqueued = true
    } else {
      const { error } = await db.from('wa_notifications').insert({
        conversation_id: opts.conversationId,
        target_phone_e164: targetPhone,
        system_quote_id: systemQuoteId,
        status: 'pending',
      })
      notificationEnqueued = !error
      if (error) console.error('wa_notifications insert falhou', error)
    }
    if (notificationEnqueued) {
      await runBackground(invokeFunction('notification-worker', {}))
    }
  }

  await sendWhatsappMessage({
    conversationId: opts.conversationId,
    toPhoneE164: toPhone,
    text: `✅ Orçamento *${displayId}* cadastrado no sistema! O vendedor responsável já foi avisado.`,
  })

  return { system_quote_id: systemQuoteId, notification_enqueued: notificationEnqueued }
}
