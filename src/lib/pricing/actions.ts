'use server'

// Cotação e Preços — leituras e escritas do módulo. Segue o padrão de Notas de
// Entrada: tabelas acessadas só pelo servidor (admin client), com a checagem
// de acesso feita aqui (admin ou página '/pricing' liberada no papel).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Metric } from './engine'
import { typeName } from './parse-sheet'
import { expandTerms, normText } from './synonyms'
import { matchCatalog, catalogSourceFor, type CatalogEntry, type ItemPhoto } from '@/lib/catalog/match'
import { syncAccordCatalog } from '@/lib/catalog/accord-sync'
import { syncUsinaCatalog } from '@/lib/catalog/usina-sync'
import { syncSorteluzCatalog } from '@/lib/catalog/sorteluz-sync'
import { syncAvantCatalog } from '@/lib/catalog/avant-sync'
import { syncEmbuledCatalog } from '@/lib/catalog/embuled-sync'
import { syncBlumenauCatalog } from '@/lib/catalog/blumenau-sync'
import { existingRows } from '@/lib/catalog/sync-utils'

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
export type TypeSupplier = { name: string; count: number }
export type PricingProductType = {
  id: string; name: string; ncm: string; group_name: string | null; sample_count: number
  sample: string; suppliers: TypeSupplier[]
}
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

// Índice de tipos/NCM em tempo real: o que cada fornecedor já vendeu, com um
// exemplo de descrição e quantos itens cada fornecedor tem. Notas seguradas ficam fora.
async function buildTypeIndex(): Promise<PricingProductType[]> {
  const db = createAdminClient()
  const idx = new Map<string, { ncm: string; name: string; count: number; sample: string; sampleDate: string; sup: Map<string, number> }>()
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from('purchase_invoice_items')
      .select('ncm, descricao, purchase_invoices!inner(data_emissao, on_hold, pricing_suppliers(name))')
      .eq('purchase_invoices.on_hold', false).not('ncm', 'is', null).range(from, from + 999)
    for (const r of (data ?? []) as any[]) {
      const t = typeName(String(r.descricao ?? '')); if (!t) continue
      const k = `${r.ncm}|${t}`
      const date = r.purchase_invoices?.data_emissao ?? ''
      const sup = r.purchase_invoices?.pricing_suppliers?.name ?? '—'
      const cur = idx.get(k) ?? { ncm: r.ncm, name: t, count: 0, sample: '', sampleDate: '', sup: new Map<string, number>() }
      cur.count++
      cur.sup.set(sup, (cur.sup.get(sup) ?? 0) + 1)
      if (!cur.sample || date > cur.sampleDate) { cur.sample = String(r.descricao).replace(/\s+/g, ' ').trim(); cur.sampleDate = date }
      idx.set(k, cur)
    }
    if (!data || data.length < 1000) break
  }
  return Array.from(idx.entries()).map(([k, v]) => ({
    id: k, name: v.name, ncm: v.ncm, group_name: null, sample_count: v.count, sample: v.sample,
    suppliers: Array.from(v.sup.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  })).filter(t => t.sample_count >= 2).sort((a, b) => b.sample_count - a.sample_count)
}

