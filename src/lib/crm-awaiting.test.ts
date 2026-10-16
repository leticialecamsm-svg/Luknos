import { describe, it, expect } from 'vitest'
import { isUrgentWait, formatWaiting, URGENT_AFTER_MS } from './crm-awaiting'

const NOW = new Date('2026-10-09T15:00:00Z').getTime()
const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('crm-awaiting', () => {
  it('urgente a partir de 3h', () => {
    expect(isUrgentWait(ago(URGENT_AFTER_MS - 60000), NOW)).toBe(false)
    expect(isUrgentWait(ago(URGENT_AFTER_MS), NOW)).toBe(true)
  })
  it('formata o tempo de espera', () => {
    expect(formatWaiting(ago(20000), NOW)).toBe('agora')
    expect(formatWaiting(ago(5 * 60000), NOW)).toBe('há 5 min')
    expect(formatWaiting(ago(2 * 3600000 + 600000), NOW)).toBe('há 2 h')
    expect(formatWaiting(ago(27 * 3600000), NOW)).toBe('há 1 d 3 h')
    expect(formatWaiting(ago(48 * 3600000), NOW)).toBe('há 2 d')
  })
})
