import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { FinanceiroProfile } from './types'
export type { FinanceiroProfile } from './types'
export { isGestor } from './types'

/**
 * Autenticação do Luknos Financeiro Inteligente. Reaproveita a MESMA sessão
 * do Luknos (auth.users é compartilhado no projeto Supabase) — quem já está
 * logado no ERP não precisa logar de novo aqui. `profiles` é espelhado a
 * partir de `public.users` (ver migração `..._fase1_seed_profiles.sql`).
 */
export async function requireFinanceiroProfile(): Promise<FinanceiroProfile> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, can_approve')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) {
    // Usuário existe no Luknos mas ainda não foi espelhado em profiles
    // (ex: criado depois do seed, ou inativo). Não é um erro de auth —
    // é falta de cadastro nesse módulo específico.
    redirect('/financeiro-ia/sem-acesso')
  }

  return profile as FinanceiroProfile
}