export async function getPricingBootstrap() {
  const auth = await guard()
  if ('error' in auth) return { error: auth.error }
  const db = createAdminClient()
  const [suppliers, metrics, types] = await Promise.all([
    db.from('pricing_suppliers').select('id, name, region_label, default_uf').eq('is_active', true).order('name'),
    db.from('pricing_metrics').select('key, label, kind, default_value, value_by_tipo, sort_order').eq('is_active', true).order('sort_order'),
    buildTypeIndex(),
  ])
  return {
    suppliers: (suppliers.data ?? []) as PricingSupplier[],
    metrics: (metrics.data ?? []).map((m: any) => ({
      key: m.key, label: m.label, kind: m.kind, value: Number(m.default_value), value_by_tipo: m.value_by_tipo,
    })) as Metric[],
    productTypes: types,
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
      .eq('ncm', ncm).eq('purchase_invoices.on_hold', false).gt('valor_total', 0).or('valor_icms.gt.0,valor_fecoep.gt.0').limit(1000)
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

export type SupplierType = { ncm: string; name: string; count: number; sample: string; last_date: string | null; nota: string | null }

// Tipos (e o NCM de cada um) que ESTE fornecedor já vendeu — o nome é o que
// aparece nas notas dele, então "Driver" no fornecedor A e "Fonte" no B ficam separados.
export async function getSupplierTypes(supplierId: string) {
  const auth = await guard()
  if ('error' in auth) return { error: auth.error }
  const db = createAdminClient()
  const counts = new Map<string, SupplierType>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('purchase_invoice_items')
      .select('ncm, descricao, purchase_invoices!inner(pricing_supplier_id, on_hold, data_emissao, numero_nota)')
      .eq('purchase_invoices.pricing_supplier_id', supplierId).eq('purchase_invoices.on_hold', false).not('ncm', 'is', null)
      .range(from, from + 999)
    if (error) return { error: error.message }
    for (const r of data ?? []) {
      const t = typeName(String((r as any).descricao ?? ''))
      if (!t) continue
      const k = `${(r as any).ncm}|${t}`
      const inv = (r as any).purchase_invoices
      const date: string | null = inv?.data_emissao ?? null
      const cur = counts.get(k)
      if (!cur) counts.set(k, { ncm: (r as any).ncm, name: t, count: 1, sample: String((r as any).descricao).replace(/\s+/g, ' ').trim(), last_date: date, nota: inv?.numero_nota ?? null })
      else {
        cur.count++
        if (date && (!cur.last_date || date > cur.last_date)) { cur.last_date = date; cur.nota = inv?.numero_nota ?? null; cur.sample = String((r as any).descricao).replace(/\s+/g, ' ').trim() }
      }
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
  imposto_ant_percent: number | null; maquininha: number; comissao: number; lucro: number
  codigo_produto: string | null; catalog_ref: string | null; photo: ItemPhoto | null
}
export type SheetInvoice = { id: string; numero_nota: string | null; data_emissao: string | null; uf_origem: string | null; source: string; on_hold: boolean; items: SheetItem[] }

// A "aba" de um fornecedor: notas por data, cada uma com seus itens.
export async function getSupplierSheet(supplierId: string) {
  const auth = await guard()
  if ('error' in auth) return { error: auth.error }
  const { data, error } = await createAdminClient().from('purchase_invoices')
    .select('id, numero_nota, data_emissao, uf_origem, source, on_hold, maquininha, comissao, lucro, purchase_invoice_items(id, numero_item, quantidade, descricao, ncm, valor_total, tipo_icms, ipi_percent, valor_icms, valor_fecoep, custo_unitario, preco_credito, imposto_ant_percent, maquininha, comissao, lucro, codigo_produto, catalog_ref)')
    .eq('pricing_supplier_id', supplierId).order('data_emissao', { ascending: false, nullsFirst: false })
  if (error) return { error: error.message }
  const catalog = await loadCatalog(supplierId)
  const byRef = new Map(catalog.map(c => [c.ref, c]))
  // O mesmo produto aparece com código numa nota (XML) e sem código em outra (planilha): quem não tem
  // código aprende o da mesma descrição neste fornecedor, e a foto sai pelo código, não pelo nome.
  const descKey = (d: string) => String(d ?? '').toUpperCase().replace(/\s+/g, ' ').trim()
  const codeByDesc = new Map<string, string>()
  for (const r of (data ?? []) as any[]) for (const i of r.purchase_invoice_items ?? []) {
    const code = String(i.codigo_produto ?? '').trim()
    if (code && !codeByDesc.has(descKey(i.descricao))) codeByDesc.set(descKey(i.descricao), code)
  }
  // Nota lançada por planilha não tem código, mas a NF-e dela costuma estar no radar de notas de entrada
  // (nfe_received, com o XML): mesmo número de nota + mesma posição + mesma descrição = o cProd do item.
  // Só leitura: não grava nada nas notas.
  const codeByPos = new Map<string, string>()
  const numeros = Array.from(new Set(((data ?? []) as any[]).map(r => String(r.numero_nota ?? '')).filter(Boolean)))
  if (numeros.length) {
    const { data: nfes } = await createAdminClient().from('nfe_received').select('numero_nota, items_json').in('numero_nota', numeros).not('items_json', 'is', null)
    for (const n of (nfes ?? []) as any[]) for (const e of Array.isArray(n.items_json) ? n.items_json : []) {
      const code = String(e.cProd ?? '').trim()
      if (!code) continue
      codeByPos.set(`${n.numero_nota}|${e.nItem}|${descKey(e.xProd)}`, code)
      if (!codeByDesc.has(descKey(e.xProd))) codeByDesc.set(descKey(e.xProd), code)
    }
  }
  const invoices: SheetInvoice[] = (data ?? []).map((r: any) => ({
    id: r.id, numero_nota: r.numero_nota, data_emissao: r.data_emissao, uf_origem: r.uf_origem, source: r.source, on_hold: !!r.on_hold,
    items: [...(r.purchase_invoice_items ?? [])].sort((a, b) => a.numero_item - b.numero_item).map((i: any) => ({
      ...i, quantidade: Number(i.quantidade), valor_total: Number(i.valor_total), ipi_percent: Number(i.ipi_percent),
      valor_icms: Number(i.valor_icms), valor_fecoep: Number(i.valor_fecoep),
      custo_unitario: i.custo_unitario == null ? null : Number(i.custo_unitario), preco_credito: i.preco_credito == null ? null : Number(i.preco_credito),
      imposto_ant_percent: i.imposto_ant_percent == null ? null : Number(i.imposto_ant_percent),
      maquininha: Number(i.maquininha ?? r.maquininha), comissao: Number(i.comissao ?? r.comissao), lucro: Number(i.lucro ?? r.lucro),
      photo: catalog.length ? matchCatalog({ ...i, codigo_produto: i.codigo_produto || codeByPos.get(`${r.numero_nota}|${i.numero_item}|${descKey(i.descricao)}`) || codeByDesc.get(descKey(i.descricao)) || null }, catalog, byRef) : null,
    })),
  }))
  return { invoices }
}

// Catálogo com fotos do fornecedor: Accord (copiado do site), Hevvy (do catálogo PDF)
// e, para todos, as fotos enviadas à mão (os demais fornecedores só têm essas).
async function catalogSource(supplierId: string) {
  const { data } = await createAdminClient().from('pricing_suppliers').select('name').eq('id', supplierId).maybeSingle()
  return (data && catalogSourceFor(data.name)) || `sup-${supplierId}`
}

async function loadCatalog(supplierId: string): Promise<CatalogEntry[]> {
  const source = await catalogSource(supplierId)
  // Em páginas: o banco devolve no máximo 1000 linhas por consulta e a Usina tem quase 3000.
  const data = await existingRows(createAdminClient(), source,
    'ref, name, kind, line, altura_cm, largura_cm, profundidade_cm, diametro_cm, product_url, image_url, source_image_url, finishes, model, ean, variant')
  return data.sort((a, b) => String(a.name).localeCompare(String(b.name))).map((c: any) => ({
    ...c, finishes: c.finishes ?? [],
    altura_cm: c.altura_cm == null ? null : Number(c.altura_cm), largura_cm: c.largura_cm == null ? null : Number(c.largura_cm),
    profundidade_cm: c.profundidade_cm == null ? null : Number(c.profundidade_cm), diametro_cm: c.diametro_cm == null ? null : Number(c.diametro_cm),
  }))
}

export async function getSupplierCatalog(supplierId: string) {
  const auth = await guard()
  if ('error' in auth) return { error: auth.error }
  return { catalog: await loadCatalog(supplierId) }
}

// Fixa a foto de um item: ref do catálogo, '-' = sem foto, null = volta ao automático.
export async function setItemCatalogRef(itemId: string, ref: string | null) {
  const auth = await guard()
  if ('error' in auth) return { error: auth.error }
  const { error } = await createAdminClient().from('purchase_invoice_items').update({ catalog_ref: ref }).eq('id', itemId)
  if (error) return { error: error.message }
  return { ok: true }
}

// Foto enviada à mão para um item. Vira (ou substitui) a foto da ref no catálogo do
// fornecedor, então outras notas com a mesma ref também passam a mostrá-la.
// ref: a que o item já usa; sem ela, a REF da descrição, o código do XML ou uma nova.
export async function uploadItemPhoto(form: FormData) {
  const auth = await guard()
  if ('error' in auth) return { error: auth.error }
  const itemId = String(form.get('itemId') ?? '')
  const file = form.get('file')
  if (!itemId || !(file instanceof Blob) || !file.size) return { error: 'Foto não recebida' }
  if (file.size > 4 * 1024 * 1024) return { error: 'Foto muito grande (máx. 4 MB)' }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return { error: 'Envie JPG, PNG ou WEBP' }

  const db = createAdminClient()
  const { data: item } = await db.from('purchase_invoice_items')
    .select('id, descricao, codigo_produto, purchase_invoices!inner(pricing_supplier_id)').eq('id', itemId).maybeSingle()
  const supplierId = (item as any)?.purchase_invoices?.pricing_supplier_id
  if (!item || !supplierId) return { error: 'Item não encontrado' }
  const source = await catalogSource(supplierId)

  const given = String(form.get('ref') ?? '').trim()
  const ref = given
    || item.descricao.match(/\bREF\b[\s.:]*(\d{3,5})/i)?.[1]
    || (item.codigo_produto ? String(item.codigo_produto).trim() : '')
    || `M-${item.id.slice(0, 8)}`

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${source}/upload/${ref.replace(/[^\w.-]+/g, '_')}-${Date.now()}.${ext}`
  const { error: upErr } = await db.storage.from('supplier-catalog').upload(path, file, { contentType: file.type })
  if (upErr) return { error: upErr.message }
  const imageUrl = db.storage.from('supplier-catalog').getPublicUrl(path).data.publicUrl

  const { data: existing } = await db.from('supplier_catalog_products').select('id').eq('source', source).eq('ref', ref).maybeSingle()
  const desc = String(item.descricao).replace(/\s+/g, ' ').trim()
  const { error } = existing
    ? await db.from('supplier_catalog_products').update({ image_url: imageUrl, source_image_url: 'upload', updated_at: new Date().toISOString() }).eq('id', existing.id)
    : await db.from('supplier_catalog_products').insert({
        source, ref, source_product_id: 'upload', image_url: imageUrl, source_image_url: 'upload',
        name: desc.replace(/\s*\(?REF[\s.:]*\d{3,5}\)?/i, '').trim().slice(0, 120),
        kind: normText(desc).split(/\s+/)[0] || null,
      })
  if (error) return { error: error.message }
  await db.from('purchase_invoice_items').update({ catalog_ref: ref }).eq('id', itemId)
  return { ok: true, ref }
}

// Relê o site do fornecedor agora (o cron faz isso toda segunda). Só Accord, Usina, Sorteluz, Avant, Embuled e Blumenau vêm de site;
// os demais catálogos vêm de PDF e são importados por script.
export async function syncSupplierCatalog(supplierId: string) {
  const auth = await guard(true)
  if ('error' in auth) return { error: auth.error }
  try {
    const source = await catalogSource(supplierId)
    if (source === 'accord') return { ...(await syncAccordCatalog()), partial: false }
    if (source === 'usina') return await syncUsinaCatalog()
    if (source === 'sorteluz') return await syncSorteluzCatalog()
    if (source === 'avant') return await syncAvantCatalog()
    if (source === 'embuled') return await syncEmbuledCatalog()
    if (source === 'blumenau') return await syncBlumenauCatalog()
    return { error: 'Este fornecedor não tem site para atualizar' }
  } catch (e) { return { error: (e as Error).message } }
}

// Salva as alterações feitas no modal de simulação (só admin).
export async function updateSheetItem(id: string, v: {
  quantidade: number; valor_total: number; tipo_icms: string | null; ipi_percent: number; valor_icms: number; valor_fecoep: number
  imposto_ant_percent: number; maquininha: number; comissao: number; lucro: number; custo_unitario: number; preco_credito: number
}) {
  const auth = await guard(true)
  if ('error' in auth) return { error: auth.error }
  const { error } = await createAdminClient().from('purchase_invoice_items').update(v).eq('id', id)
  if (error) return { error: error.message }
  return { ok: true }
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
  maquininha?: number | null; comissao?: number | null; lucro?: number | null
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
    }, { onConflict: 'chave_nfe' }).select('id, on_hold').single()
    if (error || !row) return { error: `Nota ${inv.numero_nota}: ${error?.message}` }
    await db.from('purchase_invoice_items').delete().eq('invoice_id', row.id)
    if (inv.items.length) {
      const { error: itemErr } = await db.from('purchase_invoice_items').insert(inv.items.map(i => ({ ...i, invoice_id: row.id })))
      if (itemErr) return { error: `Nota ${inv.numero_nota}: ${itemErr.message}` }
    }
    // nota segurada volta a valer sozinha quando a planilha passa a trazer todos os impostos
    if (row.on_hold && inv.items.length && inv.items.every(i => i.tipo_icms && (i.valor_icms > 0 || i.valor_fecoep > 0))) {
      await db.from('purchase_invoices').update({ on_hold: false }).eq('id', row.id)
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


// ── Comparar: o mesmo produto em vários fornecedores ─────────────────────────
export type CompareRow = {
  supplier_id: string; supplier: string; descricao: string; ncm: string | null; tipo_icms: string | null
  date: string | null; nota: string | null; qty: number; custo: number | null; venda: number | null; compras: number
}

// Cada palavra digitada precisa aparecer na descrição (a 1ª também por sinônimo:
// "fonte" acha "driver"). Vale a compra mais recente de cada descrição por fornecedor.
export async function compareProducts(query: string) {
  const auth = await guard()
  if ('error' in auth) return { error: auth.error }
  const words = normText(query).split(/\s+/).filter(w => w.length >= 1)
  if (!words.length) return { rows: [] as CompareRow[] }
  const groups = words.map(w => (w.length >= 2 ? expandTerms(w) : [w]))
  const first = groups[0].filter(t => /^[a-z0-9]+$/.test(t))
  const { data, error } = await createAdminClient().from('purchase_invoice_items')
    .select('descricao, ncm, tipo_icms, quantidade, custo_unitario, preco_credito, purchase_invoices!inner(numero_nota, data_emissao, pricing_supplier_id, on_hold, pricing_suppliers(name))')
    .not('purchase_invoices.pricing_supplier_id', 'is', null).eq('purchase_invoices.on_hold', false)
    .or(first.map(t => `descricao.ilike.%${t}%`).join(',')).limit(3000)
  if (error) return { error: error.message }

  const best = new Map<string, CompareRow>()
  for (const r of (data ?? []) as any[]) {
    const desc = normText(r.descricao ?? '')
    if (!groups.every(g => g.some(t => desc.includes(t)))) continue
    const inv = r.purchase_invoices
    const key = `${inv.pricing_supplier_id}|${desc.replace(/\s+/g, ' ')}`
    const cur = best.get(key)
    const row: CompareRow = {
      supplier_id: inv.pricing_supplier_id, supplier: inv.pricing_suppliers?.name ?? '—', descricao: r.descricao, ncm: r.ncm, tipo_icms: r.tipo_icms,
      date: inv.data_emissao, nota: inv.numero_nota, qty: Number(r.quantidade), custo: r.custo_unitario != null ? Number(r.custo_unitario) : null,
      venda: r.preco_credito != null ? Number(r.preco_credito) : null, compras: 1,
    }
    if (!cur) best.set(key, row)
    else {
      const newer = (row.date ?? '') > (cur.date ?? '')
      best.set(key, { ...(newer ? row : cur), compras: cur.compras + 1 })
    }
  }
  return { rows: Array.from(best.values()) }
}

// ── Notas de Entrada → Cotação e Preços ──────────────────────────────────────
export type PendingNfe = {
  id: string; numero_nota: string | null; data_emissao: string | null; fornecedor_nome: string | null; fornecedor_cnpj: string | null
  itens: number; sem_imposto: number; total: number
}

export async function listPendingNfe() {
  const auth = await guard(true)
  if ('error' in auth) return { error: auth.error }
  const { data, error } = await createAdminClient().from('purchase_invoices')
    .select('id, numero_nota, data_emissao, fornecedor_nome, fornecedor_cnpj, purchase_invoice_items(valor_total, tipo_icms, valor_icms, valor_fecoep)')
    .eq('source', 'nfe').is('pricing_supplier_id', null).order('data_emissao', { ascending: false, nullsFirst: false }).limit(300)
  if (error) return { error: error.message }
  const notes: PendingNfe[] = (data ?? []).map((r: any) => {
    const its = r.purchase_invoice_items ?? []
    return {
      id: r.id, numero_nota: r.numero_nota, data_emissao: r.data_emissao, fornecedor_nome: r.fornecedor_nome, fornecedor_cnpj: r.fornecedor_cnpj,
      itens: its.length, total: its.reduce((a: number, i: any) => a + Number(i.valor_total), 0),
      sem_imposto: its.filter((i: any) => !i.tipo_icms || (Number(i.valor_icms) === 0 && Number(i.valor_fecoep) === 0)).length,
    }
  }).filter(n => n.itens > 0)
  return { notes }
}

// Vincula notas de entrada a um fornecedor da planilha (ou cria um novo). Notas com
// item sem imposto preenchido ficam seguradas — não viram referência de preço.
export async function linkNfeInvoices(input: { invoiceIds: string[]; supplierId?: string; newSupplierName?: string; uf: string | null }) {
  const auth = await guard(true)
  if ('error' in auth) return { error: auth.error }
  const db = createAdminClient()
  let supplierId = input.supplierId
  if (!supplierId) {
    const name = (input.newSupplierName ?? '').trim().toUpperCase()
    if (!name) return { error: 'Escolha o fornecedor' }
    const { data, error } = await db.from('pricing_suppliers').upsert({ name, default_uf: input.uf }, { onConflict: 'name' }).select('id').single()
    if (error || !data) return { error: error?.message ?? 'Falha ao criar fornecedor' }
    supplierId = data.id as string
  }
  let linked = 0, held = 0
  for (const id of input.invoiceIds) {
    const { data: its } = await db.from('purchase_invoice_items').select('tipo_icms, valor_icms, valor_fecoep').eq('invoice_id', id)
    const incomplete = !its?.length || its.some(i => !i.tipo_icms || (Number(i.valor_icms) === 0 && Number(i.valor_fecoep) === 0))
    const { error } = await db.from('purchase_invoices').update({ pricing_supplier_id: supplierId, uf_origem: input.uf, on_hold: incomplete }).eq('id', id).eq('source', 'nfe')
    if (error) return { error: error.message }
    linked++; if (incomplete) held++
  }
  return { linked, held, supplierId }
}
