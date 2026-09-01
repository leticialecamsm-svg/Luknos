// Leitura centralizada e validada das variáveis de ambiente das Edge Functions.
// Lança cedo se uma variável obrigatória estiver ausente, para o erro aparecer
// no deploy/serve e não no meio de um cadastro.

export function requireEnv(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`)
  return v
}

export function optionalEnv(name: string): string | undefined {
  return Deno.env.get(name) || undefined
}

export const env = {
  // Supabase — SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetadas
  // automaticamente no runtime deployado das Edge Functions.
  get supabaseUrl() {
    return requireEnv('SUPABASE_URL')
  },
  get serviceRoleKey() {
    return requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  },
  get anonKey() {
    return optionalEnv('SUPABASE_ANON_KEY')
  },

  // Evolution API
  get evolutionUrl() {
    return requireEnv('EVOLUTION_API_URL')
  },
  get evolutionKey() {
    return requireEnv('EVOLUTION_API_KEY')
  },
  get evolutionWebhookSecret() {
    return requireEnv('EVOLUTION_WEBHOOK_SECRET')
  },

  // Sistema Luknos (Next.js) — POST /api/external/quotes
  get systemApiUrl() {
    return requireEnv('NEXTJS_API_URL')
  },
  get systemApiKey() {
    return requireEnv('NEXTJS_API_KEY')
  },

  // IA opcional
  get aiApiKey() {
    return optionalEnv('AI_API_KEY')
  },
  get aiProvider() {
    return optionalEnv('AI_PROVIDER') ?? 'anthropic'
  },
}
