// Motor de precificação — mesma fórmula da planilha (colunas N e T):
//   custo unitário = (valor total × (1 + IPI) + ICMS + FECOEP) ÷ qtd
//   venda (crédito) = custo ÷ (1 − soma das métricas "% do preço")
// Cada métrica configurável entra numa de quatro formas (kind).

export type MetricKind = 'price_percent' | 'cost_percent' | 'unit_amount' | 'cash_discount'

export type Metric = {
  key: string
  label: string
  kind: MetricKind
  value: number
  value_by_tipo?: Record<string, number> | null
}

export type QuoteInput = {
  unitPrice: number      // valor unitário do fornecedor (sem IPI)
  quantity?: number      // padrão 1; a planilha compra em lote
  ipiPct: number         // fração: 0.0975
  icmsPct: number        // ICMS ST/ANT como fração do valor total (coluna J)
  fecoepPct: number      // fração do valor total (coluna L)
  tipoIcms?: string | null
  metrics: Metric[]
}

export type MetricLine = { key: string; label: string; kind: MetricKind; pct: number; amount: number }

export type QuoteResult = {
  costUnit: number
  priceCredit: number | null
  priceCash: number | null
  divisor: number
  lines: MetricLine[]     // quanto cada métrica "pesa" em R$ no preço final
  marginAmount: number | null // preço − custo
  error?: string
}

export function effectiveValue(m: Metric, tipo?: string | null): number {
  const byTipo = m.value_by_tipo
  if (byTipo && tipo) {
    const v = byTipo[tipo.toUpperCase()]
    if (typeof v === 'number') return v
  }
  return m.value
}

export function computeQuote(input: QuoteInput): QuoteResult {
  const qty = input.quantity && input.quantity > 0 ? input.quantity : 1
  const total = input.unitPrice * qty
  const base = (total * (1 + input.ipiPct) + total * input.icmsPct + total * input.fecoepPct) / qty

  let cost = base
  for (const m of input.metrics) if (m.kind === 'unit_amount') cost += effectiveValue(m, input.tipoIcms)
  for (const m of input.metrics) if (m.kind === 'cost_percent') cost *= 1 + effectiveValue(m, input.tipoIcms)

  const pricePct = input.metrics
    .filter(m => m.kind === 'price_percent')
    .reduce((s, m) => s + effectiveValue(m, input.tipoIcms), 0)
  const divisor = 1 - pricePct

  if (divisor <= 0) {
    return { costUnit: cost, priceCredit: null, priceCash: null, divisor, lines: [], marginAmount: null,
      error: 'As métricas somam 100% ou mais — não há preço possível.' }
  }

  const priceCredit = cost / divisor
  const cash = input.metrics.find(m => m.kind === 'cash_discount')
  const priceCash = cash ? priceCredit * (1 - effectiveValue(cash, input.tipoIcms)) : priceCredit

  const lines: MetricLine[] = input.metrics
    .filter(m => m.kind === 'price_percent')
    .map(m => {
      const pct = effectiveValue(m, input.tipoIcms)
      return { key: m.key, label: m.label, kind: m.kind, pct, amount: priceCredit * pct }
    })

  return { costUnit: cost, priceCredit, priceCash, divisor, lines, marginAmount: priceCredit - cost }
}

export const brl = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const pct = (v: number | null | undefined, digits = 2) =>
  v == null ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: digits })}%`
