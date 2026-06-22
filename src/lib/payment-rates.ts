export interface PaymentRate {
  method_key: string
  label: string
  machine_fee_pct: number
  max_discount_pct: number
  sort_order: number
}

export type PaymentStatus = 'paid' | 'open'

export interface PaymentSplit {
  method_key: string
  amount: number
  status?: PaymentStatus
  date?: string // YYYY-MM-DD
}

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Primary payment types shown in first selector
export const PRIMARY_METHODS = ['pix', 'cash', 'debit', 'credit'] as const
export type PrimaryMethod = typeof PRIMARY_METHODS[number]
export const PRIMARY_METHOD_LABEL: Record<PrimaryMethod, string> = {
  pix:    'PIX',
  cash:   'Dinheiro',
  debit:  'Débito',
  credit: 'Crédito',
}

// Credit installments shown in second selector
export const CREDIT_INSTALLMENTS = [
  { value: 'credit_1x', label: 'À vista' },
  { value: 'credit_2x', label: '2x' },
  { value: 'credit_3x', label: '3x' },
  { value: 'credit_4x', label: '4x' },
  { value: 'credit_5x', label: '5x' },
  { value: 'credit_6x', label: '6x' },
]

/** Convert method_key to primary type for UI */
export function methodKeyToPrimary(key: string): PrimaryMethod {
  if (key === 'pix') return 'pix'
  if (key === 'cash') return 'cash'
  if (key === 'debit') return 'debit'
  return 'credit'
}

/** Default method_key for a primary type */
export function primaryToDefaultKey(primary: PrimaryMethod): string {
  if (primary === 'pix') return 'pix'
  if (primary === 'cash') return 'cash'
  if (primary === 'debit') return 'debit'
  return 'credit_1x'
}

// Default rates (used as fallback before DB loads)
export const DEFAULT_PAYMENT_RATES: PaymentRate[] = [
  { method_key: 'pix',        label: 'PIX',             machine_fee_pct: 0,    max_discount_pct: 13.38, sort_order: 1  },
  { method_key: 'cash',       label: 'Dinheiro',        machine_fee_pct: 0,    max_discount_pct: 13.38, sort_order: 2  },
  { method_key: 'debit',      label: 'Débito',          machine_fee_pct: 1.40, max_discount_pct: 10.67, sort_order: 3  },
  { method_key: 'credit_1x',  label: 'Crédito à vista', machine_fee_pct: 4.74, max_discount_pct: 3.44,  sort_order: 4  },
  { method_key: 'credit_2x',  label: '2x',              machine_fee_pct: 4.49, max_discount_pct: 3.99,  sort_order: 5  },
  { method_key: 'credit_3x',  label: '3x',              machine_fee_pct: 5.08, max_discount_pct: 2.65,  sort_order: 6  },
  { method_key: 'credit_4x',  label: '4x',              machine_fee_pct: 5.67, max_discount_pct: 1.28,  sort_order: 7  },
  { method_key: 'credit_5x',  label: '5x',              machine_fee_pct: 6.26, max_discount_pct: 0,     sort_order: 8  },
  { method_key: 'credit_6x',  label: '6x',              machine_fee_pct: 6.85, max_discount_pct: 0,     sort_order: 9  },
]

/** Weighted max discount for a mixed-payment scenario */
export function calcWeightedMaxDiscount(splits: PaymentSplit[], rates: PaymentRate[]): number {
  const total = splits.reduce((s, p) => s + p.amount, 0)
  if (total <= 0) return 0
  let weighted = 0
  for (const split of splits) {
    const rate = rates.find(r => r.method_key === split.method_key)
    if (rate) weighted += (split.amount / total) * rate.max_discount_pct
  }
  return weighted
}

/** Minimum acceptable sale value given the splits */
export function calcMinPrice(quotedValue: number, splits: PaymentSplit[], rates: PaymentRate[]): number {
  const maxDisc = calcWeightedMaxDiscount(splits, rates)
  return quotedValue * (1 - maxDisc / 100)
}

export function formatPct(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
}
