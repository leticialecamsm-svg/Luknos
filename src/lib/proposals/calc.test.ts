import { describe, expect, it } from 'vitest'
import { printOptions, proposalTotals, roomTotal, type ProposalRoom } from './calc'

const item = (qty: number, unit_price: number) => ({ id: 'x', catalog_id: null, source: null, ref: null, name: 'p', image_url: null, qty, unit_price })
const rooms: ProposalRoom[] = [
  { id: 'a', name: 'Sala', items: [item(2, 100.5), item(1, 49.5)] },
  { id: 'b', name: 'Quarto', items: [item(3, 10)] },
]

describe('proposalTotals', () => {
  it('soma ambientes', () => {
    expect(roomTotal(rooms[0])).toBe(250.5)
    expect(proposalTotals(rooms, 'percent', 0)).toMatchObject({ subtotal: 280.5, discount: 0, total: 280.5 })
  })
  it('desconto em %', () => {
    expect(proposalTotals(rooms, 'percent', 10)).toMatchObject({ discount: 28.05, total: 252.45 })
  })
  it('desconto em R$ não passa do subtotal', () => {
    expect(proposalTotals(rooms, 'value', 30)).toMatchObject({ discount: 30, total: 250.5 })
    expect(proposalTotals(rooms, 'value', 999).total).toBe(0)
  })
})

describe('printOptions', () => {
  it('completa com os padrões', () => {
    expect(printOptions({ images: false })).toMatchObject({ images: false, prices: true, brand: false })
    expect(printOptions(null).images).toBe(true)
  })
})
