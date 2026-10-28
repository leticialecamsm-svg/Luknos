import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function b64urlDecode(s: string) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

// Quem está logado nesta requisição, lido do cookie de sessão do Supabase (sem ir à rede).
// Serve só para o registro de atividade (audit_log): as ações continuam validando o usuário
// com auth.getUser() antes de escrever. Fora de uma requisição (crons, scripts) não há cookie.
function currentActorId(): string | null {
  try {
    const all = cookies().getAll()
    const base = all.find((c) => /^sb-.+-auth-token(\.0)?$/.test(c.name))?.name.replace(/\.0$/, '')
    if (!base) return null
    let raw = all.find((c) => c.name === base)?.value
    if (!raw) {
      raw = ''
      for (let i = 0; ; i++) {
        const part = all.find((c) => c.name === `${base}.${i}`)?.value
        if (part == null) break
        raw += part
      }
    }
    if (!raw) return null
    try { raw = decodeURIComponent(raw) } catch {}
    if (raw.startsWith('base64-')) raw = b64urlDecode(raw.slice(7))
    const session = JSON.parse(raw)
    const token: unknown = Array.isArray(session) ? session[0] : session?.access_token
    if (typeof token !== 'string') return null
    const sub = JSON.parse(b64urlDecode(token.split('.')[1] ?? '')).sub
    return typeof sub === 'string' && UUID_RE.test(sub) ? sub : null
  } catch {
    return null
  }
}

export function createAdminClient() {
  const actor = currentActorId()
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      ...(actor ? { global: { headers: { 'x-actor-id': actor } } } : {}),
    }
  )
}
