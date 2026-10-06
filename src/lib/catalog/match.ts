// Liga um item de nota de compra a uma referência do catálogo do fornecedor.
// Ordem: escolha manual → código do produto no XML (Accord '1145A.48' = ref 1145,
// acabamento 48; outros: ref, modelo ou EAN) → "REF 1432" na descrição → código escrito na
// descrição (Spotline '1096/1', Skylight 'SKY-4122M', Hevvy 'SL-5910L W2 BK') →
// nome + medidas (só sugestão).

// Fornecedores com catálogo completo e a origem de cada um (os demais só têm fotos enviadas).
export type CatalogSource = 'accord' | 'hevvy' | 'skylight' | 'spotline' | 'usina' | 'pix' | 'lumi' | 'sorteluz'
const SOURCES: CatalogSource[] = ['accord', 'hevvy', 'skylight', 'spotline', 'usina', 'pix', 'sorteluz']
export function catalogSourceFor(supplierName: string): CatalogSource | null {
  const n = normText(supplierName)
  if (n.includes('luminatti')) return 'lumi' // catálogo LUMI_CATALOGO_2026
  return SOURCES.find(s => n.includes(s)) ?? null
}
// Os que o sistema relê sozinho do site (os outros vêm de PDF, importado por script).
export const AUTO_SYNC_SOURCES: CatalogSource[] = ['accord', 'usina', 'sorteluz']

export type CatalogFinish = { code: string; name: string; url: string }
export type CatalogEntry = {
  ref: string; name: string; kind: string | null; line: string | null
  altura_cm: number | null; largura_cm: number | null; profundidade_cm: number | null; diametro_cm: number | null
  product_url: string | null; image_url: string | null; source_image_url: string | null; finishes: CatalogFinish[]
  model?: string | null; ean?: string | null; variant?: string | null
}
export type ItemPhoto = {
  ref: string; name: string; image_url: string | null; product_url: string | null
  finish: CatalogFinish | null; dims: string; model: string | null
  generic?: boolean // foto ilustrativa do tipo de produto (ex.: fita de LED), não do produto
  match: 'manual' | 'codigo' | 'descricao' | 'nome'
}

const KINDS = ['pendente', 'arandela', 'abajur', 'coluna', 'plafon', 'luminaria', 'spot', 'balizador', 'trilho', 'mesa']
const STOP = new Set(['accord', 'hevvy', 'iluminacao', 'linha', 'led', 'gold', 'gol', 'sand', 'black', 'white', 'smoky', 'amber', 'bk', 'gd', 'de', 'com', 'em', 'para', 'the', 'e27', 'g9', 'gu10', 'cm', 'mm', 'bivolt', 'fcp', 'st', 'bc', 'vr', 'mt'])

// Cores escritas na nota ou no fim do código de modelo, numa chave só.
const COLORS: [RegExp, string][] = [
  [/^(bk|black|preto|preta)$/, 'bk'], [/^(gd|gold|gol|dourado|dourada)$/, 'gd'], [/^(wh|white|branco|branca)$/, 'wh'],
  [/^(smo|smoky|fume)$/, 'smo'], [/^(amb|amber|ambar)$/, 'amb'], [/^(chr|chrome|cromado|cromada)$/, 'chr'],
]
const colorKey = (w: string) => COLORS.find(([re]) => re.test(w))?.[1] ?? null
const descColors = (desc: string) => {
  const set = new Set(normText(desc).split(/[^a-z]+/).map(colorKey).filter((c): c is string => !!c))
  // Abreviações da Luminatti: 'PT/PT', 'BC/BC', '... IRC 90 PT'. 'BC=' é base de cálculo de imposto, não cor.
  for (const m of Array.from(desc.toUpperCase().matchAll(/\b(PT|BC)\b(?!\s*=)/g))) set.add(m[1] === 'PT' ? 'bk' : 'wh')
  return set
}
const compact = (s: string) => normText(s).replace(/[^a-z0-9]/g, '')

// 'SL-5910L/W2 BK' -> base 'sl5910lw2', cor 'bk'; 'PZ-002/80WL1 GD+BK' -> cor 'gd+bk'
function splitModel(model: string) {
  const m = model.trim().match(/^(.*\S)\s+([A-Za-z+]{2,8})$/)
  if (!m) return { base: compact(model), color: null as string | null }
  const parts = m[2].split('+').map(p => colorKey(normText(p)))
  return parts.every(Boolean) ? { base: compact(m[1]), color: parts.join('+') } : { base: compact(model), color: null }
}

