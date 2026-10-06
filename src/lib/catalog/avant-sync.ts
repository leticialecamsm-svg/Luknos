// Sincroniza o catálogo do site da Avant (avantlux.com.br, WooCommerce) com supplier_catalog_products.
// Caminho: listagem /produtos/ (18 famílias por página) → página da família, que traz o nome, a foto
// principal (og:image, recortada) e uma galeria cujas imagens têm no nome do arquivo o código de 9
// dígitos e a descrição do ERP ('297057846-LED-FITA-INT-RISQUE-TRIO-IP20-40WM-5M-RGB-24V'), o mesmo
// formato das notas de compra. Cada família vira uma linha ('fam-<slug>') e cada código da galeria,
// outra, com a foto dele.
//
// Retomável como as outras: se não der conta em uma rodada, a próxima começa pelos mais desatualizados.

import { createAdminClient } from '@/lib/supabase/admin'
import { SIZE_TAG, UA, clean, copyImage, existingRows, pool, upsertRows } from './sync-utils'

const BASE = 'https://avantlux.com.br'
const BUDGET_MS = 240_000
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const unescapeHtml = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&#8217;/g, "'").replace(/&#8211;/g, '–').replace(/&gt;/g, '>').replace(/&lt;/g, '<')

async function text(url: string): Promise<string> {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: UA, cache: 'no-store' })
    if (r.ok) { await sleep(100); return r.text() }
    if (![429, 500, 502, 503, 504].includes(r.status)) throw new Error(`${r.status} ${url}`)
    await sleep(1500 * 2 ** i)
  }
  throw new Error(`falhou ${url}`)
}

export type AvantErp = { code: string; erp: string; url: string }

// Imagens da galeria com código no nome: '.../2024/08/297057846-LED-FITA-INT-RISQUE-TRIO-…-e172381-1-300x300.png'.
// Devolve o original (sem o sufixo de tamanho do WordPress).
export function parseGallery(html: string): AvantErp[] {
  const out = new Map<string, AvantErp>()
  const re = /(https?:\/\/[^"'\s)]*\/uploads\/\d{4}\/\d{2}\/)(\d{9})-([A-Za-z0-9-]+?)((?:-e\d{9,})?(?:-\d{1,2})?)(-\d+x\d+)?\.(png|jpe?g|webp)/g
  for (const m of Array.from(html.matchAll(re))) {
    const code = m[2]
    const erp = m[3].replace(/-\d+x\d+$/, '')
    if (!out.has(code)) out.set(code, { code, erp, url: `${m[1]}${m[2]}-${m[3]}${m[4]}.${m[6]}` })
  }
  return Array.from(out.values())
}

export function parseFamily(html: string) {
  const title = clean(unescapeHtml((html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '').replace(/\s*[-–|]\s*Avant\s*$/i, '')))
  const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? null
  const spec = (label: string) => clean(unescapeHtml(html.match(new RegExp(`${label}\\s*</[^>]+>\\s*(?:<[^>]+>\\s*)*([^<]{1,60})`, 'i'))?.[1] ?? '')) || null
  return { title, image: og, power: spec('Pot[êe]ncia'), temp: spec('Temp\\. de Cor'), erp: parseGallery(html) }
}

async function familySlugs(): Promise<string[]> {
  const slugs = new Set<string>()
  for (let n = 1; n <= 40; n++) {
    const h = await text(n === 1 ? `${BASE}/produtos/` : `${BASE}/produtos/page/${n}/`).catch(() => '')
    const found = Array.from(h.matchAll(/href="https:\/\/avantlux\.com\.br\/produtos\/([a-z0-9-]+)\/"/g), m => m[1]).filter(s => !slugs.has(s))
    if (!found.length) break
    found.forEach(s => slugs.add(s))
  }
  return Array.from(slugs)
}

export async function syncAvantCatalog() {
  const started = Date.now()
  const db = createAdminClient()
  const errors: string[] = []
  const slugs = await familySlugs()

  const existing = await existingRows(db, 'avant', 'ref, source_product_id, image_url, source_image_url, updated_at')
  const known = new Map(existing.map(r => [String(r.ref), r]))
  const order = [...slugs].sort((a, b) => String(known.get(`fam-${a}`)?.updated_at ?? '').localeCompare(String(known.get(`fam-${b}`)?.updated_at ?? '')))

  const rows: Record<string, unknown>[] = []
  let done = 0
  let partial = false
  await pool(order, 4, async slug => {
    if (Date.now() - started > BUDGET_MS) { partial = true; return }
    try {
      const f = parseFamily(await text(`${BASE}/produtos/${slug}/`))
      if (!f.title) return
      const kind = norm(f.title).split(/[\s/]+/)[0] || null
      const photo = async (ref: string, src: string | null, file: string) => {
        const prev = known.get(ref)
        if (prev?.source_image_url === 'upload') return { url: prev.image_url as string, src: 'upload' }
        if (!src) return { url: null as string | null, src: null as string | null }
        if (prev?.image_url?.includes('/storage/v1/') && prev.source_image_url === src + SIZE_TAG) return { url: prev.image_url as string, src: src + SIZE_TAG }
        return { url: await copyImage(db, src, `avant/${file}.jpg`), src: src + SIZE_TAG }
      }
      const fam = await photo(`fam-${slug}`, f.image, `fam-${slug}`)
      const base = { source: 'avant', kind, finishes: [], updated_at: new Date().toISOString(), product_url: `${BASE}/produtos/${slug}/` }
      rows.push({ ...base, ref: `fam-${slug}`, source_product_id: slug, name: f.title, line: null, model: null, variant: [f.power, f.temp].filter(Boolean).join(' ') || null, image_url: fam.url, source_image_url: fam.src })
      // As fotos dos códigos da família são copiadas juntas (cada uma é um PNG grande a reduzir).
      const erpRows = await Promise.all(f.erp.map(async e => {
        const p = await photo(e.code, e.url, e.code)
        return { ...base, ref: e.code, source_product_id: slug, name: e.erp.replace(/-/g, ' '), line: f.title, model: e.code, variant: null, image_url: p.url ?? fam.url, source_image_url: p.url ? p.src : fam.src }
      }))
      rows.push(...erpRows)
      done++
    } catch (err) {
      errors.push(`${slug}: ${(err as Error).message}`)
    }
  })

  const saved = await upsertRows(db, rows)
  errors.push(...saved.errors)
  return { families: slugs.length, processed: done, refs: saved.count, partial, errors }
}
