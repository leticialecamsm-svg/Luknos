// Funções puras de geometria usadas pela Leitura de Projeto — sem I/O, sem
// dependência de framework, fáceis de testar isoladamente.

export type Point = [number, number]

/**
 * Ray casting — verifica se um ponto está dentro de um polígono (ambos em
 * coordenadas da página do PDF). Usado pra agrupar símbolos por ambiente.
 */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false
  const [px, py] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersects = (yi > py) !== (yj > py) &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

/** Soma das distâncias entre pontos consecutivos de uma polilinha. */
export function polylineLength(points: Point[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i])
  return total
}

/**
 * Calibração manual de escala: usuário marca dois pontos conhecidos na
 * planta (em pixels da página renderizada) e informa a distância real entre
 * eles (em metros). Retorna quantos metros vale cada pixel nessa página.
 */
export function computeScaleMetersPerPixel(pointA: Point, pointB: Point, realDistanceMeters: number): number {
  const pixelDistance = distance(pointA, pointB)
  if (pixelDistance <= 0) throw new Error('Os dois pontos de calibração não podem ser o mesmo ponto.')
  if (realDistanceMeters <= 0) throw new Error('A distância real precisa ser maior que zero.')
  return realDistanceMeters / pixelDistance
}

/** Converte uma polilinha em pixels pra metros, usando a escala da página. */
export function measurementLengthMeters(points: Point[], metersPerPixel: number): number {
  return polylineLength(points) * metersPerPixel
}

/**
 * Ponto mais próximo de `target` em cima de uma polilinha — usado pra ancorar
 * o cabo (linha pontilhada) da fonte no trecho de fita mais perto dela, já
 * que a fonte quase nunca fica bem em cima da fita na planta.
 */
export function closestPointOnPolyline(target: Point, points: Point[]): Point {
  if (points.length === 0) return target
  if (points.length === 1) return points[0]
  let best = points[0]
  let bestDist = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const lenSq = dx * dx + dy * dy
    let t = lenSq > 0 ? ((target[0] - a[0]) * dx + (target[1] - a[1]) * dy) / lenSq : 0
    t = Math.max(0, Math.min(1, t))
    const candidate: Point = [a[0] + t * dx, a[1] + t * dy]
    const d = distance(target, candidate)
    if (d < bestDist) { bestDist = d; best = candidate }
  }
  return best
}

/**
 * Agrupa ocorrências de símbolo por ambiente (o primeiro polígono, na ordem
 * recebida, que contém o ponto). Ocorrências fora de qualquer ambiente
 * ficam em `environmentId: null` ("sem ambiente"), pra nunca sumirem
 * silenciosamente da contagem.
 */
export function groupPointsByEnvironment<T extends { x: number; y: number }>(
  points: T[],
  environments: { id: string; polygon: Point[] }[],
): Map<string | null, T[]> {
  const result = new Map<string | null, T[]>()
  for (const p of points) {
    const env = environments.find(e => pointInPolygon([p.x, p.y], e.polygon))
    const key = env?.id ?? null
    if (!result.has(key)) result.set(key, [])
    result.get(key)!.push(p)
  }
  return result
}
