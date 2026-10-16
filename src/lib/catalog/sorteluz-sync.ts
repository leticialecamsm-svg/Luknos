// Sincroniza o catálogo do site da Sorteluz (sorteluz.com.br) com supplier_catalog_products.
// Caminho: listagem de cada categoria (links sobre-produto.php?id=N) → página do produto, que traz
// título, marca, "Cód.", potência, temperatura, tamanho e uma foto recortada. A foto é copiada
// reduzida para o bucket 'supplier-catalog'.
//
// Os códigos do site (10xxx/20xxx) não são os das notas de compra (códigos internos), então o
// casamento é por nome e modelo ('SO-205'). Retomável: se não der conta em uma rodada, a próxima
// começa pelos produtos mais desatualizados.

import { createAdminClient } from '@/lib/supabase/admin'
import { SIZE_TAG, UA, clean, copyImage, dimsFrom, existingRows, pool, upsertRows } from './sync-utils'

const BASE = 'https://sorteluz.com.br'
const BUDGET_MS = 240_000
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))

// O site responde 500 de forma intermitente quando recebe requisições demais da Vercel: espera e tenta de novo.
async function text(url: string): Promise<string> {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: UA, cache: 'no-store' })
    if (r.ok) { await sleep(120); return r.text() }
    if (![429, 500, 502, 503, 504].includes(r.status)) throw new Error(`${r.status} ${url}`)
    await sleep(1500 * 2 ** i)
  }
  throw new Error(`falhou ${url}`)
}

const unescapeHtml = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<')
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// "REF.: 10672 - SERRA COPO 40MM", "20876 - Painel de LED…", "DESENTUPIDOR TUFÃO 5M - 10615": só o nome.
export function cleanTitle(raw: string, code: string | null): string {
  let t = clean(unescapeHtml(raw))
  t = t.replace(/^(?:ref\.?|cod\.?|c[óo]d\.?)\s*:?\s*/i, '')
  if (code) {
    const c = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    t = t.replace(new RegExp(`^${c}\\s*[-–:]?\\s*`), '').replace(new RegExp(`\\s*[-–]?\\s*(?:ref\\.?|cod\\.?)?\\s*:?\\s*${c}\\s*$`, 'i'), '')
  }
  return clean(t.replace(/^[-–:\s]+|[-–:\s]+$/g, ''))
}

// Modelo do fabricante escrito no nome ('SO-205', 'PXG-401A', 'QH7845 M', 'D625').
export function modelOf(name: string): string | null {
  const m = name.match(/\b((?:SO|PXG|PS|PA|QH|SL|PE|PB|FP)-?\d{2,5}[A-Z]?|D\d{3})\b/)
  return m ? m[1] : null
}

// 'Tam.' do site mistura unidades: '220x220mm', '16X25CM', '2M'. Sem unidade explícita, número grande = mm.
export function sizeDims(size: string | null) {
  const s = size ?? ''
  if (!/\d\s*[x×]\s*\d/i.test(s) && !/Ø|ø/.test(s)) return dimsFrom('', true)
  const nums = (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map(n => parseFloat(n.replace(',', '.')))
  const mm = /mm/i.test(s) || (!/cm/i.test(s) && Math.max(...nums) > 100)
  return dimsFrom(s, mm)
}

export function parseProduct(html: string) {
  const title = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? ''
  const info = unescapeHtml((html.match(/<div class="item-produto descricao-produto">[\s\S]*?<p>([\s\S]*?)<\/p>/)?.[1] ?? '').replace(/<br\s*\/?>/g, '\n'))
  const field = (label: string) => info.match(new RegExp(`${label}\\s*:\\s*([^\\n]+)`, 'i'))?.[1]?.trim() ?? null
  const img = html.match(/<div class="item-produto" id="lightgallery">[\s\S]*?<img src="([^"]+)"/)?.[1] ?? null
  return {
    title: clean(title.replace(/<[^>]+>/g, '')), brand: field('Marca'), code: field('C[óo]d\\.?'), power: field('Pot[êe]ncia'),
    temp: field('Temp\\. de Cor'), size: field('Tam\\.'), volt: field('Tens[ãa]o'), image: img,
  }
}

async function productIds(): Promise<string[]> {
  const ids = new Set<string>()
  // Categorias 1..130 (o site tem ~110) mais as que aparecerem na página inicial.
  const cats = new Set<string>(Array.from({ length: 130 }, (_, i) => String(i + 1)))
  const first = await text(`${BASE}/pesquisa.php`).catch(() => '')
  for (const m of Array.from(first.matchAll(/categoria=(\d+)/g))) cats.add(m[1])
  for (const m of Array.from(first.matchAll(/sobre-produto\.php\?id=(\d+)/g))) ids.add(m[1])
  await pool(Array.from(cats), 2, async c => {
    const h = await text(`${BASE}/pesquisa.php?categoria=${c}`).catch(() => '')
    for (const m of Array.from(h.matchAll(/sobre-produto\.php\?id=(\d+)/g))) ids.add(m[1])
  })
  return Array.from(ids)
}

export async function syncSorteluzCatalog() {
  const started = Date.now()
  const db = createAdminClient()
  const errors: string[] = []
  const ids = await productIds()

  const existing = await existingRows(db, 'sorteluz', 'ref, source_product_id, image_url, source_image_url, updated_at')
  const known = new Map(existing.map(r => [String(r.source_product_id), r]))
  const order = [...ids].sort((a, b) => String(known.get(a)?.updated_at ?? '').localeCompare(String(known.get(b)?.updated_at ?? '')))

  const rows: Record<string, unknown>[] = []
  let done = 0
  let partial = false
  await pool(order, 2, async id => {
    if (Date.now() - started > BUDGET_MS) { partial = true; return }
    try {
      const p = parseProduct(await text(`${BASE}/sobre-produto.php?id=${id}`))
      const code = p.code ? p.code.replace(/\D/g, '') || p.code : null
      const name = cleanTitle(p.title, code)
      if (!name) return
      const prev = known.get(id)
      const src = p.image ? `${BASE}/${p.image}` : null
      const manual = prev?.source_image_url === 'upload'
      let imageUrl: string | null = null
      if (manual) imageUrl = prev!.image_url as string
      else if (src && prev?.image_url?.includes('/storage/v1/') && prev.source_image_url === src + SIZE_TAG) imageUrl = prev.image_url as string
      else if (src) imageUrl = await copyImage(db, src, `sorteluz/${id}.jpg`)
      rows.push({
        source: 'sorteluz', ref: code ?? `site-${id}`, source_product_id: id, name, kind: norm(name).split(/[\s/]+/)[0] || null,
        line: p.brand, model: modelOf(name), variant: [p.power, p.temp, p.volt].filter(Boolean).join(' ') || null,
        product_url: `${BASE}/sobre-produto.php?id=${id}`, image_url: imageUrl, source_image_url: manual ? 'upload' : src ? src + SIZE_TAG : null,
        finishes: [], updated_at: new Date().toISOString(), ...sizeDims(p.size),
      })
      done++
    } catch (e) {
      errors.push(`${id}: ${(e as Error).message}`)
    }
  })

  const saved = await upsertRows(db, rows)
  errors.push(...saved.errors)
  return { products: ids.length, processed: done, refs: saved.count, partial, errors }
}
