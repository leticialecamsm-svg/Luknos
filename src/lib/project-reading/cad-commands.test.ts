import { describe, it, expect } from 'vitest'
import { centerline, distribuirLuz } from './cad-commands'

// onde a linha da cota fica de fato (mesma conta do desenho)
const dimLine = (d: { ax: number; ay: number; bx: number; by: number; off: number }) => {
  const l = Math.hypot(d.bx - d.ax, d.by - d.ay), nx = -(d.by - d.ay) / l, ny = (d.bx - d.ax) / l
  return [d.ax + nx * d.off, d.ay + ny * d.off, d.bx + nx * d.off, d.by + ny * d.off]
}

describe('centerline', () => {
  it('fica no meio de paralelas, mesmo desenhadas em sentidos opostos', () => {
    expect(centerline([0, 0, 4, 0], [4, 2, 0, 2])).toEqual([0, 1, 4, 1])
    expect(centerline([0, 0, 4, 0], [0, 2, 4, 2])).toEqual([0, 1, 4, 1])
  })
})

describe('distribuir luz', () => {
  const base = { p1: [0, 0] as [number, number], p2: [4, 0] as [number, number], afastamento: 0.5, quantidade: 4, distCota: 0.2 }
  it('passo entre luminárias e meio passo nas pontas, do lado clicado', () => {
    const r = distribuirLuz({ ...base, lado: [2, 3] })!
    expect(r.centros).toEqual([[0.5, 0.5], [1.5, 0.5], [2.5, 0.5], [3.5, 0.5]])
    expect(r.passo).toBe(1)
    expect(r.cotas).toHaveLength(6)
    expect(dimLine(r.cotas[0])[1]).toBeCloseTo(0.7) // cadeia pra fora das luminárias
    const parede = dimLine(r.cotas[5])
    expect(parede[0]).toBeCloseTo(0.5 - 0.18) // ao lado da primeira
  })
  it('do outro lado espelha tudo', () => {
    const r = distribuirLuz({ ...base, lado: [2, -3] })!
    expect(r.centros[0]).toEqual([0.5, -0.5])
    expect(dimLine(r.cotas[0])[1]).toBeCloseTo(-0.7)
    expect(dimLine(r.cotas[5])[0]).toBeCloseTo(0.32)
  })
  it('recusa parede sem comprimento ou quantidade zero', () => {
    expect(distribuirLuz({ ...base, p2: [0, 0], lado: [0, 1] })).toBeNull()
    expect(distribuirLuz({ ...base, quantidade: 0, lado: [0, 1] })).toBeNull()
  })
})
