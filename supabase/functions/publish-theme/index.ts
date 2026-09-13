// publish-theme — aplica a virada de uma vez: ativa o tema (is_active=true,
// desativa os demais) e liga o feature_flags.theme.<slug>.enabled.
// Bloqueia se o tema não tiver os tokens minimos de identidade.
//
// Auth: admin.
// Input:  { theme_slug?: string } — default 'viver-de-ia'
// Output: { success, activated_theme, flag_key, enabled_at, enabled_by, warning? }

import { createClient } from 'npm:@supabase/supabase-js@2.43.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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

  let payload: { theme_slug?: string } = {}
  try {
    payload = req.headers.get('content-length') === '0' ? {} : await req.json()
  } catch {
    payload = {}
  }
  const themeSlug = payload.theme_slug ?? 'viver-de-ia'

  const { data: theme } = await db.from('themes').select('id, is_active').eq('slug', themeSlug).maybeSingle()
  if (!theme) return json({ error: 'theme_not_found' }, 404)

  const { data: requiredTokens } = await db
    .from('design_tokens')
    .select('token_key')
    .eq('theme_id', theme.id)
    .in('token_key', ['color.background.base', 'color.accent.gold'])
  const foundKeys = new Set((requiredTokens ?? []).map((t) => t.token_key))
  if (!foundKeys.has('color.background.base') || !foundKeys.has('color.accent.gold')) {
    return json({ error: 'incomplete_theme' }, 422)
  }

  if (theme.is_active) {
    const flagKey = `theme.${themeSlug}.enabled`
    const { data: flag } = await db.from('feature_flags').select('*').eq('flag_key', flagKey).maybeSingle()
    return json({
      success: true,
      activated_theme: themeSlug,
      flag_key: flagKey,
      enabled_at: flag?.enabled_at ?? null,
      enabled_by: flag?.enabled_by ?? null,
    })
  }

  await db.from('themes').update({ is_active: false }).neq('id', theme.id)
  await db.from('themes').update({ is_active: true }).eq('id', theme.id)

  const flagKey = `theme.${themeSlug}.enabled`
  const enabledAt = new Date().toISOString()
  await db
    .from('feature_flags')
    .upsert({ flag_key: flagKey, is_enabled: true, enabled_at: enabledAt, enabled_by: user.id }, { onConflict: 'flag_key' })

  const { data: summaryRows } = await db.rpc('fn_redesign_summary')
  const pending = (summaryRows ?? []).find((r: { status: string; count: number }) => r.status === 'pending')

  const result: Record<string, unknown> = {
    success: true,
    activated_theme: themeSlug,
    flag_key: flagKey,
    enabled_at: enabledAt,
    enabled_by: user.id,
  }
  if (pending && pending.count > 0) {
    result.warning = `${pending.count} tela(s) ainda em pending`
  }

  return json(result)
})
