import { env, optionalEnv } from './env.ts'
import { createServiceClient } from './supabase.ts'

// Cliente do sistema de negócio do Luknos (Next.js).
// REGRA DE OURO: toda escrita no banco de negócio (quotes, contacts, proposals,
// comissão, tarefas) passa por AQUI — endpoints /api/external/* com API key.
// As Edge Functions nunca tocam essas tabelas direto.
//
// Base URL: wa_bot_config.system_api_base_url (fallback env NEXTJS_API_URL).
// API key: a env var nomeada por wa_bot_config.system_api_key_secret_ref
//          (fallback env NEXTJS_API_KEY). O valor real nunca fica no banco.

async function resolveConfig(): Promise<{ base: string; key: string }> {
  let base = ''
  let key = ''
  try {
    const db = createServiceClient()
    const { data } = await db
      .from('wa_bot_config')
      .select('system_api_base_url, system_api_key_secret_ref')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (data?.system_api_base_url) base = String(data.system_api_base_url)
    if (data?.system_api_key_secret_ref) {
      const v = optionalEnv(String(data.system_api_key_secret_ref))
      if (v) key = v
    }
  } catch (e) {
    console.warn('resolveConfig: fallback para env', e)
  }
  if (!base) base = env.systemApiUrl
  if (!key) key = env.systemApiKey
  return { base: base.replace(/\/$/, ''), key }
}

export async function systemApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { base, key } = await resolveConfig()
  return await fetch(`${base}/${path.replace(/^\//, '')}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      ...(init.headers ?? {}),
    },
  })
}

export const systemApi = {
  createQuote: (payload: unknown) =>
    systemApiFetch('/api/external/quotes', { method: 'POST', body: JSON.stringify(payload) }),
  searchContacts: (params: { role: 'client' | 'partner'; name?: string; phone?: string }) => {
    const qs = new URLSearchParams({ role: params.role })
    if (params.name) qs.set('name', params.name)
    if (params.phone) qs.set('phone', params.phone)
    return systemApiFetch(`/api/external/contacts?${qs.toString()}`, { method: 'GET' })
  },
}
