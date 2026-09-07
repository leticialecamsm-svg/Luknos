import { describe, it, expect } from 'vitest'
import {
  pointInPolygon, distance, polylineLength,
  computeScaleMetersPerPixel, measurementLengthMeters, groupPointsByEnvironment,
} from './geometry'

describe('pointInPolygon', () => {
  const quadrado: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]]

  it('detecta ponto dentro do polígono', () => {
    expect(pointInPolygon([5, 5], quadrado)).toBe(true)
  })

  it('detecta ponto fora do polígono', () => {
    expect(pointInPolygon([20, 20], quadrado)).toBe(false)
  })

  it('retorna false pra polígono degenerado (menos de 3 pontos)', () => {
    expect(pointInPolygon([1, 1], [[0, 0], [1, 1]])).toBe(false)
  })

  it('funciona com polígono côncavo (L)', () => {
    const emL: [number, number][] = [[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]]
    expect(pointInPolygon([7, 7], emL)).toBe(false) // no "recorte" do L
    expect(pointInPolygon([2, 2], emL)).toBe(true)
  })
})

describe('distance / polylineLength', () => {
  it('calcula distância entre dois pontos (3-4-5)', () => {
    expect(distance([0, 0], [3, 4])).toBe(5)
  })

  it('soma segmentos de uma polilinha', () => {
    expect(polylineLength([[0, 0], [3, 4], [3, 4 + 5]])).toBe(10)
  })

  it('polilinha de um ponto só tem comprimento zero', () => {
    expect(polylineLength([[0, 0]])).toBe(0)
  })
})

describe('computeScaleMetersPerPixel', () => {
  it('calcula metros por pixel a partir de dois pontos e distância real', () => {
    // 100px de distância representando 2 metros reais → 0.02 m/px
    expect(computeScaleMetersPerPixel([0, 0], [100, 0], 2)).toBeCloseTo(0.02)
  })

  it('rejeita dois pontos iguais', () => {
    expect(() => computeScaleMetersPerPixel([5, 5], [5, 5], 2)).toThrow()
  })

  it('rejeita distância real zero ou negativa', () => {
    expect(() => computeScaleMetersPerPixel([0, 0], [10, 0], 0)).toThrow()
  })
})

describe('measurementLengthMeters', () => {
  it('converte uma polilinha em pixels pra metros usando a escala', () => {
    const pontosPx: [number, number][] = [[0, 0], [200, 0]]
    expect(measurementLengthMeters(pontosPx, 0.02)).toBeCloseTo(4) // 200px * 0.02 m/px
  })
})

describe('groupPointsByEnvironment', () => {
  const sala = { id: 'sala', polygon: [[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][] }
  const cozinha = { id: 'cozinha', polygon: [[20, 0], [30, 0], [30, 10], [20, 10]] as [number, number][] }

  it('agrupa pontos nos ambientes corretos', () => {
    const pontos = [{ x: 5, y: 5 }, { x: 25, y: 5 }, { x: 5, y: 8 }]
    const grupos = groupPointsByEnvironment(pontos, [sala, cozinha])
    expect(grupos.get('sala')?.length).toBe(2)
    expect(grupos.get('cozinha')?.length).toBe(1)
  })

  it('pontos fora de qualquer ambiente ficam sob a chave null, não somem', () => {
    const pontos = [{ x: 100, y: 100 }]
    const grupos = groupPointsByEnvironment(pontos, [sala, cozinha])
    expect(grupos.get(null)?.length).toBe(1)
  })
})
