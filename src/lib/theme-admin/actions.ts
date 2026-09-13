'use server'

// Server actions do /theme-admin (Fase 3 do redesign): leitura de
// themes/design_tokens/component_specs/screen_registry+redesign_progress e as
// duas ações que chamam as Edge Functions administrativas (publish-theme,
// sync-design-tokens) e as RPCs de progresso (fn_set_screen_status).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const BASE_PATH = '/theme-admin'

export async function requireAdmin(): Promise<boolean> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
  return data?.role === 'admin'
}

export type Theme = {
  id: string
  slug: string
  display_name: string
  is_active: boolean
  version: string
  primary_color: string
  accent_color: string
}

export type DesignToken = {
  id: string
  token_key: string
  token_category: string
  token_value: string
  description: string | null
}

export type ComponentSpec = {
  id: string
  component_key: string
  component_group: string
  spec_json: unknown
  is_external_embed: boolean
}

export type ScreenProgress = {
  screen_slug: string
  module_name: string
  route_path: string
  has_external_embed: boolean
  status: string
  notes: string | null
}

export async function getActiveTheme(): Promise<Theme | null> {
  const supabase = createClient()
  const { data } = await supabase.from('themes').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data
}

export async function getFeatureFlag(flagKey: string) {
  const supabase = createClient()
  const { data } = await supabase.from('feature_flags').select('*').eq('flag_key', flagKey).maybeSingle()
  return data
}

export async function listDesignTokens(themeId: string): Promise<DesignToken[]> {
  const supabase = createClient()
  const { data } = await supabase.from('design_tokens').select('id, token_key, token_category, token_value, description').eq('theme_id', themeId).order('token_key')
  return data ?? []
}

export async function listComponentSpecs(themeId: string): Promise<ComponentSpec[]> {
  const supabase = createClient()
  const { data } = await supabase.from('component_specs').select('id, component_key, component_group, spec_json, is_external_embed').eq('theme_id', themeId).order('component_key')
  return data ?? []
}

export async function listScreensWithProgress(themeId: string): Promise<ScreenProgress[]> {
  const supabase = createClient()
  const { data: screens } = await supabase.from('screen_registry').select('id, screen_slug, module_name, route_path, has_external_embed').order('module_name')
  const { data: progress } = await supabase.from('redesign_progress').select('screen_id, status, notes').eq('theme_id', themeId)
  const byScreen = new Map((progress ?? []).map(p => [p.screen_id, p]))
  return (screens ?? []).map(s => ({
    screen_slug: s.screen_slug,
    module_name: s.module_name,
    route_path: s.route_path,
    has_external_embed: s.has_external_embed,
    status: byScreen.get(s.id)?.status ?? 'pending',
    notes: byScreen.get(s.id)?.notes ?? null,
  }))
}

export async function updateDesignToken(id: string, token_value: string) {
  const supabase = createClient()
  const { error } = await supabase.from('design_tokens').update({ token_value }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(BASE_PATH)
  revalidatePath(`${BASE_PATH}/tokens`)
  return { ok: true }
}

export async function setScreenStatus(screenSlug: string, newStatus: string) {
  const supabase = createClient()
  const { error } = await supabase.rpc('fn_set_screen_status', { p_screen_slug: screenSlug, p_new_status: newStatus })
  if (error) return { error: error.message }
  revalidatePath(`${BASE_PATH}/progress`)
  return { ok: true }
}

export async function publishTheme(themeSlug = 'viver-de-ia') {
  const supabase = createClient()
  const { data, error } = await supabase.functions.invoke('publish-theme', { body: { theme_slug: themeSlug } })
  if (error) return { error: error.message }
  revalidatePath(BASE_PATH)
  return data
}
