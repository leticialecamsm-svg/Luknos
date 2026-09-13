'use server'

// Server actions dos lançamentos manuais (Fase 2, item 6): contas a pagar e
// a receber, com categoria/fornecedor/centro de custo/conta bancária,
// parcelamento e status pago/pendente/incompleto. A criação e a marcação de
// pago passam pelas RPCs create_transaction_with_installments() e
// mark_transaction_paid() (ver supabase/migrations/20260913_financeiro_ia_fase2_lancamentos_manuais.sql),
// que aplicam a regra de completude e atualizam o saldo real da conta.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const PATHS = ['/financeiro-ia/contas-a-pagar', '/financeiro-ia/contas-a-receber']

export type Direction = 'a_pagar' | 'a_receber'

export type Transaction = {
  id: string
  direction: Direction
  description: string
  amount: number
  due_date: string
  paid_date: string | null
  status: string
  is_complete: boolean
  category_id: string | null
  supplier_id: string | null
  cost_center_id: string | null
  bank_account_id: string | null
  category: { name: string } | null
  supplier: { name: string } | null
  cost_center: { name: string } | null
  bank_account: { name: string } | null
}

export async function listTransactions(direction: Direction): Promise<Transaction[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('transactions')
    .select(`
      id, direction, description, amount, due_date, paid_date, status, is_complete,
      category_id, supplier_id, cost_center_id, bank_account_id,
      category:categories(name), supplier:suppliers(name),
      cost_center:cost_centers(name), bank_account:bank_accounts(name)
    `)
    .eq('direction', direction)
    .order('due_date')
  return (data as unknown as Transaction[]) ?? []
}

export async function createTransaction(input: {
  direction: Direction
  description: string
  amount: number
  due_date: string
  category_id?: string | null
  supplier_id?: string | null
  cost_center_id?: string | null
  bank_account_id?: string | null
  total_installments?: number
}) {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('create_transaction_with_installments', {
    p_direction: input.direction,
    p_description: input.description,
    p_amount: input.amount,
    p_due_date: input.due_date,
    p_category_id: input.category_id || null,
    p_supplier_id: input.supplier_id || null,
    p_cost_center_id: input.cost_center_id || null,
    p_bank_account_id: input.bank_account_id || null,
    p_total_installments: input.total_installments || 1,
  })
  if (error) return { error: error.message }
  PATHS.forEach(p => revalidatePath(p))
  return { ok: true, id: data as string }
}

export async function markTransactionPaid(id: string, paidOn?: string) {
  const supabase = createClient()
  const { error } = await supabase.rpc('mark_transaction_paid', {
    p_transaction_id: id,
    p_paid_on: paidOn || new Date().toISOString().slice(0, 10),
  })
  if (error) return { error: error.message }
  PATHS.forEach(p => revalidatePath(p))
  return { ok: true }
}

export async function deleteTransaction(id: string) {
  const supabase = createClient()
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) return { error: error.message }
  PATHS.forEach(p => revalidatePath(p))
  return { ok: true }
}
