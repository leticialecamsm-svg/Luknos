// Sincroniza o catálogo do site da Usina Design (usinadesign.com.br) com
// supplier_catalog_products. Caminho: listagem de cada linha (cards de família + tipo, com a
// foto recortada) → página da família, cuja tabela "Códigos da família" traz todos os códigos
// com dimensão e descrição ("Pendente Aivi"). Cada código vira uma ref; a foto é a do cartão
// do tipo (pendente, arandela…), copiada reduzida para o bucket 'supplier-catalog'.
//
// Se o site for grande demais para uma passada (limite de tempo da função), a rodada para
// com partial=true e a próxima continua: fotos já copiadas não são baixadas de novo.

import { createAdminClient } from '@/lib/supabase/admin'
import { SIZE_TAG, clean, copyImage, dimsFrom, existingRows, pool, text, upsertRows } from './sync-utils'

const BASE = 'https://usinadesign.com.br'
const LINHAS = ['decorativo', 'externa', 'fitas-e-fontes', 'legou', 'office-slim', 'perfil']
const BUDGET_MS = 240_000

export type Card = { fam: string; tipo: string; img: string; linha: string }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const unescapeHtml = (s: string) => s.replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
const titleCase = (s: string) => s.replace(/-/g, ' ').replace(/(^|\s)(\S)/g, (_, sp, c) => sp + c.toUpperCase())

function parseCards(html: string, linha: string): Card[] {
  const out: Card[] = []
  const re = /href="https:\/\/usinadesign\.com\.br\/familia\/([a-z0-9-]+)\?tipo=([a-z0-9-]+)"[\s\S]{0,900}?<img src="([^"]+)"/g
  for (const m of Array.from(html.matchAll(re))) out.push({ fam: m[1], tipo: m[2], img: m[3], linha })
  return out
}

// Linhas da tabela "Códigos da família X": [código, dimensão, descrição]. As colunas mudam de
// família para família, então a descrição é a coluna chamada "Descrição" (nem toda tabela tem).
export function parseCodes(html: string): [string, string, string][] {
  const i = html.indexOf('Códigos da família')
  if (i < 0) return []
  const table = html.slice(i, html.indexOf('</table>', i))
  const cell = (h: string) => clean(unescapeHtml(h.replace(/<[^>]+>/g, '')))
  const heads = Array.from(table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g), t => cell(t[1]))
  const descCol = heads.findIndex(h => norm(h) === 'descricao')
  const out: [string, string, string][] = []
  for (const tr of Array.from(table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g))) {
    const tds = Array.from(tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g), t => cell(t[1]))
    if (tds.length >= 2 && tds[0]) out.push([tds[0], tds[1], descCol >= 0 ? tds[descCol] ?? '' : ''])
  }
  return out
}

// Tipo do código pela página dele: "Pegasus · Plafon/Arandela · Decorativo" -> "Plafon/Arandela".
export function tipoDaPagina(html: string, code: string): string | null {
  const lines = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n').split('\n').map(l => clean(unescapeHtml(l))).filter(Boolean)
  for (let j = 0; j < lines.length - 2; j++) {
    if (lines[j] === code && lines[j + 1].endsWith('·') && lines[j + 2].endsWith('·')) return lines[j + 2].replace(/\s*·$/, '')
  }
  return null
}

// Cartão (tipo) que melhor corresponde a um texto de tipo ("Plafon/Arandela", "Pendente Vertical Aivi").
export function pickCard(cards: Card[], text: string): Card | null {
  const slug = norm(text).replace(/[^a-z]/g, '')
  const byLen = [...cards].sort((a, b) => b.tipo.length - a.tipo.length)
  return byLen.find(c => c.tipo.replace(/-/g, '') === slug)
    ?? byLen.find(c => norm(text).startsWith(c.tipo.replace(/-/g, ' ')))
    ?? byLen.find(c => slug.startsWith(c.tipo.replace(/-/g, '')))
    ?? null
}

// Tipo (pendente, arandela, plafon…) a partir do slug do cartão ("pendente-vertical", "plafonarandela").
const KINDS = ['pendente', 'arandela', 'plafon', 'abajur', 'balizador', 'embutido', 'spot', 'coluna', 'poste', 'luminaria', 'trilho', 'perfil', 'fita', 'fonte', 'projetor', 'refletor']
export const kindOf = (tipo: string) => KINDS.find(k => tipo.replace(/-/g, '').startsWith(k)) ?? tipo.split('-')[0]

