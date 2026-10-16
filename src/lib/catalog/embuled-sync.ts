// Sincroniza o catálogo do site da Embuled (embuled.com, WooCommerce) com supplier_catalog_products.
// Caminho: API pública da loja (/wp-json/wc/store/v1/products), que devolve produtos simples, produtos com
// variações e cada variação com o próprio SKU ('EBAR61711') e foto. O SKU é o código da nota de compra.
//
// Retomável como as outras: se não der conta em uma rodada, a próxima começa pelos mais desatualizados.

import { createAdminClient } from '@/lib/supabase/admin'
import { SIZE_TAG, UA, clean, copyImage, existingRows, pool, upsertRows } from './sync-utils'

const BASE = 'https://embuled.com'
const BUDGET_MS = 240_000
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const unescapeHtml = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&#8217;/g, "'").replace(/&#8211;/g, '–').replace(/&gt;/g, '>').replace(/&lt;/g, '<')

type WcAttr = { name: string; value?: string; terms?: { name: string }[] }
type WcProduct = {
  id: number; name: string; sku: string; type: string; parent?: number; permalink: string
  images: { src: string }[]; categories?: { name: string }[]; attributes?: WcAttr[]
}

async function json<T>(url: string): Promise<{ data: T; total: number }> {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: UA, cache: 'no-store' })
    if (r.ok) { await sleep(100); return { data: await r.json() as T, total: Number(r.headers.get('x-wp-totalpages') ?? 1) } }
    if (![429, 500, 502, 503, 504].includes(r.status)) throw new Error(`${r.status} ${url}`)
    await sleep(1500 * 2 ** i)
  }
  throw new Error(`falhou ${url}`)
}

async function allPages(query: string): Promise<WcProduct[]> {
  const out: WcProduct[] = []
  for (let page = 1; ; page++) {
    const { data, total } = await json<WcProduct[]>(`${BASE}/wp-json/wc/store/v1/products?per_page=100&page=${page}${query}`)
    out.push(...data)
    if (page >= total || !data.length) break
  }
  return out
}

// Tipo do produto pelo nome da categoria ('Balizadores' → balizador) ou pelo próprio nome.
const KIND_WORDS: [RegExp, string][] = [
  [/arandela/, 'arandela'], [/pendente/, 'pendente'], [/plafon/, 'plafon'], [/balizador/, 'balizador'], [/espeto/, 'espeto'],
  [/abajur|mesa/, 'abajur'], [/spot/, 'spot'], [/painel/, 'painel'], [/refletor/, 'refletor'], [/fita/, 'fita'], [/driver|fonte/, 'driver'],
  [/lampada/, 'lampada'], [/perfil/, 'perfil'], [/trilho/, 'trilho'], [/luminaria/, 'luminaria'],
]
export function kindOf(text: string): string | null {
  const t = norm(text)
  return KIND_WORDS.find(([re]) => re.test(t))?.[1] ?? null
}

// Nome da linha: produto simples ou variável traz o nome do modelo ('Nightway', 'Hex Antiofuscante | 18W');
// cada variação acrescenta o atributo que a diferencia ('Cor: Preto').
export function rowFor(p: WcProduct, parent?: WcProduct) {
  const base = clean(unescapeHtml(p.name || parent?.name || ''))
  const attrs = (p.attributes ?? []).map(a => a.value ?? a.terms?.[0]?.name).filter(Boolean) as string[]
  const cats = (parent ?? p).categories?.map(c => c.name).join(' ') ?? ''
  return {
    name: clean([base, ...attrs].join(' ')), line: base,
    kind: kindOf(`${cats} ${base}`), variant: attrs.join(' ') || null,
  }
}

export async function syncEmbuledCatalog() {
  const started = Date.now()
  const db = createAdminClient()
  const errors: string[] = []
  const [products, variations] = await Promise.all([allPages(''), allPages('&type=variation')])
  const parents = new Map(products.map(p => [p.id, p]))

  const existing = await existingRows(db, 'embuled', 'ref, image_url, source_image_url, updated_at')
  const known = new Map(existing.map(r => [String(r.ref), r]))

  type Item = { ref: string; p: WcProduct; parent?: WcProduct }
  const items: Item[] = []
  for (const p of products) {
    // Produto com variações: cada variação vira uma linha; o produto fica como linha 'p-<id>' (sem SKU próprio útil).
    items.push({ ref: p.type === 'variable' || !p.sku ? `p-${p.id}` : p.sku, p })
  }
  for (const v of variations) if (v.sku) items.push({ ref: v.sku, p: v, parent: parents.get(v.parent ?? 0) })
  items.sort((a, b) => String(known.get(a.ref)?.updated_at ?? '').localeCompare(String(known.get(b.ref)?.updated_at ?? '')))

  const rows: Record<string, unknown>[] = []
  let partial = false
  await pool(items, 10, async ({ ref, p, parent }) => {
    if (Date.now() - started > BUDGET_MS) { partial = true; return }
    try {
      const prev = known.get(ref)
      const src = (p.images[0] ?? parent?.images[0])?.src ?? null
      let imageUrl: string | null = null
      let srcTag: string | null = null
      if (prev?.source_image_url === 'upload') { imageUrl = prev.image_url as string; srcTag = 'upload' }
      else if (src && prev?.image_url?.includes('/storage/v1/') && prev.source_image_url === src + SIZE_TAG) { imageUrl = prev.image_url as string; srcTag = src + SIZE_TAG }
      else if (src) { imageUrl = await copyImage(db, src, `embuled/${ref}.jpg`); srcTag = imageUrl ? src + SIZE_TAG : null }
      const r = rowFor(p, parent)
      rows.push({
        source: 'embuled', ref, source_product_id: String(p.id), name: r.name, kind: r.kind, line: r.line, model: p.sku || null, variant: r.variant,
        product_url: parent?.permalink ?? p.permalink, image_url: imageUrl, source_image_url: srcTag, finishes: [], updated_at: new Date().toISOString(),
      })
    } catch (e) {
      errors.push(`${ref}: ${(e as Error).message}`)
    }
  })

  const saved = await upsertRows(db, rows)
  errors.push(...saved.errors)
  return { products: items.length, processed: rows.length, refs: saved.count, partial, errors }
}
