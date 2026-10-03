// Liga um item de nota de compra a uma referência do catálogo do fornecedor.
// Ordem: escolha manual → código do produto no XML (Accord '1145A.48' = ref 1145,
// acabamento 48; Hevvy pode vir Ref, EAN ou modelo) → "REF 1432" na descrição →
// código de modelo na descrição (Hevvy 'SL-5910L W2 BK') → nome + medidas (só sugestão).

// Fornecedores com catálogo de fotos e a origem de cada um.
export function catalogSourceFor(supplierName: string): 'accord' | 'hevvy' | null {
  const n = normText(supplierName)
  return n.includes('accord') ? 'accord' : n.includes('hevvy') ? 'hevvy' : null
}

export type CatalogFinish = { code: string; name: string; url: string }
export type CatalogEntry = {
  ref: string; name: string; kind: string | null; line: string | null
  altura_cm: number | null; largura_cm: number | null; profundidade_cm: number | null; diametro_cm: number | null
  product_url: string | null; image_url: string | null; source_image_url: string | null; finishes: CatalogFinish[]
  model?: string | null; ean?: string | null
}
export type ItemPhoto = {
  ref: string; name: string; image_url: string | null; product_url: string | null
  finish: CatalogFinish | null; dims: string; model: string | null
  match: 'manual' | 'codigo' | 'descricao' | 'nome'
}

const KINDS = ['pendente', 'arandela', 'abajur', 'coluna', 'plafon', 'luminaria', 'spot', 'balizador', 'trilho', 'mesa']
const STOP = new Set(['accord', 'hevvy', 'iluminacao', 'linha', 'led', 'gold', 'gol', 'sand', 'black', 'white', 'smoky', 'amber', 'bk', 'gd', 'de', 'com', 'em', 'para', 'the', 'e27', 'g9', 'gu10', 'cm', 'mm', 'bivolt'])

// Cores escritas na nota ou no fim do código de modelo, numa chave só.
const COLORS: [RegExp, string][] = [
  [/^(bk|black|preto|preta)$/, 'bk'], [/^(gd|gold|gol|dourado|dourada)$/, 'gd'], [/^(wh|white|branco|branca)$/, 'wh'],
  [/^(smo|smoky|fume)$/, 'smo'], [/^(amb|amber|ambar)$/, 'amb'], [/^(chr|chrome|cromado|cromada)$/, 'chr'],
]
const colorKey = (w: string) => COLORS.find(([re]) => re.test(w))?.[1] ?? null
const descColors = (desc: string) => new Set(normText(desc).split(/[^a-z]+/).map(colorKey).filter((c): c is string => !!c))
const compact = (s: string) => normText(s).replace(/[^a-z0-9]/g, '')

// 'SL-5910L/W2 BK' -> base 'sl5910lw2', cor 'bk'; 'PZ-002/80WL1 GD+BK' -> cor 'gd+bk'
function splitModel(model: string) {
  const m = model.trim().match(/^(.*\S)\s+([A-Za-z+]{2,8})$/)
  if (!m) return { base: compact(model), color: null as string | null }
  const parts = m[2].split('+').map(p => colorKey(normText(p)))
  return parts.every(Boolean) ? { base: compact(m[1]), color: parts.join('+') } : { base: compact(model), color: null }
}

function colorScore(c: CatalogEntry, want: Set<string>) {
  const color = c.model ? splitModel(c.model).color : null
  if (!color || !want.size) return 0
  const parts = color.split('+')
  return parts.every(p => want.has(p)) && parts.length === want.size ? 2 : parts.every(p => want.has(p)) ? 1 : -1
}

// Código de modelo dentro do texto: fica com a base mais longa e desempata pela cor.
function matchModel(text: string, catalog: CatalogEntry[]) {
  const t = compact(text)
  let best: { c: CatalogEntry; len: number; color: number } | null = null
  const want = descColors(text)
  for (const c of catalog) {
    if (!c.model) continue
    const { base } = splitModel(c.model)
    if (base.length < 5 || !t.includes(base)) continue
    const color = colorScore(c, want)
    if (!best || base.length > best.len || (base.length === best.len && color > best.color)) best = { c, len: base.length, color }
  }
  return best?.c ?? null
}

export const normText = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function catalogDims(c: Pick<CatalogEntry, 'altura_cm' | 'largura_cm' | 'profundidade_cm' | 'diametro_cm'>) {
  return [c.largura_cm, c.profundidade_cm, c.altura_cm, c.diametro_cm].filter((n): n is number => n != null && n > 0)
}

