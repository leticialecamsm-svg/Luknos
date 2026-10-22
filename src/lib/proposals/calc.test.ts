import { describe, expect, it } from 'vitest'
import { genericName, printOptions, proposalTotals, roomTotal, type ProposalRoom } from './calc'

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

describe('genericName', () => {
  it.each([
    ['10664 - PERFIL DE ALUMÍNIO EMBUTIR PARA FITA LED PXG-1206', 'Perfil'],
    ['Fita LED 12V 6W/M 3.000K', 'Fita de LED'],
    ['Fonte Colmeia 200W 12V/16.5A Bivolt para Fita LED 200W', 'Fonte'],
    ['Conector Pix Mult 10mm', 'Conector'],
    ['Embutido De Solo Preto 3000K', 'Embutido de solo'],
    ['Spot Trilho Magnético 10W', 'Spot'],
    ['Pendente Accord Living Hinges', 'Pendente'],
    ['Plafon Led Madrid', 'Plafon'],
    ['Sistema Trilho Eletrificado 1m', 'Trilho'],
    ['Lâmpada Bulbo E27 9W', 'Lâmpada'],
    ['Vigo 3000K', 'Vigo'],
  ])('%s → %s', (name, expected) => expect(genericName(name)).toBe(expected))
})
