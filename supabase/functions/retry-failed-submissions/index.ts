// retry-failed-submissions — reprocessa gravações de orçamento que falharam.
//
// Auth: interna (service role) — cron a cada 15 min (Fase 3).
// Seleciona conversas em status 'failed' sem system_quote_id; pega o último
// wa_submission_log e reenvia o request_payload original; grava novo registro
// no log com attempt_number+1. Teto de 5 tentativas — depois fica em 'failed'
// para intervenção manual no painel. Em recuperação, roda o mesmo
// pós-processamento do submit-quote (finalizeQuoteSubmission).

import { handleOptions, json } from '../_shared/cors.ts'
import { isInternalCall } from '../_shared/internal.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { systemApi } from '../_shared/system-api.ts'
import { finalizeQuoteSubmission } from '../_shared/quote-finalize.ts'

const MAX_ATTEMPTS = 5
const BATCH = 20
const WINDOW_HOURS = 48

Deno.serve(async (req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!isInternalCall(req)) return json({ error: 'unauthorized' }, 401)

  let body: { conversation_id?: string } = {}
  try {
    body = (await req.json().catch(() => ({}))) ?? {}
  } catch {
    body = {}
  }

  try {
    return json(await run(body.conversation_id))
  } catch (err) {
    console.error('retry-failed-submissions erro:', err)
    return json({ error: String((err as Error)?.message ?? err) }, 500)
  }
})

// conversationId presente -> retry manual de uma conversa (pelo painel);
// ausente -> varredura do cron.
async function run(conversationId?: string) {
  const db = createServiceClient()

  const since = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString()
  let q = db
    .from('wa_conversations')
    .select('id, remote_jid, collaborator_id')
    .eq('status', 'failed')
    .is('system_quote_id', null)
    .limit(BATCH)
  q = conversationId ? q.eq('id', conversationId) : q.gte('updated_at', since)
  const { data: convs, error } = await q
  if (error) throw error

  let retried = 0
  let recovered = 0
  let stillFailing = 0

  for (const conv of convs ?? []) {
    const { data: logs } = await db
      .from('wa_submission_log')
      .select('request_payload, attempt_number')
      .eq('conversation_id', conv.id)
      .order('attempt_number', { ascending: false })
      .limit(1)
    const last = logs?.[0]
    if (!last) {
      stillFailing++
      continue
    }
    // o cron respeita o teto; retry manual (conversationId presente) força.
    if (!conversationId && last.attempt_number >= MAX_ATTEMPTS) {
      stillFailing++
      continue
    }

    retried++
    const payload = last.request_payload as Record<string, unknown>
    const attemptNumber = last.attempt_number + 1

    let status = 0
    let body: unknown = null
    let ok = false
    let errorMessage: string | null = null

    try {
      const res = await systemApi.createQuote(payload)
      status = res.status
      body = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }))
      ok = res.ok && !!(body as { id?: string })?.id
      if (!ok) errorMessage = `http_${status}`
    } catch (e) {
      errorMessage = String((e as Error)?.message ?? e)
    }

    await db.from('wa_submission_log').insert({
      conversation_id: conv.id,
      request_payload: payload,
      response_status: status || null,
      response_body: body,
      success: ok,
      error_message: errorMessage,
      attempt_number: attemptNumber,
    })

    if (!ok) {
      stillFailing++
      continue
    }

    const { data: collab } = await db
      .from('wa_collaborators')
      .select('phone_e164')
      .eq('id', conv.collaborator_id)
      .maybeSingle()

    await finalizeQuoteSubmission(db, {
      conversationId: conv.id,
      remoteJid: conv.remote_jid,
      collaboratorPhone: collab?.phone_e164 ?? null,
      sellerId: (payload.primary_owner_id as string | null) ?? null,
      responseBody: body as { id: string; number?: number; system_quote_id?: string },
    })
    recovered++
  }

  return { retried, recovered, still_failing: stillFailing }
}
