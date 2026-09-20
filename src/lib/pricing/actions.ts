'use server'

// Cotação e Preços — leituras e escritas do módulo. Segue o padrão de Notas de
// Entrada: tabelas acessadas só pelo servidor (admin client), com a checagem
// de acesso feita aqui (admin ou página '/pricing' liberada no papel).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Metric } from './engine'

async function guard(adminOnly = false): Promise<{ userId: string } | { error: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const { data: profile } = await supabase.from('users').select('role, extra_pages').eq('id', user.id).single()
  if (!profile) return { error: 'Sem permissão' }
  if (profile.role === 'admin') return { userId: user.id }
  if (adminOnly) return { error: 'Apenas administradores' }
  const { data: role } = await createAdminClient().from('roles').select('allowed_pages').eq('name', profile.role).maybeSingle()
  const pages: string[] = [...(role?.allowed_pages ?? []), ...((profile.extra_pages as string[] | null) ?? [])]
  return pages.some(p => p === '/pricing' || '/pricing'.startsWith(p + '/')) ? { userId: user.id } : { error: 'Sem permissão' }
}

export type PricingSupplier = { id: string; name: string; region_label: string | null; default_uf: string | null }
export type PricingProductType = { id: string; name: string; ncm: string; group_name: string | null; sample_count: number }
export type TaxProfile = {
  supplier_id: string; ncm: string; tipo: string; uf: string; n: number
  icms_pct: number | null; fecoep_pct: number | null; ipi_pct: number | null; last_date: string | null
}
export type SavedQuote = {
  id: string; number: number; supplier_label: string | null; product_ref: string | null; product_type: string | null
  ncm: string; tipo_icms: string | null; uf_origem: string | null; quantity: number; unit_price: number
  ipi_pct: number; icms_pct: number; fecoep_pct: number; metrics: Metric[]
  cost_unit: number; price_credit: number; price_cash: number | null; notes: string | null; created_at: string
}

export async function getPricingBootstrap() {
  const auth = await guard()
  if ('error' in auth) return { error: auth.error }
  const db = createAdminClient()
  const [suppliers, metrics, types, quotes] = await Promise.all([
    db.from('pricing_suppliers').select('id, name, region_label, default_uf').eq('is_active', true).order('name'),
    db.from('pricing_metrics').select('key, label, kind, default_value, value_by_tipo, sort_order').eq('is_active', true).order('sort_order'),
    db.from('pricing_product_types').select('id, name, ncm, group_name, sample_count').order('sample_count', { ascending: false }),
    db.from('pricing_quotes').select('*').order('created_at', { ascending: false }).limit(50),
  ])
  return {
    suppliers: (suppliers.data ?? []) as PricingSupplier[],
    metrics: (metrics.data ?? []).map((m: any) => ({
      key: m.key, label: m.label, kind: m.kind, value: Number(m.default_value), value_by_tipo: m.value_by_tipo,
    })) as Metric[],
    productTypes: (types.data ?? []) as PricingProductType[],
    quotes: (quotes.data ?? []) as unknown as SavedQuote[],
  }
}

// Perfil de imposto do fornecedor para o NCM; se ele não tem histórico com esse
// NCM, cai no fornecedor "espelho" e por último em qualquer fornecedor.
export async function getTaxProfiles(supplierId: string | null, mirrorId: string | null, ncm: string) {
  const auth = await guard()
  if ('error' in auth) return { error: auth.error }
  const db = createAdminClient()
  const load = async (id: string) => {
    const { data } = await db.from('pricing_tax_profiles').select('*').eq('supplier_id', id).eq('ncm', ncm)
    return (data ?? []) as TaxProfile[]
  }
  if (supplierId) {
    const own = await load(supplierId)
    if (own.length) return { profiles: own, source: 'own' as const }
  }
  if (mirrorId) {
    const mirror = await load(mirrorId)
    if (mirror.length) return { profiles: mirror, source: 'mirror' as const }
  }
  const { data } = await db.from('pricing_tax_profiles').select('*').eq('ncm', ncm).order('n', { ascending: false }).limit(12)
  return { profiles: (data ?? []) as TaxProfile[], source: 'any' as const }
}

export type ReferenceItem = {
  id: string; descricao: string; tipo: string; uf: string; nota: string | null; date: string | null
  icms_pct: number; fecoep_pct: number; ipi_pct: number; unit_price: number
}

// Linhas recentes do mesmo NCM para "copiar o %" como se faz na planilha.
export async function getReferenceItems(supplierId: string | null, mirrorId: string | null, ncm: string) {
  const auth = await guard()
  if ('error' in auth) return { error: auth.error }
  const db = createAdminClient()
  const load = async (id: string | null) => {
    let q = db.from('purchase_invoice_items')
      .select('id, descricao, tipo_icms, quantidade, valor_total, valor_icms, valor_fecoep, ipi_percent, purchase_invoices!inner(pricing_supplier_id, numero_nota, data_emissao, uf_origem)')
      .eq('ncm', ncm).gt('valor_total', 0)
    if (id) q = q.eq('purchase_invoices.pricing_supplier_id', id)
    const { data } = await q.order('data_emissao', { referencedTable: 'purchase_invoices', ascending: false, nullsFirst: false }).limit(10)
    return (data ?? []) as any[]
  }
  let rows = supplierId ? await load(supplierId) : []
  if (!rows.length && mirrorId) rows = await load(mirrorId)
  if (!rows.length) rows = await load(null)
  const items: ReferenceItem[] = rows.map(r => ({
    id: r.id, descricao: r.descricao, tipo: String(r.tipo_icms ?? '').toUpperCase(), uf: r.purchase_invoices?.uf_origem ?? '',
    nota: r.purchase_invoices?.numero_nota ?? null, date: r.purchase_invoices?.data_emissao ?? null,
    icms_pct: r.valor_icms / r.valor_total, fecoep_pct: r.valor_fecoep / r.valor_total, ipi_pct: Number(r.ipi_percent),
    unit_price: r.valor_total / r.quantidade,
  }))
  return { items }
}

