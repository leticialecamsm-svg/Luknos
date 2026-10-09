import { describe, it, expect } from 'vitest'
import { dueState, nextBusinessDay, followupPresets, toLocalInput, fromLocalInput, formatDue } from './crm-followup'

const NOW = new Date(2026, 9, 14, 10, 0, 0) // qua 14/10/2026 10:00 (local)

describe('dueState', () => {
  it('atrasado, hoje, em breve, depois', () => {
    expect(dueState(new Date(2026, 9, 14, 9, 59).toISOString(), NOW)).toBe('overdue')
    expect(dueState(new Date(2026, 9, 14, 10, 0).toISOString(), NOW)).toBe('overdue') // exatamente agora já venceu
    expect(dueState(new Date(2026, 9, 14, 16, 0).toISOString(), NOW)).toBe('today')
    expect(dueState(new Date(2026, 9, 16, 9, 0).toISOString(), NOW)).toBe('soon')
    expect(dueState(new Date(2026, 9, 25, 9, 0).toISOString(), NOW)).toBe('later')
  })
})

describe('nextBusinessDay', () => {
  it('quarta → quinta 9h', () => {
    const d = nextBusinessDay(NOW)
    expect([d.getDate(), d.getHours(), d.getDay()]).toEqual([15, 9, 4])
  })
  it('sexta → segunda (pula o fim de semana)', () => {
    const d = nextBusinessDay(new Date(2026, 9, 16, 15, 0))
    expect([d.getDate(), d.getDay()]).toEqual([19, 1])
  })
  it('sábado → segunda', () => {
    expect(nextBusinessDay(new Date(2026, 9, 17, 12, 0)).getDay()).toBe(1)
  })
})

describe('followupPresets', () => {
  it('todos no futuro e em ordem crescente', () => {
    const p = followupPresets(NOW)
    expect(p.length).toBe(5)
    for (const x of p) expect(x.date.getTime()).toBeGreaterThan(NOW.getTime())
    const times = p.map((x) => x.date.getTime())
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })
  it('daqui a 3 horas arredonda para a hora cheia seguinte', () => {
    const d = followupPresets(new Date(2026, 9, 14, 10, 20))[0].date
    expect([d.getHours(), d.getMinutes()]).toEqual([14, 0])
  })
})

describe('datetime-local', () => {
  it('ida e volta', () => {
    const d = new Date(2026, 9, 14, 9, 5)
    expect(toLocalInput(d)).toBe('2026-10-14T09:05')
    expect(fromLocalInput('2026-10-14T09:05')?.getTime()).toBe(d.getTime())
  })
  it('inválidos', () => {
    expect(fromLocalInput('')).toBeNull()
    expect(fromLocalInput('14/10/2026 09:00')).toBeNull()
    expect(fromLocalInput('2026-13-40T99:99')).toBeNull()
  })
})

describe('formatDue', () => {
  it('hoje, amanhã e data', () => {
    expect(formatDue(new Date(2026, 9, 14, 15, 30).toISOString(), NOW)).toBe('hoje às 15:30')
    expect(formatDue(new Date(2026, 9, 15, 9, 0).toISOString(), NOW)).toBe('amanhã às 09:00')
    expect(formatDue(new Date(2026, 9, 20, 9, 0).toISOString(), NOW)).toBe('20/10 às 09:00')
  })
})
