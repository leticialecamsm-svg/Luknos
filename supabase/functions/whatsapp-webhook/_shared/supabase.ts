import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from './env.ts'
export function createServiceClient(): SupabaseClient {
  return createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
}
export function createUserClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get('Authorization') ?? ''
  return createClient(env.supabaseUrl, env.anonKey ?? env.serviceRoleKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } })
}
