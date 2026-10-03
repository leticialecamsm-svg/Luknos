// Peças comuns das sincronizações de catálogo feitas a partir do site do fabricante
// (accord-sync.ts, usina-sync.ts): download, paralelismo e cópia reduzida da foto.

import sharp from 'sharp'
import { createAdminClient } from '@/lib/supabase/admin'

export const BUCKET = 'supplier-catalog'
export const UA = { 'User-Agent': 'Mozilla/5.0 (Luknos catalog sync)' }

// As fotos dos sites chegam a 2 MB: guardamos em JPEG com o lado maior em 640px (~30 KB).
// A marca vai junto da URL de origem; mudar o tamanho força copiar tudo de novo.
export const MAX_SIDE = 640
export const SIZE_TAG = `#w${MAX_SIDE}`

export type AdminDb = ReturnType<typeof createAdminClient>

// fetch que espera e tenta de novo quando o site pede calma (429/503), respeitando Retry-After.
export async function fetchRetry(url: string, tries = 4): Promise<Response> {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: UA, cache: 'no-store' })
    if ((r.status !== 429 && r.status !== 503) || i >= tries - 1) return r
    const wait = Number(r.headers.get('retry-after')) * 1000 || 1500 * 2 ** i
    await new Promise(res => setTimeout(res, Math.min(wait, 8000)))
  }
}

export async function text(url: string) {
  const r = await fetchRetry(url)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.text()
}

export const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

// Executa fn em todos os itens com no máximo `n` em paralelo.
export async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]) }
  }))
  return out
}

// Baixa a foto de `src`, reduz e grava em <pasta>/<nome>.jpg do bucket. Devolve a URL pública
// (com ?v= para furar o cache do navegador) ou null se não deu.
export async function copyImage(db: AdminDb, src: string, path: string): Promise<string | null> {
  const r = await fetchRetry(src)
  if (!r.ok) return null
  const jpg = await sharp(Buffer.from(await r.arrayBuffer()))
    .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer()
  const { error } = await db.storage.from(BUCKET).upload(path, jpg, { contentType: 'image/jpeg', upsert: true })
  if (error) return null
  return `${db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
}

// Medidas do site ('1000X140X100', 'Ø300X110', '25 x 40 cm') em cm. `mm` divide por 10.
export function dimsFrom(text: string, mm: boolean) {
  const nums = (text.match(/\d+(?:[.,]\d+)?/g) ?? []).slice(0, 3).map(n => Math.round(parseFloat(n.replace(',', '.')) * (mm ? 10 : 100)) / 100)
  const d: { altura_cm: number | null; largura_cm: number | null; profundidade_cm: number | null; diametro_cm: number | null } =
    { altura_cm: null, largura_cm: null, profundidade_cm: null, diametro_cm: null }
  if (!nums.length) return d
  if (/[Øø]/.test(text)) { d.diametro_cm = nums[0]; d.altura_cm = nums[1] ?? null }
  else if (nums.length === 3) [d.largura_cm, d.profundidade_cm, d.altura_cm] = nums
  else if (nums.length === 2) [d.largura_cm, d.altura_cm] = nums
  else d.largura_cm = nums[0]
  return d
}

// Grava as linhas em lotes; devolve mensagens de erro (vazio = tudo certo).
export async function upsertRows(db: AdminDb, rows: Record<string, unknown>[]) {
  const errors: string[] = []
  // A mesma ref em dois produtos: fica a última vista (upsert não aceita duplicata no lote).
  const unique = Array.from(new Map(rows.map(r => [r.ref as string, r])).values())
  for (let i = 0; i < unique.length; i += 200) {
    const { error } = await db.from('supplier_catalog_products').upsert(unique.slice(i, i + 200), { onConflict: 'source,ref' })
    if (error) errors.push(error.message)
  }
  return { errors, count: unique.length }
}
