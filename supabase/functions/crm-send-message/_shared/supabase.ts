import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from './env.ts'
export function createServiceClient(): SupabaseClient {
  return createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
}
