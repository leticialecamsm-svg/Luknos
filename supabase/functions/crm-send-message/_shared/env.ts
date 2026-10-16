export function requireEnv(name: string): string { const v = Deno.env.get(name); if (!v) throw new Error(`Variavel de ambiente ausente: ${name}`); return v }
export function optionalEnv(name: string): string | undefined { return Deno.env.get(name) || undefined }
export const env = {
  get supabaseUrl() { return requireEnv('SUPABASE_URL') },
  get serviceRoleKey() { return requireEnv('SUPABASE_SERVICE_ROLE_KEY') },
  get anonKey() { return optionalEnv('SUPABASE_ANON_KEY') },
  get evolutionUrl() { return requireEnv('EVOLUTION_API_URL') },
  get evolutionKey() { return requireEnv('EVOLUTION_API_KEY') },
  get evolutionWebhookSecret() { return optionalEnv('EVOLUTION_WEBHOOK_SECRET') },
  get systemApiUrl() { return requireEnv('NEXTJS_API_URL') },
  get systemApiKey() { return requireEnv('NEXTJS_API_KEY') },
  get aiApiKey() { return optionalEnv('AI_API_KEY') },
  get aiProvider() { return optionalEnv('AI_PROVIDER') ?? 'anthropic' },
}
