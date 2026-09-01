'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ───────────────────────────────────────────────────────────────────────────
// Server Actions do módulo Robô de Orçamentos WhatsApp.
// Escrita em wa_bot_config / wa_collaborators é só do admin (RLS wa_is_admin()).
// Aqui reforçamos no app com ensureBotAdmin() antes de usar o admin client,
// mesmo padrão das actions de finance/hr do Luknos.
// ───────────────────────────────────────────────────────────────────────────

async function ensureBotAdmin() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const }
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') return { error: 'Sem permissão' as const }
  return { userId: user.id }
}

const E164 = /^\+[1-9]\d{6,14}$/

// ─── wa_bot_config ────────────────────────────────────────────────────────

export async function getBotConfig() {
  const auth = await ensureBotAdmin()
  if ('error' in auth) return null
  const { data } = await createAdminClient()
    .from('wa_bot_config')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data
}

export interface BotConfigInput {
  evolution_instance_name: string
  system_api_base_url: string
  system_api_key_secret_ref: string
  default_priority: string
  allowed_origins: string[]
  allowed_categories: string[]
}

const PRIORITIES = ['Baixa', 'Média', 'Alta', 'Urgente']

export async function saveBotConfig(input: BotConfigInput) {
  const auth = await ensureBotAdmin()
  if ('error' in auth) return { error: auth.error }

  const evolution_instance_name = input.evolution_instance_name?.trim()
  const system_api_base_url = input.system_api_base_url?.trim()
  const system_api_key_secret_ref = input.system_api_key_secret_ref?.trim()

  if (!evolution_instance_name) return { error: 'Informe o nome da instância Evolution.' }
  if (!system_api_base_url) return { error: 'Informe a base URL do sistema.' }
  try {
    new URL(system_api_base_url)
  } catch {
    return { error: 'Base URL inválida (ex.: https://app.luknos.com.br).' }
  }
  if (!system_api_key_secret_ref) return { error: 'Informe a referência do segredo da API key.' }
  if (!PRIORITIES.includes(input.default_priority)) return { error: 'Prioridade padrão inválida.' }

  const origins = dedupeTags(input.allowed_origins)
  const categories = dedupeTags(input.allowed_categories)
  if (origins.length === 0) return { error: 'Cadastre ao menos uma origem.' }
  if (categories.length === 0) return { error: 'Cadastre ao menos uma categoria.' }

  const admin = createAdminClient()
  const row = {
    evolution_instance_name,
    system_api_base_url,
    system_api_key_secret_ref,
    default_priority: input.default_priority,
    allowed_origins: origins,
    allowed_categories: categories,
  }

  const { data: existing } = await admin
    .from('wa_bot_config')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { error } = existing
    ? await admin.from('wa_bot_config').update(row).eq('id', existing.id)
    : await admin.from('wa_bot_config').insert(row)

  if (error) return { error: error.message }
  revalidatePath('/bot-config')
  return { ok: true }
}

// ─── wa_collaborators (whitelist) ─────────────────────────────────────────

export async function getBotCollaborators() {
  const auth = await ensureBotAdmin()
  if ('error' in auth) return []
  const { data } = await createAdminClient()
    .from('wa_collaborators')
    .select('*')
    .order('created_at', { ascending: false })
  return data ?? []
}

// Vendedores do sistema, para mapear phone_e164 -> system_user_id.
export async function getSystemUsersForBot() {
  const auth = await ensureBotAdmin()
  if ('error' in auth) return []
  const { data } = await createAdminClient()
    .from('users')
    .select('id, name, role, active')
    .eq('active', true)
    .order('name')
  return data ?? []
}

export interface CollaboratorInput {
  phone_e164: string
  display_name: string
  system_user_id: string | null
  is_active: boolean
}

function validateCollaborator(input: CollaboratorInput) {
  const phone_e164 = input.phone_e164?.trim()
  const display_name = input.display_name?.trim()
  if (!phone_e164 || !E164.test(phone_e164))
    return { error: 'Telefone precisa estar em formato E.164 (ex.: +5541999998888).' }
  if (!display_name) return { error: 'Informe o nome de exibição.' }
  return {
    value: {
      phone_e164,
      display_name,
      system_user_id: input.system_user_id || null,
      is_active: !!input.is_active,
    },
  }
}

export async function createBotCollaborator(input: CollaboratorInput) {
  const auth = await ensureBotAdmin()
  if ('error' in auth) return { error: auth.error }
  const v = validateCollaborator(input)
  if ('error' in v) return { error: v.error }

  const { error } = await createAdminClient().from('wa_collaborators').insert(v.value)
  if (error) {
    if (error.code === '23505') return { error: 'Já existe um colaborador com esse telefone.' }
    return { error: error.message }
  }
  revalidatePath('/bot-collaborators')
  return { ok: true }
}

export async function updateBotCollaborator(id: string, input: CollaboratorInput) {
  const auth = await ensureBotAdmin()
  if ('error' in auth) return { error: auth.error }
  const v = validateCollaborator(input)
  if ('error' in v) return { error: v.error }

  const { error } = await createAdminClient()
    .from('wa_collaborators')
    .update(v.value)
    .eq('id', id)
  if (error) {
    if (error.code === '23505') return { error: 'Já existe um colaborador com esse telefone.' }
    return { error: error.message }
  }
  revalidatePath('/bot-collaborators')
  return { ok: true }
}

export async function setBotCollaboratorActive(id: string, is_active: boolean) {
  const auth = await ensureBotAdmin()
  if ('error' in auth) return { error: auth.error }
  const { error } = await createAdminClient()
    .from('wa_collaborators')
    .update({ is_active })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/bot-collaborators')
  return { ok: true }
}

export async function deleteBotCollaborator(id: string) {
  const auth = await ensureBotAdmin()
  if ('error' in auth) return { error: auth.error }
  const { error } = await createAdminClient().from('wa_collaborators').delete().eq('id', id)
  if (error) {
    if (error.code === '23503')
      return { error: 'Este colaborador já tem conversas registradas. Desative em vez de excluir.' }
    return { error: error.message }
  }
  revalidatePath('/bot-collaborators')
  return { ok: true }
}

// ─── util ────────────────────────────────────────────────────────────────

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags ?? []) {
    const t = (raw ?? '').trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}