export async function createPricingSupplier(name: string, defaultUf?: string) {
  const auth = await guard()
  if ('error' in auth) return { error: auth.error }
  const clean = name.trim().toUpperCase()
  if (!clean) return { error: 'Informe o nome do fornecedor' }
  const { data, error } = await createAdminClient()
    .from('pricing_suppliers').insert({ name: clean, default_uf: defaultUf || null }).select('id, name, region_label, default_uf').single()
  if (error) return { error: error.code === '23505' ? 'Já existe um fornecedor com esse nome' : error.message }
  return { supplier: data as PricingSupplier }
}

export async function saveQuote(input: {
  supplier_id: string | null; mirror_supplier_id: string | null; supplier_label: string
  product_ref?: string; product_type?: string; ncm: string; tipo_icms?: string; uf_origem?: string
  quantity: number; unit_price: number; ipi_pct: number; icms_pct: number; fecoep_pct: number
  metrics: Metric[]; cost_unit: number; price_credit: number; price_cash: number | null; notes?: string
}) {
  const auth = await guard()
  if ('error' in auth) return { error: auth.error }
  const { data, error } = await createAdminClient()
    .from('pricing_quotes').insert({ ...input, created_by: auth.userId }).select('*').single()
  if (error) return { error: error.message }
  return { quote: data as unknown as SavedQuote }
}

export async function deleteQuote(id: string) {
  const auth = await guard()
  if ('error' in auth) return { error: auth.error }
  const { error } = await createAdminClient().from('pricing_quotes').delete().eq('id', id)
  if (error) return { error: error.message }
  return { ok: true }
}

// ── Importação da planilha (admin) ───────────────────────────────────────────

export type ImportItem = {
  numero_item: number; descricao: string; ncm: string; quantidade: number; valor_total: number
  ipi_percent: number; tipo_icms: string | null; valor_icms: number; valor_fecoep: number
  custo_unitario: number | null; preco_credito: number | null; imposto_ant_percent: number | null
}
export type ImportInvoice = {
  key: string; numero_nota: string; data_emissao: string | null; uf: string | null
  comissao: number; lucro: number; maquininha: number; items: ImportItem[]
}

// Uma aba da planilha = um fornecedor. Idempotente: a chave sintética da nota
// (fornecedor + nº + data) faz reimportar a mesma aba atualizar em vez de duplicar.
export async function importSupplierSheet(input: {
  supplier: string; region: string | null; defaultUf: string | null; invoices: ImportInvoice[]
}) {
  const auth = await guard(true)
  if ('error' in auth) return { error: auth.error }
  const db = createAdminClient()

  const { data: sup, error: supErr } = await db.from('pricing_suppliers')
    .upsert({ name: input.supplier, region_label: input.region, default_uf: input.defaultUf }, { onConflict: 'name' })
    .select('id').single()
  if (supErr || !sup) return { error: supErr?.message ?? 'Falha ao criar fornecedor' }

  let invoices = 0, items = 0
  for (const inv of input.invoices) {
    const chave = `planilha:${input.supplier}:${inv.key}`
    const { data: row, error } = await db.from('purchase_invoices').upsert({
      chave_nfe: chave, numero_nota: inv.numero_nota, fornecedor_nome: input.supplier, data_emissao: inv.data_emissao,
      comissao: inv.comissao, lucro: inv.lucro, maquininha: inv.maquininha,
      pricing_supplier_id: sup.id, uf_origem: inv.uf, source: 'planilha',
    }, { onConflict: 'chave_nfe' }).select('id').single()
    if (error || !row) return { error: `Nota ${inv.numero_nota}: ${error?.message}` }
    await db.from('purchase_invoice_items').delete().eq('invoice_id', row.id)
    if (inv.items.length) {
      const { error: itemErr } = await db.from('purchase_invoice_items').insert(inv.items.map(i => ({ ...i, invoice_id: row.id })))
      if (itemErr) return { error: `Nota ${inv.numero_nota}: ${itemErr.message}` }
    }
    invoices++; items += inv.items.length
  }
  return { supplierId: sup.id as string, invoices, items }
}

export async function seedProductTypes(rows: { ncm: string; name: string; count: number }[]) {
  const auth = await guard(true)
  if ('error' in auth) return { error: auth.error }
  if (!rows.length) return { ok: true }
  const { error } = await createAdminClient().from('pricing_product_types')
    .upsert(rows.map(r => ({ ncm: r.ncm, name: r.name, sample_count: r.count })), { onConflict: 'ncm,name' })
  if (error) return { error: error.message }
  revalidatePath('/pricing')
  return { ok: true }
}
