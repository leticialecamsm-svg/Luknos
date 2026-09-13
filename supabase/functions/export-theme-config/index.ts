// export-theme-config — gera, a partir dos design_tokens do tema, o
// fragmento de tailwind.config e o theme.css (CSS variables) para o time
// técnico aplicar no código-fonte. Não persiste nada, só leitura/transformação.
//
// Auth: admin (equipe técnica).
// Input:  { theme_slug?: string, format?: 'css' | 'tailwind' | 'both' }
// Output: { theme_slug, css?, tailwind_fragment? }

import { createClient } from 'npm:@supabase/supabase-js@2.43.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
function cssVarName(tokenKey: string): string {
  return `--${tokenKey.replace(/\./g, '-')}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? serviceRoleKey

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser()
  if (authErr || !user) return json({ error: 'unauthorized' }, 401)

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: profile } = await db.from('users').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return json({ error: 'forbidden' }, 403)

  let payload: { theme_slug?: string; format?: 'css' | 'tailwind' | 'both' } = {}
  try {
    payload = req.headers.get('content-length') === '0' ? {} : await req.json()
  } catch {
    payload = {}
  }
  const themeSlug = payload.theme_slug ?? 'viver-de-ia'
  const format = payload.format ?? 'both'

  const { data: theme } = await db.from('themes').select('id').eq('slug', themeSlug).maybeSingle()
  if (!theme) return json({ error: 'theme_not_found' }, 404)

  const { data: tokens } = await db
    .from('design_tokens')
    .select('token_key, token_value')
    .eq('theme_id', theme.id)
    .order('token_key')
  if (!tokens || tokens.length === 0) return json({ error: 'no_tokens' }, 404)

  const result: Record<string, unknown> = { theme_slug: themeSlug }

  if (format === 'css' || format === 'both') {
    const vars = tokens.map((t) => `${cssVarName(t.token_key)}:${t.token_value};`).join('')
    result.css = `:root{${vars}}`
  }

  if (format === 'tailwind' || format === 'both') {
    const colors: Record<string, string> = {}
    for (const t of tokens) {
      if (t.token_key.startsWith('color.')) {
        const name = t.token_key.slice('color.'.length).replace(/\./g, '-')
        colors[name] = `var(${cssVarName(t.token_key)})`
      }
    }
    result.tailwind_fragment = JSON.stringify({ theme: { extend: { colors } } })
  }

  return json(result)
})
