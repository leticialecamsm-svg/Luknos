// send-whatsapp-message — envio de saída do robô via Evolution API.
// Auth: interna (service role) — chamada pela engine e pelo notification-worker.
// Fase 2: envia via instância de wa_bot_config; quando há conversation_id,
// registra wa_messages como outbound; retorna sent=false em erro de envio.
//
// STATUS: scaffold (Fase 1). Lógica implementada na Fase 2.

import { handleOptions, json } from '../_shared/cors.ts'

Deno.serve((req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  return json({ ok: false, error: 'not_implemented', phase: 2 }, 501)
})
