'use server'

// Cotação e Preços — leituras e escritas do módulo. Segue o padrão de Notas de
// Entrada: tabelas acessadas só pelo servidor (admin client), com a checagem
// de acesso feita aqui (admin ou página '/pricing' liberada no papel).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Metric } from './engine'
import { typeName } from './parse-sheet'

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
  const [suppliers, metrics, types] = await Promise.all([
    db.from('pricing_suppliers').select('id, name, region_label, default_uf').eq('is_active', true).order('name'),
    db.from('pricing_metrics').select('key, label, kind, default_value, value_by_tipo, sort_order').eq('is_active', true).order('sort_order'),
    db.from('pricing_product_types').select('id, name, ncm, group_name, sample_count').order('sample_count', { ascending: false }),
  ])
  return {
    suppliers: (suppliers.data ?? []) as PricingSupplier[],
    metrics: (metrics.data ?? []).map((m: any) => ({
      key: m.key, label: m.label, kind: m.kind, value: Number(m.default_value), value_by_tipo: m.value_by_tipo,
    })) as Metric[],
    productTypes: (types.data ?? []) as PricingProductType[],
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

// Últimas referências do NCM (mais recente primeiro) para preencher e permitir trocar.
// Junta linhas que repetem a mesma nota/tipo/percentual pra lista ser informativa.
export async function getReferenceItems(supplierId: string | null, mirrorId: string | null, ncm: string, limit = 3) {
  const auth = await guard()
  if ('error' in auth) return { error: auth.error }
  const db = createAdminClient()
  const load = async (id: string | null) => {
    let q = db.from('purchase_invoice_items')
      .select('id, descricao, tipo_icms, quantidade, valor_total, valor_icms, valor_fecoep, ipi_percent, purchase_invoices!inner(pricing_supplier_id, numero_nota, data_emissao, uf_origem)')
      .eq('ncm', ncm).gt('valor_total', 0).limit(1000)
    if (id) q = q.eq('purchase_invoices.pricing_supplier_id', id)
    const { data } = await q
    return (data ?? []) as any[]
  }
  let rows = supplierId ? await load(supplierId) : []
  if (!rows.length && mirrorId) rows = await load(mirrorId)
  if (!rows.length) rows = await load(null)

  rows.sort((a, b) => String(b.purchase_invoices?.data_emissao ?? '').localeCompare(String(a.purchase_invoices?.data_emissao ?? '')))
  const seen = new Set<string>()
  const items: ReferenceItem[] = []
  for (const r of rows) {
    const inv = r.purchase_invoices
    const icms = r.valor_icms / r.valor_total
    const key = `${inv?.data_emissao}|${inv?.numero_nota}|${String(r.tipo_icms ?? '').toUpperCase()}|${Math.round(icms * 10000)}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push({
      id: r.id, descricao: r.descricao, tipo: String(r.tipo_icms ?? '').toUpperCase(), uf: inv?.uf_origem ?? '',
      nota: inv?.numero_nota ?? null, date: inv?.data_emissao ?? null,
      icms_pct: icms, fecoep_pct: r.valor_fecoep / r.valor_total, ipi_pct: Number(r.ipi_percent),
      unit_price: r.valor_total / r.quantidade,
    })
    if (items.length >= limit) break
  }
  return { items }
}

export type SupplierType = { ncm: string; name: string; count: number }

// Tipos (e o NCM de cada um) que ESTE fornecedor já vendeu — o nome é o que
// aparece nas notas dele, então "Driver" no fornecedor A e "Fonte" no B ficam separados.
export async function getSupplierTypes(supplierId: string) {
  const auth = await guard()
  if ('error' in auth) return { error: auth.error }
  const db = createAdminClient()
  const counts = new Map<string, SupplierType>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('purchase_invoice_items')
      .select('ncm, descricao, purchase_invoices!inner(pricing_supplier_id)')
      .eq('purchase_invoices.pricing_supplier_id', supplierId).not('ncm', 'is', null)
      .range(from, from + 999)
    if (error) return { error: error.message }
    for (const r of data ?? []) {
      const t = typeName(String((r as any).descricao ?? ''))
      if (!t) continue
      const k = `${(r as any).ncm}|${t}`
      const cur = counts.get(k)
      if (cur) cur.count++; else counts.set(k, { ncm: (r as any).ncm, name: t, count: 1 })
    }
    if (!data || data.length < 1000) break
  }
  return { types: Array.from(counts.values()).sort((a, b) => b.count - a.count) }
}

// Fornecedores que já compraram o NCM — candidatos a "espelho".
export async function getNcmSuppliers(ncm: string) {
  const auth = await guard()
  if ('error' in auth) return { error: auth.error }
  const db = createAdminClient()
  const { data } = await db.from('pricing_tax_profiles').select('supplier_id, n, last_date').eq('ncm', ncm)
  const agg = new Map<string, { n: number; last: string | null }>()
  for (const r of data ?? []) {
    const cur = agg.get(r.supplier_id) ?? { n: 0, last: null }
    cur.n += r.n
    if (r.last_date && (!cur.last || r.last_date > cur.last)) cur.last = r.last_date
    agg.set(r.supplier_id, cur)
  }
  const ids = Array.from(agg.keys())
  if (!ids.length) return { suppliers: [] as { id: string; name: string; n: number; last: string | null }[] }
  const { data: sups } = await db.from('pricing_suppliers').select('id, name').in('id', ids)
  const list = (sups ?? []).map(s => ({ id: s.id, name: s.name, ...agg.get(s.id)! })).sort((a, b) => b.n - a.n)
  return { suppliers: list }
}

export async function getSupplierQuotes(supplierId: string, limit = 5) {
  const auth = await guard()
  if ('error' in auth) return { error: auth.error }
  const { data } = await createAdminClient().from('pricing_quotes').select('*')
    .eq('supplier_id', supplierId).order('created_at', { ascending: false }).limit(limit)
  return { quotes: (data ?? []) as unknown as SavedQuote[] }
}

export type SupplierOverview = { id: string; name: string; default_uf: string | null; notas: number; itens: number; last_date: string | null }

export async function getSuppliersOverview() {
  const auth = await guard()
  if ('error' in auth) return { error: auth.error }
  const db = createAdminClient()
  const { data: sups } = await db.from('pricing_suppliers').select('id, name, default_uf').eq('is_active', true).order('name')
  const { data: inv } = await db.from('purchase_invoices').select('pricing_supplier_id, data_emissao, purchase_invoice_items(count)').not('pricing_supplier_id', 'is', null).limit(5000)
  const agg = new Map<string, { notas: number; itens: number; last: string | null }>()
  for (const r of (inv ?? []) as any[]) {
    const cur = agg.get(r.pricing_supplier_id) ?? { notas: 0, itens: 0, last: null }
    cur.notas++; cur.itens += r.purchase_invoice_items?.[0]?.count ?? 0
    if (r.data_emissao && (!cur.last || r.data_emissao > cur.last)) cur.last = r.data_emissao
    agg.set(r.pricing_supplier_id, cur)
  }
  const list: SupplierOverview[] = (sups ?? []).map(s => ({ ...s, ...(agg.get(s.id) ?? { notas: 0, itens: 0, last: null }), last_date: agg.get(s.id)?.last ?? null }))
    .map(({ last, ...rest }: any) => rest)
  return { suppliers: list }
}

export type SheetItem = {
  id: string; quantidade: number; descricao: string; ncm: string | null; valor_total: number; tipo_icms: string | null
  ipi_percent: number; valor_icms: number; valor_fecoep: number; custo_unitario: number | null; preco_credito: number | null
}
export type SheetInvoice = { id: string; numero_nota: string | null; data_emissao: string | null; uf_origem: string | null; source: string; items: SheetItem[] }

// A "aba" de um fornecedor: notas por data, cada uma com seus itens.
export async function getSupplierSheet(supplierId: string) {
  const auth = await guard()
  if ('error' in auth) return { error: auth.error }
  const { data, error } = await createAdminClient().from('purchase_invoices')
    .select('id, numero_nota, data_emissao, uf_origem, source, purchase_invoice_items(id, numero_item, quantidade, descricao, ncm, valor_total, tipo_icms, ipi_percent, valor_icms, valor_fecoep, custo_unitario, preco_credito)')
    .eq('pricing_supplier_id', supplierId).order('data_emissao', { ascending: false, nullsFirst: false })
  if (error) return { error: error.message }
  const invoices: SheetInvoice[] = (data ?? []).map((r: any) => ({
    id: r.id, numero_nota: r.numero_nota, data_emissao: r.data_emissao, uf_origem: r.uf_origem, source: r.source,
    items: [...(r.purchase_invoice_items ?? [])].sort((a, b) => a.numero_item - b.numero_item),
  }))
  return { invoices }
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
