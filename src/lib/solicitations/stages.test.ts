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

import { bigMetric, stageDeadline, dateChip, shortDayLabel, splitPlannedDone, mergeHistory, daysInPipeline } from './stages'

describe('hero helpers', () => {
  const s: any = { ...base, createdAt: '2026-09-23T10:00:00Z' }
  it('bigMetric: fechado usa final, senão orçado, senão dias', () => {
    expect(bigMetric({ ...s, negotiations: [{ temperature: 'closed' }] }, { final_value: 900, quoted_value: 1000 })).toMatchObject({ kind: 'money', value: 900 })
    expect(bigMetric(s, { final_value: 900, quoted_value: 1000 })).toMatchObject({ kind: 'money', value: 1000 })
    expect(bigMetric(s, null, new Date('2026-10-03T10:00:00Z'))).toMatchObject({ kind: 'days', days: 10 })
    expect(daysInPipeline('2026-10-03T10:00:00Z', new Date('2026-10-01T10:00:00Z'))).toBe(0)
  })
  it('stageDeadline por etapa', () => {
    const c = { ...s, purchaseChecklistItems: [{ status: 'recebido', expected_delivery_date: '2026-01-01' }, { status: 'pedido', expected_delivery_date: '2026-10-20' }, { status: 'a_pedir', expected_delivery_date: '2026-10-10' }] }
    expect(stageDeadline(c, null, 'compra')).toEqual({ stage: 'compra', date: '2026-10-10' })
    expect(stageDeadline(s, { deadline: '2026-11-01T00:00:00Z' }, 'orcamento')?.date).toBe('2026-11-01')
    expect(stageDeadline(s, null, 'projeto')).toBeNull()
    expect(stageDeadline(s, null, null)).toBeNull()
  })
  it('dateChip e shortDayLabel', () => {
    expect(dateChip('2026-10-03', '2026-10-03')).toEqual({ label: 'Hoje', tone: 'today' })
    expect(dateChip('2026-10-02', '2026-10-03')?.label).toBe('Ontem')
    expect(dateChip('2026-10-04', '2026-10-03')?.label).toBe('Amanhã')
    expect(dateChip('2026-10-20', '2026-10-03')).toEqual({ label: '20/10', tone: 'future' })
    expect(dateChip(null, '2026-10-03')).toBeNull()
    expect(shortDayLabel('2026-10-08')).toBe('08 out')
  })
  it('splitPlannedDone', () => {
    expect(splitPlannedDone('visita', [{ status: 'done' }, { status: 'scheduled' }, { status: 'not_needed' }])).toEqual({ planned: [{ status: 'scheduled' }], done: [{ status: 'done' }, { status: 'not_needed' }] })
    expect(splitPlannedDone('posVenda', [{ resolution: 'x' }, {}]).planned).toHaveLength(1)
  })
  it('mergeHistory ordena e classifica', () => {
    const h = mergeHistory(
      [{ id: '1', stage: null, kind: 'note', description: 'n', created_at: '2026-10-02T10:00:00Z', created_by: 'u', authorName: 'A', authorAvatarColor: null, authorAvatarUrl: null }],
      [{ id: 'x', type: 'note', description: 'oi', user_id: 'u', created_at: '2026-10-03T10:00:00Z' }, { id: 'y', type: 'status_change', description: 's', created_at: '2026-10-01T10:00:00Z' }]
    )
    expect(h.map(x => x.id)).toEqual(['a-x', 'e-1', 'a-y'])
    expect(h.map(x => x.kind)).toEqual(['note', 'note', 'system'])
  })
})
