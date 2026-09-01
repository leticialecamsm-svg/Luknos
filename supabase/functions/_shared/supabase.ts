import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from './env.ts'

// Cliente com service role — ignora RLS. Só as Edge Functions do robô usam.
// NUNCA expor essa key ao frontend.
export function createServiceClient(): SupabaseClient {
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Cliente no contexto do usuário logado (repassa o header Authorization).
// Usado por generate-attachment-signed-url para respeitar o RLS wa_is_staff().
export function createUserClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get('Authorization') ?? ''
  return createClient(env.supabaseUrl, env.anonKey ?? env.serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
