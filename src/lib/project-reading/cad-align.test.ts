import { describe, it, expect } from 'vitest'
import { alinhar, retasDaCota } from './cad-align'

const base = { pontos: [] as [number, number][], linhas: [] as [number, number, number, number][], tol: 0.2, reto: true }
const perto = (p: number[], q: number[]) => { expect(p[0]).toBeCloseTo(q[0]); expect(p[1]).toBeCloseTo(q[1]) }

describe('alinhamento ao desenhar', () => {
  it('sai reto na direção dominante', () => {
    perto(alinhar({ ...base, de: [0, 0], cursor: [5, 1] }).p, [5, 0])
    perto(alinhar({ ...base, de: [0, 0], cursor: [1, -5] }).p, [0, -5])
  })
  it('solto (Shift) vai onde o mouse está', () => {
    perto(alinhar({ ...base, reto: false, de: [0, 0], cursor: [5, 1] }).p, [5, 1])
  })
  it('trava no alinhamento com um ponto de referência', () => {
    const r = alinhar({ ...base, de: [0, 0], pontos: [[3, 4]], cursor: [3.1, 0.3] })
    perto(r.p, [3, 0])
    expect(r.guias.map(g => g.tipo)).toEqual(['reto', 'alinhado'])
  })
  it('sem ponto inicial, cruza duas referências', () => {
    perto(alinhar({ ...base, pontos: [[3, 4], [7, 1]], cursor: [3.05, 1.08] }).p, [3, 1])
  })
  it('paralela a uma linha inclinada vence o reto quando o mouse está nela', () => {
    const r = alinhar({ ...base, de: [0, 0], linhas: [[10, 0, 14, 4]], cursor: [3.05, 2.95] })
    perto(r.p, [3, 3])
    expect(r.guias[0].tipo).toBe('paralela')
  })
  it('perpendicular à linha de referência', () => {
    const r = alinhar({ ...base, de: [0, 0], linhas: [[10, 0, 14, 4]], cursor: [-2.02, 1.98] })
    perto(r.p, [-2, 2])
    expect(r.guias[0].tipo).toBe('perpendicular')
  })
  it('extensão da linha, sem ponto inicial', () => {
    const r = alinhar({ ...base, linhas: [[0, 0, 2, 2]], cursor: [5.1, 4.95] })
    expect(r.guias[0].tipo).toBe('extensão')
    expect(r.p[0]).toBeCloseTo(r.p[1])
  })
  it('longe de tudo, não puxa', () => {
    expect(alinhar({ ...base, pontos: [[3, 4]], cursor: [8, 8] }).guias).toEqual([])
  })
})

describe('centro do bloco atraído pelas cotas', () => {
  // cota horizontal acima e cota vertical à direita, apontando pro mesmo eixo
  const cotas = [{ ax: 0, ay: 0, bx: 5, by: 0, off: 2 }, { ax: 3, ay: -4, bx: 3, by: -1, off: 1 }]
  const linhas = cotas.flatMap(retasDaCota)
  it('cai no cruzamento do eixo da chamada com a linha da outra cota', () => {
    const r = alinhar({ cursor: [0.08, -0.93], pontos: [], linhas, reto: false, tol: 0.2 })
    perto(r.p, [0, -1])
    expect(r.guias).toHaveLength(2)
  })
  it('corre em cima do eixo quando só uma linha está perto', () => {
    perto(alinhar({ cursor: [0.1, -2.5], pontos: [], linhas, reto: false, tol: 0.2 }).p, [0, -2.5])
  })
  it('cota encostada na linha continua dando os eixos', () => {
    expect(retasDaCota({ ax: 0, ay: 0, bx: 5, by: 0, off: 0 })).toHaveLength(3)
  })
})
