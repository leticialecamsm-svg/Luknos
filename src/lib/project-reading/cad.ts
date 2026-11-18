// Leitura de arquivos CAD (DWG/DXF) no navegador — protótipo. Converte o
// desenho do espaço-modelo em segmentos de reta (já com blocos expandidos),
// textos e pontos de inserção de bloco, tudo em coordenadas do desenho.

export interface CadLayer { name: string; color: string; visible: boolean; segs: number; texts: number }
export interface CadText { x: number; y: number; h: number; rot: number; text: string; layer: number }
export interface CadInsert { name: string; x: number; y: number; layer: number }
export interface CadModel {
  layers: CadLayer[]
  segs: Float64Array // x1,y1,x2,y2 …
  segLayer: Uint16Array
  texts: CadText[]
  inserts: CadInsert[] // só os blocos colocados direto no espaço-modelo
  unitName: string
  unitToMeters: number
  unitKnown: boolean
}

const UNITS: Record<number, [string, number]> = {
  1: ['polegadas', 0.0254], 2: ['pés', 0.3048], 4: ['mm', 0.001], 5: ['cm', 0.01], 6: ['m', 1], 7: ['km', 1000],
}

const ACI_BASE: Record<number, string> = {
  1: '#dc2626', 2: '#b45309', 3: '#16a34a', 4: '#0891b2', 5: '#2563eb', 6: '#c026d3', 7: '#1f2937', 8: '#6b7280', 9: '#9ca3af',
}
export function aciToColor(i: number): string {
  if (ACI_BASE[i]) return ACI_BASE[i]
  if (i >= 250 && i <= 255) return ['#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb'][i - 250]
  if (i >= 10 && i <= 249) {
    const hue = (Math.floor((i - 10) / 10) * 15) % 360
    const k = (i - 10) % 10
    return `hsl(${hue}, ${k % 2 === 0 ? 75 : 45}%, ${32 + Math.floor(k / 2) * 6}%)`
  }
  return '#1f2937'
}

type M = [number, number, number, number, number, number] // x' = a x + c y + e ; y' = b x + d y + f
const ID: M = [1, 0, 0, 1, 0, 0]
const mul = (p: M, q: M): M => [
  p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5],
]
const ap = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

