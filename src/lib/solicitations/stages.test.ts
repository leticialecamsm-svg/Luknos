import { describe, it, expect } from 'vitest'
import { avatarColor, AVATAR_PALETTE } from '../avatar-color'
import { pickCurrentStage, dayCount, nextStep, quoteValues, computeStages } from './stages'

const base: any = {
  visits: [], designProjects: [], quotes: [], negotiations: [], purchaseChecklistItems: [],
  shipments: [], installationTrackings: [], postSaleFollowups: [],
}

describe('avatarColor', () => {
  it('é determinístico e sempre da paleta', () => {
    expect(avatarColor('abc')).toEqual(avatarColor('abc'))
    expect(AVATAR_PALETTE).toContainEqual(avatarColor('Maria'))
  })
})

describe('pickCurrentStage', () => {
  const order = ['a', 'b', 'c']
  it('primeira iniciada não concluída', () => {
    expect(pickCurrentStage(order, { a: true, b: true, c: true }, { a: true })).toBe('b')
  })
  it('todas concluídas -> última concluída', () => {
    expect(pickCurrentStage(order, { a: true, b: true }, { a: true, b: true })).toBe('b')
  })
  it('nenhuma iniciada -> null', () => {
    expect(pickCurrentStage(order, {}, {})).toBeNull()
  })
})

describe('dayCount', () => {
  it('conta dias inteiros', () => {
    expect(dayCount('2026-10-01T00:00:00Z', '2026-10-10T12:00:00Z')).toBe(9)
  })
  it('null sem dados', () => {
    expect(dayCount(null, '2026-10-10')).toBeNull()
  })
})

describe('computeStages', () => {
  it('marca estados e esconde contador sem timestamp', () => {
    const s = { ...base, visits: [{ status: 'done', created_at: '2026-10-01T00:00:00Z' }], quotes: [{ status: 'open', created_at: '2026-10-02T00:00:00Z' }] }
    const r = computeStages(s, new Date('2026-10-12T00:00:00Z'))
    expect(r.find(x => x.id === 'visita')).toMatchObject({ state: 'done', days: null })
    expect(r.find(x => x.id === 'orcamento')).toMatchObject({ state: 'current', days: 10 })
    expect(r.find(x => x.id === 'compra')?.state).toBe('not_started')
  })
})

describe('nextStep', () => {
  it('usa a data futura mais próxima', () => {
    const s = { ...base, visits: [{ status: 'scheduled', scheduled_at: '2026-10-20' }], installationTrackings: [{ status: 'agendada', scheduled_date: '2026-10-15' }] }
    expect(nextStep(s, '2026-10-03').tab).toBe('instalacao')
  })
  it('cai em compra e depois em tudo em dia', () => {
    expect(nextStep({ ...base, purchaseChecklistItems: [{ status: 'a_pedir' }] }, '2026-10-03').tab).toBe('compra')
    expect(nextStep(base, '2026-10-03').text).toBe('Tudo em dia')
  })
})

describe('quoteValues', () => {
  it('soma recebido e em aberto', () => {
    const v = quoteValues({ quoted_value: 100, final_value: 90, payment_splits: [{ amount: 40, status: 'paid' }, { amount: 50, status: 'open' }] })
    expect(v).toMatchObject({ received: 40, open: 50, final: 90 })
  })
})
