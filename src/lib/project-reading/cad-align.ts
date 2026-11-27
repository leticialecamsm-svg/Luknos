// Alinhamento ao desenhar, como no AutoCAD: traço reto (ortho) e guias de
// referência tiradas de pontos e linhas em que o mouse parou (alinhamento
// horizontal/vertical, extensão, paralela e perpendicular).
import type { Seg } from './cad-commands'

type Pt = [number, number]
export type TipoGuia = 'reto' | 'alinhado' | 'extensão' | 'paralela' | 'perpendicular'
/** Reta infinita que passa por (x, y) na direção unitária (ux, uy). */
export interface Guia { x: number; y: number; ux: number; uy: number; tipo: TipoGuia }
export interface AlinharInput {
  cursor: Pt
  de?: Pt // ponto de onde o traço está saindo
  reto: boolean // travar na horizontal/vertical a partir de `de`
  pontos: Pt[] // pontos de referência
  linhas: Seg[] // linhas de referência
  tol: number // distância pra uma guia "pegar" (unidades do desenho)
}

const distGuia = (g: Guia, p: Pt) => Math.abs((p[0] - g.x) * g.uy - (p[1] - g.y) * g.ux)
const projetar = (g: Guia, p: Pt): Pt => { const t = (p[0] - g.x) * g.ux + (p[1] - g.y) * g.uy; return [g.x + t * g.ux, g.y + t * g.uy] }
export function cruzamento(a: Guia, b: Guia): Pt | null {
  const det = a.ux * b.uy - a.uy * b.ux
  if (Math.abs(det) < 0.02) return null // paralelas (ou quase)
  const t = ((b.x - a.x) * b.uy - (b.y - a.y) * b.ux) / det
  return [a.x + t * a.ux, a.y + t * a.uy]
}

export function guiasDe(i: Pick<AlinharInput, 'de' | 'pontos' | 'linhas'>): Guia[] {
  const out: Guia[] = []
  for (const [x, y] of i.pontos) out.push({ x, y, ux: 1, uy: 0, tipo: 'alinhado' }, { x, y, ux: 0, uy: 1, tipo: 'alinhado' })
  for (const [x0, y0, x1, y1] of i.linhas) {
    const len = Math.hypot(x1 - x0, y1 - y0)
    if (!(len > 1e-9)) continue
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len
    out.push({ x: x0, y: y0, ux, uy, tipo: 'extensão' })
    if (i.de) out.push({ x: i.de[0], y: i.de[1], ux, uy, tipo: 'paralela' }, { x: i.de[0], y: i.de[1], ux: -uy, uy: ux, tipo: 'perpendicular' })
  }
  return out
}

/** Onde o ponto vai cair e quais guias estão segurando. */
export function alinhar(i: AlinharInput): { p: Pt; guias: Guia[] } {
  const c = i.cursor, todas = guiasDe(i)
  const maisPerto = (l: Guia[]) => l.filter(g => distGuia(g, c) <= i.tol).sort((a, b) => distGuia(a, c) - distGuia(b, c))
  // reta principal: paralela/perpendicular escolhida pelo mouse vale mais que o reto
  let base: Guia | undefined = i.de ? maisPerto(todas.filter(g => g.tipo === 'paralela' || g.tipo === 'perpendicular'))[0] : undefined
  if (!base && i.de && i.reto) {
    const horizontal = Math.abs(c[0] - i.de[0]) >= Math.abs(c[1] - i.de[1])
    base = { x: i.de[0], y: i.de[1], ux: horizontal ? 1 : 0, uy: horizontal ? 0 : 1, tipo: 'reto' }
  }
  if (base) {
    const pe = projetar(base, c)
    let melhor: { p: Pt; g: Guia; d: number } | null = null
    for (const g of todas) {
      if (g.tipo === 'paralela' || g.tipo === 'perpendicular') continue
      const x = cruzamento(base, g)
      if (!x) continue
      const d = Math.hypot(x[0] - pe[0], x[1] - pe[1])
      if (d <= i.tol && (!melhor || d < melhor.d)) melhor = { p: x, g, d }
    }
    return melhor ? { p: melhor.p, guias: [base, melhor.g] } : { p: pe, guias: [base] }
  }
  const perto = maisPerto(todas)
  for (let a = 0; a < perto.length; a++) for (let b = a + 1; b < perto.length; b++) {
    const x = cruzamento(perto[a], perto[b])
    if (x && Math.hypot(x[0] - c[0], x[1] - c[1]) <= i.tol * 1.5) return { p: x, guias: [perto[a], perto[b]] }
  }
  return perto.length ? { p: projetar(perto[0], c), guias: [perto[0]] } : { p: c, guias: [] }
}

/**
 * Retas que atraem o centro de um bloco: a linha de cota e as duas linhas de
 * chamada de cada cota (como retas infinitas, mesmo com a cota encostada).
 */
export function retasDaCota(d: { ax: number; ay: number; bx: number; by: number; off: number }): Seg[] {
  const dx = d.bx - d.ax, dy = d.by - d.ay, len = Math.hypot(dx, dy)
  if (!(len > 1e-9)) return []
  const nx = -dy / len, ny = dx / len, ox = nx * d.off, oy = ny * d.off
  return [
    [d.ax + ox, d.ay + oy, d.bx + ox, d.by + oy],
    [d.ax, d.ay, d.ax + nx, d.ay + ny],
    [d.bx, d.by, d.bx + nx, d.by + ny],
  ]
}
