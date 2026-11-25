import { describe, it, expect } from 'vitest'
import { polyArea, labelPoint, roomAt, midOfPath } from './cad-rooms'
import { collectItems, legendCells, LEGEND_HEADERS } from './cad-legend'
import { EMPTY_EDITS, type Edits, type Shape } from './cad-state'
import { buildCadModel, appendLibBlock, type LibBlock } from './cad'

const sala: Shape = { id: 1, kind: 'ambiente', text: 'Sala', pts: [0, 0, 10, 0, 10, 8, 0, 8], stroke: '#0f0', fill: null }
const lavabo: Shape = { id: 2, kind: 'ambiente', text: 'Lavabo', pts: [7, 5, 10, 5, 10, 8, 7, 8], stroke: '#0f0', fill: null }

describe('ambientes', () => {
  it('área, rótulo e o menor ambiente que contém o ponto', () => {
    expect(polyArea(sala.pts)).toBe(80)
    expect(labelPoint(sala.pts)).toEqual([5, 4])
    expect(roomAt([sala, lavabo], 8, 6)).toBe('Lavabo')
    expect(roomAt([sala, lavabo], 1, 1)).toBe('Sala')
    expect(roomAt([sala, lavabo], 20, 1)).toBe('')
    expect(midOfPath([0, 0, 4, 0, 4, 2])).toEqual([3, 0])
  })
  it('a legenda junta os ambientes onde cada item está; o digitado vale no lugar do automático', () => {
    const b: LibBlock = { name: 'Spot', unitToMeters: 1, cols: ['#fff'], segs: [-0.1, 0, 0.1, 0], segC: [0], texts: [], fills: [], bbox: [-0.1, -0.1, 0.1, 0.1] }
    const base = buildCadModel({ header: {}, tables: { LAYER: { entries: [] }, BLOCK_RECORD: { entries: [{ name: '*Model_Space', entities: [] }] } } })
    const { model, obj } = appendLibBlock(base, b)
    const ed: Edits = { ...EMPTY_EDITS, shapes: [sala, lavabo, { id: 5, kind: 'fita', pts: [1, 1, 3, 1], wm: 5, stroke: '#f00', fill: null, spec: { name: 'Fita', mounting: '', power: '', light: '', color: '#f00', rooms: 'Sanca' } }],
      cp: [{ id: 3, src: obj, xf: [1, 0, 0, 1, 8, 6] }, { id: 4, src: obj, xf: [1, 0, 0, 1, 2, 2] }] }
    const items = collectItems(model, ed, 1)
    expect(items.map(i => i.rooms)).toEqual(['Lavabo, Sala', 'Sanca'])
    expect(LEGEND_HEADERS).toContain('Ambientes')
    expect(legendCells(items[0]).at(-1)).toBe('Lavabo, Sala')
  })
})
