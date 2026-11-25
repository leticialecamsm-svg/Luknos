import { describe, it, expect } from 'vitest'
import { detectUnit, buildCadModel, appendLibBlock, type LibBlock } from './cad'
import { refitSizes, restoreState, EMPTY_EDITS, type Edits } from './cad-state'

const alturas = (h: number) => Array.from({ length: 20 }, (_, i) => h * (0.8 + (i % 5) * 0.1))

describe('unidade real do desenho', () => {
  it('corrige arquivo que diz mm mas foi desenhado em metros (e o contrário)', () => {
    expect(detectUnit(alturas(0.1), 0.001)).toBe(1)
    expect(detectUnit(alturas(10), 1)).toBe(0.01)
    expect(detectUnit(alturas(120), 1)).toBe(0.001)
  })
  it('respeita a unidade informada quando ela faz sentido, ou sem textos suficientes', () => {
    expect(detectUnit(alturas(0.1), 1)).toBe(1)
    expect(detectUnit(alturas(100), 0.001)).toBe(0.001)
    expect(detectUnit([0.1, 0.1], 0.001)).toBe(0.001)
  })

  const texto = (i: number) => ({ type: 'TEXT', handle: 't' + i, layer: '0', startPoint: { x: i, y: 0 }, textHeight: 0.1, text: 'a' })
  const base = buildCadModel({ header: { INSUNITS: 4 }, tables: { LAYER: { entries: [] }, BLOCK_RECORD: { entries: [{ name: '*Model_Space', entities: Array.from({ length: 10 }, (_, i) => texto(i)) }] } } })
  const spot: LibBlock = { name: 'Spot', unitToMeters: 1, cols: ['#fff'], segs: [0, 0, 0.1, 0], segC: [0], texts: [], fills: [], bbox: [0, 0, 0.1, 0] }

  it('o modelo já abre em metros', () => {
    expect(base.unitToMeters).toBe(1)
    expect(base.unitGuessed).toBe(true)
  })
  it('trabalho salvo na unidade errada volta com blocos no tamanho real e medidas certas', () => {
    const { obj } = appendLibBlock(base, spot)
    const velho = { v: 1 as const, ov: [], dims: [], next: 5, hidden: [], libs: [spot],
      cp: [{ id: 1, ref: { lib: 'Spot' }, xf: [0, 150, -150, 0, 7, 8] as [number, number, number, number, number, number] }],
      shapes: [{ id: 2, kind: 'perfil' as const, pts: [0, 0, 2, 0], w: 30, stroke: '#fff', fill: null }] }
    const r = restoreState(base, velho)
    expect(r.edits.cp[0].src).toBe(obj)
    expect(r.edits.cp[0].xf).toEqual([0, 1, -1, 0, 7, 8])
    expect(r.edits.shapes[0].w).toBeCloseTo(0.03)
    // salvo depois da correção não é mexido de novo
    expect(restoreState(base, { ...velho, unit: 1 }).edits.shapes[0].w).toBe(30)
  })
  it('trocar a unidade à mão reajusta o que foi colocado', () => {
    const { model, obj } = appendLibBlock(base, spot)
    const ed: Edits = { ...EMPTY_EDITS, cp: [{ id: 1, src: obj, xf: [1, 0, 0, 1, 0, 0] }], shapes: [{ id: 2, kind: 'text', pts: [0, 0], h: 0.2, text: 'x', stroke: '#fff', fill: null }] }
    const r = refitSizes({ ...model, unitToMeters: 0.01 }, ed, new Map([['Spot', spot]]), 1)
    expect(r.cp[0].xf[0]).toBe(100)
    expect(r.shapes[0].h).toBe(20)
  })
})
