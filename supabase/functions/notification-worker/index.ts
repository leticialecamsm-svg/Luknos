// notification-worker — processa a fila wa_notifications (status = 'pending').
// Auth: interna (service role) — Cron a cada 1 min e/ou pós submit-quote.
// Fase 2/3: envia ao target_phone_e164 via send-whatsapp-message, marca
// sent/failed, processa em lote respeitando rate limit do WhatsApp.
//
// STATUS: scaffold (Fase 1). Lógica implementada na Fase 2/3.

import { handleOptions, json } from '../_shared/cors.ts'

Deno.serve((req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  return json({ ok: false, error: 'not_implemented', phase: 2 }, 501)
})
