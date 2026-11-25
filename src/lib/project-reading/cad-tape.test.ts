import { describe, it, expect } from 'vitest'
import { perfilPoly, setLength, gripsOf, dragGrip, dimensionarFonte, nearestOnTape, polyLength } from './cad-tape'
import { normalizeLibBlock, type LibBlock } from './cad'
import type { Shape } from './cad-state'

const perfil: Shape = { id: 1, kind: 'perfil', pts: [0, 0, 2, 0], w: 0.04, stroke: '#fff', fill: null }

describe('perfil e fita', () => {
  it('monta o retângulo em volta do eixo e muda o comprimento a partir do início', () => {
    expect(perfilPoly(perfil)).toEqual([0, 0.02, 2, 0.02, 2, -0.02, 0, -0.02])
    expect(setLength(perfil, 3.5).pts).toEqual([0, 0, 3.5, 0])
  })
  it('alças: ponta estica no eixo, lateral muda a espessura', () => {
    expect(gripsOf(perfil)).toHaveLength(3)
    expect(dragGrip(perfil, 1, 5, 3, 0.01).pts).toEqual([0, 0, 5, 0])
    expect(dragGrip(perfil, 0, -1, 3, 0.01).pts).toEqual([-1, 0, 2, 0])
    expect(dragGrip(perfil, 2, 1, -0.05, 0.01).w).toBeCloseTo(0.1)
    expect(dragGrip(perfil, 1, 0, 2, 0.01, true).pts).toEqual([0, 0, 0, 2])
  })
  it('fita em L soma os trechos e conecta no ponto mais próximo', () => {
    const fita: Shape = { id: 2, kind: 'fita', pts: [0, 0, 3, 0, 3, 4], stroke: '#f00', fill: null }
    expect(polyLength(fita.pts)).toBe(7)
    expect(nearestOnTape(fita, 5, 2)).toEqual([3, 2])
  })
  it('dimensiona a fonte com 20% de folga e divide quando passa do maior modelo', () => {
    expect(dimensionarFonte(4, 9.6)).toMatchObject({ quantidade: 1, potencia: 48 })
    expect(dimensionarFonte(60, 9.6)).toMatchObject({ quantidade: 2, potencia: 400 })
  })
})

describe('normalizeLibBlock', () => {
  const base: LibBlock = { name: 'Painel', unitToMeters: 0.001, cols: ['#fff'], segs: [2387, 1877, 2387.2, 1877.2], segC: [0], texts: [], fills: [], bbox: [2387, 1877, 2387.2, 1877.2] }
  it('corrige unidade errada (desenho em metros marcado como mm) e centraliza bloco longe da base', () => {
    const n = normalizeLibBlock(base)
    expect(n.unitToMeters).toBe(1)
    expect(n.bbox[0]).toBeCloseTo(-0.1); expect(n.bbox[2]).toBeCloseTo(0.1)
    expect(n.segs[0]).toBeCloseTo(-0.1)
  })
  it('não mexe em bloco correto', () => {
    const ok: LibBlock = { ...base, unitToMeters: 1, segs: [-0.1, 0, 0.1, 0], bbox: [-0.1, 0, 0.1, 0] }
    expect(normalizeLibBlock(ok)).toBe(ok)
  })
})
