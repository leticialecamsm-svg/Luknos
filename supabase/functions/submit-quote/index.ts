// submit-quote — grava o orçamento no Luknos via POST /api/external/quotes.
//
// Auth: interna (service role) — chamada pelo bot-conversation-engine após "sim".
// Fluxo:
//   1. guard: conversa em awaiting_confirmation e sem system_quote_id (idempotência)
//   2. monta o payload a partir de collected_data (defaults finais aplicados)
//   3. POST /api/external/quotes com API key (via _shared/system-api.ts, que lê
//      base + chave de wa_bot_config / Vault)
//   4. grava wa_submission_log (request, response, success, attempt_number)
//   5. sucesso -> wa_conversations.status='submitted' + system_quote_id;
//      propaga system_quote_id p/ wa_attachments; enfileira wa_notifications;
//      confirma ao colaborador via WhatsApp
//   6. erro HTTP -> wa_conversations.status='failed', success=false (retry depois)
//
// NUNCA escreve direto no banco de negócio — só o endpoint /api/external/* faz isso.

import { handleOptions, json } from '../_shared/cors.ts'
import { isInternalCall } from '../_shared/internal.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { systemApi } from '../_shared/system-api.ts'
import { finalizeQuoteSubmission } from '../_shared/quote-finalize.ts'

const SKIP = '__skip__'

function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}
function real<T>(v: T): T | null {
  return v === undefined || v === null || v === '' || v === (SKIP as unknown) ? null : v
}

Deno.serve(async (req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ success: false, error: 'method_not_allowed' }, 405)
  if (!isInternalCall(req)) return json({ success: false, error: 'unauthorized' }, 401)

  let payload: { conversation_id?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ success: false, error: 'invalid_json' }, 400)
  }
  if (!payload.conversation_id) return json({ success: false, error: 'missing_conversation_id' }, 400)

  try {
    return json(await submit(payload.conversation_id))
  } catch (err) {
    console.error('submit-quote erro:', err)
    return json({ success: false, error: String((err as Error)?.message ?? err) }, 500)
  }
})

// ───────────────────────────────────────────────────────────────────────────

async function submit(conversationId: string) {
  const db = createServiceClient()

  const { data: conv } = await db
    .from('wa_conversations')
    .select('*')
    .eq('id', conversationId)
    .single()
  if (!conv) return { success: false, error: 'conversation_not_found' }

  // idempotência
  if (conv.system_quote_id) {
    return { success: true, system_quote_id: conv.system_quote_id, already_submitted: true }
  }
  if (conv.status !== 'awaiting_confirmation') {
    return { success: false, error: 'not_awaiting_confirmation', status: conv.status }
  }

  const { data: collab } = await db
    .from('wa_collaborators')
    .select('*')
    .eq('id', conv.collaborator_id)
    .single()

  const data = (conv.collected_data ?? {}) as Record<string, any>

  const client = data.client ?? {}
  const clientInput = client.system_contact_id
    ? { system_contact_id: client.system_contact_id }
    : { name: client.name ?? null, phone: client.phone ?? null, create: true }

  const partnerRaw = data.partner && data.partner !== SKIP ? data.partner : null
  const partnerInput = partnerRaw
    ? partnerRaw.system_contact_id
      ? { system_contact_id: partnerRaw.system_contact_id }
      : { name: partnerRaw.name ?? null, create: true }
    : null

  const sellerId =
    data.seller && data.seller !== SKIP && data.seller.system_user_id
      ? data.seller.system_user_id
      : (collab?.system_user_id ?? null)

  const requestPayload = {
    conversation_id: conversationId,
    client: clientInput,
    partner: partnerInput,
    origin: data.origin ?? 'WhatsApp',
    category: data.category ?? null,
    priority: data.priority ?? 'Média',
    size: real(data.size),
    work_stage: real(data.stage),
    deadline: real(data.deadline),
    quote_date: real(data.quote_date) ?? todayISO(),
    quoted_value: typeof data.quote_value === 'number' ? data.quote_value : null,
    notes: real(data.notes),
    drive_link: real(data.drive_link),
    primary_owner_id: sellerId,
    collaborator_ids: [],
  }

  // attempt_number
  const { count } = await db
    .from('wa_submission_log')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
  const attemptNumber = (count ?? 0) + 1

  // ── POST /api/external/quotes ────────────────────────────────────────
  let status = 0
  let responseBody: unknown = null
  let success = false
  let errorMessage: string | null = null

  try {
    const res = await systemApi.createQuote(requestPayload)
    status = res.status
    responseBody = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }))
    success = res.ok && !!(responseBody as { id?: string })?.id
    if (!success) errorMessage = `http_${status}`
  } catch (e) {
    errorMessage = String((e as Error)?.message ?? e)
  }

  await db.from('wa_submission_log').insert({
    conversation_id: conversationId,
    request_payload: requestPayload,
    response_status: status || null,
    response_body: responseBody,
    success,
    error_message: errorMessage,
    attempt_number: attemptNumber,
  })

  if (!success) {
    await db.from('wa_conversations').update({ status: 'failed' }).eq('id', conversationId)
    return { success: false, error: errorMessage ?? 'submit_failed', status, attempt_number: attemptNumber }
  }

  const rb = responseBody as { id: string; number?: number; system_quote_id?: string }
  const fin = await finalizeQuoteSubmission(db, {
    conversationId,
    remoteJid: conv.remote_jid,
    collaboratorPhone: collab?.phone_e164 ?? null,
    sellerId,
    responseBody: rb,
  })

  return {
    success: true,
    system_quote_id: fin.system_quote_id,
    number: rb.number ?? null,
    notification_enqueued: fin.notification_enqueued,
    attempt_number: attemptNumber,
  }
}
