// resolve-contact — busca Cliente ou Parceiro/especificador nos contatos do
// Luknos e indica match ou necessidade de criação.
//
// Auth: interna (service role) — chamada pelo bot-conversation-engine nos passos
// de Cliente (obrigatório) e Parceiro (opcional).
// Input:  { role: "client" | "partner", name?: string, phone?: string }
// Output: { found, matches: [{ system_contact_id, name, phone, type, company }], needs_creation }
//
// NÃO cria contato aqui — a criação efetiva acontece dentro do payload de
// submit-quote, para reusar as validações internas do sistema.

import { handleOptions, json } from '../_shared/cors.ts'
import { isInternalCall } from '../_shared/internal.ts'
import { systemApi } from '../_shared/system-api.ts'

Deno.serve(async (req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!isInternalCall(req)) return json({ error: 'unauthorized' }, 401)

  let payload: { role?: string; name?: string; phone?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const role: 'client' | 'partner' = payload.role === 'partner' ? 'partner' : 'client'
  const name = String(payload.name ?? '').trim()
  const phone = String(payload.phone ?? '').trim()

  if (!name && !phone) {
    return json({ found: false, matches: [], needs_creation: true })
  }

  try {
    const res = await systemApi.searchContacts({ role, name, phone })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('resolve-contact: sistema respondeu', res.status, detail)
      // Degrada: engine segue coletando nome+telefone para criar o contato.
      return json({
        found: false,
        matches: [],
        needs_creation: true,
        upstream_status: res.status,
      })
    }

    const body = (await res.json().catch(() => null)) as
      | { found?: boolean; matches?: unknown[]; needs_creation?: boolean }
      | null

    const matches = Array.isArray(body?.matches) ? body!.matches : []
    return json({
      found: matches.length > 0,
      matches,
      needs_creation: body?.needs_creation ?? matches.length === 0,
    })
  } catch (e) {
    console.error('resolve-contact erro', e)
    return json({ found: false, matches: [], needs_creation: true, error: String((e as Error)?.message ?? e) })
  }
})
