import { describe, it, expect } from 'vitest'
import { buildCadModel, extractLibraryBlocks } from './cad'
import { serializeState, restoreState, EMPTY_EDITS, type Edits } from './cad-state'

const line = (handle: string, x: number) => ({ type: 'LINE', handle, layer: 'A', startPoint: { x, y: 0 }, endPoint: { x: x + 1, y: 1 } })
const db = (entities: any[]) => ({
  header: { INSUNITS: 6 },
  tables: {
    LAYER: { entries: [{ name: 'A', colorIndex: 1 }] },
    BLOCK_RECORD: { entries: [{ name: '*Model_Space', entities }, { name: 'Spot', basePoint: { x: 0, y: 0 }, entities: [line('B1', 0)] }] },
  },
})

describe('estado salvo do laboratório CAD', () => {
  it('volta igual depois de salvar e reabrir, inclusive blocos da biblioteca e camadas', () => {
    const source = db([line('10', 0), line('11', 5)])
    const base = buildCadModel(source)
    const spot = extractLibraryBlocks(source)[0]
    const placed = restoreState(base, { v: 1, ov: [], cp: [], shapes: [], dims: [], next: 1, libs: [spot], hidden: [] })
    const edits: Edits = {
      ...EMPTY_EDITS, ov: { 1: null }, next: 5,
      cp: [{ id: 1, src: placed.libObj.get('Spot')!, xf: [1, 0, 0, 1, 3, 4], attrs: { COD: 'L1' } }, { id: 2, src: 0, xf: [1, 0, 0, 1, 1, 1] }],
      shapes: [{ id: 3, kind: 'line', pts: [0, 0, 1, 1], stroke: '#fff', fill: null }],
      dims: [{ id: 4, ax: 0, ay: 0, bx: 1, by: 0, off: 0.5 }],
    }
    const vis = placed.model.layers.map(l => l.name !== 'A')
    const saved = JSON.parse(JSON.stringify(serializeState(placed.model, edits, vis, placed.libDefs)))

    // reabre com um objeto a mais no começo do arquivo: os índices mudam, os handles não
    const reopened = restoreState(buildCadModel(db([line('09', -5), line('10', 0), line('11', 5)])), saved)
    expect(reopened.lost).toBe(0)
    expect(reopened.edits.ov).toEqual({ 2: null })
    expect(reopened.edits.cp[1].src).toBe(1)
    expect(reopened.model.objs[reopened.edits.cp[0].src].name).toBe('Spot')
    expect(reopened.edits.cp[0].attrs).toEqual({ COD: 'L1' })
    expect(reopened.edits.shapes).toEqual(edits.shapes)
    expect(reopened.edits.dims).toEqual(edits.dims)
    expect(reopened.layerVis).toEqual(reopened.model.layers.map(l => l.name !== 'A'))
  })
})
