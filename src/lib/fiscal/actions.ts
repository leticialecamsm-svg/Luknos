'use server'

// Emissão fiscal (NF-e/NFC-e) — leituras e escritas. Só admin (é dado sensível:
// CNPJ/IE e os tokens da Focus). Segue o padrão de pricing/actions.ts.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function guardAdmin(): Promise<{ userId: string } | { error: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Apenas administradores' }
  return { userId: user.id }
}

// mostra só os 4 últimos caracteres — o valor completo nunca volta pro navegador
const mask = (v: string | null) => (!v ? null : v.length <= 4 ? '•'.repeat(v.length) : '•'.repeat(v.length - 4) + v.slice(-4))

export type FiscalConfig = {
  cnpj: string | null; ie: string | null; crt: number | null; ambiente: 'homologacao' | 'producao'
  focus_token_homologacao: string | null; focus_token_producao: string | null // já mascarados
  nfe_serie_homologacao: number; nfe_serie_producao: number
  nfce_serie_homologacao: number; nfce_serie_producao: number
  updated_at: string
}

export async function getFiscalConfig() {
  const auth = await guardAdmin()
  if ('error' in auth) return { error: auth.error }
  const { data, error } = await createAdminClient().from('fiscal_config').select('*').eq('id', true).single()
  if (error || !data) return { error: error?.message ?? 'Configuração não encontrada' }
  const config: FiscalConfig = {
    cnpj: data.cnpj, ie: data.ie, crt: data.crt, ambiente: data.ambiente,
    focus_token_homologacao: mask(data.focus_token_homologacao), focus_token_producao: mask(data.focus_token_producao),
    nfe_serie_homologacao: data.nfe_serie_homologacao, nfe_serie_producao: data.nfe_serie_producao,
    nfce_serie_homologacao: data.nfce_serie_homologacao, nfce_serie_producao: data.nfce_serie_producao,
    updated_at: data.updated_at,
  }
  return { config }
}

export async function updateFiscalConfig(input: {
  cnpj?: string; ie?: string; crt?: number; ambiente?: 'homologacao' | 'producao'
  focus_token_homologacao?: string; focus_token_producao?: string // string vazia = não mexe (veio mascarado)
  nfe_serie_homologacao?: number; nfe_serie_producao?: number
  nfce_serie_homologacao?: number; nfce_serie_producao?: number
}) {
  const auth = await guardAdmin()
  if ('error' in auth) return { error: auth.error }

  const patch: Record<string, unknown> = { updated_by: auth.userId, updated_at: new Date().toISOString() }
  for (const k of ['cnpj', 'ie', 'crt', 'ambiente', 'nfe_serie_homologacao', 'nfe_serie_producao', 'nfce_serie_homologacao', 'nfce_serie_producao'] as const) {
    if (input[k] !== undefined) patch[k] = input[k]
  }
  // token só troca se vier um valor novo de verdade (o campo mostra mascarado; só grava se o usuário digitou algo sem "•")
  if (input.focus_token_homologacao && !input.focus_token_homologacao.includes('•')) patch.focus_token_homologacao = input.focus_token_homologacao.trim()
  if (input.focus_token_producao && !input.focus_token_producao.includes('•')) patch.focus_token_producao = input.focus_token_producao.trim()

  const { error } = await createAdminClient().from('fiscal_config').update(patch).eq('id', true)
  if (error) return { error: error.message }
  revalidatePath('/fiscal/configuracoes')
  return { ok: true }
}
