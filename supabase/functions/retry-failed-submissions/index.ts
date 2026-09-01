// retry-failed-submissions — reprocessa wa_submission_log com success=false.
// Auth: interna (service role) — Cron a cada 15 min.
// Fase 3: reenvia o request_payload original, incrementa attempt_number, respeita
// teto de tentativas; em recuperação segue o pós-processamento do submit-quote.
//
// STATUS: scaffold (Fase 1). Lógica implementada na Fase 3.

import { handleOptions, json } from '../_shared/cors.ts'

Deno.serve((req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  return json({ ok: false, error: 'not_implemented', phase: 3 }, 501)
})
