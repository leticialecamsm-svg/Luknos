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
}

export type ProposalRoom = { id: string; name: string; items: ProposalItem[] }

export type DiscountType = 'percent' | 'value'

export type PrintOptions = {
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
  images: true, prices: true, roomTotals: true, total: true, discount: true, ref: true, brand: false, notes: true,
}

export const PRINT_LABELS: { key: keyof PrintOptions; label: string; hint?: string }[] = [
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