export function dimsLabel(c: CatalogEntry) {
  const p: string[] = []
  if (c.diametro_cm) p.push(`Ø${c.diametro_cm}`)
  if (c.largura_cm) p.push(`L${c.largura_cm}`)
  if (c.profundidade_cm) p.push(`P${c.profundidade_cm}`)
  if (c.altura_cm) p.push(`A${c.altura_cm}`)
  return p.length ? p.join(' × ') + ' cm' : ''
}

// Medidas escritas na descrição: '150X20X18', '22X50', '43CM', '33X9,5X34'.
export function descDims(desc: string) {
  const out: number[] = []
  for (const m of Array.from(desc.toUpperCase().matchAll(/\d+(?:[.,]\d+)?(?:\s*X\s*\d+(?:[.,]\d+)?)+|\b\d+(?:[.,]\d+)?\s*CM\b/g))) {
    for (const n of m[0].match(/\d+(?:[.,]\d+)?/g) ?? []) out.push(parseFloat(n.replace(',', '.')))
  }
  return out
}

// Erro relativo médio entre as medidas da nota e as do catálogo (ordem não importa).
function dimError(want: number[], have: number[]) {
  if (!want.length || !have.length) return null
  const pool = [...have]
  let sum = 0
  for (const w of want) {
    if (!pool.length) { sum += 1; continue }
    let best = 0
    for (let k = 1; k < pool.length; k++) if (Math.abs(pool[k] - w) < Math.abs(pool[best] - w)) best = k
    sum += Math.abs(pool[best] - w) / Math.max(w, pool[best])
    pool.splice(best, 1)
  }
  return sum / want.length
}

function words(s: string) {
  return normText(s).split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !/^\d/.test(w) && !STOP.has(w))
}

function toPhoto(c: CatalogEntry, match: ItemPhoto['match'], finishCode?: string | null): ItemPhoto {
  const finish = finishCode ? c.finishes.find(f => f.code === finishCode.padStart(2, '0')) ?? null : null
  return { ref: c.ref, name: c.name, image_url: c.image_url, product_url: c.product_url, finish, dims: dimsLabel(c), model: c.model ?? null, match }
}

export function matchCatalog(
  item: { codigo_produto?: string | null; descricao: string; catalog_ref?: string | null },
  catalog: CatalogEntry[],
  byRef: Map<string, CatalogEntry> = new Map(catalog.map(c => [c.ref, c])),
): ItemPhoto | null {
  if (item.catalog_ref === '-') return null
  if (item.catalog_ref) { const c = byRef.get(item.catalog_ref); if (c) return toPhoto(c, 'manual') }

  const cod = (item.codigo_produto ?? '').trim()
  if (/^\d{13}$/.test(cod)) { const c = catalog.find(x => x.ean === cod); if (c) return toPhoto(c, 'codigo') }
  const code = cod.match(/^(\d{3,5})[A-Z]*(?:\.(\d{1,3}))?$/i)
  if (code) { const c = byRef.get(code[1]); if (c) return toPhoto(c, 'codigo', code[2]) }
  if (cod && !code) { const c = matchModel(`${cod} ${item.descricao}`, catalog); if (c) return toPhoto(c, 'codigo') }

  const inDesc = item.descricao.match(/\bREF\b[\s.:]*(\d{3,5})/i)
  if (inDesc) { const c = byRef.get(inDesc[1]); if (c) return toPhoto(c, 'descricao') }

  const byModel = matchModel(item.descricao, catalog)
  if (byModel) return toPhoto(byModel, 'descricao')

  // Nome + medidas: precisa bater o tipo (pendente, arandela…) e ao menos uma palavra do nome.
  const w = words(item.descricao)
  const kind = w.find(x => KINDS.includes(x)) ?? null
  const terms = w.filter(x => !KINDS.includes(x))
  if (!terms.length) return null
  const want = descDims(item.descricao)
  const colors = descColors(item.descricao)
  let best: { c: CatalogEntry; hits: number; err: number | null; color: number } | null = null
  for (const c of catalog) {
    if (kind && c.kind && normText(c.kind) !== kind) continue
    const hay = new Set(words(`${c.name} ${c.line ?? ''} ${(c.source_image_url ?? '').split('/').pop() ?? ''}`))
    const hits = terms.filter(t => hay.has(t)).length
    if (!hits) continue
    const err = dimError(want, catalogDims(c))
    const color = colorScore(c, colors)
    const better = !best || hits > best.hits || (hits === best.hits && ((err ?? 1) < (best.err ?? 1) || ((err ?? 1) === (best.err ?? 1) && color > best.color)))
    if (better) best = { c, hits, err, color }
  }
  if (!best) return null
  // Medidas na nota e no catálogo: só aceita se baterem (até ~12% de diferença média).
  // Catálogo sem medidas (Hevvy) fica pelo nome e pela cor.
  if (want.length && best.err != null && best.err > 0.12) return null
  return toPhoto(best.c, 'nome')
}
