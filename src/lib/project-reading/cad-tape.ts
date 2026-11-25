// Perfil + Fita, Fita e Fonte do laboratório CAD: geometria e dimensionamento.
import type { Shape } from './cad-state'
import { calcularFita, sugerirFonte, CATALOGO_FONTES_12V } from './calculations'

export const isTape = (s: Shape) => s.kind === 'perfil' || s.kind === 'fita'

export function polyLength(pts: number[]) {
  let l = 0
  for (let i = 2; i < pts.length; i += 2) l += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1])
  return l
}

/** Eixo do perfil: comprimento, direção e normal. */
export function axis(s: Shape) {
  const dx = s.pts[2] - s.pts[0], dy = s.pts[3] - s.pts[1]
  const len = Math.hypot(dx, dy)
  const ux = len ? dx / len : 1, uy = len ? dy / len : 0
  return { len, ux, uy, nx: -uy, ny: ux }
}

/** Retângulo do perfil (4 cantos) em volta do eixo. */
export function perfilPoly(s: Shape): number[] {
  const { nx, ny } = axis(s), h = (s.w ?? 0) / 2
  const [x0, y0, x1, y1] = s.pts
  return [x0 + nx * h, y0 + ny * h, x1 + nx * h, y1 + ny * h, x1 - nx * h, y1 - ny * h, x0 - nx * h, y0 - ny * h]
}

/** Muda o comprimento mantendo o início e a direção. */
export function setLength(s: Shape, len: number): Shape {
  if (s.pts.length !== 4 || !(len > 0)) return s
  const { ux, uy } = axis(s)
  return { ...s, pts: [s.pts[0], s.pts[1], s.pts[0] + ux * len, s.pts[1] + uy * len] }
}

/** Alças de redimensionar: perfil = início, fim e lateral (espessura); fita = cada vértice. */
export function gripsOf(s: Shape): [number, number][] {
  if (s.kind === 'perfil') {
    const { nx, ny } = axis(s), h = (s.w ?? 0) / 2
    return [[s.pts[0], s.pts[1]], [s.pts[2], s.pts[3]], [(s.pts[0] + s.pts[2]) / 2 + nx * h, (s.pts[1] + s.pts[3]) / 2 + ny * h]]
  }
  if (s.kind !== 'fita') return []
  const out: [number, number][] = []
  for (let i = 0; i < s.pts.length; i += 2) out.push([s.pts[i], s.pts[i + 1]])
  return out
}

/**
 * Arrasta uma alça até (x, y). No perfil, as pontas esticam ao longo do próprio
 * eixo (com `livre`, a ponta vai pra qualquer lugar, girando o perfil).
 */
export function dragGrip(s: Shape, grip: number, x: number, y: number, min: number, livre = false): Shape {
  if (s.kind === 'fita') {
    const pts = [...s.pts]; pts[grip * 2] = x; pts[grip * 2 + 1] = y
    return { ...s, pts }
  }
  const { ux, uy, nx, ny, len } = axis(s)
  if (grip === 2) {
    const d = Math.abs((x - s.pts[0]) * nx + (y - s.pts[1]) * ny)
    return { ...s, w: Math.max(min, d * 2) }
  }
  const fixed = grip === 0 ? 2 : 0
  const fx = s.pts[fixed], fy = s.pts[fixed + 1]
  let nxp = x, nyp = y
  if (!livre) {
    const sign = grip === 0 ? -1 : 1
    const t = Math.max(min, ((x - fx) * ux + (y - fy) * uy) * sign)
    nxp = fx + ux * t * sign; nyp = fy + uy * t * sign
  } else if (Math.hypot(x - fx, y - fy) < min) return { ...s, pts: [...s.pts], w: s.w }
  const pts = [...s.pts]; pts[grip * 2] = nxp; pts[grip * 2 + 1] = nyp
  return len ? { ...s, pts } : s
}

/** Ponto da fita mais próximo de (x, y) — onde a linha da fonte se conecta. */
export function nearestOnTape(s: Shape, x: number, y: number): [number, number] {
  let best: [number, number] = [s.pts[0], s.pts[1]], bd = Infinity
  for (let i = 0; i + 3 < s.pts.length; i += 2) {
    const ax = s.pts[i], ay = s.pts[i + 1], dx = s.pts[i + 2] - ax, dy = s.pts[i + 3] - ay
    const l2 = dx * dx + dy * dy
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0
    const px = ax + t * dx, py = ay + t * dy, d = Math.hypot(x - px, y - py)
    if (d < bd) { bd = d; best = [px, py] }
  }
  return best
}

/** Fonte(s) pra um trecho de fita; passando do maior modelo, divide em várias iguais. */
export function dimensionarFonte(comprimentoM: number, wPorM: number) {
  const { consumoW, fonteMinimaW } = calcularFita(comprimentoM, wPorM)
  const maior = CATALOGO_FONTES_12V[CATALOGO_FONTES_12V.length - 1]
  const quantidade = Math.max(1, Math.ceil(fonteMinimaW / maior))
  const potencia = sugerirFonte(fonteMinimaW / quantidade) ?? maior
  return { consumoW, minimaW: fonteMinimaW, quantidade, potencia }
}
