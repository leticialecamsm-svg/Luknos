// notification-worker — processa a fila wa_notifications (status = 'pending')
// e avisa o vendedor responsável que há um novo orçamento em seu nome.
//
// Auth: interna (service role) — chamada logo após submit-quote e por cron
// (agendado na Fase 3, a cada 1 min).
// Input:  {} (varre a fila) | { notification_id } (disparo pontual)
// Output: { processed, sent, failed }
// Regra (docs/PROCESSO.md): todo orçamento cadastrado dispara notificação.

import { handleOptions, json } from '../_shared/cors.ts'
import { isInternalCall } from '../_shared/internal.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { sendWhatsappMessage } from '../_shared/wa-send.ts'

const BATCH_LIMIT = 20
const GAP_MS = 250 // respeita rate limit do WhatsApp entre envios

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

Deno.serve(async (req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!isInternalCall(req)) return json({ error: 'unauthorized' }, 401)

  let payload: { notification_id?: string } = {}
  try {
    payload = (await req.json().catch(() => ({}))) ?? {}
  } catch {
    payload = {}
  }

  try {
    return json(await run(payload.notification_id))
  } catch (err) {
    console.error('notification-worker erro:', err)
    return json({ error: String((err as Error)?.message ?? err) }, 500)
  }
})

// ───────────────────────────────────────────────────────────────────────────

async function run(notificationId?: string) {
  const db = createServiceClient()

  let query = db
    .from('wa_notifications')
    .select('id, target_phone_e164, system_quote_id, status')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT)

  if (notificationId) query = db
    .from('wa_notifications')
    .select('id, target_phone_e164, system_quote_id, status')
    .eq('id', notificationId)
    .eq('status', 'pending')

  const { data: rows, error } = await query
  if (error) throw error

  const { data: cfg } = await db
    .from('wa_bot_config')
    .select('system_api_base_url')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  const baseUrl = (cfg?.system_api_base_url ?? '').replace(/\/$/, '')

  let sent = 0
  let failed = 0

  for (const row of rows ?? []) {
    const displayId = /^\d+$/.test(String(row.system_quote_id))
      ? `#${row.system_quote_id}`
      : String(row.system_quote_id)

    const link = await quoteLink(db, baseUrl, String(row.system_quote_id))

    const text =
      `🔔 *Novo orçamento em seu nome*\n` +
      `O orçamento *${displayId}* foi cadastrado pelo Robô de Orçamentos e está com você como ` +
      `vendedor responsável. Abra o sistema para iniciar a análise e a negociação.` +
      (link ? `\n\n${link}` : '')

    let ok = false
    try {
      const r = await sendWhatsappMessage({
        conversationId: null, // vai pro vendedor, não pro chat do colaborador
        toPhoneE164: row.target_phone_e164,
        text,
      })
      ok = r.sent
    } catch (e) {
      console.error('envio de notificação falhou', row.id, e)
    }

    // guarda por status='pending' evita sobrescrever atualização concorrente
    if (ok) {
      const { error: upErr } = await db
        .from('wa_notifications')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('status', 'pending')
      if (!upErr) sent++
    } else {
      await db
        .from('wa_notifications')
        .update({ status: 'failed' })
        .eq('id', row.id)
        .eq('status', 'pending')
      failed++
    }

    if ((rows?.length ?? 0) > 1) await sleep(GAP_MS)
  }

  return { processed: rows?.length ?? 0, sent, failed }
}

// Monta o link do orçamento no sistema. system_quote_id normalmente é o número
// (quotes.number) — resolve o uuid em quotes pra montar /quotes/<uuid>.
async function quoteLink(
  db: ReturnType<typeof createServiceClient>,
  baseUrl: string,
  systemQuoteId: string,
): Promise<string | null> {
  if (!baseUrl || !systemQuoteId) return null
  const isNumber = /^\d+$/.test(systemQuoteId)
  if (isNumber) {
    const { data } = await db
      .from('quotes')
      .select('id')
      .eq('number', Number(systemQuoteId))
      .limit(1)
      .maybeSingle()
    if (!data?.id) return null
    return `${baseUrl}/quotes/${data.id}`
  }
  // já é uuid (caso de fallback)
  return `${baseUrl}/quotes/${systemQuoteId}`
}
