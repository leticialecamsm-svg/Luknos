// Sincroniza o catálogo do site da Blumenau (blumenauiluminacao.com.br) com supplier_catalog_products.
// Caminho: páginas de categoria (com paginação) → links /produtos/detalhes/<slug> (um por variação de cor) →
// página da variação, que traz nome, SKU ('102800-01' ou '12143001', os mesmos códigos da nota), tensão,
// temperatura, medidas e a foto (og:image 800x800). A foto é copiada reduzida para o bucket 'supplier-catalog'.
//
// Substitui, onde o SKU coincide, as linhas vindas do catálogo PDF (as fotos do site são melhores); o que só
// existe no PDF continua valendo. Retomável: a próxima rodada começa pelas variações mais desatualizadas.

import { createAdminClient } from '@/lib/supabase/admin'
import { SIZE_TAG, UA, clean, copyImage, dimsFrom, existingRows, pool, upsertRows } from './sync-utils'

const BASE = 'https://blumenauiluminacao.com.br'
const BUDGET_MS = 240_000
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const unescapeHtml = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&gt;/g, '>').replace(/&lt;/g, '<')

async function text(url: string): Promise<string> {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: UA, cache: 'no-store' })
    if (r.ok) { await sleep(80); return r.text() }
    if (![429, 500, 502, 503, 504].includes(r.status)) throw new Error(`${r.status} ${url}`)
    await sleep(1500 * 2 ** i)
  }
  throw new Error(`falhou ${url}`)
}

const KIND_WORDS: [RegExp, string][] = [
  [/arandela/, 'arandela'], [/pendente/, 'pendente'], [/plafon/, 'plafon'], [/balizador/, 'balizador'], [/espeto/, 'espeto'], [/spot/, 'spot'],
  [/painel/, 'painel'], [/refletor|projetor/, 'refletor'], [/fita/, 'fita'], [/driver|fonte/, 'driver'], [/lampada|bulbo|filamento/, 'lampada'],
  [/perfil/, 'perfil'], [/trilho/, 'trilho'], [/luminaria/, 'luminaria'], [/lustre/, 'lustre'], [/abajur/, 'abajur'], [/poste/, 'poste'],
]
export const kindOf = (name: string) => KIND_WORDS.find(([re]) => re.test(norm(name)))?.[1] ?? null

// $scope.product = JSON.parse("{...}") — o literal é uma string JS (aceita \' que o JSON não aceita).
export function parseProduct(html: string) {
  const lit = html.match(/\$scope\.product = JSON\.parse\(("(?:[^"\\]|\\.)*")\)/)?.[1]
  if (!lit) return null
  try {
    const p = JSON.parse(JSON.parse(lit.replace(/\\'/g, "'"))) as Record<string, string | null>
    const feat = (label: string) => {
      const m = (p.Caracteristicas ?? '').match(new RegExp(`${label}[^<]*:</td><td[^>]*>([^<]*)`, 'i'))
      return m ? clean(unescapeHtml(m[1])) : null
    }
    return {
      name: clean(unescapeHtml(p.Nome ?? '')), sku: (p.Sku ?? '').trim(), volt: p.Tensao, temp: p.Temperatura,
      power: feat('Pot[êe]ncia'), dims: feat('Dimens[õo]es'), image: html.match(/og:image" content="([^"]+)/)?.[1] ?? null,
    }
  } catch { return null }
}

// '217,00 x 290,00 x 154,00 (Comp. x Alt. x Larg.)' em mm → medidas em cm.
export function dimsOf(s: string | null) {
  const m = s?.match(/([\d.,]+)\s*x\s*([\d.,]+)(?:\s*x\s*([\d.,]+))?/i)
  if (!m) return dimsFrom('', true)
  const n = [m[1], m[2], m[3]].filter(Boolean).map(x => parseFloat(x.replace(/\./g, '').replace(',', '.')))
  const d = dimsFrom(n.join('x'), true)
  if (n.length === 3 && /Comp\.\s*x\s*Alt\.\s*x\s*Larg/i.test(s ?? '')) {
    const cm = (v: number) => Math.round(v) / 10
    return { largura_cm: cm(n[0]), altura_cm: cm(n[1]), profundidade_cm: cm(n[2]), diametro_cm: null }
  }
  return d
}

async function productSlugs(): Promise<string[]> {
  const home = await text(`${BASE}/`).catch(() => '')
  const cats = Array.from(new Set(Array.from(home.matchAll(/href="https:\/\/blumenauiluminacao\.com\.br\/(produtos\/[a-z0-9-]+)\/?"/g), m => m[1])))
  const slugs = new Set<string>()
  await pool(cats, 8, async c => {
    for (let p = 1; p < 40; p++) {
      const h = await text(`${BASE}/${c}${p === 1 ? '' : `/${p}`}`).catch(() => '')
      const found = Array.from(h.matchAll(/\/produtos\/detalhes\/([a-z0-9-]+)\/?"/g), m => m[1])
      const fresh = found.filter(s => !slugs.has(s))
      found.forEach(s => slugs.add(s))
      if (!found.length || (p > 1 && !fresh.length)) break
    }
  })
  return Array.from(slugs)
}

export async function syncBlumenauCatalog() {
  const started = Date.now()
  const db = createAdminClient()
  const errors: string[] = []
  const slugs = await productSlugs()

  const existing = await existingRows(db, 'blumenau', 'ref, source_product_id, image_url, source_image_url, updated_at')
  const bySlug = new Map(existing.filter(r => r.source_product_id).map(r => [String(r.source_product_id), r]))
  const order = [...slugs].sort((a, b) => String(bySlug.get(a)?.updated_at ?? '').localeCompare(String(bySlug.get(b)?.updated_at ?? '')))

  const rows: Record<string, unknown>[] = []
  let partial = false
  await pool(order, 8, async slug => {
    if (Date.now() - started > BUDGET_MS) { partial = true; return }
    try {
      const p = parseProduct(await text(`${BASE}/produtos/detalhes/${slug}/`))
      if (!p || !p.sku || !p.name) return
      const prev = existing.find(r => r.ref === p.sku)
      let imageUrl: string | null = null
      let srcTag: string | null = null
      if (prev?.source_image_url === 'upload') { imageUrl = prev.image_url as string; srcTag = 'upload' }
      else if (p.image && prev?.image_url?.includes('/storage/v1/') && prev.source_image_url === p.image + SIZE_TAG) { imageUrl = prev.image_url as string; srcTag = p.image + SIZE_TAG }
      else if (p.image) { imageUrl = await copyImage(db, p.image, `blumenau/site-${p.sku}.jpg`); srcTag = imageUrl ? p.image + SIZE_TAG : null }
      rows.push({
        source: 'blumenau', ref: p.sku, source_product_id: slug, name: p.name, kind: kindOf(p.name), line: null, model: p.sku,
        variant: [p.power, p.volt, p.temp].filter(Boolean).join(' ') || null, product_url: `${BASE}/produtos/detalhes/${slug}/`,
        image_url: imageUrl, source_image_url: srcTag, finishes: [], updated_at: new Date().toISOString(), ...dimsOf(p.dims),
      })
    } catch (e) {
      errors.push(`${slug}: ${(e as Error).message}`)
    }
  })

  const saved = await upsertRows(db, rows)
  errors.push(...saved.errors)
  return { products: slugs.length, processed: rows.length, refs: saved.count, partial, errors }
}
