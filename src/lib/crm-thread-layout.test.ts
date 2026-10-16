import { describe, expect, it } from 'vitest'
import { threadLayout, type LayoutMsg } from './crm-thread-layout'
import { formatDayLabel } from './crm-time'

const now = new Date('2026-10-12T15:00:00-03:00')
const m = (over: Partial<LayoutMsg>): LayoutMsg => ({
  direction: 'inbound', sender_user_id: null, is_system: false, created_at: '2026-10-12T10:00:00-03:00', ...over,
})

describe('formatDayLabel', () => {
  it('hoje, ontem, dia da semana e data', () => {
    expect(formatDayLabel('2026-10-12T09:00:00-03:00', now)).toBe('Hoje')
    expect(formatDayLabel('2026-10-11T23:00:00-03:00', now)).toBe('Ontem')
    expect(formatDayLabel('2026-10-08T09:00:00-03:00', now)).toBe('Quinta-feira')
    expect(formatDayLabel('2026-09-30T09:00:00-03:00', now)).toBe('30/09/2026')
  })
})

describe('threadLayout', () => {
  it('separa por dia e agrupa a mesma pessoa', () => {
    const out = threadLayout([
      m({ created_at: '2026-10-11T10:00:00-03:00' }),
      m({ created_at: '2026-10-12T10:00:00-03:00' }),
      m({ created_at: '2026-10-12T10:01:00-03:00' }),
      m({ direction: 'outbound', sender_user_id: 'u1', created_at: '2026-10-12T10:02:00-03:00' }),
      m({ direction: 'outbound', sender_user_id: 'u1', created_at: '2026-10-12T10:03:00-03:00' }),
      m({ direction: 'outbound', sender_user_id: 'u2', created_at: '2026-10-12T10:04:00-03:00' }),
    ], now)
    expect(out.map((s) => s.day)).toEqual(['Ontem', 'Hoje', null, null, null, null])
    expect(out.map((s) => s.first)).toEqual([true, true, false, true, false, true])
  })

  it('em grupo, cada participante abre uma sequência', () => {
    const out = threadLayout([
      m({ participant_jid: 'a' }), m({ participant_jid: 'a' }), m({ participant_jid: 'b' }),
    ], now)
    expect(out.map((s) => s.first)).toEqual([true, false, true])
  })
})
