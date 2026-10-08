import { describe, it, expect } from 'vitest'
import { parseBRLToCents, formatCents, dbValueToCents, sumCents, MAX_DEAL_CENTS } from './crm-money'

describe('parseBRLToCents', () => {
  const ok: Array<[string, number | null]> = [
    ['1250', 125000], ['1.250', 125000], ['1.250,5', 125050], ['1.250,50', 125050], ['R$ 1.250,00', 125000],
    ['1250.50', 125050], ['0,99', 99], ['0', 0], ['12.5', 1250], ['1.234.567,89', 123456789], ['', null], ['   ', null],
    ['1,', 100], ['10.000', 1000000], ['R$', null],
  ]
  for (const [i, o] of ok) it(`"${i}" -> ${o}`, () => expect(parseBRLToCents(i)).toBe(o))

  for (const bad of ['abc', '-5', '1,234', '1,2,3', '12,3x', '1..2', '1.2.3', '1e5', '9999999999999', '1.000.000.000,00'])
    it(`rejeita "${bad}"`, () => expect(parseBRLToCents(bad)).toHaveProperty('error'))

  it('limite exato aceita, +1 centavo rejeita', () => {
    expect(parseBRLToCents('999.999.999,99')).toBe(MAX_DEAL_CENTS)
    expect(parseBRLToCents('1.000.000.000,00')).toHaveProperty('error')
  })
})

describe('formatCents / soma', () => {
  it('formata pt-BR', () => {
    expect(formatCents(0)).toBe('R$ 0,00')
    expect(formatCents(5)).toBe('R$ 0,05')
    expect(formatCents(125050)).toBe('R$ 1.250,50')
    expect(formatCents(123456789)).toBe('R$ 1.234.567,89')
  })
  it('ida e volta com o banco (numeric)', () => {
    expect(dbValueToCents(1250.5)).toBe(125050)
    expect(dbValueToCents('0.07')).toBe(7)
    expect(dbValueToCents(null)).toBeNull()
    expect(dbValueToCents('lixo')).toBeNull()
  })
  it('0,10 + 0,20 = 0,30 (sem erro de float)', () => {
    expect(sumCents([10, 20])).toBe(30)
    expect(0.1 + 0.2).not.toBe(0.3) // por isso trabalhamos em centavos
    expect(sumCents([null, undefined, 150])).toBe(150)
    expect(sumCents([])).toBe(0)
  })
})
