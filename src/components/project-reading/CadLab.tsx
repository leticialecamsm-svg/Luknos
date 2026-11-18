'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadCadFile, computeRegions, appendLibBlock, loadCadLibraryFile, type CadModel, type LibBlock } from '@/lib/project-reading/cad'
import { listCadLibrary, saveCadLibraryBlock, deleteCadLibraryBlock, setCadLibraryFamily, type CadLibRow } from '@/lib/project-reading/cad-library-actions'
import {
  Loader2, Upload, Ruler, Hand, Maximize, MousePointer, Minus, Square, Circle as CircleIcon, Copy, ClipboardPaste,
  RotateCw, FlipHorizontal, FlipVertical, Trash2, Undo2, Redo2, CopyPlus, Type as TypeIcon, ArrowUpRight, Boxes,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Tool = 'select' | 'pan' | 'medir' | 'linha' | 'retangulo' | 'circulo' | 'texto' | 'seta' | 'inserir'
interface Snap { x: number; y: number; kind: 'ponta' | 'meio' | 'bloco' }
type M6 = [number, number, number, number, number, number]
const ID6: M6 = [1, 0, 0, 1, 0, 0]
const mul6 = (p: M6, q: M6): M6 => [
  p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5],
]
const ap6 = (m: M6, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
const inv6 = (m: M6): M6 => {
  const det = m[0] * m[3] - m[1] * m[2]
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])]
}
const rotAbout = (deg: number, cx: number, cy: number): M6 => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
  return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy]
}

// ── Estado editável (imutável, pra desfazer/refazer) ────────────────────────
interface Shape { id: number; kind: 'line' | 'rect' | 'circle' | 'text' | 'arrow'; pts: number[]; stroke: string; fill: string | null; text?: string; h?: number; rot?: number }
interface Dim { id: number; ax: number; ay: number; bx: number; by: number; off: number }
interface Cp { id: number; src: number; xf: M6 }
interface Edits { ov: Record<number, M6 | null>; cp: Cp[]; shapes: Shape[]; dims: Dim[]; next: number }
const EMPTY: Edits = { ov: {}, cp: [], shapes: [], dims: [], next: 1 }

const BG = '#1b1d23'
const SEL = '#38bdf8'
function lum(c: string) {
  const m = /^#([0-9a-f]{6})$/i.exec(c)
  if (!m) return 1
  const n = parseInt(m[1], 16)
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
}
// fundo escuro: cores quase pretas (ACI 7 etc.) viram claras, como no AutoCAD
const cor = (c: string) => (lum(c) < 0.2 ? '#e5e7eb' : c)

function distSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}
function inRings(rings: Float64Array[], x: number, y: number) {
  let inside = false
  for (const r of rings) {
    const n = r.length / 2
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = r[i * 2], yi = r[i * 2 + 1], xj = r[j * 2], yj = r[j * 2 + 1]
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}
function dimGeom(d: Dim) {
  const dx = d.bx - d.ax, dy = d.by - d.ay
  const len = Math.hypot(dx, dy) || 1e-9
  const nx = -dy / len, ny = dx / len
  return { len, nx, ny, p1: [d.ax + nx * d.off, d.ay + ny * d.off] as [number, number], p2: [d.bx + nx * d.off, d.by + ny * d.off] as [number, number] }
}
// caixa (polígono) do texto de uma forma 'text' (ancorado no ponto) ou 'arrow' (texto na cauda, do lado oposto à ponta)
function textPoly(s: Shape): number[] {
  const h = s.h ?? 0.1, w = Math.max(1, (s.text ?? '').length) * h * 0.55
  if (s.kind === 'text') {
    const r = s.rot ?? 0, c = Math.cos(r), sn = Math.sin(r), x = s.pts[0], y = s.pts[1]
    return [[0, -0.3 * h], [w, -0.3 * h], [w, 1.1 * h], [0, 1.1 * h]].flatMap(([a, b]) => [x + a * c - b * sn, y + a * sn + b * c])
  }
  const left = s.pts[0] < s.pts[2], gap = h * 0.3
  const x0 = left ? s.pts[0] - gap - w : s.pts[0] + gap, x1 = x0 + w, y = s.pts[1]
  return [x0, y - 0.6 * h, x1, y - 0.6 * h, x1, y + 0.6 * h, x0, y + 0.6 * h]
}
const fmtM = (v: number) => v.toFixed(2).replace('.', ',') + ' m'

export function CadLab() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [model, setModel] = useState<CadModel | null>(null)
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tempo, setTempo] = useState<number | null>(null)
  const [layerVis, setLayerVis] = useState<boolean[]>([])
  const [layerFilter, setLayerFilter] = useState('')
  const [tool, setTool] = useState<Tool>('select')
  const [selBlock, setSelBlock] = useState<string | null>(null)
  const [hover, setHover] = useState<Snap | null>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [, setTick] = useState(0)
  const redraw = useCallback(() => setTick(t => t + 1), [])

  // edição
  const [ed, setEd] = useState<Edits>(EMPTY)
  const edRef = useRef(ed); edRef.current = ed
  const past = useRef<Edits[]>([])
  const future = useRef<Edits[]>([])
  const [sel, setSel] = useState<string[]>([])
  const selRef = useRef(sel); selRef.current = sel
  const clip = useRef<{ ed: Edits; keys: string[] } | null>(null)
  const [draft, setDraft] = useState<number[][]>([]) // pontos já clicados da ferramenta atual
  const [stroke, setStroke] = useState('#22d3ee')
  const [fill, setFill] = useState('#f59e0b')
  const [useFill, setUseFill] = useState(false)
  const [angulo, setAngulo] = useState('45')
  const [placeScale, setPlaceScale] = useState('1') // multiplicador do tamanho ao colocar bloco
  const [scaleBy, setScaleBy] = useState('2') // fator do botão Escalar
  const [textH, setTextH] = useState('0.15') // altura do texto em metros
  const [textEdit, setTextEdit] = useState<null | { kind: 'text' | 'arrow'; x: number; y: number; tip?: number[]; id?: number; value: string }>(null)
  const textEditRef = useRef(textEdit); textEditRef.current = textEdit
  // biblioteca
  const [lib, setLib] = useState<CadLibRow[]>([])
  const [openFam, setOpenFam] = useState<string | null>(null)
  const [stateMenu, setStateMenu] = useState(false)
  const [libMsg, setLibMsg] = useState<string | null>(null)
  const [libFilter, setLibFilter] = useState('')
  const [cand, setCand] = useState<LibBlock[] | null>(null)
  const [candSel, setCandSel] = useState<Set<string>>(new Set())
  const [libBusy, setLibBusy] = useState(false)
  const [placing, setPlacing] = useState<null | { name: string; obj: number; s: number }>(null)
  const libObj = useRef(new Map<string, number>())
  const modelRef = useRef<CadModel | null>(null); modelRef.current = model
  const needFit = useRef(false)

  const baseRef = useRef<null | { sig: string; layerVis: boolean[]; model: CadModel; cv: HTMLCanvasElement }>(null)
  const view = useRef({ cx: 0, cy: 0, scale: 1 })
  const gesture = useRef<null | {
    type: 'pan' | 'move' | 'box' | 'dimdrag'
    x: number; y: number; cx: number; cy: number
    base?: Edits; start?: [number, number]; moved?: boolean; keys?: string[]; dim?: number
    bx?: number; by?: number
  }>(null)
  const [box, setBoxState] = useState<null | { x0: number; y0: number; x1: number; y1: number }>(null)
  const boxRef = useRef<typeof box>(null)
  const setBox = (b: typeof box) => { boxRef.current = b; setBoxState(b) }

  const toScreen = (x: number, y: number, w: number, h: number): [number, number] =>
    [(x - view.current.cx) * view.current.scale + w / 2, h / 2 - (y - view.current.cy) * view.current.scale]
  const toWorld = (px: number, py: number, w: number, h: number): [number, number] =>
    [(px - w / 2) / view.current.scale + view.current.cx, (h / 2 - py) / view.current.scale + view.current.cy]

  // histórico
  function commit(next: Edits) {
    past.current.push(edRef.current); future.current = []
    setEd(next)
  }
  function undo() {
    const p = past.current.pop(); if (!p) return
    future.current.push(edRef.current); setEd(p); setSel([])
  }
  function redo() {
    const f = future.current.pop(); if (!f) return
    past.current.push(edRef.current); setEd(f); setSel([])
  }

  // ── Geometria das chaves de seleção ──────────────────────────────────────
  // chaves: o<n> = objeto do arquivo, c<id> = cópia, s<id> = forma, d<id> = cota
  function bboxOf(e: Edits, key: string): [number, number, number, number] | null {
    if (!model) return null
    const id = Number(key.slice(1))
    const k = key[0]
    if (k === 'o' || k === 'c') {
      let src = id, xf: M6 = ID6
      if (k === 'o') { const v = e.ov[id]; if (v === null) return null; if (v) xf = v }
      else { const c = e.cp.find(c => c.id === id); if (!c) return null; src = c.src; xf = c.xf }
      const [x0, y0, x1, y1] = model.objs[src].bbox
      const cs = [ap6(xf, x0, y0), ap6(xf, x1, y0), ap6(xf, x1, y1), ap6(xf, x0, y1)]
      return [Math.min(...cs.map(c => c[0])), Math.min(...cs.map(c => c[1])), Math.max(...cs.map(c => c[0])), Math.max(...cs.map(c => c[1]))]
    }
    if (k === 's') {
      const s = e.shapes.find(s => s.id === id); if (!s) return null
      if (s.kind === 'text' || s.kind === 'arrow') {
        const q = [...textPoly(s), ...(s.kind === 'arrow' ? s.pts : [])]
        const xs = q.filter((_, i) => i % 2 === 0), ys = q.filter((_, i) => i % 2 === 1)
        return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
      }
      if (s.kind === 'circle') return [s.pts[0] - s.pts[2], s.pts[1] - s.pts[2], s.pts[0] + s.pts[2], s.pts[1] + s.pts[2]]
      const xs = s.pts.filter((_, i) => i % 2 === 0), ys = s.pts.filter((_, i) => i % 2 === 1)
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    }
    const d = e.dims.find(d => d.id === id); if (!d) return null
    const g = dimGeom(d)
    return [Math.min(d.ax, d.bx, g.p1[0], g.p2[0]), Math.min(d.ay, d.by, g.p1[1], g.p2[1]), Math.max(d.ax, d.bx, g.p1[0], g.p2[0]), Math.max(d.ay, d.by, g.p1[1], g.p2[1])]
  }
  function unionBox(e: Edits, keys: string[]) {
    let b: [number, number, number, number] | null = null
    for (const k of keys) {
      const bb = bboxOf(e, k); if (!bb) continue
      b = b ? [Math.min(b[0], bb[0]), Math.min(b[1], bb[1]), Math.max(b[2], bb[2]), Math.max(b[3], bb[3])] : bb
    }
    return b
  }

  const xfShape = (s: Shape, T: M6): Shape => {
    if (s.kind === 'circle') { const [x, y] = ap6(T, s.pts[0], s.pts[1]); return { ...s, pts: [x, y, s.pts[2]] } }
    const out: number[] = []
    for (let i = 0; i < s.pts.length; i += 2) out.push(...ap6(T, s.pts[i], s.pts[i + 1]))
    return { ...s, pts: out, rot: s.kind === 'text' ? (s.rot ?? 0) + Math.atan2(T[1], T[0]) : s.rot }
  }
  const xfDim = (d: Dim, T: M6): Dim => {
    const [ax, ay] = ap6(T, d.ax, d.ay), [bx, by] = ap6(T, d.bx, d.by)
    const det = T[0] * T[3] - T[1] * T[2]
    return { ...d, ax, ay, bx, by, off: d.off * (det < 0 ? -1 : 1) }
  }
  function applyXf(e: Edits, keys: string[], T: M6): Edits {
    const ov = { ...e.ov }
    let cp = e.cp, shapes = e.shapes, dims = e.dims
    for (const k of keys) {
      const id = Number(k.slice(1))
      if (k[0] === 'o') { if (ov[id] !== null) ov[id] = mul6(T, ov[id] ?? ID6) }
      else if (k[0] === 'c') cp = cp.map(c => (c.id === id ? { ...c, xf: mul6(T, c.xf) } : c))
      else if (k[0] === 's') shapes = shapes.map(s => (s.id === id ? xfShape(s, T) : s))
      else dims = dims.map(d => (d.id === id ? xfDim(d, T) : d))
    }
    return { ...e, ov, cp, shapes, dims }
  }
  function cloneItems(from: Edits, keys: string[], T: M6, into: Edits): { ed: Edits; keys: string[] } {
    let next = into.next
    const cp = [...into.cp], shapes = [...into.shapes], dims = [...into.dims]
    const nk: string[] = []
    for (const k of keys) {
      const id = Number(k.slice(1))
      if (k[0] === 'o') { const v = from.ov[id]; if (v === null) continue; cp.push({ id: next, src: id, xf: mul6(T, v ?? ID6) }); nk.push('c' + next++) }
      else if (k[0] === 'c') { const c = from.cp.find(c => c.id === id); if (!c) continue; cp.push({ id: next, src: c.src, xf: mul6(T, c.xf) }); nk.push('c' + next++) }
      else if (k[0] === 's') { const s = from.shapes.find(s => s.id === id); if (!s) continue; shapes.push({ ...xfShape(s, T), id: next }); nk.push('s' + next++) }
      else { const d = from.dims.find(d => d.id === id); if (!d) continue; dims.push({ ...xfDim(d, T), id: next }); nk.push('d' + next++) }
    }
    return { ed: { ...into, cp, shapes, dims, next }, keys: nk }
  }
  function deleteKeys(e: Edits, keys: string[]): Edits {
    const ov = { ...e.ov }
    const set = new Set(keys)
    for (const k of keys) if (k[0] === 'o') ov[Number(k.slice(1))] = null
    return {
      ...e, ov,
      cp: e.cp.filter(c => !set.has('c' + c.id)), shapes: e.shapes.filter(s => !set.has('s' + s.id)), dims: e.dims.filter(d => !set.has('d' + d.id)),
    }
  }

  // ── Ações da barra ───────────────────────────────────────────────────────
  const u2m = model?.unitToMeters ?? 1
  function actRotate(deg: number) {
    const b = unionBox(edRef.current, selRef.current); if (!b || !selRef.current.length) return
    commit(applyXf(edRef.current, selRef.current, rotAbout(deg, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2)))
  }
  // aumenta/diminui blocos selecionados (só blocos e cópias; formas desenhadas não mudam)
  function actScale(f: number) {
    const keys = selRef.current.filter(k => k[0] === 'c' || k[0] === 'o')
    const b = unionBox(edRef.current, keys); if (!b || !keys.length || !(f > 0)) return
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2
    commit(applyXf(edRef.current, keys, [f, 0, 0, f, cx - f * cx, cy - f * cy]))
  }
  function actMirror(h: boolean) {
    const b = unionBox(edRef.current, selRef.current); if (!b || !selRef.current.length) return
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2
    commit(applyXf(edRef.current, selRef.current, h ? [-1, 0, 0, 1, 2 * cx, 0] : [1, 0, 0, -1, 0, 2 * cy]))
  }
  function actDelete() {
    if (!selRef.current.length) return
    commit(deleteKeys(edRef.current, selRef.current)); setSel([])
  }
  function actCopy() { if (selRef.current.length) clip.current = { ed: edRef.current, keys: [...selRef.current] } }
  function actPaste(at?: [number, number]) {
    const c = clip.current; if (!c) return
    const b = unionBox(c.ed, c.keys); if (!b) return
    const [tx, ty] = at ?? [(b[0] + b[2]) / 2 + 0.5 / u2m, (b[1] + b[3]) / 2 - 0.5 / u2m]
    const T: M6 = [1, 0, 0, 1, tx - (b[0] + b[2]) / 2, ty - (b[1] + b[3]) / 2]
    const r = cloneItems(c.ed, c.keys, T, edRef.current)
    commit(r.ed); setSel(r.keys)
  }
  function actDuplicate() { actCopy(); actPaste() }
  function setShapeStyle(patch: Partial<Pick<Shape, 'stroke' | 'fill'>>) {
    const ids = new Set(selRef.current.filter(k => k[0] === 's').map(k => Number(k.slice(1))))
    if (!ids.size) return
    commit({ ...edRef.current, shapes: edRef.current.shapes.map(s => (ids.has(s.id) ? { ...s, ...patch } : s)) })
  }

  // ── Snap ─────────────────────────────────────────────────────────────────
  const snapIndex = useMemo(() => {
    if (!model) return null
    const pts: { x: number; y: number; kind: Snap['kind']; layer: number; obj: number }[] = []
    const s = model.segs
    for (let i = 0; i < model.segLayer.length; i++) {
      const x1 = s[i * 4], y1 = s[i * 4 + 1], x2 = s[i * 4 + 2], y2 = s[i * 4 + 3]
      const L = model.segLayer[i], o = model.segObj[i]
      pts.push({ x: x1, y: y1, kind: 'ponta', layer: L, obj: o }, { x: x2, y: y2, kind: 'ponta', layer: L, obj: o },
        { x: (x1 + x2) / 2, y: (y1 + y2) / 2, kind: 'meio', layer: L, obj: o })
    }
    for (const b of model.inserts) pts.push({ x: b.x, y: b.y, kind: 'bloco', layer: b.layer, obj: -1 })
    const cell = 0.5
    const grid = new Map<string, number[]>()
    pts.forEach((p, i) => {
      const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`
      const arr = grid.get(k); if (arr) arr.push(i); else grid.set(k, [i])
    })
    return { pts, grid, cell }
  }, [model])

  // pontos de snap de coisas movidas/copiadas/desenhadas
  const dynPts = useMemo(() => {
    if (!model) return []
    const out: { x: number; y: number; kind: Snap['kind']; key: string }[] = []
    const inst = (src: number, xf: M6, key: string) => {
      const o = model.objs[src]
      for (let i = o.s0; i < o.s1; i++) {
        const [a, b] = ap6(xf, model.segs[i * 4], model.segs[i * 4 + 1]), [c, d] = ap6(xf, model.segs[i * 4 + 2], model.segs[i * 4 + 3])
        out.push({ x: a, y: b, kind: 'ponta', key }, { x: c, y: d, kind: 'ponta', key }, { x: (a + c) / 2, y: (b + d) / 2, kind: 'meio', key })
      }
    }
    for (const k of Object.keys(ed.ov)) { const v = ed.ov[Number(k)]; if (v) inst(Number(k), v, 'o' + k) }
    for (const c of ed.cp) inst(c.src, c.xf, 'c' + c.id)
    for (const s of ed.shapes) {
      const key = 's' + s.id
      if (s.kind === 'circle') out.push({ x: s.pts[0], y: s.pts[1], kind: 'bloco', key })
      else for (let i = 0; i < s.pts.length; i += 2) {
        out.push({ x: s.pts[i], y: s.pts[i + 1], kind: 'ponta', key })
        const j = (i + 2) % s.pts.length
        if (s.kind === 'rect' || i + 2 < s.pts.length) out.push({ x: (s.pts[i] + s.pts[j]) / 2, y: (s.pts[i + 1] + s.pts[j + 1]) / 2, kind: 'meio', key })
      }
    }
    return out
  }, [ed, model])

  function findSnap(wx: number, wy: number, exclude?: Set<string>): Snap | null {
    if (!snapIndex || !model) return null
    const rWorld = 12 / view.current.scale
    const { pts, grid, cell } = snapIndex
    const n = Math.ceil(rWorld / cell)
    let best: Snap | null = null, bestD = rWorld
    const e = edRef.current
    if (n <= 15) {
      const cx = Math.floor(wx / cell), cy = Math.floor(wy / cell)
      for (let gx = cx - n; gx <= cx + n; gx++) for (let gy = cy - n; gy <= cy + n; gy++) {
        const arr = grid.get(`${gx},${gy}`); if (!arr) continue
        for (const i of arr) {
          const p = pts[i]
          if (!layerVis[p.layer]) continue
          if (p.obj >= 0 && (p.obj in e.ov || exclude?.has('o' + p.obj))) continue
          const d = Math.hypot(p.x - wx, p.y - wy) + (p.kind === 'meio' ? rWorld * 0.05 : 0)
          if (d < bestD) { bestD = d; best = { x: p.x, y: p.y, kind: p.kind } }
        }
      }
    }
    for (const p of dynPts) {
      if (exclude?.has(p.key)) continue
      const d = Math.hypot(p.x - wx, p.y - wy) + (p.kind === 'meio' ? rWorld * 0.05 : 0)
      if (d < bestD) { bestD = d; best = { x: p.x, y: p.y, kind: p.kind } }
    }
    return best
  }

  // ── Seleção por clique ───────────────────────────────────────────────────
  function hitObj(idx: number, xf: M6, wx: number, wy: number, tol: number): number | null {
    if (!model) return null
    const o = model.objs[idx]
    const inv = inv6(xf)
    const [lx, ly] = ap6(inv, wx, wy)
    const sc = Math.sqrt(Math.abs(xf[0] * xf[3] - xf[1] * xf[2])) || 1
    const tl = tol / sc
    const [x0, y0, x1, y1] = o.bbox
    if (lx < x0 - tl || lx > x1 + tl || ly < y0 - tl || ly > y1 + tl) return null
    let best = Infinity
    for (let i = o.s0; i < o.s1; i++) {
      if (!layerVis[model.segLayer[i]]) continue
      const d = distSeg(lx, ly, model.segs[i * 4], model.segs[i * 4 + 1], model.segs[i * 4 + 2], model.segs[i * 4 + 3])
      if (d < best) best = d
    }
    if (best <= tl) return best * sc
    for (let i = o.t0; i < o.t1; i++) {
      const t = model.texts[i]
      if (!layerVis[t.layer]) continue
      if (Math.abs(lx - t.x) < Math.max(t.text.length * t.h * 0.6, tl) && ly > t.y - t.h * 0.4 && ly < t.y + t.h * 1.3) return tol * 0.9
    }
    for (let i = o.f0; i < o.f1; i++) {
      const f = model.fills[i]
      if (layerVis[f.layer] && inRings(f.rings, lx, ly)) return 1e6 + (x1 - x0) * (y1 - y0) * sc * sc
    }
    return null
  }
  function hitTest(wx: number, wy: number): string | null {
    if (!model) return null
    const e = edRef.current
    const tol = 8 / view.current.scale
    let best: string | null = null, bestS = Infinity
    const consider = (k: string, s: number | null) => { if (s !== null && s < bestS) { bestS = s; best = k } }
    for (const d of e.dims) {
      const g = dimGeom(d)
      let s = Math.min(distSeg(wx, wy, g.p1[0], g.p1[1], g.p2[0], g.p2[1]), distSeg(wx, wy, d.ax, d.ay, g.p1[0], g.p1[1]), distSeg(wx, wy, d.bx, d.by, g.p2[0], g.p2[1]))
      s = Math.min(s, Math.hypot(wx - (g.p1[0] + g.p2[0]) / 2, wy - (g.p1[1] + g.p2[1]) / 2) * 0.8)
      if (s <= tol) consider('d' + d.id, s * 0.5)
    }
    for (const s of e.shapes) {
      let d = Infinity
      if (s.kind === 'text' || s.kind === 'arrow') {
        const poly = textPoly(s)
        d = inRings([Float64Array.from(poly)], wx, wy) ? 0 : Math.min(...[0, 2, 4, 6].map(i => distSeg(wx, wy, poly[i], poly[i + 1], poly[(i + 2) % 8], poly[(i + 3) % 8])))
        if (s.kind === 'arrow') d = Math.min(d, distSeg(wx, wy, s.pts[0], s.pts[1], s.pts[2], s.pts[3]))
      } else if (s.kind === 'line') d = distSeg(wx, wy, s.pts[0], s.pts[1], s.pts[2], s.pts[3])
      else if (s.kind === 'circle') { const r = Math.hypot(wx - s.pts[0], wy - s.pts[1]); d = s.fill && r < s.pts[2] ? 0 : Math.abs(r - s.pts[2]) }
      else {
        for (let i = 0; i < 8; i += 2) d = Math.min(d, distSeg(wx, wy, s.pts[i], s.pts[i + 1], s.pts[(i + 2) % 8], s.pts[(i + 3) % 8]))
        if (s.fill && inRings([Float64Array.from(s.pts)], wx, wy)) d = 0
      }
      if (d <= tol) consider('s' + s.id, d * 0.5)
    }
    for (const c of e.cp) consider('c' + c.id, hitObj(c.src, c.xf, wx, wy, tol))
    for (let i = 0; i < model.objs.length; i++) {
      const v = e.ov[i]
      if (v === null) continue
      consider('o' + i, hitObj(i, v ?? ID6, wx, wy, tol))
    }
    return best
  }

  // ── Carregar arquivo ─────────────────────────────────────────────────────
  async function handleFile(file: File) {
    setError(null); setLoading(true); setModel(null); setSelBlock(null); setEd(EMPTY); setSel([]); setDraft([])
    past.current = []; future.current = []
    setFileName(file.name)
    try {
      const t0 = performance.now()
      const m = await loadCadFile(await file.arrayBuffer())
      setTempo(Math.round(performance.now() - t0))
      setLayerVis(m.layers.map(l => l.visible))
      libObj.current = new Map(); setPlacing(null)
      needFit.current = true
      setModel(m)
    } catch (e: any) {
      setError(e?.message ?? 'Falha ao ler o arquivo.')
    } finally {
      setLoading(false)
    }
  }

  const regioes = useMemo(() => (model ? computeRegions(model) : []), [model])

  function fitBox(x0: number, y0: number, x1: number, y1: number, maxScale = Infinity) {
    const el = wrapRef.current
    if (!el) return
    const w = el.clientWidth, h = el.clientHeight
    view.current = {
      cx: (x0 + x1) / 2, cy: (y0 + y1) / 2,
      scale: Math.min(maxScale, Math.min(w / Math.max(1e-6, x1 - x0), h / Math.max(1e-6, y1 - y0)) * 0.92),
    }
    redraw()
  }
  function fit(i = 0) {
    const r = regioes[i]
    if (r) fitBox(r.x0, r.y0, r.x1, r.y1)
  }
  const instIdx = useRef(0)
  function irParaBloco(nome: string, proximo = false) {
    if (!model) return
    const list = model.inserts.filter(b => b.name === nome)
    if (!list.length) return
    instIdx.current = proximo ? (instIdx.current + 1) % list.length : 0
    const b = list[instIdx.current]
    const half = 1.5 / model.unitToMeters
    fitBox(b.x - half, b.y - half, b.x + half, b.y + half)
  }
  useEffect(() => { if (model && regioes.length && needFit.current) { needFit.current = false; fit(0) } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [model, regioes])

  // ── Desenho ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current, canvas = canvasRef.current
    if (!el || !canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = el.clientWidth, h = el.clientHeight
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr }
    const main = canvas.getContext('2d')!
    let ctx = main
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h)
    if (!model) return
    const { scale } = view.current
    const [wx0, wy1] = toWorld(0, 0, w, h), [wx1, wy0] = toWorld(w, h, w, h)
    const colorOf = (col: number, layer: number) => cor(col ? model.palette[col] : model.layers[layer].color)
    const inView = (b: number[]) => !(b[2] < wx0 || b[0] > wx1 || b[3] < wy0 || b[1] > wy1)
    const dirty = (o: number) => o in ed.ov
    const selSet = new Set(sel)

    // pinta um objeto (original, movido ou cópia) com transformação opcional
    const drawInst = (idx: number, xf: M6, hl: boolean) => {
      const o = model.objs[idx]
      const P = (x: number, y: number) => { const [a, b] = ap6(xf, x, y); return toScreen(a, b, w, h) }
      for (let i = o.f0; i < o.f1; i++) {
        const f = model.fills[i]; if (!layerVis[f.layer]) continue
        ctx.beginPath()
        for (const r of f.rings) { for (let k = 0; k < r.length; k += 2) { const [x, y] = P(r[k], r[k + 1]); if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.closePath() }
        ctx.globalAlpha = f.alpha; ctx.fillStyle = hl ? SEL : colorOf(f.col, f.layer); ctx.fill('evenodd'); ctx.globalAlpha = 1
      }
      ctx.lineWidth = hl ? 2 : 1
      const groups = new Map<string, number[]>()
      for (let i = o.s0; i < o.s1; i++) {
        const l = model.segLayer[i]; if (!layerVis[l]) continue
        const c = hl ? SEL : colorOf(model.segCol[i], l)
        const g = groups.get(c); if (g) g.push(i); else groups.set(c, [i])
      }
      groups.forEach((idxs, c) => {
        ctx.strokeStyle = c; ctx.beginPath()
        for (const i of idxs) { const [a, b] = P(model.segs[i * 4], model.segs[i * 4 + 1]), [cc, d] = P(model.segs[i * 4 + 2], model.segs[i * 4 + 3]); ctx.moveTo(a, b); ctx.lineTo(cc, d) }
        ctx.stroke()
      })
      const rot = Math.atan2(xf[1], xf[0]), sc = Math.hypot(xf[0], xf[1])
      for (let i = o.t0; i < o.t1; i++) {
        const t = model.texts[i]; if (!layerVis[t.layer] || !t.text) continue
        drawText(t.text, ...P(t.x, t.y), t.h * sc * scale, t.rot + rot, hl ? SEL : colorOf(t.col, t.layer))
      }
    }
    const drawText = (text: string, x: number, y: number, px: number, rot: number, color: string) => {
      if (px < 0.4 || px > 600 || x < -300 || x > w + 300 || y < -100 || y > h + 100) return
      ctx.save(); ctx.translate(x, y); ctx.rotate(-rot)
      if (px < 4) { // texto minúsculo: vira barrinha, como no AutoCAD
        ctx.globalAlpha = 0.55; ctx.fillStyle = color
        ctx.fillRect(0, -Math.max(1, px * 0.8), Math.max(2, text.length * px * 0.55), Math.max(1, px * 0.8))
        ctx.globalAlpha = 1
      } else { ctx.fillStyle = color; ctx.font = `${px}px sans-serif`; ctx.fillText(text, 0, 0) }
      ctx.restore()
    }

    // Desenho base (originais não movidos) em cache: só refaz quando muda vista, camadas ou objetos mexidos
    const sig = [view.current.cx, view.current.cy, view.current.scale, w, h, dpr, Object.keys(ed.ov).join(',')].join('|')
    let cache = baseRef.current
    if (!cache || cache.sig !== sig || cache.layerVis !== layerVis || cache.model !== model) {
      const cv = cache?.cv ?? document.createElement('canvas')
      cv.width = canvas.width; cv.height = canvas.height
      const bc = cv.getContext('2d')!
      bc.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx = bc
      ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h)
      // 1) preenchimentos originais
    for (const f of model.fills) {
      if (!layerVis[f.layer] || dirty(f.obj) || !inView(model.objs[f.obj].bbox)) continue
      ctx.beginPath()
      for (const r of f.rings) { for (let k = 0; k < r.length; k += 2) { const [x, y] = toScreen(r[k], r[k + 1], w, h); if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.closePath() }
      ctx.globalAlpha = f.alpha; ctx.fillStyle = colorOf(f.col, f.layer); ctx.fill('evenodd'); ctx.globalAlpha = 1
    }
    // 2) traços originais agrupados por cor
    const byColor = new Map<string, number[]>()
    for (let i = 0; i < model.segLayer.length; i++) {
      const l = model.segLayer[i]
      if (!layerVis[l] || dirty(model.segObj[i])) continue
      const x1 = model.segs[i * 4], y1 = model.segs[i * 4 + 1], x2 = model.segs[i * 4 + 2], y2 = model.segs[i * 4 + 3]
      if (Math.max(x1, x2) < wx0 || Math.min(x1, x2) > wx1 || Math.max(y1, y2) < wy0 || Math.min(y1, y2) > wy1) continue
      const c = colorOf(model.segCol[i], l)
      const arr = byColor.get(c); if (arr) arr.push(i); else byColor.set(c, [i])
    }
    ctx.lineWidth = 1; ctx.lineCap = 'round'
    byColor.forEach((idx, c) => {
      ctx.strokeStyle = c; ctx.beginPath()
      for (const i of idx) {
        const [a, b] = toScreen(model.segs[i * 4], model.segs[i * 4 + 1], w, h)
        const [cc, d] = toScreen(model.segs[i * 4 + 2], model.segs[i * 4 + 3], w, h)
        ctx.moveTo(a, b); ctx.lineTo(cc, d)
      }
      ctx.stroke()
    })
    // 3) textos originais
    for (const t of model.texts) {
      if (!layerVis[t.layer] || !t.text || dirty(t.obj)) continue
      const [x, y] = toScreen(t.x, t.y, w, h)
      drawText(t.text, x, y, t.h * scale, t.rot, colorOf(t.col, t.layer))
    }
      ctx = main
      cache = { sig, layerVis, model, cv }
      baseRef.current = cache
    }
    main.setTransform(1, 0, 0, 1, 0, 0); main.drawImage(cache.cv, 0, 0); main.setTransform(dpr, 0, 0, dpr, 0, 0)
    // 4) movidos e cópias
    for (const k of Object.keys(ed.ov)) { const v = ed.ov[Number(k)]; if (v) drawInst(Number(k), v, selSet.has('o' + k)) }
    for (const c of ed.cp) drawInst(c.src, c.xf, selSet.has('c' + c.id))
    // seleção de objetos ainda no lugar
    for (const k of sel) if (k[0] === 'o' && !dirty(Number(k.slice(1)))) drawInst(Number(k.slice(1)), ID6, true)

    // 5) formas desenhadas
    const shapePath = (s: Shape) => {
      ctx.beginPath()
      if (s.kind === 'circle') { const [x, y] = toScreen(s.pts[0], s.pts[1], w, h); ctx.arc(x, y, s.pts[2] * scale, 0, Math.PI * 2) }
      else {
        for (let i = 0; i < s.pts.length; i += 2) { const [x, y] = toScreen(s.pts[i], s.pts[i + 1], w, h); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) }
        if (s.kind === 'rect') ctx.closePath()
      }
    }
    for (const s of ed.shapes) {
      const on = selSet.has('s' + s.id)
      if (s.kind === 'text' || s.kind === 'arrow') {
        const color = on ? SEL : s.stroke
        const px = (s.h ?? 0.1) * scale
        if (s.kind === 'text') { const [x, y] = toScreen(s.pts[0], s.pts[1], w, h); drawText(s.text ?? '', x, y, px, s.rot ?? 0, color); continue }
        const [tx, ty] = toScreen(s.pts[0], s.pts[1], w, h), [ax, ay] = toScreen(s.pts[2], s.pts[3], w, h)
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = on ? 2.5 : 1.5
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(ax, ay); ctx.stroke()
        const ang = Math.atan2(ay - ty, ax - tx), L = Math.max(7, px * 0.9)
        ctx.beginPath(); ctx.moveTo(ax, ay)
        ctx.lineTo(ax - L * Math.cos(ang - 0.35), ay - L * Math.sin(ang - 0.35)); ctx.lineTo(ax - L * Math.cos(ang + 0.35), ay - L * Math.sin(ang + 0.35)); ctx.closePath(); ctx.fill()
        if (s.text) {
          const left = s.pts[0] < s.pts[2], gap = px * 0.3
          ctx.save(); ctx.translate(tx + (left ? -gap : gap), ty)
          if (px < 4) { ctx.globalAlpha = 0.55; const bw = Math.max(2, s.text.length * px * 0.55); ctx.fillRect(left ? -bw : 0, -Math.max(1, px * 0.4), bw, Math.max(1, px * 0.8)); ctx.globalAlpha = 1 }
          else { ctx.font = `${px}px sans-serif`; ctx.textAlign = left ? 'right' : 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s.text, 0, 0) }
          ctx.restore()
        }
        continue
      }
      shapePath(s)
      if (s.fill && s.kind !== 'line') { ctx.fillStyle = s.fill; ctx.fill() }
      ctx.strokeStyle = on ? SEL : s.stroke; ctx.lineWidth = on ? 2.5 : 1.5; ctx.stroke()
    }

    // 6) cotas
    const drawDim = (d: Dim, color: string, lw: number) => {
      const g = dimGeom(d)
      const A = toScreen(d.ax, d.ay, w, h), B = toScreen(d.bx, d.by, w, h)
      const P1 = toScreen(g.p1[0], g.p1[1], w, h), P2 = toScreen(g.p2[0], g.p2[1], w, h)
      const ang = Math.atan2(P2[1] - P1[1], P2[0] - P1[0])
      const ux = Math.cos(ang), uy = Math.sin(ang)
      const side = d.off >= 0 ? 1 : -1 // quão além do ponto a linha de extensão passa
      const nxs = g.nx, nys = -g.ny // normal em tela
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw
      ctx.beginPath()
      for (const [P, Q] of [[A, P1], [B, P2]] as const) {
        const dx = Q[0] - P[0], dy = Q[1] - P[1], l = Math.hypot(dx, dy) || 1
        ctx.moveTo(P[0] + (dx / l) * 3, P[1] + (dy / l) * 3); ctx.lineTo(Q[0] + (dx / l) * 5 * Math.sign(d.off || 1), Q[1] + (dy / l) * 5 * Math.sign(d.off || 1))
      }
      ctx.moveTo(P1[0] - ux * 5, P1[1] - uy * 5); ctx.lineTo(P2[0] + ux * 5, P2[1] + uy * 5)
      for (const P of [P1, P2]) { ctx.moveTo(P[0] - 4, P[1] + 4); ctx.lineTo(P[0] + 4, P[1] - 4) } // tique oblíquo
      ctx.stroke()
      void side; void nxs; void nys
      let ta = ang
      if (ta > Math.PI / 2 || ta < -Math.PI / 2) ta += Math.PI
      ctx.save()
      ctx.translate((P1[0] + P2[0]) / 2, (P1[1] + P2[1]) / 2); ctx.rotate(ta)
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'
      const label = fmtM(g.len * model.unitToMeters)
      ctx.lineWidth = 4; ctx.strokeStyle = BG; ctx.strokeText(label, 0, -4)
      ctx.fillStyle = color; ctx.fillText(label, 0, -4)
      ctx.restore()
    }
    for (const d of ed.dims) drawDim(d, selSet.has('d' + d.id) ? SEL : '#f87171', selSet.has('d' + d.id) ? 2 : 1.25)

    // 7) rascunho da ferramenta atual
    const cur = hover ? [hover.x, hover.y] : cursor ? [cursor.x, cursor.y] : null
    const guide = (fn: () => void) => { ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); fn(); ctx.setLineDash([]) }
    if (cur && draft.length) {
      if (tool === 'linha') guide(() => { const [x1, y1] = toScreen(draft[0][0], draft[0][1], w, h), [x2, y2] = toScreen(cur[0], cur[1], w, h); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke() })
      if (tool === 'seta') guide(() => { const [x1, y1] = toScreen(draft[0][0], draft[0][1], w, h), [x2, y2] = toScreen(cur[0], cur[1], w, h); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke() })
      if (tool === 'retangulo') guide(() => { const [x1, y1] = toScreen(draft[0][0], draft[0][1], w, h), [x2, y2] = toScreen(cur[0], cur[1], w, h); ctx.strokeRect(x1, y1, x2 - x1, y2 - y1) })
      if (tool === 'circulo') guide(() => { const [x1, y1] = toScreen(draft[0][0], draft[0][1], w, h); ctx.beginPath(); ctx.arc(x1, y1, Math.hypot(cur[0] - draft[0][0], cur[1] - draft[0][1]) * scale, 0, Math.PI * 2); ctx.stroke() })
      if (tool === 'medir') {
        if (draft.length === 1) drawDim({ id: 0, ax: draft[0][0], ay: draft[0][1], bx: cur[0], by: cur[1], off: 0 }, '#fbbf24', 1.25)
        else {
          const dd: Dim = { id: 0, ax: draft[0][0], ay: draft[0][1], bx: draft[1][0], by: draft[1][1], off: 0 }
          const g = dimGeom(dd)
          dd.off = (cur[0] - dd.ax) * g.nx + (cur[1] - dd.ay) * g.ny
          drawDim(dd, '#fbbf24', 1.25)
        }
      }
    }
    if (tool === 'inserir' && placing && cur) {
      ctx.globalAlpha = 0.65
      const ps = placing.s * (parseFloat(placeScale.replace(',', '.')) || 1)
      drawInst(placing.obj, [ps, 0, 0, ps, cur[0], cur[1]], false)
      ctx.globalAlpha = 1
    }
    if (box) { ctx.strokeStyle = SEL; ctx.fillStyle = 'rgba(56,189,248,0.12)'; ctx.lineWidth = 1; ctx.setLineDash(box.x1 < box.x0 ? [5, 4] : []); ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0); ctx.strokeRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0); ctx.setLineDash([]) }
    if (selBlock) {
      ctx.strokeStyle = '#d946ef'; ctx.fillStyle = 'rgba(217,70,239,0.25)'; ctx.lineWidth = 2
      for (const b of model.inserts) {
        if (b.name !== selBlock) continue
        const [x, y] = toScreen(b.x, b.y, w, h)
        ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      }
    }
    if (hover) {
      const [x, y] = toScreen(hover.x, hover.y, w, h)
      ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2
      if (hover.kind === 'meio') { ctx.beginPath(); ctx.moveTo(x - 6, y + 5); ctx.lineTo(x + 6, y + 5); ctx.lineTo(x, y - 6); ctx.closePath(); ctx.stroke() }
      else if (hover.kind === 'bloco') { ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke() }
      else ctx.strokeRect(x - 6, y - 6, 12, 12)
    }
  })

  // zoom com a rodinha
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const px = e.clientX - r.left, py = e.clientY - r.top
      const [wx, wy] = toWorld(px, py, el.clientWidth, el.clientHeight)
      const f = e.deltaY < 0 ? 1.15 : 1 / 1.15
      view.current.scale = Math.min(1e6, Math.max(1e-4, view.current.scale * f))
      view.current.cx = wx - (px - el.clientWidth / 2) / view.current.scale
      view.current.cy = wy + (py - el.clientHeight / 2) / view.current.scale
      redraw()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model])

  // ── Mouse ────────────────────────────────────────────────────────────────
  function pos(e: React.MouseEvent) {
    const r = wrapRef.current!.getBoundingClientRect()
    return { px: e.clientX - r.left, py: e.clientY - r.top, w: r.width, h: r.height }
  }
  const ortho = (p: number[], from: number[], shift: boolean) => {
    if (!shift) return p
    return Math.abs(p[0] - from[0]) > Math.abs(p[1] - from[1]) ? [p[0], from[1]] : [from[0], p[1]]
  }
  function point(e: React.MouseEvent, exclude?: Set<string>): { p: number[]; snap: Snap | null } {
    const { px, py, w, h } = pos(e)
    const [wx, wy] = toWorld(px, py, w, h)
    const s = findSnap(wx, wy, exclude)
    return { p: s ? [s.x, s.y] : [wx, wy], snap: s }
  }

  function onDown(e: React.MouseEvent) {
    const { px, py, w, h } = pos(e)
    if (e.button === 1 || (e.button === 0 && tool === 'pan')) { gesture.current = { type: 'pan', x: px, y: py, cx: view.current.cx, cy: view.current.cy }; return }
    if (e.button !== 0 || tool !== 'select') return
    const [wx, wy] = toWorld(px, py, w, h)
    const hit = hitTest(wx, wy)
    if (hit) {
      let keys = selRef.current
      if (e.shiftKey) {
        keys = keys.includes(hit) ? keys.filter(k => k !== hit) : [...keys, hit]
        setSel(keys); return
      }
      if (!keys.includes(hit)) { keys = [hit]; setSel(keys) }
      if (hit[0] === 'd' && keys.length === 1) {
        gesture.current = { type: 'dimdrag', x: px, y: py, cx: 0, cy: 0, base: edRef.current, dim: Number(hit.slice(1)), moved: false }
      } else {
        const s = findSnap(wx, wy, new Set())
        gesture.current = { type: 'move', x: px, y: py, cx: 0, cy: 0, base: edRef.current, keys, start: s ? [s.x, s.y] : [wx, wy], moved: false }
      }
    } else {
      if (!e.shiftKey) setSel([])
      gesture.current = { type: 'box', x: px, y: py, cx: 0, cy: 0, bx: px, by: py }
    }
  }
  function onMove(e: React.MouseEvent) {
    const { px, py, w, h } = pos(e)
    const g = gesture.current
    if (g?.type === 'pan') {
      view.current.cx = g.cx - (px - g.x) / view.current.scale
      view.current.cy = g.cy + (py - g.y) / view.current.scale
      redraw(); return
    }
    const [wx, wy] = toWorld(px, py, w, h)
    if (g?.type === 'move' && g.base && g.keys) {
      if (!g.moved && Math.hypot(px - g.x, py - g.y) < 4) return
      g.moved = true
      const s = findSnap(wx, wy, new Set(g.keys))
      let [tx, ty] = s ? [s.x, s.y] : [wx, wy]
      if (e.shiftKey) { if (Math.abs(tx - g.start![0]) > Math.abs(ty - g.start![1])) ty = g.start![1]; else tx = g.start![0] }
      setHover(s)
      setEd(applyXf(g.base, g.keys, [1, 0, 0, 1, tx - g.start![0], ty - g.start![1]]))
      return
    }
    if (g?.type === 'dimdrag' && g.base) {
      g.moved = true
      const d = g.base.dims.find(d => d.id === g.dim)!
      const gm = dimGeom(d)
      const off = (wx - d.ax) * gm.nx + (wy - d.ay) * gm.ny
      setEd({ ...g.base, dims: g.base.dims.map(x => (x.id === d.id ? { ...x, off } : x)) })
      return
    }
    if (g?.type === 'box') { setBox({ x0: g.x, y0: g.y, x1: px, y1: py }); return }
    setCursor({ x: wx, y: wy })
    setHover(tool === 'pan' ? null : findSnap(wx, wy))
  }
  function onUp(e?: React.MouseEvent) {
    const g = gesture.current
    gesture.current = null
    if (!g) return
    if ((g.type === 'move' || g.type === 'dimdrag') && g.base) {
      if (g.moved) { past.current.push(g.base); future.current = []; redraw() } else setEd(g.base)
    }
    const box = boxRef.current
    if (g.type === 'box' && box && model && wrapRef.current) {
      const { w, h } = { w: wrapRef.current.clientWidth, h: wrapRef.current.clientHeight }
      const [ax, ay] = toWorld(Math.min(box.x0, box.x1), Math.max(box.y0, box.y1), w, h)
      const [bx, by] = toWorld(Math.max(box.x0, box.x1), Math.min(box.y0, box.y1), w, h)
      const crossing = box.x1 < box.x0
      const e0 = edRef.current
      const keys: string[] = []
      const test = (k: string) => {
        const bb = bboxOf(e0, k); if (!bb) return
        const inside = bb[0] >= ax && bb[2] <= bx && bb[1] >= ay && bb[3] <= by
        const touch = !(bb[2] < ax || bb[0] > bx || bb[3] < ay || bb[1] > by)
        if (crossing ? touch : inside) keys.push(k)
      }
      for (let i = 0; i < model.objs.length; i++) if (layerVis[model.objs[i].layer]) test('o' + i)
      e0.cp.forEach(c => test('c' + c.id)); e0.shapes.forEach(s => test('s' + s.id)); e0.dims.forEach(d => test('d' + d.id))
      setSel(prev => (e?.shiftKey ? Array.from(new Set([...prev, ...keys])) : keys))
    }
    setBox(null)
  }
  function onClick(e: React.MouseEvent) {
    if (tool === 'select' || tool === 'pan') return
    if (textEditRef.current) return // o campo de texto está aberto (o blur confirma)
    const { p: raw } = point(e)
    const last = draft[draft.length - 1]
    const p = last && tool !== 'medir' ? ortho(raw, last, e.shiftKey) : raw
    const e0 = edRef.current
    if (tool === 'texto') { setTextEdit({ kind: 'text', x: p[0], y: p[1], value: '' }); return }
    if (tool === 'seta') {
      if (!draft.length) { setDraft([p]); return }
      if (Math.hypot(p[0] - draft[0][0], p[1] - draft[0][1]) < 1e-9) return
      setTextEdit({ kind: 'arrow', x: p[0], y: p[1], tip: draft[0], value: '' }); setDraft([]); return
    }
    if (tool === 'inserir') {
      if (!placing) return
      const ps = placing.s * (parseFloat(placeScale.replace(',', '.')) || 1)
      commit({ ...e0, cp: [...e0.cp, { id: e0.next, src: placing.obj, xf: [ps, 0, 0, ps, p[0], p[1]] }], next: e0.next + 1 })
      setSel(['c' + e0.next]); return
    }
    if (tool === 'linha') {
      if (!draft.length) { setDraft([p]); return }
      if (Math.hypot(p[0] - draft[0][0], p[1] - draft[0][1]) < 1e-9) return
      commit({ ...e0, shapes: [...e0.shapes, { id: e0.next, kind: 'line', pts: [draft[0][0], draft[0][1], p[0], p[1]], stroke, fill: null }], next: e0.next + 1 })
      setDraft([p]) // continua a partir do último ponto; Esc / botão direito termina
    } else if (tool === 'retangulo') {
      if (!draft.length) { setDraft([p]); return }
      const [x0, y0] = draft[0], [x1, y1] = p
      if (Math.abs(x1 - x0) < 1e-9 || Math.abs(y1 - y0) < 1e-9) return
      commit({ ...e0, shapes: [...e0.shapes, { id: e0.next, kind: 'rect', pts: [x0, y0, x1, y0, x1, y1, x0, y1], stroke, fill: useFill ? fill : null }], next: e0.next + 1 })
      setDraft([])
    } else if (tool === 'circulo') {
      if (!draft.length) { setDraft([p]); return }
      const r = Math.hypot(p[0] - draft[0][0], p[1] - draft[0][1])
      if (r < 1e-9) return
      commit({ ...e0, shapes: [...e0.shapes, { id: e0.next, kind: 'circle', pts: [draft[0][0], draft[0][1], r], stroke, fill: useFill ? fill : null }], next: e0.next + 1 })
      setDraft([])
    } else if (tool === 'medir') {
      if (draft.length < 2) { if (draft.length === 1 && Math.hypot(p[0] - draft[0][0], p[1] - draft[0][1]) < 1e-9) return; setDraft([...draft, p]); return }
      const d: Dim = { id: e0.next, ax: draft[0][0], ay: draft[0][1], bx: draft[1][0], by: draft[1][1], off: 0 }
      const g = dimGeom(d)
      d.off = (raw[0] - d.ax) * g.nx + (raw[1] - d.ay) * g.ny
      commit({ ...e0, dims: [...e0.dims, d], next: e0.next + 1 })
      setDraft([])
    }
  }

  useEffect(() => { setStateMenu(false) }, [sel])
  useEffect(() => {
    setDraft([]); if (tool !== 'inserir') setPlacing(null)
    // texto novo nasce legível no zoom atual (~14 px de altura); dá pra ajustar no campo "Texto"
    if ((tool === 'texto' || tool === 'seta') && model) setTextH(String(Number(((14 / view.current.scale) * model.unitToMeters).toPrecision(2))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool])

  function onDbl(e: React.MouseEvent) {
    if (tool !== 'select') { setDraft([]); return }
    const { px, py, w, h } = pos(e)
    const hit = hitTest(...toWorld(px, py, w, h))
    if (!hit || hit[0] !== 's') return
    const sh = edRef.current.shapes.find(x => x.id === Number(hit.slice(1)))
    if (!sh || (sh.kind !== 'text' && sh.kind !== 'arrow')) return
    setTextEdit({ kind: sh.kind, id: sh.id, x: sh.pts[0], y: sh.pts[1], value: sh.text ?? '' })
  }
  function commitText(cancel = false) {
    const te = textEditRef.current
    if (!te) return
    setTextEdit(null); textEditRef.current = null
    if (cancel) return
    const value = te.value.trim()
    const e0 = edRef.current
    const h = (parseFloat(textH.replace(',', '.')) || 0.15) / u2m
    if (te.id !== undefined) {
      if (!value && te.kind === 'text') { commit(deleteKeys(e0, ['s' + te.id])); setSel([]); return }
      commit({ ...e0, shapes: e0.shapes.map(x => (x.id === te.id ? { ...x, text: value } : x)) }); return
    }
    if (te.kind === 'text') {
      if (!value) return
      commit({ ...e0, shapes: [...e0.shapes, { id: e0.next, kind: 'text', pts: [te.x, te.y], text: value, h, rot: 0, stroke, fill: null }], next: e0.next + 1 })
    } else {
      commit({ ...e0, shapes: [...e0.shapes, { id: e0.next, kind: 'arrow', pts: [te.x, te.y, te.tip![0], te.tip![1]], text: value, h, stroke, fill: null }], next: e0.next + 1 })
    }
  }

  // ── Biblioteca ───────────────────────────────────────────────────────────
  useEffect(() => {
    listCadLibrary().then(r => { if (r.rows) setLib(r.rows); else if (r.error) setLibMsg(r.error) }).catch(() => {})
  }, [])
  // coloca a definição do bloco no desenho aberto (uma vez por bloco) e devolve o índice do objeto
  function ensureObj(b: LibBlock): number {
    const m = modelRef.current!
    let obj = libObj.current.get(b.name)
    if (obj === undefined) {
      const r = appendLibBlock(m, b)
      modelRef.current = r.model; setModel(r.model)
      if (r.layerAdded) setLayerVis(v => [...v, true])
      obj = r.obj; libObj.current.set(b.name, obj)
    }
    return obj
  }
  function startPlace(b: LibBlock) {
    const m = modelRef.current
    if (!m) return
    setPlacing({ name: b.name, obj: ensureObj(b), s: b.unitToMeters / m.unitToMeters }); setTool('inserir')
  }

  // ── Famílias e estados ───────────────────────────────────────────────────
  // Família = campo "family" (manual) ou o nome sem o número final ("Vigo 10 focos" → "Vigo")
  const autoStem = (name: string) => name.replace(/[\s_-]*\d+([.,]\d+)?\s*[^\d\s]*\s*$/, '').trim()
  const groups = useMemo(() => {
    const stems = new Map<string, number>()
    for (const r of lib) { const k = r.family?.trim() || autoStem(r.name); if (k) stems.set(k, (stems.get(k) ?? 0) + 1) }
    const m = new Map<string, CadLibRow[]>()
    for (const r of lib) {
      const st = r.family?.trim() || autoStem(r.name)
      const k = st && (r.family?.trim() || (stems.get(st) ?? 0) > 1) ? st : r.name
      const arr = m.get(k); if (arr) arr.push(r); else m.set(k, [r])
    }
    m.forEach(arr => arr.sort((x, y) => x.name.localeCompare(y.name, 'pt-BR', { numeric: true })))
    return Array.from(m.entries()).sort((x, y) => x[0].localeCompare(y[0], 'pt-BR', { numeric: true }))
  }, [lib])
  const groupOfName = useMemo(() => {
    const m = new Map<string, { key: string; rows: CadLibRow[] }>()
    for (const [key, rows] of groups) for (const r of rows) m.set(r.name, { key, rows })
    return m
  }, [groups])
  // seleção atual: só blocos da biblioteca, todos da mesma família com 2+ estados → mostra o menu de estado
  const stateInfo = (() => {
    if (!model || tool !== 'select' || !sel.length || sel.some(k => k[0] !== 'c')) return null
    let fam: { key: string; rows: CadLibRow[] } | null = null
    const cur = new Set<string>()
    for (const k of sel) {
      const c = ed.cp.find(c => c.id === Number(k.slice(1))); const o = c ? model.objs[c.src] : null
      if (!o || o.kind !== 'LIB') return null
      const g = groupOfName.get(o.name); if (!g || g.rows.length < 2) return null
      if (fam && fam.key !== g.key) return null
      fam = g; cur.add(o.name)
    }
    if (!fam) return null
    const bb = unionBox(ed, sel)
    return bb ? { fam, cur, bb } : null
  })()
  function changeState(row: CadLibRow) {
    if (!stateInfo || !modelRef.current) return
    const obj = ensureObj(row.data)
    const ids = new Set(sel.map(k => Number(k.slice(1))))
    commit({ ...edRef.current, cp: edRef.current.cp.map(c => (ids.has(c.id) ? { ...c, src: obj } : c)) })
    setStateMenu(false)
  }
  async function renameFamily(r: CadLibRow) {
    const v = window.prompt(`Família do bloco "${r.name}" (vazio = automática pelo nome):`, r.family ?? autoStem(r.name))
    if (v === null) return
    const res = await setCadLibraryFamily(r.id, v)
    if (res.error) { setLibMsg(res.error); return }
    setLib(l => l.map(x => (x.id === r.id ? { ...x, family: v.trim() || null } : x)))
  }
  async function onLibFile(file: File) {
    if (file.size > 60e6) { setLibMsg(`Esse arquivo tem ${(file.size / 1e6).toFixed(0)} MB — pesado demais pro navegador. No AutoCAD: rode -PURGE (Tudo) e salve, ou use WBLOCK só com os blocos que quer e suba o arquivo menor (idealmente até uns 30 MB).`); return }
    setLibMsg('Lendo o arquivo de biblioteca...'); setCand(null)
    try {
      const blocks = await loadCadLibraryFile(await file.arrayBuffer())
      if (!blocks.length) { setLibMsg('Nenhum bloco encontrado nesse arquivo.'); return }
      setCand(blocks); setCandSel(new Set(blocks.map(b => b.name))); setLibMsg(null)
    } catch (err: any) { setLibMsg(/Aborted|memory|out of/i.test(String(err?.message)) ? `Esse arquivo é pesado demais pro navegador (${(file.size / 1e6).toFixed(0)} MB). No AutoCAD: abra o arquivo, rode -PURGE (Tudo) e salve; ou use WBLOCK só com os blocos que quer e suba o arquivo menor (idealmente até uns 30 MB).` : (err?.message ?? 'Falha ao ler o arquivo.')) }
  }
  async function saveCand() {
    if (!cand) return
    setLibBusy(true); let ok = 0; const fails: string[] = []
    for (const b of cand) {
      if (!candSel.has(b.name)) continue
      const r = await saveCadLibraryBlock(b)
      if (r.error) fails.push(`${b.name}: ${r.error}`); else ok++
    }
    const r = await listCadLibrary(); if (r.rows) setLib(r.rows)
    setLibBusy(false)
    if (fails.length) setLibMsg(`${ok} salvo(s). Falhas: ${fails.slice(0, 3).join(' · ')}`); else { setLibMsg(`${ok} bloco(s) salvo(s) na biblioteca.`); setCand(null) }
  }
  async function removeLib(id: string, name: string) {
    if (!window.confirm(`Remover "${name}" da biblioteca?`)) return
    const r = await deleteCadLibraryBlock(id)
    if (r.error) { setLibMsg(r.error); return }
    setLib(l => l.filter(x => x.id !== id))
  }
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return
      const mod = ev.metaKey || ev.ctrlKey
      const k = ev.key.toLowerCase()
      if (mod && k === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return }
      if (mod && k === 'y') { ev.preventDefault(); redo(); return }
      if (mod && k === 'c') { actCopy(); return }
      if (mod && k === 'v') { ev.preventDefault(); actPaste(); return }
      if (mod && k === 'd') { ev.preventDefault(); actDuplicate(); return }
      if (mod) return
      if (k === 'escape') { setDraft([]); setSel([]); setTool('select') }
      else if (k === 'delete' || k === 'backspace') { ev.preventDefault(); actDelete() }
      else if (k === 'v') setTool('select')
      else if (k === 'h') setTool('pan')
      else if (k === 'm') setTool('medir')
      else if (k === 'l') setTool('linha')
      else if (k === 'r') setTool('retangulo')
      else if (k === 'c') setTool('circulo')
      else if (k === 't') setTool('texto')
      else if (k === 'a') setTool('seta')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model])

  const blocos = useMemo(() => {
    if (!model) return []
    const c = new Map<string, number>()
    for (const b of model.inserts) c.set(b.name, (c.get(b.name) ?? 0) + 1)
    return Array.from(c.entries()).filter(([n]) => !n.startsWith('*')).sort((a, b) => b[1] - a[1])
  }, [model])

  const selShapes = ed.shapes.filter(s => sel.includes('s' + s.id))
  const totalCotas = model ? ed.dims.reduce((s, d) => s + dimGeom(d).len * model.unitToMeters, 0) : 0
  const cursorCss = tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair'

  const TB = ({ id, icon, label, k }: { id: Tool; icon: React.ReactNode; label: string; k: string }) => (
    <button onClick={() => setTool(id)} title={`${label} (${k})`}
      className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium', tool === id ? 'bg-brand-600 text-white' : 'text-navy-muted hover:bg-surface-secondary')}>{icon} {label}</button>
  )
  const AB = ({ onClick, icon, label, disabled }: { onClick: () => void; icon: React.ReactNode; label: string; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled} title={label}
      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-navy-muted hover:bg-surface-secondary disabled:opacity-35 disabled:hover:bg-transparent">{icon}<span className="hidden xl:inline">{label}</span></button>
  )

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-bold text-navy">Laboratório CAD <span className="text-xs font-semibold align-middle bg-amber-100 text-amber-700 rounded px-2 py-0.5">protótipo · só você vê</span></h1>
        <p className="text-sm text-navy-muted">Abre DWG ou DXF direto no navegador (o arquivo não é enviado pra lugar nenhum). Camadas, blocos, snap, cotas, e edição: selecionar, mover, copiar, girar, espelhar, apagar, desenhar linhas, retângulos e círculos.</p>
      </div>

      <label className="flex items-center gap-3 border-2 border-dashed border-surface-border hover:border-brand-400 rounded-card px-4 py-3 cursor-pointer bg-gradient-card shadow-card">
        <input type="file" accept=".dwg,.dxf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        {loading ? <Loader2 className="w-5 h-5 text-brand-500 animate-spin" /> : <Upload className="w-5 h-5 text-navy-muted/60" />}
        <span className="text-sm font-medium text-navy-muted">
          {loading ? 'Lendo o desenho (arquivos grandes levam alguns segundos)...' : fileName ? `${fileName} — clique pra trocar o arquivo` : 'Clique pra escolher um arquivo .dwg ou .dxf'}
        </span>
      </label>
      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {model && (
        <div className="flex gap-3 items-start">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-1 gap-y-1 mb-1">
              <TB id="select" icon={<MousePointer className="w-3.5 h-3.5" />} label="Selecionar" k="V" />
              <TB id="pan" icon={<Hand className="w-3.5 h-3.5" />} label="Pan" k="H" />
              <TB id="medir" icon={<Ruler className="w-3.5 h-3.5" />} label="Cota" k="M" />
              <span className="w-px h-5 bg-gray-200 mx-1" />
              <TB id="linha" icon={<Minus className="w-3.5 h-3.5 -rotate-45" />} label="Linha" k="L" />
              <TB id="retangulo" icon={<Square className="w-3.5 h-3.5" />} label="Retângulo" k="R" />
              <TB id="circulo" icon={<CircleIcon className="w-3.5 h-3.5" />} label="Círculo" k="C" />
              <TB id="texto" icon={<TypeIcon className="w-3.5 h-3.5" />} label="Texto" k="T" />
              <TB id="seta" icon={<ArrowUpRight className="w-3.5 h-3.5" />} label="Seta" k="A" />
              <span className="w-px h-5 bg-gray-200 mx-1" />
              <button onClick={() => fit(0)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-navy-muted hover:bg-surface-secondary"><Maximize className="w-3.5 h-3.5" /> Ajustar</button>
              <span className="ml-auto text-[11px] text-gray-400">
                {tempo != null && `lido em ${(tempo / 1000).toFixed(1)}s · `}{(model.segLayer.length).toLocaleString('pt-BR')} traços · unidade: {model.unitName}
                {cursor && ` · x ${cursor.x.toFixed(2)} y ${cursor.y.toFixed(2)}`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-0.5 gap-y-1 mb-2">
              <AB onClick={undo} icon={<Undo2 className="w-3.5 h-3.5" />} label="Desfazer" disabled={!past.current.length} />
              <AB onClick={redo} icon={<Redo2 className="w-3.5 h-3.5" />} label="Refazer" disabled={!future.current.length} />
              <span className="w-px h-5 bg-gray-200 mx-1" />
              <AB onClick={actCopy} icon={<Copy className="w-3.5 h-3.5" />} label="Copiar" disabled={!sel.length} />
              <AB onClick={() => actPaste()} icon={<ClipboardPaste className="w-3.5 h-3.5" />} label="Colar" disabled={!clip.current} />
              <AB onClick={actDuplicate} icon={<CopyPlus className="w-3.5 h-3.5" />} label="Duplicar" disabled={!sel.length} />
              <span className="w-px h-5 bg-gray-200 mx-1" />
              <AB onClick={() => actRotate(90)} icon={<RotateCw className="w-3.5 h-3.5" />} label="Girar 90°" disabled={!sel.length} />
              <input value={angulo} onChange={e => setAngulo(e.target.value)} className="w-12 text-xs border border-gray-200 rounded px-1.5 py-1 text-center" title="Ângulo em graus (anti-horário)" />
              <AB onClick={() => { const a = parseFloat(angulo.replace(',', '.')); if (!isNaN(a)) actRotate(a) }} icon={<RotateCw className="w-3.5 h-3.5" />} label="Girar" disabled={!sel.length} />
              <AB onClick={() => actMirror(true)} icon={<FlipHorizontal className="w-3.5 h-3.5" />} label="Espelhar ↔" disabled={!sel.length} />
              <AB onClick={() => actMirror(false)} icon={<FlipVertical className="w-3.5 h-3.5" />} label="Espelhar ↕" disabled={!sel.length} />
              <AB onClick={actDelete} icon={<Trash2 className="w-3.5 h-3.5" />} label="Apagar" disabled={!sel.length} />
              <span className="w-px h-5 bg-gray-200 mx-1" />
              <span className="text-[11px] text-navy-muted">Escala</span>
              <input value={scaleBy} onChange={e => setScaleBy(e.target.value)} className="w-12 text-xs border border-gray-200 rounded px-1.5 py-1 text-center" title="Fator: 2 = dobra o tamanho, 0.5 = metade" />
              <AB onClick={() => actScale(parseFloat(scaleBy.replace(',', '.')))} icon={<Maximize className="w-3.5 h-3.5" />} label="Escalar" disabled={!sel.length} />
              <span className="w-px h-5 bg-gray-200 mx-1" />
              <label className="flex items-center gap-1 text-[11px] text-navy-muted" title="Altura das letras em metros">Texto
                <input value={textH} onChange={e => { setTextH(e.target.value); const v = parseFloat(e.target.value.replace(',', '.')); if (v > 0) { const ids = new Set(selRef.current.filter(k => k[0] === 's').map(k => Number(k.slice(1)))); if (ids.size) commit({ ...edRef.current, shapes: edRef.current.shapes.map(x => (ids.has(x.id) && (x.kind === 'text' || x.kind === 'arrow') ? { ...x, h: v / u2m } : x)) }) } }}
                  className="w-12 text-xs border border-gray-200 rounded px-1.5 py-1 text-center" />m</label>
              <label className="flex items-center gap-1 text-[11px] text-navy-muted ml-1">Contorno
                <input type="color" value={selShapes[0]?.stroke ?? stroke} onChange={e => { setStroke(e.target.value); setShapeStyle({ stroke: e.target.value }) }} className="w-6 h-6 p-0 border border-gray-200 rounded cursor-pointer" /></label>
              <label className="flex items-center gap-1 text-[11px] text-navy-muted ml-1">
                <input type="checkbox" checked={selShapes.length ? !!selShapes[0].fill : useFill} onChange={e => { setUseFill(e.target.checked); setShapeStyle({ fill: e.target.checked ? fill : null }) }} /> Preencher
                <input type="color" value={selShapes[0]?.fill ?? fill} onChange={e => { setFill(e.target.value); setUseFill(true); setShapeStyle({ fill: e.target.value }) }} className="w-6 h-6 p-0 border border-gray-200 rounded cursor-pointer" /></label>
            </div>
            <div ref={wrapRef} className="relative w-full border border-surface-border rounded-xl overflow-hidden" style={{ background: BG, height: '66vh', cursor: gesture.current?.type === 'pan' ? 'grabbing' : cursorCss }}
              onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => { onUp(); setHover(null) }} onClick={onClick}
              onDoubleClick={onDbl} onContextMenu={e => { e.preventDefault(); setDraft([]) }}>
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ width: '100%', height: '100%' }} />
              {textEdit && (() => {
                const el = wrapRef.current
                const [sx, sy] = toScreen(textEdit.x, textEdit.y, el?.clientWidth ?? 0, el?.clientHeight ?? 0)
                return (
                  <input autoFocus value={textEdit.value} onChange={e => setTextEdit(t => (t ? { ...t, value: e.target.value } : t))}
                    onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') commitText(); else if (e.key === 'Escape') commitText(true) }}
                    onBlur={() => commitText()} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
                    placeholder={textEdit.kind === 'arrow' ? 'texto da seta (opcional)' : 'digite o texto'}
                    style={{ position: 'absolute', left: sx, top: sy - 12, minWidth: 140 }}
                    className="text-xs px-2 py-1 rounded border border-amber-400 bg-white text-gray-800 shadow-lg z-10" />
                )
              })()}
              {stateInfo && (() => {
                const el = wrapRef.current
                const [sx, sy] = toScreen((stateInfo.bb[0] + stateInfo.bb[2]) / 2, stateInfo.bb[1], el?.clientWidth ?? 0, el?.clientHeight ?? 0)
                return (
                  <div style={{ position: 'absolute', left: sx - 10, top: sy + 6 }} className="z-10" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
                    <button onClick={() => setStateMenu(v => !v)} title="Trocar o estado do bloco" className="w-5 h-5 flex items-center justify-center bg-red-700/90 hover:bg-red-600 text-white text-[9px] rounded-sm" style={{ clipPath: 'polygon(0 0,100% 0,50% 100%)', paddingBottom: 2 }}>▼</button>
                    {stateMenu && (
                      <div style={{ position: 'absolute', left: 0, top: sy + 30 + (stateInfo.fam.rows.length * 26 + 28) > (el?.clientHeight ?? 0) ? -(stateInfo.fam.rows.length * 26 + 28) - 4 : 24 }} className="min-w-[150px] bg-white/95 backdrop-blur rounded-lg border border-gray-200 shadow-xl py-1">
                        <p className="px-3 py-0.5 text-[10px] text-gray-400 uppercase">{stateInfo.fam.key}</p>
                        {stateInfo.fam.rows.map(r => (
                          <button key={r.id} onClick={() => changeState(r)} className="w-full text-left px-3 py-1 text-xs hover:bg-brand-50 flex items-center gap-1.5 text-gray-800">
                            <span className="w-3 text-brand-600">{stateInfo.cur.size === 1 && stateInfo.cur.has(r.name) ? '✓' : ''}</span>{r.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}
              {hover && <div className="absolute left-2 bottom-2 text-[11px] bg-white/90 border border-gray-200 rounded px-2 py-0.5 text-green-700 font-medium">snap: {hover.kind}</div>}
              {tool !== 'select' && tool !== 'pan' && (
                <div className="absolute left-2 top-2 text-[11px] bg-amber-50 border border-amber-200 rounded px-2 py-0.5 text-amber-700">
                  {tool === 'linha' && (draft.length ? 'Próximo ponto (Shift = reto; Esc ou botão direito termina)' : 'Clique no ponto inicial da linha')}
                  {tool === 'retangulo' && (draft.length ? 'Clique no canto oposto' : 'Clique no primeiro canto')}
                  {tool === 'circulo' && (draft.length ? 'Clique pra definir o raio' : 'Clique no centro')}
                  {tool === 'texto' && 'Clique onde o texto começa e digite (Enter confirma). Duplo clique num texto edita.'}
                  {tool === 'seta' && (draft.length ? 'Clique onde o texto da seta vai ficar' : 'Seta com texto: clique na PONTA da seta')}
                  {tool === 'inserir' && (placing ? `Inserindo "${placing.name}" — clique pra colocar (Esc termina)` : '')}
                  {tool === 'medir' && (draft.length === 0 ? 'Cota: clique no 1º ponto' : draft.length === 1 ? 'Clique no 2º ponto' : 'Clique onde a cota deve ficar (distância da linha)')}
                </div>
              )}
              {tool === 'inserir' && placing && (
                <div className="absolute right-2 top-2 z-10 flex items-center gap-1 text-[11px] bg-white/95 border border-gray-200 rounded px-2 py-1 text-gray-600" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                  Tamanho ×
                  <input value={placeScale} onChange={e => setPlaceScale(e.target.value)} className="w-12 text-xs border border-gray-200 rounded px-1 py-0.5 text-center" title="1 = tamanho do arquivo da biblioteca; 5 = cinco vezes maior" />
                </div>
              )}
              {tool === 'select' && sel.length > 0 && <div className="absolute left-2 top-2 text-[11px] bg-sky-50 border border-sky-200 rounded px-2 py-0.5 text-sky-700">{sel.length} selecionado(s) — arraste pra mover, Shift pra somar, Delete apaga</div>}
            </div>
            {!model.unitKnown && <p className="text-[11px] text-amber-600 mt-1">O arquivo não informa a unidade — as medidas estão assumindo metros.</p>}
          </div>

          <div className="w-72 shrink-0 space-y-3 max-h-[80vh] overflow-y-auto">
            <section className="border border-gray-200 rounded-xl bg-white p-3">
              <p className="text-xs font-bold text-gray-500 uppercase mb-1">Cotas</p>
              {ed.dims.length === 0 && <p className="text-xs text-gray-400">Use "Cota": 2 pontos e depois clique onde ela deve ficar. Selecione e arraste a cota pra afastá-la da linha, ou ajuste a distância abaixo.</p>}
              {ed.dims.map((d, i) => (
                <div key={d.id} className={cn('flex items-center gap-1.5 text-xs py-0.5 rounded px-1', sel.includes('d' + d.id) && 'bg-sky-50')}>
                  <button onClick={() => setSel(['d' + d.id])} className="text-gray-500 hover:text-gray-800">#{i + 1}</button>
                  <b className="flex-1">{fmtM(dimGeom(d).len * model.unitToMeters)}</b>
                  <input type="number" step="0.1" value={Number((d.off * model.unitToMeters).toFixed(2))}
                    onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) commit({ ...ed, dims: ed.dims.map(x => (x.id === d.id ? { ...x, off: v / model.unitToMeters } : x)) }) }}
                    className="w-16 text-[11px] border border-gray-200 rounded px-1 py-0.5" title="Distância da cota até a linha (m)" />
                  <button onClick={() => { commit(deleteKeys(ed, ['d' + d.id])); setSel(s => s.filter(k => k !== 'd' + d.id)) }} className="text-gray-300 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
              {ed.dims.length > 0 && <div className="flex justify-between text-xs border-t border-gray-100 mt-1 pt-1"><span className="text-gray-500">Total</span><b>{fmtM(totalCotas)}</b></div>}
            </section>

            <section className="border border-gray-200 rounded-xl bg-white p-3">
              <div className="flex items-center gap-1 mb-1">
                <p className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><Boxes className="w-3.5 h-3.5" /> Biblioteca Luknos ({lib.length})</p>
                <label className="ml-auto text-[10px] text-brand-600 underline cursor-pointer">
                  importar arquivo
                  <input type="file" accept=".dwg,.dxf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onLibFile(f); e.target.value = '' }} />
                </label>
              </div>
              <p className="text-[10px] text-gray-400 mb-1">Seus blocos padrão, em qualquer desenho que você abrir. Clique num bloco e depois no desenho pra colocar (Esc termina).</p>
              {libMsg && <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1 mb-1">{libMsg}</p>}
              {cand && (
                <div className="border border-sky-200 bg-sky-50/50 rounded-lg p-2 mb-2">
                  <p className="text-[11px] font-medium text-sky-800 mb-1">{cand.length} bloco(s) encontrados no arquivo — marque o que entra na biblioteca:</p>
                  <div className="flex gap-2 text-[10px] mb-1">
                    <button onClick={() => setCandSel(new Set(cand.map(b => b.name)))} className="text-brand-600 underline">todos</button>
                    <button onClick={() => setCandSel(new Set())} className="text-brand-600 underline">nenhum</button>
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-0.5">
                    {cand.map(b => (
                      <div key={b.name} className="flex items-center gap-1.5 text-xs">
                        <input type="checkbox" checked={candSel.has(b.name)} onChange={() => setCandSel(prev => { const n = new Set(prev); if (n.has(b.name)) n.delete(b.name); else n.add(b.name); return n })} />
                        <button onClick={() => startPlace(b)} title="Colocar no desenho (pra testar)" className="shrink-0"><BlockThumb b={b} /></button>
                        <span className="truncate flex-1">{b.name}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button onClick={saveCand} disabled={libBusy || candSel.size === 0} className="flex-1 text-xs font-medium bg-brand-600 text-white rounded-lg py-1.5 disabled:opacity-40">{libBusy ? 'Salvando...' : `Salvar ${candSel.size} na biblioteca`}</button>
                    <button onClick={() => setCand(null)} className="text-xs text-gray-500 px-2">cancelar</button>
                  </div>
                </div>
              )}
              {lib.length > 6 && <input value={libFilter} onChange={e => setLibFilter(e.target.value)} placeholder="buscar bloco..." className="w-full text-[11px] border border-gray-200 rounded px-1.5 py-0.5 mb-1" />}
              {lib.length === 0 && !cand && <p className="text-xs text-gray-400">Ainda vazia. Use "importar arquivo" com o seu DWG/DXF de blocos padrão.</p>}
              <div className="max-h-72 overflow-y-auto grid grid-cols-3 gap-1.5">
                {groups.filter(([k, rows]) => (k + rows.map(r => r.name).join(' ')).toLowerCase().includes(libFilter.toLowerCase())).map(([key, rows]) => (
                  <div key={key} className={cn('relative group border rounded-lg p-1 text-center cursor-pointer hover:border-brand-400', rows.some(r => placing?.name === r.name) && tool === 'inserir' ? 'border-brand-500 bg-brand-50' : 'border-gray-200', openFam === key && 'col-span-3')}
                    onClick={() => (rows.length > 1 ? setOpenFam(openFam === key ? null : key) : startPlace(rows[0].data))} title={key}>
                    {openFam === key ? (
                      <div onClick={ev => ev.stopPropagation()} className="text-left">
                        <p className="text-[11px] font-semibold text-gray-700 mb-1">{key} — {rows.length} estados <button onClick={() => setOpenFam(null)} className="text-gray-400 font-normal ml-1">fechar</button></p>
                        {rows.map(r => (
                          <div key={r.id} className="flex items-center gap-1.5 text-xs py-0.5">
                            <button onClick={() => startPlace(r.data)} title="Colocar no desenho"><BlockThumb b={r.data} /></button>
                            <span className="flex-1 truncate">{r.name}</span>
                            <button onClick={() => renameFamily(r)} className="text-[10px] text-brand-600 underline">família</button>
                            <button onClick={() => removeLib(r.id, r.name)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-center"><BlockThumb b={rows[0].data} /></div>
                        <p className="text-[10px] text-gray-600 truncate mt-0.5">{key}</p>
                        {rows.length > 1 && <span className="absolute top-0.5 left-0.5 text-[9px] bg-brand-600 text-white rounded px-1">{rows.length} estados</span>}
                        {rows.length === 1 && (
                          <>
                            <button onClick={ev => { ev.stopPropagation(); removeLib(rows[0].id, rows[0].name) }} className="absolute top-0.5 right-0.5 hidden group-hover:block text-gray-300 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                            <button onClick={ev => { ev.stopPropagation(); renameFamily(rows[0]) }} className="absolute top-0.5 left-0.5 hidden group-hover:block text-[9px] text-brand-600 underline bg-white/80 rounded px-0.5">família</button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="border border-gray-200 rounded-xl bg-white p-3">
              <p className="text-xs font-bold text-gray-500 uppercase mb-1">Regiões do desenho ({regioes.length})</p>
              <p className="text-[10px] text-gray-400 mb-1">Arquivos CAD guardam planta, cortes e detalhes no mesmo espaço. Clique pra ir até cada um.</p>
              <div className="space-y-0.5 max-h-32 overflow-y-auto">
                {regioes.slice(0, 12).map((r, i) => (
                  <button key={i} onClick={() => fit(i)} className="w-full flex justify-between text-xs rounded px-1.5 py-0.5 text-left hover:bg-gray-50 text-gray-700">
                    <span>Região {i + 1} · {((r.x1 - r.x0) * model.unitToMeters).toFixed(0)}×{((r.y1 - r.y0) * model.unitToMeters).toFixed(0)} m</span><b className="ml-2">{r.n.toLocaleString('pt-BR')}</b>
                  </button>
                ))}
              </div>
            </section>

            <section className="border border-gray-200 rounded-xl bg-white p-3">
              <p className="text-xs font-bold text-gray-500 uppercase mb-1">Blocos no desenho ({blocos.reduce((s, b) => s + b[1], 0)})</p>
              <p className="text-[10px] text-gray-400 mb-1">Cada bloco é um símbolo repetido (luminária, seta...). Clique pra ir até um; clique de novo pra ir pro próximo.</p>
              <div className="space-y-0.5 max-h-52 overflow-y-auto">
                {blocos.map(([nome, n]) => (
                  <button key={nome} onClick={() => { if (selBlock === nome) { irParaBloco(nome, true) } else { setSelBlock(nome); irParaBloco(nome) } }}
                    className={cn('w-full flex justify-between text-xs rounded px-1.5 py-0.5 text-left', selBlock === nome ? 'bg-fuchsia-100 text-fuchsia-800' : 'hover:bg-gray-50 text-gray-700')}>
                    <span className="truncate">{nome}</span><b className="ml-2">{n}</b>
                  </button>
                ))}
              </div>
            </section>

            <section className="border border-gray-200 rounded-xl bg-white p-3">
              <p className="text-xs font-bold text-gray-500 uppercase mb-1">Camadas ({model.layers.length})</p>
              <div className="flex gap-1 mb-1">
                <button onClick={() => setLayerVis(model.layers.map(() => true))} className="text-[10px] text-brand-600 underline">todas</button>
                <button onClick={() => setLayerVis(model.layers.map(() => false))} className="text-[10px] text-brand-600 underline">nenhuma</button>
                <input value={layerFilter} onChange={e => setLayerFilter(e.target.value)} placeholder="filtrar..." className="ml-auto w-24 text-[11px] border border-gray-200 rounded px-1.5 py-0.5" />
              </div>
              <div className="max-h-64 overflow-y-auto">
                {model.layers.map((l, i) => ({ l, i })).filter(({ l }) => l.segs + l.texts > 0 && l.name.toLowerCase().includes(layerFilter.toLowerCase())).map(({ l, i }) => (
                  <label key={i} className="flex items-center gap-1.5 text-xs py-0.5 cursor-pointer hover:bg-gray-50 rounded px-1">
                    <input type="checkbox" checked={!!layerVis[i]} onChange={() => setLayerVis(v => v.map((x, k) => k === i ? !x : x))} />
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: cor(l.color) }} />
                    <span className={cn('truncate flex-1', !layerVis[i] && 'text-gray-400')}>{l.name}</span>
                    <span className="text-[10px] text-gray-400">{l.segs + l.texts}</span>
                  </label>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}

// Miniatura de um bloco da biblioteca (fundo escuro, igual ao desenho)
function BlockThumb({ b }: { b: LibBlock }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current; if (!cv) return
    const dpr = window.devicePixelRatio || 1, S = 48
    cv.width = S * dpr; cv.height = S * dpr
    const ctx = cv.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = BG; ctx.fillRect(0, 0, S, S)
    const [x0, y0, x1, y1] = b.bbox
    const w = Math.max(1e-6, x1 - x0), h = Math.max(1e-6, y1 - y0)
    const k = (S - 8) / Math.max(w, h)
    const P = (x: number, y: number): [number, number] => [(x - x0) * k + (S - w * k) / 2, S - ((y - y0) * k + (S - h * k) / 2)]
    for (const f of b.fills) {
      ctx.beginPath()
      for (const r of f.rings) { for (let i = 0; i < r.length; i += 2) { const [x, y] = P(r[i], r[i + 1]); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.closePath() }
      ctx.globalAlpha = f.a; ctx.fillStyle = cor(b.cols[f.c] ?? '#e5e7eb'); ctx.fill('evenodd'); ctx.globalAlpha = 1
    }
    const by = new Map<number, number[]>()
    for (let i = 0; i < b.segC.length; i++) { const a = by.get(b.segC[i]); if (a) a.push(i); else by.set(b.segC[i], [i]) }
    ctx.lineWidth = 1
    by.forEach((idx, c) => {
      ctx.strokeStyle = cor(b.cols[c] ?? '#e5e7eb'); ctx.beginPath()
      for (const i of idx) { const [a, bb] = P(b.segs[i * 4], b.segs[i * 4 + 1]), [c2, d] = P(b.segs[i * 4 + 2], b.segs[i * 4 + 3]); ctx.moveTo(a, bb); ctx.lineTo(c2, d) }
      ctx.stroke()
    })
  }, [b])
  return <canvas ref={ref} style={{ width: 48, height: 48 }} className="rounded border border-gray-700" />
}
