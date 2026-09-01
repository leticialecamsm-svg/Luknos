// generate-attachment-signed-url — signed URL curta de um arquivo do bucket
// privado wa-attachments, para o painel admin.
// Auth: usuário logado (staff/admin) via Supabase Auth — verify_jwt = true.
// Fase 3: valida role via createUserClient, localiza wa_attachments.storage_path,
// gera signed URL (default 5 min). Bucket nunca fica público.
//
// STATUS: scaffold (Fase 1). Lógica implementada na Fase 3.

import { handleOptions, json } from '../_shared/cors.ts'

Deno.serve((req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  return json({ ok: false, error: 'not_implemented', phase: 3 }, 501)
})
