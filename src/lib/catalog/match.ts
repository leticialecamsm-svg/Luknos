// Liga um item de nota de compra a uma referência do catálogo do fornecedor.
// Ordem: escolha manual → código do produto no XML (ex.: '1145A.48' = ref 1145,
// acabamento 48) → "REF 1432" na descrição → nome + medidas (só sugestão).

export type CatalogFinish = { code: string; name: string; url: string }
export type CatalogEntry = {
  ref: string; name: string; kind: string | null; line: string | null
  altura_cm: number | null; largura_cm: number | null; profundidade_cm: number | null; diametro_cm: number | null
  product_url: string | null; image_url: string | null; source_image_url: string | null; finishes: CatalogFinish[]
}
export type ItemPhoto = {
  ref: string; name: string; image_url: string | null; product_url: string | null
  finish: CatalogFinish | null; dims: string
  match: 'manual' | 'codigo' | 'descricao' | 'nome'
}

const KINDS = ['pendente', 'arandela', 'abajur', 'coluna', 'plafon', 'luminaria', 'spot', 'balizador', 'trilho', 'mesa']
const STOP = new Set(['accord', 'iluminacao', 'linha', 'led', 'gold', 'black', 'white', 'bk', 'gd', 'de', 'com', 'para', 'the', 'e27', 'g9', 'gu10', 'cm', 'mm'])

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
  return { ref: c.ref, name: c.name, image_url: c.image_url, product_url: c.product_url, finish, dims: dimsLabel(c), match }
}

export function matchCatalog(
  item: { codigo_produto?: string | null; descricao: string; catalog_ref?: string | null },
  catalog: CatalogEntry[],
  byRef: Map<string, CatalogEntry> = new Map(catalog.map(c => [c.ref, c])),
): ItemPhoto | null {
  if (item.catalog_ref === '-') return null
  if (item.catalog_ref) { const c = byRef.get(item.catalog_ref); if (c) return toPhoto(c, 'manual') }

  const code = (item.codigo_produto ?? '').trim().match(/^(\d{3,5})[A-Z]*(?:\.(\d{1,3}))?/i)
  if (code) { const c = byRef.get(code[1]); if (c) return toPhoto(c, 'codigo', code[2]) }

  const inDesc = item.descricao.match(/\bREF\b[\s.:]*(\d{3,5})/i)
  if (inDesc) { const c = byRef.get(inDesc[1]); if (c) return toPhoto(c, 'descricao') }

  // Nome + medidas: precisa bater o tipo (pendente, arandela…) e ao menos uma palavra do nome.
  const w = words(item.descricao)
  const kind = w.find(x => KINDS.includes(x)) ?? null
  const terms = w.filter(x => !KINDS.includes(x))
  if (!terms.length) return null
  const want = descDims(item.descricao)
  let best: { c: CatalogEntry; hits: number; err: number | null } | null = null
  for (const c of catalog) {
    if (kind && c.kind && normText(c.kind) !== kind) continue
    const hay = new Set(words(`${c.name} ${c.line ?? ''} ${(c.source_image_url ?? '').split('/').pop() ?? ''}`))
    const hits = terms.filter(t => hay.has(t)).length
    if (!hits) continue
    const err = dimError(want, catalogDims(c))
    const better = !best || hits > best.hits || (hits === best.hits && (err ?? 1) < (best.err ?? 1))
    if (better) best = { c, hits, err }
  }
  if (!best) return null
  // Com medidas na nota, só aceita se baterem (até ~12% de diferença média).
  if (want.length && (best.err == null || best.err > 0.12)) return null
  return toPhoto(best.c, 'nome')
}
