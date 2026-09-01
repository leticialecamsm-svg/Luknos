// resolve-contact — busca Cliente/Parceiro nos contatos do Luknos.
// Auth: interna (service role) — chamada pela bot-conversation-engine.
// Fase 2: consulta o sistema externo por nome/telefone (E.164); retorna match,
// lista p/ desambiguação, ou needs_creation. Não cria contato aqui.
//
// STATUS: scaffold (Fase 1). Lógica implementada na Fase 2.

import { handleOptions, json } from '../_shared/cors.ts'

Deno.serve((req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  return json({ ok: false, error: 'not_implemented', phase: 2 }, 501)
})
