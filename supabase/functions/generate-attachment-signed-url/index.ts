// generate-attachment-signed-url — URL assinada temporária de um arquivo do
// bucket privado wa-attachments, para exibição no painel.
//
// Auth: usuário logado (staff/admin) via Supabase Auth (verify_jwt = true no
// config.toml). Aqui reconfirmamos o papel via public.users.role.
// Input:  { attachment_id: string, expires_in?: number (default 300) }
// Output: { signed_url: string, expires_at: string }

import { handleOptions, json } from '../_shared/cors.ts'
import { createServiceClient, createUserClient } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // usuário logado
  const userClient = createUserClient(req)
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser()
  if (authErr || !user) return json({ error: 'unauthorized' }, 401)

  const db = createServiceClient()
  // qualquer usuário interno ativo do Luknos pode ver anexos (mesma regra do RLS
  // wa_attachments_select / wa_is_staff). Anônimo já foi barrado acima.
  const { data: profile } = await db
    .from('users')
    .select('active')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || profile.active === false) return json({ error: 'forbidden' }, 403)

  let payload: { attachment_id?: string; expires_in?: number }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!payload.attachment_id) return json({ error: 'missing_attachment_id' }, 400)

  const expiresIn = Math.min(Math.max(payload.expires_in ?? 300, 30), 3600)

  const { data: att } = await db
    .from('wa_attachments')
    .select('storage_path, file_name')
    .eq('id', payload.attachment_id)
    .maybeSingle()
  if (!att) return json({ error: 'attachment_not_found' }, 404)

  const { data: signed, error } = await db.storage
    .from('wa-attachments')
    .createSignedUrl(att.storage_path, expiresIn, { download: att.file_name })
  if (error || !signed?.signedUrl) {
    return json({ error: `sign_failed: ${error?.message ?? 'unknown'}` }, 500)
  }

  return json({
    signed_url: signed.signedUrl,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    file_name: att.file_name,
  })
})
