// get-active-theme — retorna o tema ativo (viver-de-ia) com todos os
// design_tokens e component_specs agregados, para o front montar CSS
// variables/Tailwind no boot e no /loader.
//
// Auth: usuário logado (qualquer um dos 9 cadastrados do Luknos).
// Input:  { theme_slug?: string } — opcional, default busca is_active = true.
// Output: { theme, tokens, components }

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

  let payload: { theme_slug?: string } = {}
  try {
    payload = req.headers.get('content-length') === '0' ? {} : await req.json()
  } catch {
    payload = {}
  }

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  let query = db.from('themes').select('*')
  query = payload.theme_slug ? query.eq('slug', payload.theme_slug) : query.eq('is_active', true)
  const { data: themes } = await query.order('created_at', { ascending: false }).limit(1)
  const theme = themes?.[0]
  if (!theme) return json({ error: 'no_active_theme' }, 404)

  const [{ data: tokens }, { data: components }] = await Promise.all([
    db.from('design_tokens').select('token_key, token_category, token_value, description').eq('theme_id', theme.id).order('token_key'),
    db.from('component_specs').select('component_key, component_group, spec_json, is_external_embed').eq('theme_id', theme.id).order('component_key'),
  ])

  return json({
    theme: {
      id: theme.id,
      slug: theme.slug,
      display_name: theme.display_name,
      version: theme.version,
      primary_color: theme.primary_color,
      accent_color: theme.accent_color,
      is_active: theme.is_active,
    },
    tokens: tokens ?? [],
    components: components ?? [],
  })
})