function colorScore(c: CatalogEntry, want: Set<string>) {
  if (!want.size) return 0
  const color = c.model ? splitModel(c.model).color : null
  if (color) {
    const parts = color.split('+')
    return parts.every(p => want.has(p)) && parts.length === want.size ? 2 : parts.every(p => want.has(p)) ? 1 : -1
  }
  // Sem cor no código: vale a cor do catálogo ('BRANCO', ou 'PRETO, BRANCO, DOURADO' quando há várias).
  const have = c.variant ? descColors(c.variant) : new Set<string>()
  if (!have.size) return 0
  const wanted = Array.from(want)
  return wanted.every(w => have.has(w)) ? (have.size === want.size ? 2 : 1) : -1
}

// Índice código -> produto (ref e modelo, sem espaços e em maiúsculas), uma vez por catálogo.
const codeIndexes = new WeakMap<CatalogEntry[], Map<string, CatalogEntry>>()
const codeKey = (s: string) => s.toUpperCase().replace(/\s+/g, '')
function codeIndex(catalog: CatalogEntry[]) {
  let idx = codeIndexes.get(catalog)
  if (!idx) {
    idx = new Map()
    for (const c of catalog) for (const k of [c.ref, c.model]) if (k && !idx.has(codeKey(k))) idx.set(codeKey(k), c)
    codeIndexes.set(catalog, idx)
  }
  return idx
}

// Código escrito na descrição que é exatamente a ref/modelo de um produto. Só vale token que
// tenha letra, barra ou traço junto com número (não "1500" solto, que pode ser lúmens).
function matchCodeToken(text: string, catalog: CatalogEntry[]) {
  const idx = codeIndex(catalog)
  for (const raw of text.toUpperCase().split(/[\s,;()[\]]+/)) {
    const t = raw.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, '')
    if (t.length < 4 || !/\d/.test(t) || /^\d+$/.test(t)) continue
    const c = idx.get(t)
    if (c) return c
  }
  return null
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

