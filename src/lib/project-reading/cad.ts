// Leitura de arquivos CAD (DWG/DXF) no navegador — protótipo. Converte o
// desenho do espaço-modelo em segmentos de reta (já com blocos expandidos),
// textos e pontos de inserção de bloco, tudo em coordenadas do desenho.

export interface CadLayer { name: string; color: string; visible: boolean; segs: number; texts: number }
export interface CadText { x: number; y: number; h: number; rot: number; text: string; layer: number; col: number; obj: number }
/** Preenchimento (HATCH): anéis (contorno + furos) em coordenadas do desenho. */
export interface CadFill { rings: Float64Array[]; col: number; layer: number; alpha: number; obj: number }
/** Objeto de nível superior do espaço-modelo (linha, bloco, hachura...) — a unidade que se seleciona/edita. */
export interface CadObj { kind: string; name: string; layer: number; s0: number; s1: number; t0: number; t1: number; f0: number; f1: number; bbox: [number, number, number, number] }
export interface CadInsert { name: string; x: number; y: number; layer: number }
export interface CadModel {
  layers: CadLayer[]
  segs: Float64Array // x1,y1,x2,y2 …
  segLayer: Uint16Array
  texts: CadText[]
  inserts: CadInsert[] // só os blocos colocados direto no espaço-modelo
  fills: CadFill[]
  objs: CadObj[]
  segObj: Uint32Array // objeto dono de cada segmento
  segCol: Uint16Array // índice em `palette` (0 = cor da camada)
  palette: string[]
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

export function buildCadModel(db: any, opts?: { entities?: any[]; base?: { x: number; y: number } }): CadModel {
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
      layers.push({ name, color: aciToColor(Math.abs(info?.colorIndex ?? 7)), visible: !hidden, segs: 0, texts: 0 })
      layerIndex.set(name, i)
    }
    return i
  }

  const segs: number[] = []
  const segLayer: number[] = []
  const texts: CadText[] = []
  const inserts: CadInsert[] = []
  const fills: CadFill[] = []
  const objs: CadObj[] = []
  const segObjA: number[] = []
  const segColA: number[] = []
  const palette: string[] = ['']
  const palMap = new Map<string, number>()
  const palIdx = (c: string) => { let i = palMap.get(c); if (i === undefined) { i = palette.length; palette.push(c); palMap.set(c, i) } return i }
  let curCol = 0 // cor do objeto em desenho (0 = da camada)
  const entCol = (e: any, inh: number): number => {
    const ci = e.colorIndex
    if (ci === undefined || ci === 256) return 0
    if (ci === 0) return inh // PORBLOCO
    const c = typeof e.color === 'number' && e.color > 0 ? '#' + e.color.toString(16).padStart(6, '0') : aciToColor(Math.abs(ci))
    return palIdx(c)
  }

  const seg = (m: M, x1: number, y1: number, x2: number, y2: number, layer: number) => {
    const [a, b] = ap(m, x1, y1), [c, d] = ap(m, x2, y2)
    segs.push(a, b, c, d); segLayer.push(layer); segObjA.push(objs.length); segColA.push(curCol); layers[layer].segs++
  }
  const deBoor = (p: number, kn: number[], cps: any[], t: number): [number, number] => {
    let sp = p
    while (sp < cps.length - 1 && t >= kn[sp + 1]) sp++
    const d: [number, number][] = []
    for (let j = 0; j <= p; j++) d.push([cps[j + sp - p].x, cps[j + sp - p].y])
    for (let r = 1; r <= p; r++) for (let j = p; j >= r; j--) {
      const den = kn[j + 1 + sp - r] - kn[j + sp - p]
      const a = den === 0 ? 0 : (t - kn[j + sp - p]) / den
      d[j] = [(1 - a) * d[j - 1][0] + a * d[j][0], (1 - a) * d[j - 1][1] + a * d[j][1]]
    }
    return d[p]
  }
  const splinePts = (e: any): [number, number][] => {
    const cps = e.controlPoints ?? [], kn = e.knots ?? [], deg = e.degree ?? 3
    if (cps.length >= deg + 1 && kn.length === cps.length + deg + 1) {
      const t0 = kn[deg], t1 = kn[cps.length]
      const n = Math.max(16, cps.length * 6)
      const out: [number, number][] = []
      for (let i = 0; i <= n; i++) out.push(deBoor(deg, kn, cps, Math.min(t1 - 1e-9, t0 + ((t1 - t0) * i) / n)))
      out.push([cps[cps.length - 1].x, cps[cps.length - 1].y])
      return out
    }
    return (e.fitPoints?.length ? e.fitPoints : cps).map((q: any) => [q.x, q.y] as [number, number])
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

  function walk(entities: any[], m: M, depth: number, inherited: string | null, top: boolean, inhCol = 0) {
    for (const e of entities) {
      if (e.isVisible === false) continue
      const lname = e.layer === '0' && inherited ? inherited : e.layer ?? '0'
      const li = layerOf(lname)
      curCol = entCol(e, inhCol)
      const eCol = curCol
      const s0 = segs.length / 4, t0 = texts.length, f0 = fills.length
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
        case 'POLYLINE2D': case 'POLYLINE3D': {
          const v = e.vertices ?? []
          const pts: [number, number][] = []
          const closed = !!(e.flag & 1)
          for (let i = 0; i < v.length; i++) {
            const nxt = v[i + 1] ?? (closed ? v[0] : null)
            if (!nxt) { pts.push([v[i].x, v[i].y]); break }
            const arc = bulgeArc(v[i], nxt)
            for (let k = 0; k < arc.length - 1; k++) pts.push(arc[k])
          }
          poly(m, pts, closed, li); break
        }
        case 'SPLINE': poly(m, splinePts(e), !!(e.flag & 1), li); break
        case 'HATCH': {
          const rings: Float64Array[] = []
          for (const bp of e.boundaryPaths ?? []) {
            const pts: [number, number][] = []
            if ((bp.boundaryPathTypeFlag ?? 0) & 2) {
              const v = bp.vertices ?? []
              for (let i = 0; i < v.length; i++) {
                const nxt = v[i + 1] ?? v[0]
                const arc = bulgeArc(v[i], nxt)
                for (let k = 0; k < arc.length - 1; k++) pts.push(arc[k])
              }
            } else {
              for (const ed of bp.edges ?? []) {
                if (ed.type === 1) pts.push([ed.start.x, ed.start.y], [ed.end.x, ed.end.y])
                else if (ed.type === 2) {
                  let a0 = ed.startAngle, a1 = ed.endAngle
                  if (!ed.isCCW) { const t = a0; a0 = a1; a1 = t } // horário = anti-horário de trás pra frente
                  if (Math.abs(a1 - a0 - Math.PI * 2) < 1e-6 || Math.abs(a0 - a1 - Math.PI * 2) < 1e-6) { a0 = 0; a1 = Math.PI * 2 }
                  for (const q of arcPts(ed.center.x, ed.center.y, ed.radius, ed.radius, 0, a0, a1)) pts.push(q)
                } else if (ed.type === 4) {
                  const sp = (ed.controlPoints?.length ? ed.controlPoints : ed.fitPoints) ?? []
                  const q = splinePts({ controlPoints: ed.controlPoints, knots: ed.knots, degree: ed.degree, fitPoints: ed.fitPoints })
                  for (const r of q.length ? q : sp.map((z: any) => [z.x, z.y])) pts.push(r)
                }
              }
            }
            if (pts.length < 3) continue
            const f = new Float64Array(pts.length * 2)
            pts.forEach(([x, y], i) => { const [a, b] = ap(m, x, y); f[i * 2] = a; f[i * 2 + 1] = b })
            rings.push(f)
          }
          if (rings.length) {
            const solid = !!e.solidFill || e.patternName === 'SOLID'
            fills.push({ rings, col: curCol, layer: li, alpha: solid ? 1 : 0.4, obj: objs.length }); layers[li].segs++
          }
          break
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
          texts.push({ x, y, h: (e.textHeight ?? 0.1) * sc, rot: (e.rotation ?? 0) + Math.atan2(m[1], m[0]), text: cleanText(e.text), layer: li, col: curCol, obj: objs.length })
          layers[li].texts++; break
        }
        case 'MTEXT': {
          const [x, y] = ap(m, e.insertionPoint.x, e.insertionPoint.y)
          const sc = Math.hypot(m[0], m[1])
          texts.push({ x, y, h: (e.textHeight ?? 0.1) * sc, rot: (e.rotation ?? 0) + Math.atan2(m[1], m[0]), text: cleanText(e.text), layer: li, col: curCol, obj: objs.length })
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
          walk(b.entities, mul(m, mul(place, base)), depth + 1, lname, false, eCol)
          break
        }
        default: break // VIEWPORT, ATTDEF… não desenhados
      }
      if (top) {
        const s1 = segs.length / 4, t1 = texts.length, f1 = fills.length
        if (s1 > s0 || t1 > t0 || f1 > f0) {
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
          const ext = (x: number, y: number) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
          for (let i = s0; i < s1; i++) { ext(segs[i * 4], segs[i * 4 + 1]); ext(segs[i * 4 + 2], segs[i * 4 + 3]) }
          for (let i = t0; i < t1; i++) ext(texts[i].x, texts[i].y)
          for (let i = f0; i < f1; i++) for (const r of fills[i].rings) for (let k = 0; k < r.length; k += 2) ext(r[k], r[k + 1])
          objs.push({ kind: String(e.type), name: String(e.name ?? ''), layer: li, s0, s1, t0, t1, f0, f1, bbox: [x0, y0, x1, y1] })
        }
      }
      curCol = 0
    }
  }
  walk(opts?.entities ?? model, opts?.base ? [1, 0, 0, 1, -opts.base.x, -opts.base.y] : ID, 0, null, true)

  const code = Number(db.header?.INSUNITS ?? 0)
  const u = UNITS[code]
  return {
    layers, segs: Float64Array.from(segs), segLayer: Uint16Array.from(segLayer), texts, inserts, fills, objs,
    segObj: Uint32Array.from(segObjA), segCol: Uint16Array.from(segColA), palette,
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

// ── Integração com o leitor de projeto ──────────────────────────────────────
// Cada "região" do desenho (planta, corte, detalhe...) vira uma PÁGINA do
// leitor. As coordenadas guardadas nas marcações seguem a mesma regra dos
// PDFs — "pixels do canvas na escala 1", origem no canto superior esquerdo
// — só que aqui a escala em metros por pixel é exata (vem do próprio CAD,
// sem calibrar): px = (X - x0) * k  /  py = (y1 - Y) * k.

export interface CadRegion { x0: number; y0: number; x1: number; y1: number; n: number; k: number }
export interface CadMeta { unitToMeters: number; unitName: string; regions: CadRegion[] }

const MAX_BASE_PX = 2200 // lado maior da região na escala 1

export function computeRegions(model: CadModel): CadRegion[] {
  const c = 10 / model.unitToMeters // ~10 m
  const cells = new Map<string, { n: number; x0: number; y0: number; x1: number; y1: number }>()
  for (let i = 0; i < model.segLayer.length; i++) {
    if (!model.layers[model.segLayer[i]].visible) continue
    const x1 = model.segs[i * 4], y1 = model.segs[i * 4 + 1], x2 = model.segs[i * 4 + 2], y2 = model.segs[i * 4 + 3]
    const k = `${Math.floor((x1 + x2) / 2 / c)},${Math.floor((y1 + y2) / 2 / c)}`
    const cell = cells.get(k)
    if (!cell) cells.set(k, { n: 1, x0: Math.min(x1, x2), y0: Math.min(y1, y2), x1: Math.max(x1, x2), y1: Math.max(y1, y2) })
    else { cell.n++; cell.x0 = Math.min(cell.x0, x1, x2); cell.y0 = Math.min(cell.y0, y1, y2); cell.x1 = Math.max(cell.x1, x1, x2); cell.y1 = Math.max(cell.y1, y1, y2) }
  }
  const seen = new Set<string>()
  const raw: { n: number; x0: number; y0: number; x1: number; y1: number }[] = []
  cells.forEach((_, start) => {
    if (seen.has(start)) return
    const reg = { n: 0, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
    const stack = [start]; seen.add(start)
    while (stack.length) {
      const key = stack.pop()!
      const cell = cells.get(key)!
      reg.n += cell.n; reg.x0 = Math.min(reg.x0, cell.x0); reg.y0 = Math.min(reg.y0, cell.y0); reg.x1 = Math.max(reg.x1, cell.x1); reg.y1 = Math.max(reg.y1, cell.y1)
      const [gx, gy] = key.split(',').map(Number)
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const nk = `${gx + dx},${gy + dy}`
        if (cells.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk) }
      }
    }
    raw.push(reg)
  })
  raw.sort((a, b) => b.n - a.n)
  const maior = raw[0]?.n ?? 0
  return raw.filter(r => r.n >= Math.max(30, maior * 0.01)).map(r => {
    const side = Math.max(r.x1 - r.x0, r.y1 - r.y0, 1e-6)
    const pad = side * 0.02
    const reg = { ...r, x0: r.x0 - pad, y0: r.y0 - pad, x1: r.x1 + pad, y1: r.y1 + pad }
    return { ...reg, k: MAX_BASE_PX / (side + pad * 2) }
  })
}