export async function syncUsinaCatalog() {
  const started = Date.now()
  const db = createAdminClient()
  const errors: string[] = []

  // 1. Famílias e cartões de tipo (cada linha tem várias páginas).
  const fams = new Map<string, { linha: string; cards: Card[] }>()
  for (const linha of LINHAS) {
    const seen = new Set<string>()
    for (let page = 1; page <= 40; page++) {
      let html = ''
      try { html = await text(`${BASE}/catalogo?linha=${linha}${page > 1 ? `&page=${page}` : ''}`) } catch { break }
      const cards = parseCards(html, linha).filter(c => !seen.has(`${c.fam}/${c.tipo}`))
      if (!cards.length) break
      for (const c of cards) {
        seen.add(`${c.fam}/${c.tipo}`)
        const f = fams.get(c.fam) ?? { linha, cards: [] }
        if (!f.cards.some(x => x.tipo === c.tipo)) f.cards.push(c)
        fams.set(c.fam, f)
      }
    }
  }

  // 2. O que já está no banco: foto enviada à mão fica; foto copiada e igual não é baixada de novo.
  const existing = await existingRows(db, 'usina', 'ref, image_url, source_image_url, line, updated_at')
  const known = new Map(existing.map(r => [r.ref as string, r]))
  const copied = new Map<string, string | null>() // fam/tipo -> URL no nosso Storage

  // O site limita requisições: se uma rodada não der conta de tudo, a próxima começa pelas
  // famílias mais desatualizadas (as nunca vistas primeiro), e várias rodadas cobrem o catálogo.
  const lastSeen = new Map<string, string>()
  for (const r of existing) {
    const k = norm(String(r.line ?? '')).replace(/ /g, '-')
    if (!lastSeen.has(k) || String(r.updated_at) < lastSeen.get(k)!) lastSeen.set(k, String(r.updated_at))
  }
  const order = Array.from(fams.entries()).sort((a, b) => (lastSeen.get(a[0]) ?? '').localeCompare(lastSeen.get(b[0]) ?? ''))

  const rows: Record<string, unknown>[] = []
  let done = 0
  let partial = false
  await pool(order, 2, async ([fam, f]) => {
    if (Date.now() - started > BUDGET_MS) { partial = true; return }
    try {
      const codes = parseCodes(await text(`${BASE}/familia/${fam}?tipo=${f.cards[0].tipo}`))
      // Códigos sem descrição herdam a de um irmão do mesmo modelo (mesmo número antes do traço).
      const blank = (d: string) => !d || /^[—–-]+$/.test(d)
      const model = (code: string) => code.split('-')[0]
      const sibling = new Map<string, string>()
      for (const [code, , desc] of codes) if (!blank(desc) && !sibling.has(model(code))) sibling.set(model(code), desc)
      // Família com vários tipos e sem descrição: pergunta o tipo à página de um código por modelo.
      const tipoDoModelo = new Map<string, Card>()
      if (f.cards.length > 1) {
        for (const [code, , desc] of codes) {
          const m = model(code)
          if (!blank(desc) || sibling.has(m) || tipoDoModelo.has(m)) continue
          const tipo = tipoDaPagina(await text(`${BASE}/codigo/${encodeURIComponent(code)}`).catch(() => ''), code)
          tipoDoModelo.set(m, (tipo && pickCard(f.cards, tipo)) || f.cards[0])
        }
      }
      for (const [code, dim, rawDesc] of codes) {
        const desc = blank(rawDesc) ? sibling.get(model(code)) ?? '' : rawDesc
        const card = (desc && pickCard(f.cards, desc)) || tipoDoModelo.get(model(code)) || f.cards[0]
        const name = desc || `${titleCase(card.tipo)} ${titleCase(fam)}`
        const key = `${fam}/${card.tipo}`
        const src = BASE + card.img
        const prev = known.get(code)
        const manual = prev?.source_image_url === 'upload'
        let imageUrl: string | null
        if (manual) imageUrl = prev!.image_url as string
        else if (prev?.image_url?.includes('/storage/v1/') && prev.source_image_url === src + SIZE_TAG) imageUrl = prev.image_url as string
        else {
          if (!copied.has(key)) copied.set(key, await copyImage(db, src, `usina/${fam}-${card.tipo}.jpg`))
          imageUrl = copied.get(key) ?? null
        }
        rows.push({
          source: 'usina', ref: code, source_product_id: key, name, kind: kindOf(card.tipo),
          line: titleCase(fam), model: code, product_url: `${BASE}/codigo/${encodeURIComponent(code)}`,
          image_url: imageUrl, source_image_url: manual ? 'upload' : src + SIZE_TAG, finishes: [], updated_at: new Date().toISOString(),
          ...dimsFrom(dim, true),
        })
      }
      done++
    } catch (e) {
      errors.push(`${fam}: ${(e as Error).message}`)
    }
  })

  const saved = await upsertRows(db, rows)
  errors.push(...saved.errors)
  return { families: fams.size, processed: done, refs: saved.count, partial, errors }
}

