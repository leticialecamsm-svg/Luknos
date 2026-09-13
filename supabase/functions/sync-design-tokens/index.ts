// sync-design-tokens — upsert de tokens/specs no tema alvo (equipe de
// redesign atualiza a identidade a partir de um pacote exportado).
//
// Auth: admin.
// Input:  { theme_slug?: string, tokens?: [...], components?: [...] }
// Output: { success, tokens_upserted, components_upserted, theme_id, errors? }

import { createClient } from 'npm:@supabase/supabase-js@2.43.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const VALID_CATEGORIES = new Set(['color', 'typography', 'spacing', 'radius', 'shadow', 'motion'])
const VALID_GROUPS = new Set(['form', 'feedback', 'data-viz', 'navigation', 'overlay'])
const HEX_RE = /^#[0-9a-fA-F]{3,8}$/

type TokenInput = { token_key: string; token_category: string; token_value: string; description?: string }
type ComponentInput = { component_key: string; component_group: string; spec_json?: unknown; is_external_embed?: boolean }

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

  let payload: { theme_slug?: string; tokens?: TokenInput[]; components?: ComponentInput[] } = {}
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  const themeSlug = payload.theme_slug ?? 'viver-de-ia'

  const { data: theme } = await db.from('themes').select('id').eq('slug', themeSlug).maybeSingle()
  if (!theme) return json({ error: 'theme_not_found' }, 404)

  const errors: string[] = []

  const validTokens = (payload.tokens ?? []).filter((t) => {
    if (!VALID_CATEGORIES.has(t.token_category)) {
      errors.push(`token ${t.token_key}: categoria invalida (${t.token_category})`)
      return false
    }
    if (t.token_category === 'color' && !HEX_RE.test(t.token_value)) {
      errors.push(`token ${t.token_key}: valor de cor invalido (${t.token_value})`)
      return false
    }
    return true
  })

  const validComponents = (payload.components ?? []).filter((c) => {
    if (!VALID_GROUPS.has(c.component_group)) {
      errors.push(`component ${c.component_key}: grupo invalido (${c.component_group})`)
      return false
    }
    return true
  })

  let tokensUpserted = 0
  if (validTokens.length > 0) {
    const { error, count } = await db
      .from('design_tokens')
      .upsert(
        validTokens.map((t) => ({
          theme_id: theme.id,
          token_key: t.token_key,
          token_category: t.token_category,
          token_value: t.token_value,
          description: t.description ?? null,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'theme_id,token_key', count: 'exact' },
      )
    if (error) errors.push(`upsert tokens: ${error.message}`)
    else tokensUpserted = count ?? validTokens.length
  }

  let componentsUpserted = 0
  if (validComponents.length > 0) {
    const { error, count } = await db
      .from('component_specs')
      .upsert(
        validComponents.map((c) => ({
          theme_id: theme.id,
          component_key: c.component_key,
          component_group: c.component_group,
          spec_json: c.spec_json ?? {},
          is_external_embed: c.is_external_embed ?? false,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'theme_id,component_key', count: 'exact' },
      )
    if (error) errors.push(`upsert components: ${error.message}`)
    else componentsUpserted = count ?? validComponents.length
  }

  return json({
    success: true,
    tokens_upserted: tokensUpserted,
    components_upserted: componentsUpserted,
    theme_id: theme.id,
    ...(errors.length > 0 ? { errors } : {}),
  })
})
