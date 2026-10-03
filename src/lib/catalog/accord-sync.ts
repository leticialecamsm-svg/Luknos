// Sincroniza o catálogo de iluminação do site da Accord (accordiluminacao.com) com
// supplier_catalog_products. Caminho: página de iluminação → páginas de linha (cards
// com id do produto, título e miniatura) → para cada produto, as referências com
// medidas (/ajax/listar_referencias.php) e a página do produto (fotos por acabamento).
// A foto principal é copiada para o bucket 'supplier-catalog'; o resto é só URL.

import { createAdminClient } from '@/lib/supabase/admin'
import { SIZE_TAG, UA, clean, copyImage as copyTo, pool, text, upsertRows } from './sync-utils'

const BASE = 'https://www.accordiluminacao.com'
type Card = { productId: string; href: string; title: string; line: string; thumb: string }
type Finish = { code: string; name: string; url: string }

const cm = (v: unknown) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

function parseCards(html: string, line: string): Card[] {
  const cards: Card[] = []
  const re = /<a href="(\/pt\/produto\/[^"]+)"[^>]*>\s*<img src="\/cdn\/imagens\/produtos\/(\d+)\/thumb\/([^"]+)"[^>]*title="([^"]*)"/g
  for (const m of Array.from(html.matchAll(re))) {
    cards.push({ href: m[1], productId: m[2], thumb: `/cdn/imagens/produtos/${m[2]}/thumb/${m[3]}`, title: clean(m[4]), line })
  }
  return cards
}

function parseFinishes(html: string, productId: string): Finish[] {
  const names = new Map<string, string>()
  for (const m of Array.from(html.matchAll(/>\s*(\d{2})\.\s*([^<]+?)\s*</g))) names.set(m[1], clean(m[2]))
  const seen = new Set<string>()
  const out: Finish[] = []
  const re = new RegExp(`data-imagem="(/cdn/imagens/produtos/${productId}/[^"]*?-(\\d{2})-[a-z0-9-]+\\.(?:png|jpe?g|webp))"`, 'g')
  for (const m of Array.from(html.matchAll(re))) {
    if (seen.has(m[2])) continue
    seen.add(m[2])
    out.push({ code: m[2], name: names.get(m[2]) ?? m[2], url: BASE + m[1] })
  }
  return out
}

async function copyImage(db: ReturnType<typeof createAdminClient>, src: string, productId: string) {
  const url = await copyTo(db, src, `accord/${productId}.jpg`)
  // Versões antigas (PNG/WEBP em tamanho original) deixam de ser usadas.
  if (url) await db.storage.from('supplier-catalog').remove([`accord/${productId}.png`, `accord/${productId}.webp`])
  return url
}

export async function syncAccordCatalog() {
  const db = createAdminClient()
  const home = await text(`${BASE}/pt/iluminacao`)
  const lines = Array.from(new Set(Array.from(home.matchAll(/\/pt\/iluminacao\/([a-z0-9-]+)\/\d+/g), m => m[0])))

  // Um produto pode aparecer em mais de uma linha: fica o primeiro card.
  const cards = new Map<string, Card>()
  for (const cs of await pool(lines, 6, async l => parseCards(await text(BASE + l), l.split('/')[3]))) {
    for (const c of cs) if (!cards.has(c.productId)) cards.set(c.productId, c)
  }

  // Fotos já copiadas: não baixa de novo se a origem não mudou.
  const { data: existing } = await db.from('supplier_catalog_products').select('source_product_id, source_image_url, image_url').eq('source', 'accord')
  const known = new Map((existing ?? []).map(r => [r.source_product_id, r]))

  const rows: Record<string, unknown>[] = []
  const errors: string[] = []
  await pool(Array.from(cards.values()), 6, async c => {
    try {
      const [refs, page] = await Promise.all([
        fetch(`${BASE}/ajax/listar_referencias.php?produto_id=${c.productId}&lang=pt&pais=1`, { headers: UA, cache: 'no-store' }).then(r => r.json()).catch(() => []),
        text(BASE + c.href).catch(() => ''),
      ])
      if (!Array.isArray(refs) || refs.length === 0) return
      const sourceImage = BASE + c.thumb.replace('/thumb/', '/').replace(/-small(\.\w+)$/, '$1')
      const prev = known.get(c.productId)
      // Foto enviada à mão (source_image_url = 'upload') nunca é trocada pela do site.
      const manual = prev?.source_image_url === 'upload'
      // Só reaproveita se já estiver no nosso Storage e a origem não mudou.
      const imageUrl = manual ? prev!.image_url : prev?.image_url?.includes('/storage/v1/') && prev.source_image_url === sourceImage + SIZE_TAG
        ? prev.image_url
        : (await copyImage(db, sourceImage, c.productId)) ?? (await copyImage(db, BASE + c.thumb, c.productId)) ?? sourceImage
      const finishes = page ? parseFinishes(page, c.productId) : []
      for (const r of refs as any[]) {
        const ref = String(r.ref_referencia ?? '').trim()
        if (!ref) continue
        rows.push({
          source: 'accord', ref, source_product_id: c.productId, name: c.title, kind: c.title.split(' ')[0]?.toLowerCase() || null, line: c.line,
          altura_cm: cm(r.altura), largura_cm: cm(r.largura), profundidade_cm: cm(r.profundidade), diametro_cm: cm(r.diametro),
          product_url: BASE + c.href, image_url: imageUrl, source_image_url: manual ? 'upload' : sourceImage + SIZE_TAG, finishes, updated_at: new Date().toISOString(),
        })
      }
    } catch (e) {
      errors.push(`${c.productId}: ${(e as Error).message}`)
    }
  })

  const saved = await upsertRows(db, rows)
  errors.push(...saved.errors)
  return { lines: lines.length, products: cards.size, refs: saved.count, errors }
}
