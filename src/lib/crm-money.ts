// Valor da negociação de cada conversa. Tudo em CENTAVOS (inteiro) na UI e nas
// somas — evita erro de ponto flutuante (0,1 + 0,2) nos totais das colunas.

export const MAX_DEAL_CENTS = 99_999_999_999 // R$ 999.999.999,99 (cabe em numeric(12,2))

// Aceita "1250", "1.250", "1.250,5", "R$ 1.250,00", "1250.50", "0,99".
// Devolve centavos, null quando vazio, ou { error }.
export function parseBRLToCents(raw: string): number | null | { error: string } {
  const s = (raw ?? '').replace(/R\$/gi, '').replace(/\s/g, '')
  if (s === '') return null
  if (/[^\d.,]/.test(s)) return { error: 'Use só números, vírgula e ponto' }
  let normalized: string
  if (s.includes(',')) {
    // vírgula = decimal; pontos antes dela = milhar
    const parts = s.split(',')
    if (parts.length > 2) return { error: 'Valor inválido' }
    const [int, dec = ''] = parts
    if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(int)) return { error: 'Valor inválido' }
    if (dec.length > 2 || !/^\d*$/.test(dec)) return { error: 'No máximo 2 casas depois da vírgula' }
    normalized = `${int.replace(/\./g, '')}.${dec.padEnd(2, '0')}`
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    normalized = s.replace(/\./g, '') + '.00' // 1.250 = mil duzentos e cinquenta
  } else if (/^\d+(\.\d{1,2})?$/.test(s)) {
    normalized = s.includes('.') ? s.padEnd(s.indexOf('.') + 3, '0') : s + '.00'
  } else {
    return { error: 'Valor inválido' }
  }
  const [i, d] = normalized.split('.')
  const cents = Number(i) * 100 + Number(d)
  if (!Number.isSafeInteger(cents)) return { error: 'Valor grande demais' }
  if (cents > MAX_DEAL_CENTS) return { error: 'Valor grande demais' }
  return cents
}

export function formatCents(cents: number): string {
  const abs = Math.abs(cents)
  const int = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const dec = String(abs % 100).padStart(2, '0')
  return `${cents < 0 ? '-' : ''}R$ ${int},${dec}`
}

// numeric(12,2) do banco (number | string | null) -> centavos
export function dbValueToCents(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

export function centsToDb(cents: number | null): number | null {
  return cents === null ? null : cents / 100
}

export function sumCents(values: Array<number | null | undefined>): number {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0)
}