// Medidas escritas na descrição, em cm: '150X20X18', '22X50', '43CM', '33X9,5X34', '190X460MM'.
export function descDims(desc: string) {
  const out: number[] = []
  const re = /(\d+(?:[.,]\d+)?(?:\s*X\s*\d+(?:[.,]\d+)?)+)\s*(MM|CM)?|\b(\d+(?:[.,]\d+)?)\s*(CM|MM)\b/g
  for (const m of Array.from(desc.toUpperCase().matchAll(re))) {
    const k = (m[2] ?? m[4]) === 'MM' ? 0.1 : 1
    for (const n of (m[1] ?? m[3]).match(/\d+(?:[.,]\d+)?/g) ?? []) out.push(Math.round(parseFloat(n.replace(',', '.')) * k * 100) / 100)
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

// Palavras de nome: sem números soltos (3000k, 12w), mas com medida de conector ('8mm', '10mm'),
// e no singular ('Interruptores' = 'interruptor') para a nota casar com o título do catálogo.
export function words(s: string) {
  return normText(s).split(/[^a-z0-9]+/)
    .filter(w => w.length >= 2 && (!/^\d/.test(w) || /^\d{1,2}mm$/.test(w)) && !STOP.has(w))
    .map(w => (w.length > 5 ? w.replace(/(?:es|s)$/, '') : w))
    .map(w => (w.length > 6 ? w.replace(/(?:ida|ido|idas|idos|ir)$/, '') : w)) // embutida/embutido/embutir -> embut
}

const SPEC_WORD = /^(ip\d{2}|rgb)$/

// Palavras do nome de cada produto e o peso de cada palavra: as raras no catálogo ('bombyx')
// pesam mais que as comuns ('branco', 'cabo'), então "PENDENTE BOMBYX BRANCO" não casa com um cabo branco.
const nameIndexes = new WeakMap<CatalogEntry[], { hay: Map<CatalogEntry, Set<string>>; weight: Map<string, number> }>()
// A nota abrevia ('TINY MAG'): 'mag' vale 'magneto'/'magnético' se a palavra do catálogo for bem maior.
function termWeight(h: Set<string>, weight: Map<string, number>, t: string) {
  if (h.has(t)) return weight.get(t) ?? 0
  if (t.length < 3) return 0
  for (const hw of Array.from(h)) {
    if (hw.length >= t.length + 3 && hw.startsWith(t)) return 0.8 * (weight.get(hw) ?? 0)   // nota abrevia: 'mag' ~ 'magneto'
    if (hw.length >= 3 && t.length >= hw.length + 3 && t.startsWith(hw)) return 0.8 * (weight.get(hw) ?? 0) // catálogo abrevia: 'red' ~ 'redonda'
  }
  return 0
}

export function nameIndex(catalog: CatalogEntry[]) {
  let idx = nameIndexes.get(catalog)
  if (!idx) {
    const hay = new Map<CatalogEntry, Set<string>>()
    const df = new Map<string, number>()
    for (const c of catalog) {
      const set = new Set(words(`${c.name} ${c.line ?? ''}`))
      hay.set(c, set)
      set.forEach(w => df.set(w, (df.get(w) ?? 0) + 1))
    }
    const weight = new Map<string, number>()
    // Especificação (IP65, RGB) é rara nos nomes mas não identifica o produto: pesa pouco, só ajuda no desempate.
    df.forEach((n, w) => weight.set(w, SPEC_WORD.test(w) ? 0.5 : Math.log(1 + catalog.length / n)))
    idx = { hay, weight }
    nameIndexes.set(catalog, idx)
  }
  return idx
}

function toPhoto(c: CatalogEntry, match: ItemPhoto['match'], finishCode?: string | null): ItemPhoto {
  const finish = finishCode ? c.finishes.find(f => f.code === finishCode.padStart(2, '0')) ?? null : null
  return { ref: c.ref, name: c.name, image_url: c.image_url, product_url: c.product_url, finish, dims: dimsLabel(c), model: c.model ?? null, generic: !!c.source_image_url?.includes('#generic'), match }
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
  if (cod) { const c = codeIndex(catalog).get(codeKey(cod)); if (c) return toPhoto(c, 'codigo') }
  const code = cod.match(/^(\d{3,5})[A-Z]*(?:\.(\d{1,3}))?$/i)
  if (code) { const c = byRef.get(code[1]); if (c) return toPhoto(c, 'codigo', code[2]) }
  if (cod && !code) { const c = matchModel(`${cod} ${item.descricao}`, catalog); if (c) return toPhoto(c, 'codigo') }

  const inDesc = item.descricao.match(/\bREF\b[\s.:]*(\d{3,5})/i)
  if (inDesc) { const c = byRef.get(inDesc[1]); if (c) return toPhoto(c, 'descricao') }

  const byToken = matchCodeToken(item.descricao, catalog)
  if (byToken) return toPhoto(byToken, 'descricao')
  const byModel = matchModel(item.descricao, catalog)
  if (byModel) return toPhoto(byModel, 'descricao')

  // Nome + medidas: precisa bater o tipo (pendente, arandela…) e ao menos uma palavra do nome.
  const w = words(item.descricao)
  // 'luminária' é genérico (serve para embutido, solo, mesa…): não filtra o tipo, só entra como palavra.
  const kind = w.find(x => KINDS.includes(x) && x !== 'luminaria') ?? null
  const terms = w.filter(x => !KINDS.includes(x) || x === 'luminaria')
  if (!terms.length) return null
  const want = descDims(item.descricao)
  const colors = descColors(item.descricao)
  const { hay, weight } = nameIndex(catalog)
  // Palpite fraco (só palavras comuns do catálogo) não vale, a menos que as medidas confirmem.
  const minScore = 0.55 * Math.log(1 + catalog.length)
  let best: { c: CatalogEntry; score: number; err: number | null; color: number; focus: number } | null = null
  // O tipo da nota (pendente, arandela…) pesa, mas não é barreira: 'SPOT PINO' é a 'Arandela Pino' do
  // catálogo. Mesmo tipo vale cheio; tipo desconhecido (títulos como 'Sena') 0,85; outro tipo 0,7.
  const kindFactor = (c: CatalogEntry) => !kind ? 1 : !c.kind ? 0.85 : normText(c.kind) === kind ? 1 : 0.7
  for (const c of catalog) {
    const h = hay.get(c)!
    const raw = terms.reduce((sum, t) => sum + termWeight(h, weight, t), 0)
    if (!raw) continue
    const score = raw * kindFactor(c)
    const err = dimError(want, catalogDims(c))
    // Medida da nota batendo com a do catálogo vale como prova; sem ela, só palavra rara.
    // Nota que começa com o nome inteiro do produto ('DICROICA GU10…' = 'Dicróica') também vale.
    const own = words(c.name)
    const leads = own.length > 0 && own.every((x, i) => w[i] === x)
    if (score < minScore && !(err != null && err <= 0.06) && !leads) continue
    const color = colorScore(c, colors)
    // Desempate final: parte do nome do produto que a nota cobre ('Fonte Metálica' 1/2 > 'Cabo conector fonte/fita 10mm' 1/5).
    const focus = h.size ? terms.filter(t => termWeight(h, weight, t) > 0).length / h.size : 0
    const better = !best || score > best.score + 1e-9 ||
      (Math.abs(score - best.score) <= 1e-9 && ((err ?? 1) < (best.err ?? 1) || ((err ?? 1) === (best.err ?? 1) &&
        (color > best.color || (color === best.color && focus > best.focus)))))
    if (better) best = { c, score, err, color, focus }
  }
  if (!best) return null
  // Medidas na nota e no catálogo: só aceita se baterem (até ~12% de diferença média).
  // Catálogo sem medidas (Hevvy) fica pelo nome e pela cor.
  if (want.length && best.err != null && best.err > 0.12) return null
  return toPhoto(best.c, 'nome')
}
