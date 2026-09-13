'use server'

// Server actions do fluxo de aprovação (Fase 3, item 10): valor de corte
// configurável (approval_settings) e fila de aprovação (approve_transaction
// RPC). Ver supabase/migrations/20260913_financeiro_ia_fase3_fluxo_aprovacao.sql.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Transaction } from './transactions-actions'

const APROVACOES_PATH = '/financeiro-ia/aprovacoes'
const CONFIG_PATH = '/financeiro-ia/configuracoes'

export async function getApprovalThreshold(): Promise<number> {
  const supabase = createClient()
  const { data } = await supabase
    .from('approval_settings')
    .select('approval_threshold')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.approval_threshold ?? 0
}

export async function setApprovalThreshold(threshold: number) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('approval_settings').insert({
    approval_threshold: threshold,
    updated_by: user?.id ?? null,
  })
  if (error) return { error: error.message }
  revalidatePath(CONFIG_PATH)
  return { ok: true }
}

export async function listPendingApprovals(): Promise<Transaction[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('transactions')
    .select(`
      id, direction, description, amount, due_date, paid_date, status, is_complete,
      category_id, supplier_id, cost_center_id, bank_account_id,
      category:categories(name), supplier:suppliers(name),
      cost_center:cost_centers(name), bank_account:bank_accounts(name)
    `)
    .eq('status', 'aguardando_aprovacao')
    .order('due_date')
  return (data as unknown as Transaction[]) ?? []
}

export async function approveTransaction(id: string, approved: boolean) {
  const supabase = createClient()
  const { error } = await supabase.rpc('approve_transaction', {
    p_transaction_id: id,
    p_approved: approved,
  })
  if (error) return { error: error.message }
  revalidatePath(APROVACOES_PATH)
  return { ok: true }
}