// Desenha uma região no canvas (já dimensionado), na escala de visualização
// `scale` — mesma lógica de "escala 1 = k px por unidade do desenho".
export function drawCadRegion(ctx: CanvasRenderingContext2D, model: CadModel, region: CadRegion, scale: number, hidden: Set<string>) {
  const K = region.k * scale
  const w = (region.x1 - region.x0) * K, h = (region.y1 - region.y0) * K
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
  const byLayer = new Map<number, number[]>()
  for (let i = 0; i < model.segLayer.length; i++) {
    const l = model.segLayer[i]
    if (hidden.has(model.layers[l].name)) continue
    const x1 = model.segs[i * 4], y1 = model.segs[i * 4 + 1], x2 = model.segs[i * 4 + 2], y2 = model.segs[i * 4 + 3]
    if (Math.max(x1, x2) < region.x0 || Math.min(x1, x2) > region.x1 || Math.max(y1, y2) < region.y0 || Math.min(y1, y2) > region.y1) continue
    const arr = byLayer.get(l); if (arr) arr.push(i); else byLayer.set(l, [i])
  }
  ctx.lineWidth = Math.max(1, Math.min(2, scale * 0.8)); ctx.lineCap = 'round'
  byLayer.forEach((idx, l) => {
    ctx.strokeStyle = model.layers[l].color
    ctx.beginPath()
    for (const i of idx) {
      ctx.moveTo((model.segs[i * 4] - region.x0) * K, (region.y1 - model.segs[i * 4 + 1]) * K)
      ctx.lineTo((model.segs[i * 4 + 2] - region.x0) * K, (region.y1 - model.segs[i * 4 + 3]) * K)
    }
    ctx.stroke()
  })
  for (const t of model.texts) {
    if (!t.text || hidden.has(model.layers[t.layer].name)) continue
    const px = t.h * K
    if (px < 4 || px > 600) continue
    if (t.x < region.x0 || t.x > region.x1 || t.y < region.y0 || t.y > region.y1) continue
    ctx.save(); ctx.translate((t.x - region.x0) * K, (region.y1 - t.y) * K); ctx.rotate(-t.rot)
    ctx.fillStyle = model.layers[t.layer].color; ctx.font = `${px}px sans-serif`; ctx.fillText(t.text, 0, 0)
    ctx.restore()
  }
}

