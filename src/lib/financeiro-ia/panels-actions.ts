'use server'

// Server actions dos painéis (Fase 2, itens 8 e 9): caixa do dia, fluxo
// projetado, visão mensal e DRE. Todas chamam as RPCs de
// supabase/migrations/20260913_financeiro_ia_fase2_rpcs_calculo.sql.

import { createClient } from '@/lib/supabase/server'

export type DailyCashPanel = {
  consolidated_balance: number
  total_due_today: number
  total_receivable_today: number
  remaining: number
  items: {
    transaction_id: string
    direction: 'a_pagar' | 'a_receber'
    description: string
    amount: number
    status: string
    category: string | null
    supplier: string | null
    cost_center: string | null
    bank_account: string | null
  }[]
}

export type CashflowDay = {
  date: string
  opening_balance: number
  expected_in: number
  expected_out: number
  closing_balance: number
}

export type MonthlySummary = {
  total_payable: number
  total_receivable: number
  needed_sales_to_break_even: number
  projected_result: number
}

export type Dre = {
  revenue: number
  expenses_by_category: { category_name: string; total: number }[]
  expenses_by_cost_center: { cost_center_name: string; total: number }[]
  total_expenses: number
  result: number
}

export type CategoryBreakdown = {
  category_name: string
  kind: string
  total: number
  percentage: number
}[]

const todayISO = () => new Date().toISOString().slice(0, 10)

export async function getDailyCashPanel(targetDate?: string): Promise<DailyCashPanel> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_daily_cash_panel', { target_date: targetDate || todayISO() })
  if (error) throw new Error(error.message)
  return data as DailyCashPanel
}

export async function getCashflowProjection(startDate: string, endDate: string): Promise<CashflowDay[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_cashflow_projection', { start_date: startDate, end_date: endDate })
  if (error) throw new Error(error.message)
  return (data as CashflowDay[]) ?? []
}

export async function getMonthlySummary(month?: string): Promise<MonthlySummary> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_monthly_summary', { target_month: month || todayISO() })
  if (error) throw new Error(error.message)
  return data as MonthlySummary
}

export async function getDre(startDate: string, endDate: string, costCenterId?: string | null): Promise<Dre> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_dre', { start_date: startDate, end_date: endDate, p_cost_center_id: costCenterId || null })
  if (error) throw new Error(error.message)
  return data as Dre
}

export async function getCategoryBreakdown(startDate: string, endDate: string): Promise<CategoryBreakdown> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_category_breakdown', { start_date: startDate, end_date: endDate })
  if (error) throw new Error(error.message)
  return (data as CategoryBreakdown) ?? []
}
