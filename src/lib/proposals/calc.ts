// Orçamento de Produtos — tipos e contas, sem nada de servidor (usado pela tela
// de edição, pela impressão e pelo save, que guarda o total para a listagem).

export type ProposalItem = {
  id: string
  catalog_id: string | null   // supplier_catalog_products.id; null = item digitado à mão
  source: string | null       // fornecedor do catálogo ('accord', 'lumi'…)
  ref: string | null
  name: string
  image_url: string | null
  qty: number
  unit_price: number
  note?: string | null        // acabamento, cor, observação do item
  label?: string | null       // nome que o cliente vê (vazio = nome genérico automático)
}

export type ProposalRoom = { id: string; name: string; items: ProposalItem[] }

export type DiscountType = 'percent' | 'value'

export type PrintOptions = {
  generic: boolean     // nome genérico (Perfil, Spot, Fita de LED…) em vez do nome do fornecedor
  images: boolean      // foto dos produtos
  prices: boolean      // valor unitário e total de cada item
  roomTotals: boolean  // total de cada ambiente
  total: boolean       // total geral (e condições de pagamento)
  discount: boolean    // linha de desconto (sem ela, sai o valor cheio)
  ref: boolean         // código do produto
  brand: boolean       // marca/fornecedor
  notes: boolean       // observações gerais
}

export const DEFAULT_PRINT: PrintOptions = {
  generic: true, images: true, prices: true, roomTotals: true, total: true, discount: true, ref: true, brand: false, notes: true,
}

export const PRINT_LABELS: { key: keyof PrintOptions; label: string; hint?: string }[] = [
  { key: 'generic', label: 'Nome genérico', hint: 'Perfil, Spot, Fita de LED… em vez do nome do fornecedor' },
  { key: 'images', label: 'Fotos dos produtos' },
  { key: 'prices', label: 'Preços dos itens', hint: 'valor unitário e total de cada produto' },
  { key: 'roomTotals', label: 'Total por ambiente' },
  { key: 'total', label: 'Total geral', hint: 'com as condições de pagamento' },
  { key: 'discount', label: 'Desconto', hint: 'sem ele o orçamento sai com o valor cheio' },
  { key: 'ref', label: 'Código do produto' },
  { key: 'brand', label: 'Marca do fornecedor' },
  { key: 'notes', label: 'Observações' },
]

export function printOptions(raw: unknown): PrintOptions {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<PrintOptions>
  return Object.fromEntries(
    Object.entries(DEFAULT_PRINT).map(([k, v]) => [k, typeof o[k as keyof PrintOptions] === 'boolean' ? o[k as keyof PrintOptions] : v]),
  ) as PrintOptions
}

const money = (n: number) => Math.round(n * 100) / 100

export const itemTotal = (i: ProposalItem) => money((Number(i.qty) || 0) * (Number(i.unit_price) || 0))
export const roomTotal = (r: ProposalRoom) => money(r.items.reduce((s, i) => s + itemTotal(i), 0))

export function proposalTotals(rooms: ProposalRoom[], discountType: DiscountType, discountValue: number) {
  const subtotal = money(rooms.reduce((s, r) => s + roomTotal(r), 0))
  const v = Math.max(0, Number(discountValue) || 0)
  const discount = money(Math.min(subtotal, discountType === 'percent' ? subtotal * Math.min(v, 100) / 100 : v))
  const discountPct = subtotal > 0 ? discount / subtotal : 0
  return { subtotal, discount, discountPct, total: money(subtotal - discount) }
}

// Nome de cada fornecedor do catálogo (chave = source), igual às chaves de supplierBrand.
export const SOURCE_LABEL: Record<string, string> = {
  accord: 'Accord Iluminação', hevvy: 'Hevvy', skylight: 'Skylight', spotline: 'Spotline', usina: 'Usina',
  pix: 'Pix', lumi: 'Luminatti', sorteluz: 'Sorteluz', avant: 'Avant', nordecor: 'Nordecor',
  blumenau: 'Blumenau', gaya: 'Gaya', tks: 'TKS', embuled: 'Embuled',
}
export const sourceLabel = (s: string | null | undefined) => (s ? SOURCE_LABEL[s] ?? (s.startsWith('sup-') ? null : s) : null)

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const proposalCode = (n: number) => String(n).padStart(4, '0')

// Nome genérico do produto para o cliente, pelo tipo escrito no nome do fornecedor.
// Vale o tipo que aparece primeiro ("Fonte … para Fita LED" é Fonte, "Spot Trilho" é Spot);
// empate na mesma posição fica com o que vem antes na lista.
const GENERIC: [RegExp, string][] = [
  [/\bperfi(l|s)\b/, 'Perfil'],
  [/\bfitas?\b|fitasdeled/, 'Fita de LED'],
  [/\b(fontes?|drivers?)\b/, 'Fonte'],
  [/\b(conector(es)?|emendas?|juncao)\b/, 'Conector'],
  [/\bmangueira\b/, 'Mangueira de LED'],
  [/\bespeto\b/, 'Espeto'],
  [/\b(lampadas?|dicroica|bulbo)\b|lampadastecnicas/, 'Lâmpada'],
  [/\bpendentes?\b/, 'Pendente'],
  [/\blustres?\b/, 'Lustre'],
  [/\barandelas?\b/, 'Arandela'],
  [/\bplafon/, 'Plafon'],
  [/\babajur\b|\bluminaria de mesa\b/, 'Luminária de mesa'],
  [/\bcoluna\b/, 'Luminária de coluna'],
  [/\bbalizador/, 'Balizador'],
  [/\b(embutido|embutir)\b.*\bsolo\b|\bsolo\b/, 'Embutido de solo'],
  [/\bspots?\b/, 'Spot'],
  [/\bdownlight/, 'Downlight'],
  [/\b(embutido|embutir)\b/, 'Embutido'],
  [/\bpain(el|eis)\b/, 'Painel de LED'],
  [/\b(refletor|projetor)\b/, 'Refletor'],
  [/\bposte\b/, 'Poste'],
  [/\btrilhos?\b/, 'Trilho'],
  [/\btartaruga\b/, 'Tartaruga'],
  [/\bmodulos?\b/, 'Módulo de LED'],
  [/\bsobrepor\b|\bluminarias?\b|\blum\./, 'Luminária'],
]

export function genericName(name: string): string {
  const n = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  let best: { at: number; label: string } | null = null
  for (const [re, label] of GENERIC) {
    const m = re.exec(n)
    if (m && (!best || m.index < best.at)) best = { at: m.index, label }
  }
  if (best) return best.label
  const first = name.replace(/^\s*\d+\s*-\s*/, '').trim().split(/\s+/)[0] ?? ''
  return first ? first[0].toUpperCase() + first.slice(1).toLowerCase() : name
}

// Nome do item no PDF: o que a pessoa escreveu, senão o genérico (com a opção ligada), senão o do fornecedor.
export const displayName = (i: ProposalItem, generic: boolean) =>
  i.label?.trim() || (generic && i.catalog_id ? genericName(i.name) : i.name)
