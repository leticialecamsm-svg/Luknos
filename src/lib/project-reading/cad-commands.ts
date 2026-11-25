// Comandos do laboratório CAD: Centerline e Distribuir Luz (mesma lógica do
// distribuir_luminarias.lsp usado no AutoCAD).
import type { Dim } from './cad-state'

export type Seg = [number, number, number, number]
type Pt = [number, number]

/**
 * Linha central entre duas linhas: liga o ponto médio das pontas
 * correspondentes (se foram desenhadas em sentidos opostos, a segunda é
 * invertida). Vale pra paralelas e pra linhas em ângulo (bissetriz).
 */
export function centerline(a: Seg, b: Seg): Seg | null {
  const dot = (a[2] - a[0]) * (b[2] - b[0]) + (a[3] - a[1]) * (b[3] - b[1])
  const c: Seg = dot < 0 ? [b[2], b[3], b[0], b[1]] : b
  const out: Seg = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2, (a[3] + c[3]) / 2]
  return Math.hypot(out[2] - out[0], out[3] - out[1]) < 1e-9 ? null : out
}

export interface DistribuirInput {
  p1: Pt; p2: Pt // extremidades da parede
  lado: Pt // qualquer ponto do lado onde as luminárias ficam
  afastamento: number // da parede (unidades do desenho)
  quantidade: number
  distCota: number // linha de cotas pra fora das luminárias
}

/**
 * Luminárias igualmente espaçadas ao longo da parede: entre elas vai um passo,
 * nas extremidades meio passo. Devolve os centros e as cotas.
 */
export function distribuirLuz(i: DistribuirInput) {
  const dx = i.p2[0] - i.p1[0], dy = i.p2[1] - i.p1[1]
  const len = Math.hypot(dx, dy)
  const n = Math.floor(i.quantidade)
  if (!(len > 1e-9) || !(n >= 1)) return null
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux
  const sinal = (i.lado[0] - i.p1[0]) * nx + (i.lado[1] - i.p1[1]) * ny < 0 ? -1 : 1
  const ox = nx * sinal * i.afastamento, oy = ny * sinal * i.afastamento
  const inicio: Pt = [i.p1[0] + ox, i.p1[1] + oy], fim: Pt = [i.p2[0] + ox, i.p2[1] + oy]
  const passo = len / n
  const centros: Pt[] = Array.from({ length: n }, (_, k) => [inicio[0] + ux * (k + 0.5) * passo, inicio[1] + uy * (k + 0.5) * passo])
  const cadeia: Pt[] = [inicio, ...centros, fim]
  const cotas: Omit<Dim, 'id'>[] = cadeia.slice(1).map((b, k) => ({ ax: cadeia[k][0], ay: cadeia[k][1], bx: b[0], by: b[1], off: sinal * i.distCota }))
  if (i.afastamento > 1e-9) { // cota do afastamento da parede, ao lado da primeira luminária
    cotas.push({ ax: i.p1[0] + ux * passo / 2, ay: i.p1[1] + uy * passo / 2, bx: centros[0][0], by: centros[0][1], off: sinal * passo * 0.18 })
  }
  return { centros, linha: [inicio[0], inicio[1], fim[0], fim[1]] as Seg, cotas, passo, sinal }
}