export function buildCadModel(db: any): CadModel {
  const blocks = new Map<string, { base: { x: number; y: number }; entities: any[] }>()
  let model: any[] = []
  for (const b of db.tables?.BLOCK_RECORD?.entries ?? []) {
    if (b.name === '*Model_Space') model = b.entities ?? []
    else blocks.set(b.name, { base: b.basePoint ?? { x: 0, y: 0 }, entities: b.entities ?? [] })
  }
  const layerIndex = new Map<string, number>()
  const layers: CadLayer[] = []
  const layerInfo = new Map<string, any>()
  for (const l of db.tables?.LAYER?.entries ?? []) layerInfo.set(l.name, l)
  const layerOf = (name: string): number => {
    let i = layerIndex.get(name)
    if (i === undefined) {
      const info = layerInfo.get(name)
      const hidden = !!info && (info.off || info.frozen)
      i = layers.length
      layers.push({ name, color: aciToColor(Math.abs(info?.colorIndex ?? 7)), visible: !hidden && name.toUpperCase() !== 'DEFPOINTS', segs: 0, texts: 0 })
      layerIndex.set(name, i)
    }
    return i
  }

  const segs: number[] = []
  const segLayer: number[] = []
  const texts: CadText[] = []
  const inserts: CadInsert[] = []

  const seg = (m: M, x1: number, y1: number, x2: number, y2: number, layer: number) => {
    const [a, b] = ap(m, x1, y1), [c, d] = ap(m, x2, y2)
    segs.push(a, b, c, d); segLayer.push(layer); layers[layer].segs++
  }
  const poly = (m: M, pts: [number, number][], closed: boolean, layer: number) => {
    for (let i = 0; i < pts.length - 1; i++) seg(m, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], layer)
    if (closed && pts.length > 2) seg(m, pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], layer)
  }
  const arcPts = (cx: number, cy: number, rx: number, ry: number, rot: number, a0: number, a1: number): [number, number][] => {
    let span = a1 - a0
    if (span <= 0) span += Math.PI * 2
    const n = Math.max(8, Math.ceil((span / (Math.PI * 2)) * 48))
    const out: [number, number][] = []
    for (let i = 0; i <= n; i++) {
      const t = a0 + (span * i) / n
      const x = rx * Math.cos(t), y = ry * Math.sin(t)
      out.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)])
    }
    return out
  }
  const bulgeArc = (p: any, q: any): [number, number][] => {
    const bulge = p.bulge || 0
    if (!bulge) return [[p.x, p.y], [q.x, q.y]]
    const dx = q.x - p.x, dy = q.y - p.y
    const chord = Math.hypot(dx, dy)
    const theta = 4 * Math.atan(bulge)
    const r = chord / (2 * Math.sin(theta / 2))
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2
    const off = Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2)) * Math.sign(bulge) * Math.sign(r)
    const cx = mx - (dy / chord) * off, cy = my + (dx / chord) * off
    const a0 = Math.atan2(p.y - cy, p.x - cx)
    const n = Math.max(2, Math.ceil(Math.abs(theta) / (Math.PI / 12)))
    const out: [number, number][] = []
    for (let i = 0; i <= n; i++) { const a = a0 + (theta * i) / n; out.push([cx + Math.abs(r) * Math.cos(a), cy + Math.abs(r) * Math.sin(a)]) }
    return out
  }
  const cleanText = (t: string) => String(t ?? '')
    .replace(/\\[Pp]/g, ' ').replace(/\\[A-Za-z][^;\\]*;/g, '').replace(/[{}]/g, '').replace(/\\\\/g, '\\').trim()

  function walk(entities: any[], m: M, depth: number, inherited: string | null, top: boolean) {
    for (const e of entities) {
      if (e.isVisible === false) continue
      const lname = e.layer === '0' && inherited ? inherited : e.layer ?? '0'
      const li = layerOf(lname)
      switch (e.type) {
        case 'LINE':
          seg(m, e.startPoint.x, e.startPoint.y, e.endPoint.x, e.endPoint.y, li); break
        case 'LWPOLYLINE': {
          const v = e.vertices ?? []
          const closed = !!(e.flag & 1)
          const pts: [number, number][] = []
          for (let i = 0; i < v.length; i++) {
            const nxt = v[i + 1] ?? (closed ? v[0] : null)
            if (!nxt) { pts.push([v[i].x, v[i].y]); break }
            const arc = bulgeArc(v[i], nxt)
            for (let k = 0; k < arc.length - 1; k++) pts.push(arc[k])
            if (i === v.length - 1 && closed) pts.push(arc[arc.length - 1])
          }
          if (!closed && v.length) pts.push([v[v.length - 1].x, v[v.length - 1].y])
          poly(m, pts, false, li); break
        }
        case 'CIRCLE': poly(m, arcPts(e.center.x, e.center.y, e.radius, e.radius, 0, 0, Math.PI * 2), false, li); break
        case 'ARC': poly(m, arcPts(e.center.x, e.center.y, e.radius, e.radius, 0, e.startAngle, e.endAngle), false, li); break
        case 'ELLIPSE': {
          const mx = e.majorAxisEndPoint?.x ?? 1, my = e.majorAxisEndPoint?.y ?? 0
          const rx = Math.hypot(mx, my)
          poly(m, arcPts(e.center.x, e.center.y, rx, rx * (e.axisRatio ?? 1), Math.atan2(my, mx), e.startAngle ?? 0, (e.endAngle ?? 0) <= (e.startAngle ?? 0) ? (e.startAngle ?? 0) + Math.PI * 2 : e.endAngle), false, li)
          break
        }
        case 'MLINE': poly(m, (e.vertices ?? []).map((v: any) => [v.vertex.x, v.vertex.y] as [number, number]), !!(e.flags & 2), li); break
        case 'LEADER': poly(m, (e.vertices ?? []).map((v: any) => [v.x, v.y] as [number, number]), false, li); break
        case 'TEXT': {
          const [x, y] = ap(m, e.startPoint.x, e.startPoint.y)
          const sc = Math.hypot(m[0], m[1])
          texts.push({ x, y, h: (e.textHeight ?? 0.1) * sc, rot: (e.rotation ?? 0) + Math.atan2(m[1], m[0]), text: cleanText(e.text), layer: li })
          layers[li].texts++; break
        }
        case 'MTEXT': {
          const [x, y] = ap(m, e.insertionPoint.x, e.insertionPoint.y)
          const sc = Math.hypot(m[0], m[1])
          texts.push({ x, y, h: (e.textHeight ?? 0.1) * sc, rot: (e.rotation ?? 0) + Math.atan2(m[1], m[0]), text: cleanText(e.text), layer: li })
          layers[li].texts++; break
        }
        case 'DIMENSION': {
          const b = e.name ? blocks.get(e.name) : null
          if (b && depth < 8) walk(b.entities, m, depth + 1, lname, false)
          break
        }
        case 'INSERT': {
          const b = blocks.get(e.name)
          if (top && !String(e.name).startsWith('*')) inserts.push({ name: e.name, x: e.insertionPoint.x, y: e.insertionPoint.y, layer: li })
          if (!b || depth >= 8) break
          const sx = e.xScale ?? 1, sy = e.yScale ?? 1, rot = e.rotation ?? 0
          const c = Math.cos(rot), s = Math.sin(rot)
          const place: M = [c * sx, s * sx, -s * sy, c * sy, e.insertionPoint.x, e.insertionPoint.y]
          const base: M = [1, 0, 0, 1, -(b.base?.x ?? 0), -(b.base?.y ?? 0)]
          walk(b.entities, mul(m, mul(place, base)), depth + 1, lname, false)
          break
        }
        default: break // HATCH, VIEWPORT, ATTDEF… não desenhados no protótipo
      }
    }
  }
  walk(model, ID, 0, null, true)

  const code = Number(db.header?.INSUNITS ?? 0)
  const u = UNITS[code]
  return {
    layers, segs: Float64Array.from(segs), segLayer: Uint16Array.from(segLayer), texts, inserts,
    unitName: u ? u[0] : 'unidades (não informado)', unitToMeters: u ? u[1] : 1, unitKnown: !!u,
  }
}

export async function loadCadFile(buf: ArrayBuffer): Promise<CadModel> {
  const { LibreDwg, Dwg_File_Type } = await import('@mlightcad/libredwg-web')
  const lib = await LibreDwg.create('/libredwg/')
  const head = new TextDecoder('latin1').decode(new Uint8Array(buf, 0, 6))
  const isDwg = /^AC10/.test(head)
  const data = lib.dwg_read_data(buf, isDwg ? Dwg_File_Type.DWG : Dwg_File_Type.DXF)
  if (!data) throw new Error('Não foi possível ler o arquivo (DWG/DXF inválido ou versão não suportada).')
  const db = lib.convert(data)
  const model = buildCadModel(db)
  try { lib.dwg_free(data) } catch { /* libera memória, não crítico */ }
  return model
}
