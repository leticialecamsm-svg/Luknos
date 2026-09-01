// submit-quote — grava o orçamento no Luknos via POST /api/external/quotes.
// Auth: interna (service role) — chamada pela bot-conversation-engine após confirmação.
// Fase 2: monta o JSON de collected_data com defaults finais, faz o POST com API key,
// grava wa_submission_log, propaga system_quote_id p/ wa_attachments, enfileira
// wa_notifications. Idempotente (não duplica se já houver system_quote_id).
//
// STATUS: scaffold (Fase 1). Lógica implementada na Fase 2.

import { handleOptions, json } from '../_shared/cors.ts'

Deno.serve((req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  return json({ ok: false, error: 'not_implemented', phase: 2 }, 501)
})