// ── Snap (pontas, meios e pontos de bloco) ──────────────────────────────────
export interface SnapIndex { pts: { x: number; y: number; layer: number }[]; grid: Map<string, number[]>; cell: number }

export function buildSnapIndex(model: CadModel): SnapIndex {
  const pts: SnapIndex['pts'] = []
  const s = model.segs
  for (let i = 0; i < model.segLayer.length; i++) {
    const x1 = s[i * 4], y1 = s[i * 4 + 1], x2 = s[i * 4 + 2], y2 = s[i * 4 + 3], l = model.segLayer[i]
    pts.push({ x: x1, y: y1, layer: l }, { x: x2, y: y2, layer: l }, { x: (x1 + x2) / 2, y: (y1 + y2) / 2, layer: l })
  }
  for (const b of model.inserts) pts.push({ x: b.x, y: b.y, layer: b.layer })
  const cell = 0.5 / model.unitToMeters
  const grid = new Map<string, number[]>()
  pts.forEach((p, i) => {
    const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`
    const arr = grid.get(k); if (arr) arr.push(i); else grid.set(k, [i])
  })
  return { pts, grid, cell }
}

export function findSnapWorld(idx: SnapIndex, model: CadModel, hidden: Set<string>, wx: number, wy: number, rWorld: number): { x: number; y: number } | null {
  const n = Math.ceil(rWorld / idx.cell)
  if (n > 15) return null
  let best: { x: number; y: number } | null = null, bestD = rWorld
  const cx = Math.floor(wx / idx.cell), cy = Math.floor(wy / idx.cell)
  for (let gx = cx - n; gx <= cx + n; gx++) for (let gy = cy - n; gy <= cy + n; gy++) {
    const arr = idx.grid.get(`${gx},${gy}`); if (!arr) continue
    for (const i of arr) {
      const p = idx.pts[i]
      if (hidden.has(model.layers[p.layer].name)) continue
      const d = Math.hypot(p.x - wx, p.y - wy)
      if (d < bestD) { bestD = d; best = { x: p.x, y: p.y } }
    }
  }
  return best
}

// Adaptador com a mesma "cara" de uma página do pdf.js — assim o leitor
// reaproveita todo o caminho de render/zoom/exportação sem mudar nada.
export function makeCadPdfAdapter(model: CadModel, meta: CadMeta, getHidden: () => Set<string>) {
  return {
    numPages: meta.regions.length,
    getPage: async (n: number) => {
      const region = meta.regions[Math.min(Math.max(n, 1), meta.regions.length) - 1]
      return {
        rotate: 0,
        getViewport: ({ scale }: { scale: number }) => ({
          scale, width: Math.ceil((region.x1 - region.x0) * region.k * scale), height: Math.ceil((region.y1 - region.y0) * region.k * scale),
        }),
        render: ({ canvasContext, viewport }: { canvasContext: CanvasRenderingContext2D; viewport: { scale: number } }) => {
          let cancelled = false
          const promise = new Promise<void>((resolve, reject) => {
            requestAnimationFrame(() => {
              if (cancelled) { const e = new Error('cancelled'); e.name = 'RenderingCancelledException'; reject(e); return }
              drawCadRegion(canvasContext, model, region, viewport.scale, getHidden())
              resolve()
            })
          })
          return { promise, cancel: () => { cancelled = true } }
        },
      }
    },
  }
}


// ── Biblioteca de blocos (reutilizável em qualquer desenho) ─────────────────
/** Bloco da biblioteca: geometria já "achatada", com a base do bloco em (0,0). */
export interface LibBlock {
  name: string
  unitToMeters: number
  cols: string[] // cores usadas
  segs: number[] // x1,y1,x2,y2 …
  segC: number[] // índice em cols por segmento
  texts: { x: number; y: number; h: number; rot: number; text: string; c: number }[]
  fills: { rings: number[][]; c: number; a: number }[]
  bbox: [number, number, number, number]
}
const r5 = (v: number) => Math.round(v * 1e5) / 1e5

/** Lê TODAS as definições de bloco de um arquivo (não só as que estão inseridas no desenho). */
export function extractLibraryBlocks(db: any): LibBlock[] {
  const out: LibBlock[] = []
  const code = Number(db.header?.INSUNITS ?? 0)
  const unit = UNITS[code]?.[1] ?? 1
  for (const b of db.tables?.BLOCK_RECORD?.entries ?? []) {
    const name = String(b.name ?? '')
    if (!name || name.startsWith('*') || !b.entities?.length) continue
    const m = buildCadModel(db, { entities: b.entities, base: b.basePoint ?? { x: 0, y: 0 } })
    if (m.segLayer.length === 0 && m.fills.length === 0 && m.texts.length === 0) continue
    if (m.segLayer.length > 20000) continue
    const cols: string[] = []
    const ci = new Map<string, number>()
    const colIdx = (c: string) => { let i = ci.get(c); if (i === undefined) { i = cols.length; cols.push(c); ci.set(c, i) } return i }
    const resolve = (col: number, layer: number) => (col ? m.palette[col] : m.layers[layer].color)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    const ext = (x: number, y: number) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
    const segs: number[] = [], segC: number[] = []
    for (let i = 0; i < m.segLayer.length; i++) {
      const q = [m.segs[i * 4], m.segs[i * 4 + 1], m.segs[i * 4 + 2], m.segs[i * 4 + 3]]
      ext(q[0], q[1]); ext(q[2], q[3])
      segs.push(r5(q[0]), r5(q[1]), r5(q[2]), r5(q[3])); segC.push(colIdx(resolve(m.segCol[i], m.segLayer[i])))
    }
    const texts = m.texts.map(t => { ext(t.x, t.y); return { x: r5(t.x), y: r5(t.y), h: r5(t.h), rot: r5(t.rot), text: t.text, c: colIdx(resolve(t.col, t.layer)) } })
    const fills = m.fills.map(f => ({
      rings: f.rings.map(r => { const a = Array.from(r, r5); for (let k = 0; k < r.length; k += 2) ext(r[k], r[k + 1]); return a }),
      c: colIdx(resolve(f.col, f.layer)), a: f.alpha,
    }))
    out.push({ name, unitToMeters: unit, cols, segs, segC, texts, fills, bbox: [x0, y0, x1, y1] })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export async function loadCadLibraryFile(buf: ArrayBuffer): Promise<LibBlock[]> {
  const { LibreDwg, Dwg_File_Type } = await import('@mlightcad/libredwg-web')
  const lib = await LibreDwg.create('/libredwg/')
  const head = new TextDecoder('latin1').decode(new Uint8Array(buf, 0, 6))
  const data = lib.dwg_read_data(buf, /^AC10/.test(head) ? Dwg_File_Type.DWG : Dwg_File_Type.DXF)
  if (!data) throw new Error('Não foi possível ler o arquivo (DWG/DXF inválido ou versão não suportada).')
  const db = lib.convert(data)
  const blocks = extractLibraryBlocks(db)
  try { lib.dwg_free(data) } catch { /* não crítico */ }
  return blocks
}

/** Acrescenta um bloco da biblioteca ao modelo aberto (vira um objeto editável). Devolve o novo modelo e o índice do objeto. */
export function appendLibBlock(model: CadModel, b: LibBlock): { model: CadModel; obj: number; layerAdded: boolean } {
  const LAYER = 'Biblioteca Luknos'
  let layers = model.layers
  let li = layers.findIndex(l => l.name === LAYER)
  let layerAdded = false
  if (li < 0) { layers = [...layers, { name: LAYER, color: '#e5e7eb', visible: true, segs: 0, texts: 0 }]; li = layers.length - 1; layerAdded = true }
  const palette = [...model.palette]
  const colMap = b.cols.map(c => { let i = palette.indexOf(c); if (i < 0) { palette.push(c); i = palette.length - 1 } return i })
  const obj = model.objs.length
  const n = b.segs.length / 4
  const s0 = model.segLayer.length
  const segs = new Float64Array(model.segs.length + b.segs.length); segs.set(model.segs); segs.set(b.segs, model.segs.length)
  const segLayer = new Uint16Array(s0 + n); segLayer.set(model.segLayer); segLayer.fill(li, s0)
  const segObj = new Uint32Array(s0 + n); segObj.set(model.segObj); segObj.fill(obj, s0)
  const segCol = new Uint16Array(s0 + n); segCol.set(model.segCol); for (let i = 0; i < n; i++) segCol[s0 + i] = colMap[b.segC[i]]
  const t0 = model.texts.length, f0 = model.fills.length
  const texts = [...model.texts, ...b.texts.map(t => ({ x: t.x, y: t.y, h: t.h, rot: t.rot, text: t.text, layer: li, col: colMap[t.c], obj }))]
  const fills = [...model.fills, ...b.fills.map(f => ({ rings: f.rings.map(r => Float64Array.from(r)), col: colMap[f.c], layer: li, alpha: f.a, obj }))]
  const objs = [...model.objs, { kind: 'LIB', name: b.name, layer: li, s0, s1: s0 + n, t0, t1: texts.length, f0, f1: fills.length, bbox: b.bbox }]
  return { model: { ...model, layers, palette, segs, segLayer, segObj, segCol, texts, fills, objs }, obj, layerAdded }
}
