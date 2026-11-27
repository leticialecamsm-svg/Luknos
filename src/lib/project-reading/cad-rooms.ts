// Ambientes marcados na planta: área, rótulo e em qual deles cada item está.
import type { Shape } from './cad-state'

export const isRoom = (s: Shape) => s.kind === 'ambiente'

export function polyArea(pts: number[]) {
  let a = 0
  for (let i = 0, n = pts.length; i < n; i += 2) a += pts[i] * pts[(i + 3) % n] - pts[(i + 2) % n] * pts[i + 1]
  return Math.abs(a) / 2
}

export function pointInPoly(pts: number[], x: number, y: number) {
  let inside = false
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Onde escrever o nome: o centróide da área (ou a média dos cantos se for degenerada). */
export function labelPoint(pts: number[]): [number, number] {
  let a = 0, cx = 0, cy = 0
  for (let i = 0, n = pts.length; i < n; i += 2) {
    const x0 = pts[i], y0 = pts[i + 1], x1 = pts[(i + 2) % n], y1 = pts[(i + 3) % n]
    const k = x0 * y1 - x1 * y0
    a += k; cx += (x0 + x1) * k; cy += (y0 + y1) * k
  }
  if (Math.abs(a) > 1e-9) return [cx / (3 * a), cy / (3 * a)]
  const n = pts.length / 2
  return [pts.filter((_, i) => i % 2 === 0).reduce((s, v) => s + v, 0) / n, pts.filter((_, i) => i % 2 === 1).reduce((s, v) => s + v, 0) / n]
}

/** Onde o nome do ambiente aparece: onde foi arrastado ou, por padrão, no centro. */
export const roomLabel = (s: Shape): [number, number] => s.rotulo ?? labelPoint(s.pts)

/** Nome do ambiente que contém o ponto; havendo um dentro do outro, vale o menor. */
export function roomAt(shapes: Shape[], x: number, y: number): string {
  let best = '', area = Infinity
  for (const s of shapes) {
    if (!isRoom(s) || !pointInPoly(s.pts, x, y)) continue
    const a = polyArea(s.pts)
    if (a < area) { area = a; best = s.text ?? '' }
  }
  return best
}

/** Ponto do meio de uma fita/perfil (pelo comprimento). */
export function midOfPath(pts: number[]): [number, number] {
  const lens: number[] = []
  for (let i = 2; i < pts.length; i += 2) lens.push(Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]))
  let half = lens.reduce((a, b) => a + b, 0) / 2
  for (let k = 0; k < lens.length; k++) {
    if (half <= lens[k] && lens[k] > 0) {
      const t = half / lens[k], i = k * 2
      return [pts[i] + (pts[i + 2] - pts[i]) * t, pts[i + 1] + (pts[i + 3] - pts[i + 1]) * t]
    }
    half -= lens[k]
  }
  return [pts[0], pts[1]]
}
