'use server'

// Server actions dos cadastros de apoio (Fase 2, item 5): contas bancárias,
// categorias, fornecedores e centros de custo. RLS já cobre quem pode
// inserir/editar/excluir cada tabela (ver db/schemas.sql do pacote) —
// aqui só repassamos o erro do Postgres quando a policy barrar.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const BASE_PATH = '/financeiro-ia/configuracoes'

export type BankAccount = {
  id: string
  name: string
  bank_code: string | null
  account_type: string
  current_balance: number
  status: string
}

export type Category = {
  id: string
  name: string
  kind: string
  is_active: boolean
}

export type Supplier = {
  id: string
  name: string
  document: string | null
  is_active: boolean
}

export type CostCenter = {
  id: string
  name: string
  is_active: boolean
}

export async function listBankAccounts(): Promise<BankAccount[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('bank_accounts')
    .select('id, name, bank_code, account_type, current_balance, status')
    .order('name')
  return data ?? []
}

export async function listCategories(): Promise<Category[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('categories')
    .select('id, name, kind, is_active')
    .order('name')
  return data ?? []
}

export async function listSuppliers(): Promise<Supplier[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('suppliers')
    .select('id, name, document, is_active')
    .order('name')
  return data ?? []
}

export async function listCostCenters(): Promise<CostCenter[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('cost_centers')
    .select('id, name, is_active')
    .order('name')
  return data ?? []
}

// ── Contas bancárias ────────────────────────────────────────────────────

export async function createBankAccount(input: { name: string; bank_code?: string; account_type: string; status: string }) {
  const supabase = createClient()
  const { error } = await supabase.from('bank_accounts').insert({
    name: input.name,
    bank_code: input.bank_code || null,
    account_type: input.account_type,
    status: input.status,
  })
  if (error) return { error: error.message }
  revalidatePath(BASE_PATH)
  return { ok: true }
}

export async function updateBankAccount(id: string, input: { name: string; bank_code?: string; account_type: string; status: string }) {
  const supabase = createClient()
  const { error } = await supabase.from('bank_accounts').update({
    name: input.name,
    bank_code: input.bank_code || null,
    account_type: input.account_type,
    status: input.status,
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(BASE_PATH)
  return { ok: true }
}

export async function deleteBankAccount(id: string) {
  const supabase = createClient()
  const { error } = await supabase.from('bank_accounts').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(BASE_PATH)
  return { ok: true }
}

// ── Categorias ──────────────────────────────────────────────────────────

export async function createCategory(input: { name: string; kind: string }) {
  const supabase = createClient()
  const { error } = await supabase.from('categories').insert({ name: input.name, kind: input.kind })
  if (error) return { error: error.message }
  revalidatePath(BASE_PATH)
  return { ok: true }
}

export async function updateCategory(id: string, input: { name: string; kind: string; is_active: boolean }) {
  const supabase = createClient()
  const { error } = await supabase.from('categories').update(input).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(BASE_PATH)
  return { ok: true }
}

export async function deleteCategory(id: string) {
  const supabase = createClient()
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(BASE_PATH)
  return { ok: true }
}

// ── Fornecedores ────────────────────────────────────────────────────────

export async function createSupplier(input: { name: string; document?: string }) {
  const supabase = createClient()
  const { error } = await supabase.from('suppliers').insert({ name: input.name, document: input.document || null })
  if (error) return { error: error.message }
  revalidatePath(BASE_PATH)
  return { ok: true }
}

export async function updateSupplier(id: string, input: { name: string; document?: string; is_active: boolean }) {
  const supabase = createClient()
  const { error } = await supabase.from('suppliers').update({
    name: input.name,
    document: input.document || null,
    is_active: input.is_active,
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(BASE_PATH)
  return { ok: true }
}

export async function deleteSupplier(id: string) {
  const supabase = createClient()
  const { error } = await supabase.from('suppliers').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(BASE_PATH)
  return { ok: true }
}

// ── Centros de custo ────────────────────────────────────────────────────

export async function createCostCenter(input: { name: string }) {
  const supabase = createClient()
  const { error } = await supabase.from('cost_centers').insert({ name: input.name })
  if (error) return { error: error.message }
  revalidatePath(BASE_PATH)
  return { ok: true }
}

export async function updateCostCenter(id: string, input: { name: string; is_active: boolean }) {
  const supabase = createClient()
  const { error } = await supabase.from('cost_centers').update(input).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(BASE_PATH)
  return { ok: true }
}

export async function deleteCostCenter(id: string) {
  const supabase = createClient()
  const { error } = await supabase.from('cost_centers').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(BASE_PATH)
  return { ok: true }
}
