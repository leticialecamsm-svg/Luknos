// bot-conversation-engine — máquina de estados do cadastro guiado.
// Auth: interna (service role) — chamada só pela whatsapp-webhook.
// Fase 2: decide o próximo campo (obrigatórios Cliente/Origem/Categoria/Prioridade
// primeiro, depois opcionais), valida contra wa_bot_config, aplica defaults
// (Prioridade "Média", Data = hoje), monta resumo e trata confirmação.
//
// STATUS: scaffold (Fase 1). Lógica implementada na Fase 2.

import { handleOptions, json } from '../_shared/cors.ts'

Deno.serve((req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  return json({ ok: false, error: 'not_implemented', phase: 2 }, 501)
})
