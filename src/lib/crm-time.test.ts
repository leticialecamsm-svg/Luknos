import { describe, it, expect } from 'vitest'
import { formatListTime } from './crm-time'

const NOW = new Date('2026-10-09T18:00:00Z') // 15:00 em Brasília

describe('formatListTime', () => {
  it('hoje mostra a hora (horário de Brasília)', () => {
    expect(formatListTime('2026-10-09T12:40:00Z', NOW)).toBe('09:40')
  })
  it('ontem', () => {
    expect(formatListTime('2026-10-08T15:00:00Z', NOW)).toBe('Ontem')
  })
  it('últimos dias mostra o dia da semana', () => {
    expect(formatListTime('2026-10-05T15:00:00Z', NOW)).toBe('seg')
  })
  it('mais antigo mostra a data', () => {
    expect(formatListTime('2026-09-01T15:00:00Z', NOW)).toBe('01/09/2026')
  })
  it('vazio ou inválido não quebra', () => {
    expect(formatListTime(null, NOW)).toBe('')
    expect(formatListTime('x', NOW)).toBe('')
  })
})
