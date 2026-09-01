import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { User } from '@/types'

// ───────────────────────────────────────────────────────────────────────────
// Guarda de acesso do módulo "Robô de Orçamentos WhatsApp".
//
// O painel do robô é restrito a usuários internos do Luknos (equipe). O papel
// vem de public.users.role — não há custom claim no JWT (mesmo padrão do resto
// do sistema). Mapeamento:
//   - role = 'admin'            -> botRole 'admin' (Gestor/Dono): acesso total
//   - qualquer outro role ativo -> botRole 'staff': monitor em leitura
//
// Colaboradores que encaminham projetos NÃO passam por aqui — são identificados
// por phone_e164 na whitelist (wa_collaborators), dentro das Edge Functions.
// ───────────────────────────────────────────────────────────────────────────

export type BotRole = 'admin' | 'staff'

export interface BotAccess {
  profile: User
  botRole: BotRole
  roleLabel: string
  /** allowed_pages do papel — repassado ao Sidebar, mesmo shape de requirePageAccess */
  allowedPages: string[] | null
}

export async function requireBotAccess(
  opts: { requireAdmin?: boolean } = {},
): Promise<BotAccess> {
  const supabase = createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) redirect('/auth/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  // Sem row em users, ou usuário desativado -> não é equipe interna.
  if (!profile || profile.active === false) redirect('/auth/login')

  const botRole: BotRole = profile.role === 'admin' ? 'admin' : 'staff'

  // Áreas de escrita do módulo (config, whitelist, retry manual) são só do admin.
  // Staff cai no monitor de conversas (ou no dashboard geral se ainda não existir).
  if (opts.requireAdmin && botRole !== 'admin') redirect('/dashboard')

  const { data: role } = await admin
    .from('roles')
    .select('label, allowed_pages')
    .eq('name', profile.role)
    .maybeSingle()

  return {
    profile: profile as User,
    botRole,
    roleLabel: role?.label ?? profile.role,
    allowedPages: (role?.allowed_pages as string[] | null) ?? null,
  }
}
