'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadCadFile, computeRegions, appendLibBlock, loadCadLibraryFile, normalizeLibBlock, type CadModel, type LibBlock } from '@/lib/project-reading/cad'
import { listCadLibrary, saveCadLibraryBlock, deleteCadLibraryBlock, setCadLibraryFamily, type CadLibRow } from '@/lib/project-reading/cad-library-actions'
import {
  Loader2, Upload, Ruler, Hand, Maximize, MousePointer, Minus, Square, Circle as CircleIcon, Copy, ClipboardPaste,
  RotateCw, FlipHorizontal, FlipVertical, Trash2, Undo2, Redo2, CopyPlus, Type as TypeIcon, ArrowUpRight, Boxes, RectangleHorizontal, MoreHorizontal, Zap, Tag, Table, FileDown, SeparatorHorizontal, GripHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildPlotPdf, plotLayout, plotPadrao, PAPEIS, ESCALAS, type PlotInfo, type Papel } from '@/lib/project-reading/cad-plot'
import { centerline, distribuirLuz, type Seg } from '@/lib/project-reading/cad-commands'
import { collectItems, guessSpec, qtyLabel, describe, legendLayout, legendPoly, LEGEND_HEADERS, type Item } from '@/lib/project-reading/cad-legend'
import { CadSpecFields } from './CadSpecFields'
import { isTape, polyLength, perfilPoly, setLength, gripsOf, dragGrip, nearestOnTape, dimensionarFonte } from '@/lib/project-reading/cad-tape'
import { createClient } from '@/lib/supabase/client'
import { serializeState, restoreState, EMPTY_EDITS as EMPTY, type M6, type Shape, type Dim, type Edits, type SavedState, type Spec } from '@/lib/project-reading/cad-state'
import { listCadDrawings, createCadUpload, finalizeCadDrawing, openCadDrawing, saveCadDrawingState, renameCadDrawing, deleteCadDrawing, type CadDrawingRow } from '@/lib/project-reading/cad-drawing-actions'

type Tool = 'select' | 'pan' | 'medir' | 'linha' | 'retangulo' | 'circulo' | 'texto' | 'seta' | 'inserir' | 'perfil' | 'fita' | 'centro' | 'distribuir' | 'plotar'
interface Snap { x: number; y: number; kind: 'ponta' | 'meio' | 'bloco' }
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
// retângulo da fonte (centrado no ponto)
function fontePoly(s: Shape): number[] {
  const hw = (s.w ?? 0.4) / 2, hh = hw * 0.5, [x, y] = s.pts
  return [x - hw, y - hh, x + hw, y - hh, x + hw, y + hh, x - hw, y + hh]
}
const polyOf = (s: Shape) => (s.kind === 'perfil' ? perfilPoly(s) : s.kind === 'fonte' ? fontePoly(s) : null)
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
  // plotagem: dados do carimbo (salvos junto com o desenho) e janela aberta
  const [plot, setPlot] = useState<PlotInfo>(plotPadrao)
  const plotRef = useRef(plot); plotRef.current = plot
  const [plotUi, setPlotUi] = useState(false)
  const [gerando, setGerando] = useState(false)
  // centerline: primeira linha escolhida e a linha sob o cursor
  const [centroA, setCentroA] = useState<Seg | null>(null)
  const [segHover, setSegHover] = useState<Seg | null>(null)
  // distribuir luz: pontos clicados e parâmetros
  const [dist, setDist] = useState<{ pts: [number, number][]; escolhendo: boolean }>({ pts: [], escolhendo: false })
  const [distAfast, setDistAfast] = useState('50')
  const [distQtd, setDistQtd] = useState('4')
  const [distCota, setDistCota] = useState('20')
  const [aviso, setAviso] = useState<string | null>(null)
  // perfil + fita
  const [perfilCm, setPerfilCm] = useState('3') // espessura
  const [perfilM, setPerfilM] = useState('') // comprimento digitado (vazio = pelos cliques)
  const [perfilCor, setPerfilCor] = useState('#e5e7eb')
  const [fitaCor, setFitaCor] = useState('#f43f5e')
  const [wmPadrao, setWmPadrao] = useState('9.6')
  const [voltPadrao, setVoltPadrao] = useState(12)
  const [fonteModal, setFonteModal] = useState<null | { id: number; wm: string; volt: number; spec: Spec; tapeColor: string }>(null)
  const [specModal, setSpecModal] = useState<null | { block?: LibBlock; keys?: string[]; title: string; form: Spec; showPower: boolean }>(null)
  const lastSpec = useRef(new Map<string, Spec>())
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
  const [placing, setPlacing] = useState<null | { name: string; obj: number; s: number; spec: Spec }>(null)
  const libObj = useRef(new Map<string, number>())
  const modelRef = useRef<CadModel | null>(null); modelRef.current = model
  const needFit = useRef(false)
  // desenhos salvos
  const [drawings, setDrawings] = useState<CadDrawingRow[] | null>(null)
  const [drawing, setDrawing] = useState<{ id: string | null; name: string } | null>(null)
  const [saveStatus, setSaveStatus] = useState<{ kind: 'salvo' | 'salvando' | 'pendente' | 'erro'; msg?: string } | null>(null)
  const libDefs = useRef(new Map<string, LibBlock>())
  const lastSaved = useRef('')
  const dirty = useRef(false)
  const inflight = useRef(0)
  const drawingRef = useRef(drawing); drawingRef.current = drawing
  const layerVisRef = useRef(layerVis); layerVisRef.current = layerVis
  const asLoaded = useRef<null | { ed: Edits; vis: boolean[]; plot: PlotInfo }>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadSeq = useRef(0)

  const baseRef = useRef<null | { sig: string; layerVis: boolean[]; model: CadModel; cv: HTMLCanvasElement }>(null)
  const view = useRef({ cx: 0, cy: 0, scale: 1 })
  const gesture = useRef<null | {
    type: 'pan' | 'move' | 'box' | 'dimdrag' | 'grip'
    grip?: number
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
  const items = useMemo(() => (model ? collectItems(model, ed, model.unitToMeters) : []), [model, ed])
  // cantos da legenda (o tamanho depende dos itens do projeto)
  function legendBox(sh: Shape, e: Edits) {
    const l = legendLayout(collectItems(model!, e, model!.unitToMeters), sh.h ?? 0.2)
    return legendPoly(sh, l.width, l.height)
  }
  function insertLegend() {
    const el = wrapRef.current; if (!el) return
    const [x, y] = toWorld(40, 40, el.clientWidth, el.clientHeight)
    const e0 = edRef.current
    commit({ ...e0, shapes: [...e0.shapes, { id: e0.next, kind: 'legenda', pts: [x, y], h: 11 / view.current.scale, stroke: '#e5e7eb', fill: null }], next: e0.next + 1 })
    setSel(['s' + e0.next]); setTool('select')
  }
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
      const poly = s.kind === 'legenda' ? legendBox(s, e) : polyOf(s)
      if (poly) {
        const xs = poly.filter((_, i) => i % 2 === 0), ys = poly.filter((_, i) => i % 2 === 1)
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
      else if (k[0] === 'c') { const c = from.cp.find(c => c.id === id); if (!c) continue; cp.push({ id: next, src: c.src, xf: mul6(T, c.xf), attrs: c.attrs }); nk.push('c' + next++) }
      else if (k[0] === 's') { const s = from.shapes.find(s => s.id === id); if (!s) continue; shapes.push({ ...xfShape(s, T), id: next }); nk.push('s' + next++) }
      else { const d = from.dims.find(d => d.id === id); if (!d) continue; dims.push({ ...xfDim(d, T), id: next }); nk.push('d' + next++) }
    }
    // fonte copiada junto com a sua fita passa a apontar pra cópia
    const remap = new Map<number, number>()
    keys.filter(k => k[0] === 's').forEach(k => { const i = keys.indexOf(k); if (nk[i]) remap.set(Number(k.slice(1)), Number(nk[i].slice(1))) })
    const made = new Set(nk.filter(k => k[0] === 's').map(k => Number(k.slice(1))))
    const fixed = shapes.map(s => (made.has(s.id) && s.kind === 'fonte' && s.link !== undefined && remap.has(s.link) ? { ...s, link: remap.get(s.link) } : s))
    return { ed: { ...into, cp, shapes: fixed, dims, next }, keys: nk }
  }
  function deleteKeys(e: Edits, keys: string[]): Edits {
    const ov = { ...e.ov }
    const set = new Set(keys)
    for (const k of keys) if (k[0] === 'o') ov[Number(k.slice(1))] = null
    return {
      ...e, ov,
      cp: e.cp.filter(c => !set.has('c' + c.id)),
      // apagar uma fita/perfil leva junto a fonte ligada a ela
      shapes: e.shapes.filter(s => !set.has('s' + s.id) && !(s.kind === 'fonte' && s.link !== undefined && set.has('s' + s.link))),
      dims: e.dims.filter(d => !set.has('d' + d.id)),
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
  // ── Perfil, fita e fonte ─────────────────────────────────────────────────
  const num = (v: string, d = 0) => { const n = parseFloat(v.replace(',', '.')); return isNaN(n) ? d : n }
  function openFonte(id: number, from: Edits = edRef.current) {
    const s = from.shapes.find(x => x.id === id)
    if (!s) return
    setFonteModal({ id, wm: s.wm ? String(s.wm) : wmPadrao, volt: s.volt ?? voltPadrao, spec: { ...specOfShape(s), color: s.stroke }, tapeColor: s.tapeColor ?? fitaCor })
  }
  function addTape(shape: Omit<Shape, 'id'>) {
    const e0 = edRef.current
    const next: Edits = { ...e0, shapes: [...e0.shapes, { ...shape, id: e0.next }], next: e0.next + 1 }
    commit(next); setSel(['s' + e0.next]); setDraft([])
    openFonte(e0.next, next)
  }
  function finishFita() {
    const pts = draft.filter((p, i) => i === 0 || Math.hypot(p[0] - draft[i - 1][0], p[1] - draft[i - 1][1]) > 1e-6)
    if (pts.length < 2) { setDraft([]); return }
    addTape({ kind: 'fita', pts: pts.flat(), stroke: fitaCor, fill: null })
  }
  // grava W/m e tensão na fita e, se pedido, cria (ou atualiza) a fonte ligada a ela
  function confirmFonte(incluir: boolean) {
    const m = fonteModal
    if (!m) return
    setFonteModal(null)
    const e0 = edRef.current
    const tape = e0.shapes.find(x => x.id === m.id)
    if (!tape) return
    const wm = num(m.wm)
    const spec = { ...m.spec, name: m.spec.name.trim() || specOfShape(tape).name }
    if (wm > 0) { setWmPadrao(m.wm); setVoltPadrao(m.volt) }
    let shapes = e0.shapes.map(x => (x.id === m.id ? { ...x, wm: wm > 0 ? wm : x.wm, volt: m.volt, spec, stroke: spec.color || x.stroke, tapeColor: x.kind === 'perfil' ? m.tapeColor : x.tapeColor } : x))
    let next = e0.next
    if (incluir && wm > 0) {
      const r = dimensionarFonte(polyLength(tape.pts) * u2m, wm)
      const antigas = shapes.filter(x => x.kind === 'fonte' && x.link === m.id)
      shapes = shapes.filter(x => !(x.kind === 'fonte' && x.link === m.id))
      const w = Math.max(0.4 / u2m, 90 / view.current.scale) // legível no zoom atual
      const abaixo = tape.pts[1] - (tape.w ?? 0) / 2 - w * 0.8 // fora do perfil
      for (let i = 0; i < r.quantidade; i++) {
        const old = antigas[i]
        const base = { watts: r.potencia, volt: m.volt, text: `Fonte ${r.potencia}W ${m.volt}V`, link: m.id }
        shapes.push(old ? { ...old, ...base } : { ...base, id: next++, kind: 'fonte', pts: [tape.pts[0] + i * w * 1.2, abaixo], w, stroke: '#22d3ee', fill: null })
      }
    }
    commit({ ...e0, shapes, next })
  }
  function patchShape(id: number, fn: (s: Shape) => Shape) {
    const e0 = edRef.current
    commit({ ...e0, shapes: e0.shapes.map(x => (x.id === id ? fn(x) : x)) })
  }
  // ── Centerline e Distribuir Luz ──────────────────────────────────────────
  // trecho reto mais próximo do cursor (do arquivo, movido, copiado ou desenhado)
  function pickSegment(wx: number, wy: number): Seg | null {
    const m = modelRef.current; if (!m) return null
    const e0 = edRef.current, tol = 8 / view.current.scale
    let best: Seg | null = null, bd = tol
    const test = (a: number, b: number, c: number, d: number) => { const dist = distSeg(wx, wy, a, b, c, d); if (dist < bd) { bd = dist; best = [a, b, c, d] } }
    for (let i = 0; i < m.segLayer.length; i++) {
      if (!layerVis[m.segLayer[i]] || m.segObj[i] in e0.ov || m.objs[m.segObj[i]].kind === 'LIB') continue
      const x1 = m.segs[i * 4], y1 = m.segs[i * 4 + 1], x2 = m.segs[i * 4 + 2], y2 = m.segs[i * 4 + 3]
      if (wx < Math.min(x1, x2) - bd || wx > Math.max(x1, x2) + bd || wy < Math.min(y1, y2) - bd || wy > Math.max(y1, y2) + bd) continue
      test(x1, y1, x2, y2)
    }
    const inst = (src: number, xf: M6) => {
      const o = m.objs[src]
      for (let i = o.s0; i < o.s1; i++) { const [a, b] = ap6(xf, m.segs[i * 4], m.segs[i * 4 + 1]), [c, d] = ap6(xf, m.segs[i * 4 + 2], m.segs[i * 4 + 3]); test(a, b, c, d) }
    }
    for (const k of Object.keys(e0.ov)) { const v = e0.ov[Number(k)]; if (v) inst(Number(k), v) }
    for (const c of e0.cp) inst(c.src, c.xf)
    for (const s of e0.shapes) {
      const poly = s.kind === 'rect' ? s.pts : s.kind === 'perfil' ? perfilPoly(s) : null
      if (poly) for (let i = 0; i < 8; i += 2) test(poly[i], poly[i + 1], poly[(i + 2) % 8], poly[(i + 3) % 8])
      else if (s.kind === 'line' || s.kind === 'fita') for (let i = 0; i + 3 < s.pts.length; i += 2) test(s.pts[i], s.pts[i + 1], s.pts[i + 2], s.pts[i + 3])
    }
    return best
  }
  // cálculo atual da distribuição (usado na pré-visualização e ao aplicar)
  function planoDistribuir() {
    if (dist.pts.length < 3) return null
    const [p1, p2, lado] = dist.pts
    return distribuirLuz({ p1, p2, lado, afastamento: num(distAfast) / 100 / u2m, quantidade: num(distQtd), distCota: num(distCota, 20) / 100 / u2m })
  }
  function inverterLado() {
    setDist(d => {
      const [p1, p2, lado] = d.pts
      const dx = p2[0] - p1[0], dy = p2[1] - p1[1], l2 = dx * dx + dy * dy || 1
      const t = ((lado[0] - p1[0]) * dx + (lado[1] - p1[1]) * dy) / l2
      const fx = p1[0] + t * dx, fy = p1[1] + t * dy
      return { ...d, pts: [p1, p2, [2 * fx - lado[0], 2 * fy - lado[1]]] }
    })
  }
  // copia a luminária modelo pra cada centro e cria as cotas (a modelo original continua onde está)
  function aplicarDistribuir(modelos: string[]) {
    const plano = planoDistribuir()
    if (!plano) { setAviso('Confira a quantidade (pelo menos 1).'); return }
    const e0 = edRef.current
    const bb = unionBox(e0, modelos)
    if (!bb) return
    const cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2
    let acc = e0
    const novos: string[] = []
    for (const [x, y] of plano.centros) {
      const r = cloneItems(e0, modelos, [1, 0, 0, 1, x - cx, y - cy], acc)
      acc = r.ed; novos.push(...r.keys)
    }
    let next = acc.next
    const dims = [...acc.dims, ...plano.cotas.map(c => ({ ...c, id: next++ }))]
    commit({ ...acc, dims, next })
    setTool('select'); setSel(novos)
    setAviso(`Distribuídas ${plano.centros.length}: ${fmtM(plano.passo * u2m)} entre elas, ${fmtM((plano.passo * u2m) / 2)} nas pontas.`)
  }
  const modelaveis = (keys: string[]) => keys.filter(k => k[0] === 'o' || k[0] === 'c')
  // ── PDF ──────────────────────────────────────────────────────────────────
  async function gerarPdf() {
    const m = modelRef.current, area = plot.area
    if (!m || !area) return
    const L = plotLayout(plot, items.length, area, m.unitToMeters)
    if (!L.cabe && !window.confirm(`A área marcada não cabe na escala 1/${plot.escala} nessa folha: o que passar das bordas fica cortado. Gerar mesmo assim?`)) return
    setGerando(true)
    await new Promise(r => setTimeout(r, 30)) // deixa a tela mostrar "Gerando..."
    try {
      const logo = await fetch('/cad/carimbo-logo.png').then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null)
      // desenha com uma vista própria e devolve a vista da tela em seguida (tudo síncrono)
      const comVista = (v: { cx: number; cy: number; scale: number }, fn: () => void) => { const tela = view.current; view.current = v; try { fn() } finally { view.current = tela } }
      const bytes = await buildPlotPdf({
        info: plot, area, unitToMeters: m.unitToMeters, items, logo,
        drawPlan: (ctx, v, w, h) => comVista(v, () => paint({ ctx, w, h })),
        drawSymbol: (ctx, item, x, y, w, h) => comVista({ cx: 0, cy: 0, scale: 1 }, () => paint({ ctx, w: 0, h: 0, symbol: { item, x, y, w, h } })),
      })
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url; a.download = `${drawing?.name || 'planta'} - ${plot.pavimento || 'iluminacao'}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setPlotUi(false); setAviso('PDF gerado — está nos seus downloads.')
    } catch (e: any) {
      setAviso(`Não consegui gerar o PDF: ${e?.message ?? 'erro desconhecido'}`)
    } finally {
      setGerando(false)
    }
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
    const cids = new Set(patch.stroke ? selRef.current.filter(k => k[0] === 'c').map(k => Number(k.slice(1))) : [])
    if (!ids.size && !cids.size) return
    const e0 = edRef.current, m = modelRef.current
    commit({
      ...e0,
      shapes: e0.shapes.map(s => (ids.has(s.id) ? { ...s, ...patch, spec: s.spec && patch.stroke ? { ...s.spec, color: patch.stroke } : s.spec } : s)),
      cp: e0.cp.map(c => (cids.has(c.id) && m?.objs[c.src]?.kind === 'LIB' ? { ...c, spec: { ...(c.spec ?? guessSpec(m.objs[c.src].name)), color: patch.stroke! } } : c)),
    })
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
      const box = polyOf(s)
      if (s.kind === 'legenda') {
        // prioridade baixa: o que estiver em cima da legenda é selecionado antes
        if (inRings([Float64Array.from(legendBox(s, e))], wx, wy)) consider('s' + s.id, tol * 0.95)
        continue
      } else if (box) {
        d = inRings([Float64Array.from(box)], wx, wy) ? 0 : Math.min(...[0, 2, 4, 6].map(i => distSeg(wx, wy, box[i], box[i + 1], box[(i + 2) % 8], box[(i + 3) % 8])))
      } else if (s.kind === 'fita') {
        for (let i = 0; i + 3 < s.pts.length; i += 2) d = Math.min(d, distSeg(wx, wy, s.pts[i], s.pts[i + 1], s.pts[i + 2], s.pts[i + 3]))
      } else if (s.kind === 'text' || s.kind === 'arrow') {
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
  // ── Abrir, enviar e salvar ───────────────────────────────────────────────
  const refreshDrawings = useCallback(() => {
    listCadDrawings().then(r => { if (r.rows) setDrawings(r.rows); else { setDrawings([]); setError(r.error ?? null) } }).catch(() => setDrawings([]))
  }, [])

  function setUrlDrawing(id: string | null) {
    const u = new URL(window.location.href)
    if (id) u.searchParams.set('d', id); else u.searchParams.delete('d')
    window.history.replaceState(window.history.state, '', u.toString())
  }

  // grava agora o que estiver pendente (usado antes de trocar de desenho e pelo botão Salvar).
  // O estado só é montado aqui, não a cada movimento do mouse.
  async function flushSave() {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    const m = modelRef.current, id = drawingRef.current?.id, vis = layerVisRef.current
    if (!dirty.current || !m || !id || vis.length !== m.layers.length) return true
    const state = serializeState(m, edRef.current, vis, libDefs.current, plotRef.current)
    const json = JSON.stringify(state)
    dirty.current = false
    const salvo = () => setSaveStatus({ kind: 'salvo', msg: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) })
    if (json === lastSaved.current) { salvo(); return true }
    setSaveStatus({ kind: 'salvando' })
    inflight.current++
    let err: string | undefined
    try { err = (await saveCadDrawingState(id, state)).error } catch { err = 'sem conexão ou desenho grande demais' }
    inflight.current--
    if (drawingRef.current?.id !== id) return !err
    if (err) { dirty.current = true; setSaveStatus({ kind: 'erro', msg: err }); return false }
    lastSaved.current = json
    if (!dirty.current) salvo()
    return true
  }

  function resetEditor() {
    setError(null); setModel(null); setSelBlock(null); setEd(EMPTY); setSel([]); setDraft([]); setPlacing(null); setPlot(plotPadrao()); setPlotUi(false)
    past.current = []; future.current = []
    libObj.current = new Map(); libDefs.current = new Map()
    dirty.current = false; asLoaded.current = null; lastSaved.current = ''; setSaveStatus(null); setDrawing(null)
  }

  async function loadDrawing(buf: ArrayBuffer, saved: SavedState | null | undefined) {
    const t0 = performance.now()
    let m = await loadCadFile(buf)
    setTempo(Math.round(performance.now() - t0))
    let edits = EMPTY
    let vis = m.layers.map(l => l.visible)
    if (saved) {
      const r = restoreState(m, saved)
      m = r.model; edits = r.edits; vis = r.layerVis
      libObj.current = r.libObj; libDefs.current = r.libDefs
      if (r.lost) setError(`${r.lost} alteração(ões) não puderam ser reaplicadas neste arquivo.`)
    }
    const info = { ...plotPadrao(), ...(saved?.plot ?? {}) }
    setPlot(info)
    lastSaved.current = JSON.stringify(serializeState(m, edits, vis, libDefs.current, info))
    asLoaded.current = { ed: edits, vis, plot: info }
    needFit.current = true
    setEd(edits); setLayerVis(vis); setModel(m)
  }

  async function handleFile(file: File) {
    if (!(await flushSave()) && !window.confirm('As últimas alterações do desenho atual não foram salvas. Continuar mesmo assim?')) return
    const seq = ++loadSeq.current
    resetEditor(); setLoading(true); setFileName(file.name)
    try {
      const buf = await file.arrayBuffer()
      await loadDrawing(buf.slice(0), null)
      setLoading(false)
      // guarda o arquivo original pra poder reabrir depois
      setDrawing({ id: null, name: file.name })
      setSaveStatus({ kind: 'salvando', msg: 'enviando o arquivo' })
      const prep = await createCadUpload(file.name, file.size)
      if (prep.error || !prep.path || !prep.token) throw new Error(prep.error ?? 'falha ao preparar o envio')
      const up = await createClient().storage.from('cad-drawings').uploadToSignedUrl(prep.path, prep.token, file, { contentType: 'application/octet-stream' })
      if (up.error) throw new Error(up.error.message)
      const fin = await finalizeCadDrawing({ path: prep.path, fileName: file.name, sizeBytes: file.size })
      if (fin.error || !fin.id) throw new Error(fin.error ?? 'falha ao registrar o desenho')
      if (seq !== loadSeq.current) { refreshDrawings(); return }
      lastSaved.current = '' // força salvar o que já foi feito durante o envio
      asLoaded.current = null
      setDrawing({ id: fin.id, name: file.name.replace(/\.(dwg|dxf)$/i, '') })
      setUrlDrawing(fin.id)
      refreshDrawings()
    } catch (e: any) {
      if (seq !== loadSeq.current) return
      if (modelRef.current) setSaveStatus({ kind: 'erro', msg: `este desenho NÃO está salvo (${e?.message ?? 'falha no envio'})` })
      setError(e?.message ?? 'Falha ao ler o arquivo.')
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }

  async function openSaved(id: string) {
    const seq = ++loadSeq.current
    resetEditor(); setLoading(true)
    try {
      const r = await openCadDrawing(id)
      if (r.error || !r.url) throw new Error(r.error ?? 'Falha ao abrir')
      setFileName(r.fileName ?? '')
      const res = await fetch(r.url)
      if (!res.ok) throw new Error('Não foi possível baixar o arquivo salvo.')
      const buf = await res.arrayBuffer()
      if (seq !== loadSeq.current) return
      await loadDrawing(buf, r.state)
      setDrawing({ id, name: r.name ?? '' }); setSaveStatus({ kind: 'salvo' })
      setUrlDrawing(id)
    } catch (e: any) {
      if (seq === loadSeq.current) { setError(e?.message ?? 'Falha ao abrir o desenho.'); setUrlDrawing(null) }
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }

  async function closeDrawing() {
    if (!(await flushSave()) && !window.confirm('As últimas alterações não foram salvas. Fechar mesmo assim?')) return
    if (!drawing?.id && modelRef.current && !window.confirm('Este desenho não está salvo. Fechar mesmo assim?')) return
    loadSeq.current++
    resetEditor(); setLoading(false); setUrlDrawing(null); refreshDrawings()
  }
  async function renameDrawing(id: string, atual: string) {
    const v = window.prompt('Nome do desenho:', atual)
    if (!v?.trim()) return
    const r = await renameCadDrawing(id, v)
    if (r.error) { setError(r.error); return }
    setDrawing(d => (d?.id === id ? { id, name: v.trim() } : d)); refreshDrawings()
  }
  async function removeDrawing(id: string, nome: string) {
    if (!window.confirm(`Apagar o desenho "${nome}" e todas as alterações dele? Não dá pra desfazer.`)) return
    const r = await deleteCadDrawing(id)
    if (r.error) setError(r.error); else refreshDrawings()
  }

  // ao entrar na tela: lista os desenhos e reabre o que estava aberto (?d=)
  useEffect(() => {
    refreshDrawings()
    const id = new URL(window.location.href).searchParams.get('d')
    if (id) openSaved(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // salvamento automático: 1,5 s depois da última alteração
  useEffect(() => {
    if (!model || !drawing?.id) return
    // recém-aberto e sem mudança: não há o que salvar
    if (asLoaded.current && asLoaded.current.ed === ed && asLoaded.current.vis === layerVis && asLoaded.current.plot === plot) return
    asLoaded.current = null
    dirty.current = true
    setSaveStatus({ kind: 'pendente' })
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { flushSave() }, 1500)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ed, layerVis, plot, drawing?.id])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current || inflight.current) { e.preventDefault(); e.returnValue = '' } }
    const hidden = () => { if (document.visibilityState === 'hidden') flushSave() }
    window.addEventListener('beforeunload', warn)
    document.addEventListener('visibilitychange', hidden)
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('visibilitychange', hidden); flushSave() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  // A mesma função pinta a tela e o PDF (`print`): no papel não há seleção,
  // guias nem barrinhas no lugar de texto pequeno.
  function paint(print?: { ctx: CanvasRenderingContext2D; w: number; h: number; symbol?: { item: Item; x: number; y: number; w: number; h: number } }) {
    const printing = !!print
    const el = wrapRef.current, canvas = canvasRef.current
    if (!print && (!el || !canvas)) return
    const dpr = print ? 1 : window.devicePixelRatio || 1
    const w = print ? print.w : el!.clientWidth, h = print ? print.h : el!.clientHeight
    if (!print && (canvas!.width !== w * dpr || canvas!.height !== h * dpr)) { canvas!.width = w * dpr; canvas!.height = h * dpr }
    const main = print ? print.ctx : canvas!.getContext('2d')!
    let ctx = main
    const bg = printing ? '#ffffff' : BG
    const ui = printing ? 0.4 : 1 // elementos de tamanho fixo ficam menores no papel
    const minLegivel = printing ? 0.3 : 4
    if (!printing) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h) }
    if (!model) return
    const { scale } = view.current
    const [wx0, wy1] = toWorld(0, 0, w, h), [wx1, wy0] = toWorld(w, h, w, h)
    // na tela, cores escuras clareiam pro fundo preto; no papel valem as originais
    const naFolha = (c: string) => (printing ? c : cor(c))
    const colorOf = (col: number, layer: number) => naFolha(col ? model.palette[col] : model.layers[layer].color)
    const inView = (b: number[]) => !(b[2] < wx0 || b[0] > wx1 || b[3] < wy0 || b[1] > wy1)
    const dirty = (o: number) => o in ed.ov
    const selSet = new Set(printing ? [] : sel)

    // pinta um objeto (original, movido ou cópia) com transformação opcional
    const drawInst = (idx: number, xf: M6, hl: boolean, tint?: string) => {
      const o = model.objs[idx]
      const P = (x: number, y: number) => { const [a, b] = ap6(xf, x, y); return toScreen(a, b, w, h) }
      for (let i = o.f0; i < o.f1; i++) {
        const f = model.fills[i]; if (!layerVis[f.layer]) continue
        ctx.beginPath()
        for (const r of f.rings) { for (let k = 0; k < r.length; k += 2) { const [x, y] = P(r[k], r[k + 1]); if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.closePath() }
        // cor escolhida pinta o corpo do bloco; o preenchimento opaco da "luz" mantém a cor original
        let fc = colorOf(f.col, f.layer)
        if (tint) { let corpo = f.alpha < 1; for (let k = o.s0; !corpo && k < o.s1; k++) corpo = colorOf(model.segCol[k], model.segLayer[k]) === fc; if (corpo) fc = tint }
        ctx.globalAlpha = f.alpha; ctx.fillStyle = hl ? SEL : fc; ctx.fill('evenodd'); ctx.globalAlpha = 1
      }
      ctx.lineWidth = hl ? 2 : 1
      const groups = new Map<string, number[]>()
      for (let i = o.s0; i < o.s1; i++) {
        const l = model.segLayer[i]; if (!layerVis[l]) continue
        const c = hl ? SEL : tint || colorOf(model.segCol[i], l)
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
        drawText(t.text, ...P(t.x, t.y), t.h * sc * scale, t.rot + rot, hl ? SEL : tint || colorOf(t.col, t.layer))
      }
    }
    const drawText = (text: string, x: number, y: number, px: number, rot: number, color: string) => {
      if (!print?.symbol && (px < (printing ? 0.2 : 0.4) || px > 600 || x < -300 || x > w + 300 || y < -100 || y > h + 100)) return
      ctx.save(); ctx.translate(x, y); ctx.rotate(-rot)
      if (px < minLegivel) { // texto minúsculo: vira barrinha, como no AutoCAD
        ctx.globalAlpha = 0.55; ctx.fillStyle = color
        ctx.fillRect(0, -Math.max(1, px * 0.8), Math.max(2, text.length * px * 0.55), Math.max(1, px * 0.8))
        ctx.globalAlpha = 1
      } else { ctx.fillStyle = color; ctx.font = `${px}px sans-serif`; ctx.fillText(text, 0, 0) }
      ctx.restore()
    }

    const paintBase = () => {
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
    }
    // símbolo avulso (legenda do PDF)
    const drawSymbol = (it: Item, mx: number, mid: number, sw: number, sh2: number) => {
      if (it.kind === 'bloco') {
        const idx = model.objs.findIndex(o => o.kind === 'LIB' && o.name === it.block)
        if (idx < 0) return
        const [p0, q0, p1, q1] = model.objs[idx].bbox
        const k = Math.min(sw / Math.max(1e-9, p1 - p0), sh2 / Math.max(1e-9, q1 - q0))
        drawInst(idx, [k, 0, 0, k, mx - (k * (p0 + p1)) / 2, mid - (k * (q0 + q1)) / 2], false, it.color || undefined)
        return
      }
      const [a, b] = toScreen(mx - sw / 2, mid, w, h), [c] = toScreen(mx + sw / 2, mid, w, h)
      const th = Math.max(4 * ui, sh2 * 0.6 * view.current.scale)
      ctx.strokeStyle = it.color; ctx.lineWidth = 1.5
      if (it.kind === 'perfil' || it.kind === 'fonte') ctx.strokeRect(a, b - th / 2, c - a, th)
      if (it.kind !== 'fonte') { ctx.strokeStyle = it.kind === 'perfil' ? it.tapeColor ?? '#f43f5e' : it.color; ctx.lineWidth = 2; ctx.setLineDash([5 * ui, 3 * ui]); ctx.beginPath(); ctx.moveTo(a + 2 * ui, b); ctx.lineTo(c - 2 * ui, b); ctx.stroke(); ctx.setLineDash([]) }
    }
    if (print?.symbol) {
      // coordenadas da folha: com vista neutra, o "mundo" (x, −y) cai no ponto (x, y)
      drawSymbol(print.symbol.item, print.symbol.x, -print.symbol.y, print.symbol.w, print.symbol.h)
      return
    }
    if (printing) paintBase()
    else {
      // Desenho base (originais não movidos) em cache: só refaz quando muda vista, camadas ou objetos mexidos
      const sig = [view.current.cx, view.current.cy, view.current.scale, w, h, dpr, Object.keys(ed.ov).join(',')].join('|')
      let cache = baseRef.current
      if (!cache || cache.sig !== sig || cache.layerVis !== layerVis || cache.model !== model) {
        const cv = cache?.cv ?? document.createElement('canvas')
        cv.width = canvas!.width; cv.height = canvas!.height
        const bc = cv.getContext('2d')!
        bc.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx = bc
        ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h)
        paintBase()
        ctx = main
        cache = { sig, layerVis, model, cv }
        baseRef.current = cache
      }
      main.setTransform(1, 0, 0, 1, 0, 0); main.drawImage(cache.cv, 0, 0); main.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    // 4) movidos e cópias
    for (const k of Object.keys(ed.ov)) { const v = ed.ov[Number(k)]; if (v) drawInst(Number(k), v, selSet.has('o' + k)) }
    for (const c of ed.cp) drawInst(c.src, c.xf, selSet.has('c' + c.id), c.spec?.color || undefined)
    // atributos dos blocos da biblioteca (texto de cada campo, no valor preenchido ou padrão)
    for (const c of ed.cp) {
      const defs = model.objs[c.src]?.attdefs
      if (!defs || !layerVis[model.objs[c.src].layer]) continue
      const sc = Math.hypot(c.xf[0], c.xf[1]), rot0 = Math.atan2(c.xf[1], c.xf[0])
      for (const d of defs) {
        const text = d.constant ? d.def : (c.attrs?.[d.tag] ?? d.def)
        if (d.hidden || !text) continue
        const [wx, wy] = ap6(c.xf, d.x, d.y)
        const [x, y] = toScreen(wx, wy, w, h)
        const px = d.h * sc * scale
        if (px < 0.4 || px > 600 || x < -300 || x > w + 300 || y < -100 || y > h + 100) continue
        ctx.save(); ctx.translate(x, y); ctx.rotate(-(d.rot + rot0))
        const color = selSet.has('c' + c.id) ? SEL : naFolha(d.col)
        ctx.fillStyle = color
        if (px < minLegivel) { ctx.globalAlpha = 0.55; const bw = Math.max(2, text.length * px * 0.55); ctx.fillRect(d.ha === 1 || d.ha === 4 ? -bw / 2 : d.ha === 2 ? -bw : 0, -Math.max(1, px * 0.8), bw, Math.max(1, px * 0.8)); ctx.globalAlpha = 1 }
        else {
          ctx.font = `${px}px sans-serif`
          ctx.textAlign = d.ha === 1 || d.ha === 4 ? 'center' : d.ha === 2 ? 'right' : 'left'
          ctx.textBaseline = d.ha === 4 || d.va === 2 ? 'middle' : d.va === 3 ? 'top' : d.va === 1 ? 'bottom' : 'alphabetic'
          ctx.fillText(text, 0, 0)
        }
        ctx.restore()
      }
    }
    // seleção de objetos ainda no lugar
    for (const k of Array.from(selSet)) if (k[0] === 'o' && !dirty(Number(k.slice(1)))) drawInst(Number(k.slice(1)), ID6, true)

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
      if (s.kind === 'legenda') {
        if (printing && plot.legenda) continue // a folha já tem a legenda
        const hh = s.h ?? 0.2
        const list = items
        const l = legendLayout(list, hh)
        const [x0, y0] = s.pts
        const S = (x: number, y: number) => toScreen(x, y, w, h)
        const [ax, ay] = S(x0, y0), [bx, by] = S(x0 + l.width, y0 - l.height)
        const color = on ? SEL : s.stroke
        ctx.fillStyle = bg; ctx.fillRect(ax, ay, bx - ax, by - ay)
        ctx.strokeStyle = color; ctx.lineWidth = on ? 2 : 1; ctx.strokeRect(ax, ay, bx - ax, by - ay)
        const linha = (x1: number, y1: number, x2: number, y2: number) => { const [a, b] = S(x1, y1), [c, d] = S(x2, y2); ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke() }
        const texto = (t: string, x: number, y: number, size: number) => { const [a, b] = S(x, y); drawText(t, a, b, size * scale, 0, color) }
        texto('LEGENDA DE ILUMINAÇÃO', x0 + hh * 0.8, y0 - l.titleH * 0.68, hh * 1.25)
        ctx.lineWidth = 1
        linha(x0, y0 - l.titleH, x0 + l.width, y0 - l.titleH)
        linha(x0, y0 - l.titleH - l.headH, x0 + l.width, y0 - l.titleH - l.headH)
        let cx = x0
        l.widths.forEach((cw, i) => {
          texto(LEGEND_HEADERS[i], cx + hh * 0.5, y0 - l.titleH - l.headH * 0.68, hh * 0.85)
          if (i > 0) linha(cx, y0 - l.titleH, cx, y0 - l.height)
          cx += cw
        })
        if (!list.length) texto('Nenhum item adicionado ainda', x0 + l.widths[0] + hh * 0.5, y0 - l.titleH - l.headH - l.rowH * 0.6, hh)
        list.forEach((it, r) => {
          const top = y0 - l.titleH - l.headH - r * l.rowH, mid = top - l.rowH / 2
          ctx.strokeStyle = color; ctx.lineWidth = 0.5; linha(x0, top - l.rowH, x0 + l.width, top - l.rowH)
          let tx = x0 + l.widths[0]
          l.rows[r].forEach((cell, i) => { texto(cell, tx + hh * 0.5, mid - hh * 0.35, hh); tx += l.widths[i + 1] })
          ctx.lineWidth = 1
          drawSymbol(it, x0 + l.widths[0] / 2, mid, l.widths[0] * 0.8, l.rowH * 0.75)
        })
        continue
      }
      if (isTape(s)) {
        const pt = (i: number) => toScreen(s.pts[i], s.pts[i + 1], w, h)
        if (s.kind === 'perfil') {
          const q = perfilPoly(s)
          ctx.beginPath()
          for (let i = 0; i < 8; i += 2) { const [x, y] = toScreen(q[i], q[i + 1], w, h); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) }
          ctx.closePath()
          ctx.globalAlpha = 0.18; ctx.fillStyle = s.stroke; ctx.fill(); ctx.globalAlpha = 1
          ctx.strokeStyle = on ? SEL : s.stroke; ctx.lineWidth = on ? 2.5 : 1.5; ctx.stroke()
        }
        // fita: linha pontilhada (no perfil, no meio dele)
        ctx.beginPath()
        for (let i = 0; i < s.pts.length; i += 2) { const [x, y] = pt(i); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) }
        ctx.strokeStyle = on && s.kind === 'fita' ? SEL : s.kind === 'perfil' ? s.tapeColor ?? '#f43f5e' : s.stroke
        ctx.lineWidth = 2; ctx.setLineDash([7, 5]); ctx.stroke(); ctx.setLineDash([])
        continue
      }
      if (s.kind === 'fonte') {
        const tape = ed.shapes.find(x => x.id === s.link)
        const color = on ? SEL : s.stroke
        if (tape) { // linha de conexão fonte → fita (acompanha quando qualquer uma se move)
          const [tx, ty] = nearestOnTape(tape, s.pts[0], s.pts[1])
          const [a, b] = toScreen(s.pts[0], s.pts[1], w, h), [c, d] = toScreen(tx, ty, w, h)
          ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([4 * ui, 4 * ui]); ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); ctx.setLineDash([])
          ctx.fillStyle = color; ctx.beginPath(); ctx.arc(c, d, 3 * ui, 0, Math.PI * 2); ctx.fill()
        }
        const q = fontePoly(s)
        const [x0, y0] = toScreen(q[0], q[5], w, h), [x1, y1] = toScreen(q[2], q[1], w, h)
        ctx.fillStyle = bg; ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
        ctx.globalAlpha = 0.25; ctx.fillStyle = s.stroke; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.globalAlpha = 1
        ctx.strokeStyle = color; ctx.lineWidth = on ? 2.5 : 1.5; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0)
        const px = Math.min((x1 - x0) / (Math.max(8, (s.text ?? '').length) * 0.58), (y1 - y0) * 0.55)
        if (px >= minLegivel) { ctx.fillStyle = '#ffffff'; ctx.font = `${px}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s.text ?? '', (x0 + x1) / 2, (y0 + y1) / 2); ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic' }
        continue
      }
      if (s.kind === 'text' || s.kind === 'arrow') {
        const color = on ? SEL : s.stroke
        const px = (s.h ?? 0.1) * scale
        if (s.kind === 'text') { const [x, y] = toScreen(s.pts[0], s.pts[1], w, h); drawText(s.text ?? '', x, y, px, s.rot ?? 0, color); continue }
        const [tx, ty] = toScreen(s.pts[0], s.pts[1], w, h), [ax, ay] = toScreen(s.pts[2], s.pts[3], w, h)
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = on ? 2.5 : 1.5
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(ax, ay); ctx.stroke()
        const ang = Math.atan2(ay - ty, ax - tx), L = Math.max(7 * ui, px * 0.9)
        ctx.beginPath(); ctx.moveTo(ax, ay)
        ctx.lineTo(ax - L * Math.cos(ang - 0.35), ay - L * Math.sin(ang - 0.35)); ctx.lineTo(ax - L * Math.cos(ang + 0.35), ay - L * Math.sin(ang + 0.35)); ctx.closePath(); ctx.fill()
        if (s.text) {
          const left = s.pts[0] < s.pts[2], gap = px * 0.3
          ctx.save(); ctx.translate(tx + (left ? -gap : gap), ty)
          if (px < minLegivel) { ctx.globalAlpha = 0.55; const bw = Math.max(2, s.text.length * px * 0.55); ctx.fillRect(left ? -bw : 0, -Math.max(1, px * 0.4), bw, Math.max(1, px * 0.8)); ctx.globalAlpha = 1 }
          else { ctx.font = `${px}px sans-serif`; ctx.textAlign = left ? 'right' : 'left'; ctx.textBaseline = 'middle'; ctx.fillText(s.text, 0, 0) }
          ctx.restore()
        }
        continue
      }
      shapePath(s)
      if (s.fill && s.kind !== 'line') { ctx.fillStyle = s.fill; ctx.fill() }
      if (s.dash) ctx.setLineDash([14, 4, 3, 4])
      ctx.strokeStyle = on ? SEL : s.stroke; ctx.lineWidth = on ? 2.5 : 1.5; ctx.stroke(); ctx.setLineDash([])
    }

    // alças de redimensionar e medida da fita/perfil selecionado
    if (!printing && tool === 'select' && sel.length === 1) {
      const s = ed.shapes.find(x => 's' + x.id === sel[0])
      if (s && isTape(s)) {
        gripsOf(s).forEach(([gx, gy], i) => {
          const [x, y] = toScreen(gx, gy, w, h)
          ctx.fillStyle = s.kind === 'perfil' && i === 2 ? '#fbbf24' : '#2563eb'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1
          ctx.fillRect(x - 5, y - 5, 10, 10); ctx.strokeRect(x - 5, y - 5, 10, 10)
        })
        const [x, y] = toScreen(s.pts[0], s.pts[1], w, h)
        const label = fmtM(polyLength(s.pts) * model.unitToMeters) + (s.kind === 'perfil' ? ` × ${((s.w ?? 0) * model.unitToMeters * 100).toFixed(1).replace('.', ',')} cm` : '')
        ctx.font = 'bold 12px sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = BG; ctx.strokeText(label, x + 8, y - 10); ctx.fillStyle = '#fbbf24'; ctx.fillText(label, x + 8, y - 10)
      }
    }
    // centerline: linhas escolhidas em destaque
    if (!printing && tool === 'centro') {
      for (const [seg, color] of [[centroA, '#fbbf24'], [segHover, '#4ade80']] as const) {
        if (!seg) continue
        const [a, b] = toScreen(seg[0], seg[1], w, h), [c, d] = toScreen(seg[2], seg[3], w, h)
        ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke()
      }
    }
    // distribuir luz: parede, fileira e posições antes de confirmar
    if (!printing && tool === 'distribuir' && dist.pts.length) {
      const P = (p: number[]) => toScreen(p[0], p[1], w, h)
      const p2 = dist.pts[1] ?? (cursor ? [cursor.x, cursor.y] : dist.pts[0])
      ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2
      const [a, b] = P(dist.pts[0]), [c, d] = P(p2); ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke()
      const plano = planoDistribuir()
      if (plano) {
        const [e1, f1] = P([plano.linha[0], plano.linha[1]]), [g1, h1] = P([plano.linha[2], plano.linha[3]])
        ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(e1, f1); ctx.lineTo(g1, h1); ctx.stroke(); ctx.setLineDash([])
        for (const centro of plano.centros) { const [x, y] = P(centro); ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y); ctx.moveTo(x, y - 9); ctx.lineTo(x, y + 9); ctx.stroke() }
      }
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
        ctx.moveTo(P[0] + (dx / l) * 3 * ui, P[1] + (dy / l) * 3 * ui); ctx.lineTo(Q[0] + (dx / l) * 5 * ui * Math.sign(d.off || 1), Q[1] + (dy / l) * 5 * ui * Math.sign(d.off || 1))
      }
      ctx.moveTo(P1[0] - ux * 5 * ui, P1[1] - uy * 5 * ui); ctx.lineTo(P2[0] + ux * 5 * ui, P2[1] + uy * 5 * ui)
      for (const P of [P1, P2]) { ctx.moveTo(P[0] - 4 * ui, P[1] + 4 * ui); ctx.lineTo(P[0] + 4 * ui, P[1] - 4 * ui) } // tique oblíquo
      ctx.stroke()
      void side; void nxs; void nys
      let ta = ang
      if (ta > Math.PI / 2 || ta < -Math.PI / 2) ta += Math.PI
      ctx.save()
      ctx.translate((P1[0] + P2[0]) / 2, (P1[1] + P2[1]) / 2); ctx.rotate(ta)
      ctx.font = `bold ${12 * ui}px sans-serif`; ctx.textAlign = 'center'
      const label = fmtM(g.len * model.unitToMeters)
      ctx.lineWidth = 4; ctx.strokeStyle = bg; ctx.strokeText(label, 0, -4 * ui)
      ctx.fillStyle = color; ctx.fillText(label, 0, -4 * ui)
      ctx.restore()
    }
    for (const d of ed.dims) drawDim(d, selSet.has('d' + d.id) ? SEL : printing ? '#1f2937' : '#f87171', selSet.has('d' + d.id) ? 2 : 1.25)
    if (printing) return
    if (plotUi && plot.area) { // área escolhida pra plotagem
      const [a, b] = toScreen(plot.area[0], plot.area[3], w, h), [c, d] = toScreen(plot.area[2], plot.area[1], w, h)
      ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.setLineDash([8, 5]); ctx.strokeRect(a, b, c - a, d - b); ctx.setLineDash([])
    }

    // 7) rascunho da ferramenta atual
    const cur = hover ? [hover.x, hover.y] : cursor ? [cursor.x, cursor.y] : null
    const guide = (fn: () => void) => { ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); fn(); ctx.setLineDash([]) }
    if (cur && draft.length) {
      if (tool === 'linha') guide(() => { const [x1, y1] = toScreen(draft[0][0], draft[0][1], w, h), [x2, y2] = toScreen(cur[0], cur[1], w, h); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke() })
      if (tool === 'fita') guide(() => { ctx.beginPath(); [...draft, cur].forEach((p, i) => { const [x, y] = toScreen(p[0], p[1], w, h); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) }); ctx.stroke() })
      if (tool === 'perfil') guide(() => {
        const L = num(perfilM) / model.unitToMeters
        const d = Math.hypot(cur[0] - draft[0][0], cur[1] - draft[0][1]) || 1
        const end = L > 0 ? [draft[0][0] + ((cur[0] - draft[0][0]) / d) * L, draft[0][1] + ((cur[1] - draft[0][1]) / d) * L] : cur
        const ghost: Shape = { id: 0, kind: 'perfil', pts: [draft[0][0], draft[0][1], end[0], end[1]], w: num(perfilCm, 3) / 100 / model.unitToMeters, stroke: '', fill: null }
        const q = perfilPoly(ghost)
        ctx.beginPath(); for (let i = 0; i < 8; i += 2) { const [x, y] = toScreen(q[i], q[i + 1], w, h); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.closePath(); ctx.stroke()
        const [x, y] = toScreen(end[0], end[1], w, h); ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 12px sans-serif'; ctx.fillText(fmtM(Math.hypot(end[0] - draft[0][0], end[1] - draft[0][1]) * model.unitToMeters), x + 8, y - 8)
      })
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
      drawInst(placing.obj, [ps, 0, 0, ps, cur[0], cur[1]], false, placing.spec.color || undefined)
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
  }
  useEffect(() => { paint() })

  // zoom com a rodinha
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('[data-nozoom]')) return // rolar painéis sobre o desenho
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
    if (e.button === 0 && tool === 'plotar') { gesture.current = { type: 'box', x: px, y: py, cx: 0, cy: 0, bx: px, by: py }; return }
    if (e.button !== 0 || tool !== 'select') return
    const [wx, wy] = toWorld(px, py, w, h)
    if (selRef.current.length === 1) { // alça do perfil/fita selecionado tem prioridade
      const s = edRef.current.shapes.find(x => 's' + x.id === selRef.current[0])
      if (s && isTape(s)) {
        const tol = 8 / view.current.scale
        const gi = gripsOf(s).findIndex(([gx, gy]) => Math.abs(gx - wx) <= tol && Math.abs(gy - wy) <= tol)
        if (gi >= 0) { gesture.current = { type: 'grip', x: px, y: py, cx: 0, cy: 0, base: edRef.current, dim: s.id, grip: gi, moved: false }; return }
      }
    }
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
    if (g?.type === 'grip' && g.base) {
      if (!g.moved && Math.hypot(px - g.x, py - g.y) < 3) return
      g.moved = true
      const snap = findSnap(wx, wy, new Set(['s' + g.dim]))
      const [tx, ty] = snap ? [snap.x, snap.y] : [wx, wy]
      setHover(snap)
      setEd({ ...g.base, shapes: g.base.shapes.map(x => {
        if (x.id !== g.dim) return x
        let p = [tx, ty]
        if (x.kind === 'fita' && e.shiftKey) { const j = g.grip! > 0 ? g.grip! - 1 : 1; p = ortho(p, [x.pts[j * 2], x.pts[j * 2 + 1]], true) }
        return dragGrip(x, g.grip!, p[0], p[1], 0.01 / u2m, e.altKey)
      }) })
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
    setSegHover(tool === 'centro' ? pickSegment(wx, wy) : null)
    setCursor({ x: wx, y: wy })
    setHover(tool === 'pan' ? null : findSnap(wx, wy))
  }
  function onUp(e?: React.MouseEvent) {
    const g = gesture.current
    gesture.current = null
    if (!g) return
    if ((g.type === 'move' || g.type === 'dimdrag' || g.type === 'grip') && g.base) {
      if (g.moved) { past.current.push(g.base); future.current = []; redraw() } else setEd(g.base)
    }
    const box = boxRef.current
    if (g.type === 'box' && tool === 'plotar') {
      setBox(null)
      if (!box || !wrapRef.current || Math.abs(box.x1 - box.x0) < 8 || Math.abs(box.y1 - box.y0) < 8) return
      const cw = wrapRef.current.clientWidth, ch = wrapRef.current.clientHeight
      const [ax, ay] = toWorld(Math.min(box.x0, box.x1), Math.max(box.y0, box.y1), cw, ch)
      const [bx, by] = toWorld(Math.max(box.x0, box.x1), Math.min(box.y0, box.y1), cw, ch)
      setPlot(p => ({ ...p, area: [ax, ay, bx, by] })); setTool('select'); setPlotUi(true)
      return
    }
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
    if (tool === 'select' || tool === 'pan' || tool === 'plotar') return
    if (textEditRef.current) return // o campo de texto está aberto (o blur confirma)
    const { p: raw } = point(e)
    const last = draft[draft.length - 1]
    const p = last && tool !== 'medir' ? ortho(raw, last, e.shiftKey) : raw
    const e0 = edRef.current
    if (tool === 'centro') {
      const { px, py, w, h } = pos(e)
      const seg = pickSegment(...toWorld(px, py, w, h))
      if (!seg) { setAviso('Clique em cima de uma linha.'); return }
      if (!centroA) { setCentroA(seg); setAviso(null); return }
      const c = centerline(centroA, seg)
      setCentroA(null)
      if (!c) { setAviso('Não deu pra criar a linha central com essas duas linhas.'); return }
      commit({ ...e0, shapes: [...e0.shapes, { id: e0.next, kind: 'line', pts: [...c], stroke: '#f87171', fill: null, dash: true }], next: e0.next + 1 })
      setAviso(null); return
    }
    if (tool === 'distribuir') {
      if (dist.escolhendo) {
        const { px, py, w, h } = pos(e)
        const hit = hitTest(...toWorld(px, py, w, h))
        if (!hit || !modelaveis([hit]).length) { setAviso('Clique numa luminária (bloco) pra usar como modelo.'); return }
        aplicarDistribuir([hit]); return
      }
      if (dist.pts.length >= 3) return
      const q = (dist.pts.length === 1 ? ortho(p, dist.pts[0], e.shiftKey) : dist.pts.length === 2 ? raw : p) as [number, number]
      if (dist.pts.length === 1 && Math.hypot(q[0] - dist.pts[0][0], q[1] - dist.pts[0][1]) < 1e-9) return
      setAviso(null); setDist({ pts: [...dist.pts, q], escolhendo: false }); return
    }
    if (tool === 'perfil') {
      if (!draft.length) { setDraft([p]); return }
      const d = Math.hypot(p[0] - draft[0][0], p[1] - draft[0][1])
      if (d < 1e-9) return
      const L = num(perfilM) / u2m
      const end = L > 0 ? [draft[0][0] + ((p[0] - draft[0][0]) / d) * L, draft[0][1] + ((p[1] - draft[0][1]) / d) * L] : p
      addTape({ kind: 'perfil', pts: [draft[0][0], draft[0][1], end[0], end[1]], w: num(perfilCm, 3) / 100 / u2m, stroke: perfilCor, tapeColor: fitaCor, fill: null })
      return
    }
    if (tool === 'fita') { if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-9) setDraft([...draft, p]); return }
    if (tool === 'texto') { setTextEdit({ kind: 'text', x: p[0], y: p[1], value: '' }); return }
    if (tool === 'seta') {
      if (!draft.length) { setDraft([p]); return }
      if (Math.hypot(p[0] - draft[0][0], p[1] - draft[0][1]) < 1e-9) return
      setTextEdit({ kind: 'arrow', x: p[0], y: p[1], tip: draft[0], value: '' }); setDraft([]); return
    }
    if (tool === 'inserir') {
      if (!placing) return
      const ps = placing.s * (parseFloat(placeScale.replace(',', '.')) || 1)
      commit({ ...e0, cp: [...e0.cp, { id: e0.next, src: placing.obj, xf: [ps, 0, 0, ps, p[0], p[1]], spec: placing.spec }], next: e0.next + 1 })
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
    setCentroA(null); setSegHover(null); setDist({ pts: [], escolhendo: false }); if (tool === 'centro' || tool === 'distribuir') setAviso(null)
    // texto novo nasce legível no zoom atual (~14 px de altura); dá pra ajustar no campo "Texto"
    if ((tool === 'texto' || tool === 'seta') && model) setTextH(String(Number(((14 / view.current.scale) * model.unitToMeters).toPrecision(2))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool])

  function onDbl(e: React.MouseEvent) {
    if (tool === 'fita') { finishFita(); return }
    if (tool !== 'select') { setDraft([]); return }
    const { px, py, w, h } = pos(e)
    const hit = hitTest(...toWorld(px, py, w, h))
    if (hit && hit[0] === 'c' && edRef.current.cp.some(c => c.id === Number(hit.slice(1)) && modelRef.current?.objs[c.src]?.attdefs?.some(d => !d.constant))) {
      setSel([hit]); setTimeout(() => document.getElementById('attr-0')?.focus(), 60); return
    }
    if (!hit) return
    if (hit[0] === 'c' || (hit[0] === 's' && edRef.current.shapes.some(x => 's' + x.id === hit && (isTape(x) || x.kind === 'fonte')))) { setSel([hit]); openSpecs([hit]); return }
    if (hit[0] !== 's') return
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
    listCadLibrary().then(r => { if (r.rows) setLib(r.rows.map(x => ({ ...x, data: normalizeLibBlock(x.data) }))); else if (r.error) setLibMsg(r.error) }).catch(() => {})
  }, [])
  // coloca a definição do bloco no desenho aberto (uma vez por bloco) e devolve o índice do objeto
  function ensureObj(b: LibBlock): number {
    const m = modelRef.current!
    let obj = libObj.current.get(b.name)
    if (obj === undefined) {
      const r = appendLibBlock(m, b)
      modelRef.current = r.model; setModel(r.model)
      if (r.layerAdded) setLayerVis(v => [...v, true])
      obj = r.obj; libObj.current.set(b.name, obj); libDefs.current.set(b.name, b)
    }
    return obj
  }
  // ao escolher um bloco: primeiro as especificações, depois é só clicar na planta
  function startPlace(b: LibBlock) {
    if (!modelRef.current) return
    setSpecModal({ block: b, title: b.name, form: { ...(lastSpec.current.get(b.name) ?? guessSpec(b.name)) }, showPower: true })
  }
  const specOfShape = (sh: Shape): Spec => sh.spec ?? { name: sh.kind === 'perfil' ? 'Perfil + Fita' : sh.kind === 'fita' ? 'Fita LED' : 'Fonte', mounting: '', power: '', light: '', color: sh.stroke }
  // chaves selecionadas que aceitam especificação
  function specKeys(keys: string[]) {
    const e0 = edRef.current, m = modelRef.current
    return keys.filter(k => {
      const id = Number(k.slice(1))
      if (k[0] === 'c') { const c = e0.cp.find(c => c.id === id); return !!c && m?.objs[c.src]?.kind === 'LIB' }
      if (k[0] === 's') { const sh = e0.shapes.find(x => x.id === id); return !!sh && (isTape(sh) || sh.kind === 'fonte') }
      return false
    })
  }
  function openSpecs(all: string[]) {
    const keys = specKeys(all); if (!keys.length) return
    const e0 = edRef.current, first = keys[0], id = Number(first.slice(1))
    let form: Spec
    if (first[0] === 'c') { const c = e0.cp.find(c => c.id === id)!; form = { ...(c.spec ?? guessSpec(modelRef.current!.objs[c.src].name)) } }
    else form = { ...specOfShape(e0.shapes.find(x => x.id === id)!) }
    setSpecModal({ keys, title: keys.length > 1 ? `${keys.length} itens` : form.name, form, showPower: keys.some(k => k[0] === 'c') })
  }
  function confirmSpec() {
    const sm = specModal; if (!sm) return
    const form = { ...sm.form, name: sm.form.name.trim() || sm.title }
    setSpecModal(null)
    if (sm.block) {
      const m = modelRef.current; if (!m) return
      lastSpec.current.set(sm.block.name, form)
      setPlacing({ name: sm.block.name, obj: ensureObj(sm.block), s: sm.block.unitToMeters / m.unitToMeters, spec: form }); setTool('inserir')
      return
    }
    const set = new Set(sm.keys), e0 = edRef.current
    commit({
      ...e0,
      cp: e0.cp.map(c => (set.has('c' + c.id) ? { ...c, spec: { ...form, power: form.power } } : c)),
      shapes: e0.shapes.map(x => (set.has('s' + x.id) ? { ...x, spec: form, stroke: form.color || x.stroke } : x)),
    })
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
    const nu = guessSpec(row.name)
    commit({ ...edRef.current, cp: edRef.current.cp.map(c => {
      if (!ids.has(c.id)) return c
      if (!c.spec) return { ...c, src: obj }
      // o que veio do nome do estado antigo acompanha o novo; o que foi digitado fica
      const old = guessSpec(modelRef.current!.objs[c.src].name)
      return { ...c, src: obj, spec: { ...c.spec,
        name: c.spec.name === old.name ? nu.name : c.spec.name,
        power: c.spec.power === old.power && nu.power ? nu.power : c.spec.power,
        mounting: c.spec.mounting === old.mounting && nu.mounting ? nu.mounting : c.spec.mounting } }
    }) })
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
    const r = await listCadLibrary(); if (r.rows) setLib(r.rows.map(x => ({ ...x, data: normalizeLibBlock(x.data) })))
    setLibBusy(false)
    if (fails.length) setLibMsg(`${ok} salvo(s). Falhas: ${fails.slice(0, 3).join(' · ')}`); else { setLibMsg(`${ok} bloco(s) salvo(s) na biblioteca.`); setCand(null) }
  }
  async function removeLib(id: string, name: string) {
    if (!window.confirm(`Remover "${name}" da biblioteca?`)) return
    const r = await deleteCadLibraryBlock(id)
    if (r.error) { setLibMsg(r.error); return }
    setLib(l => l.filter(x => x.id !== id))
  }
  const toolRef = useRef(tool); toolRef.current = tool
  const finishRef = useRef(finishFita); finishRef.current = finishFita
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
      if (k === 'enter' && toolRef.current === 'fita') { ev.preventDefault(); finishRef.current(); return }
      if (k === 'escape') { setPlotUi(false); setSpecModal(null); setFonteModal(null); setDraft([]); setSel([]); setTool('select') }
      else if (k === 'delete' || k === 'backspace') { ev.preventDefault(); actDelete() }
      else if (k === 'v') setTool('select')
      else if (k === 'h') setTool('pan')
      else if (k === 'm') setTool('medir')
      else if (k === 'l') setTool('linha')
      else if (k === 'r') setTool('retangulo')
      else if (k === 'c') setTool('circulo')
      else if (k === 'e') setTool('centro')
      else if (k === 'd') setTool('distribuir')
      else if (k === 'p') setTool('perfil')
      else if (k === 'f') setTool('fita')
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

  // bloco selecionado (um só) que tem atributos editáveis
  const attrCp = (() => {
    if (!model || sel.length !== 1 || sel[0][0] !== 'c') return null
    const c = ed.cp.find(c => c.id === Number(sel[0].slice(1)))
    return c && model.objs[c.src]?.attdefs?.some(d => !d.constant) ? c : null
  })()
  const tapeSel = sel.length === 1 ? ed.shapes.find(x => 's' + x.id === sel[0] && isTape(x)) ?? null : null
  const legendShape = ed.shapes.find(x => x.kind === 'legenda') ?? null
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
        <p className="text-sm text-navy-muted">Abre DWG ou DXF no navegador. O arquivo e as suas alterações ficam salvos na sua conta. Camadas, blocos, snap, cotas, e edição: selecionar, mover, copiar, girar, espelhar, apagar, desenhar linhas, retângulos e círculos.</p>
      </div>

      <label className="flex items-center gap-3 border-2 border-dashed border-surface-border hover:border-brand-400 rounded-card px-4 py-3 cursor-pointer bg-gradient-card shadow-card">
        <input type="file" accept=".dwg,.dxf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
        {loading ? <Loader2 className="w-5 h-5 text-brand-500 animate-spin" /> : <Upload className="w-5 h-5 text-navy-muted/60" />}
        <span className="text-sm font-medium text-navy-muted">
          {loading ? 'Lendo o desenho (arquivos grandes levam alguns segundos)...' : fileName ? `${fileName} — clique pra trocar o arquivo` : 'Clique pra escolher um arquivo .dwg ou .dxf'}
        </span>
      </label>
      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {drawing && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button onClick={closeDrawing} className="text-brand-600 font-medium hover:underline">← Meus desenhos</button>
          <span className="font-semibold text-navy truncate max-w-[40ch]">{drawing.name}</span>
          {drawing.id && <button onClick={() => renameDrawing(drawing.id!, drawing.name)} className="text-xs text-gray-400 hover:text-gray-700 underline">renomear</button>}
          {saveStatus && (
            <span className={cn('ml-auto text-xs rounded-full px-2.5 py-1', saveStatus.kind === 'erro' ? 'bg-red-50 text-red-600' : saveStatus.kind === 'salvo' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700')}>
              {saveStatus.kind === 'salvo' && `✓ Salvo${saveStatus.msg ? ` às ${saveStatus.msg}` : ''}`}
              {saveStatus.kind === 'salvando' && `Salvando${saveStatus.msg ? ` (${saveStatus.msg})` : ''}...`}
              {saveStatus.kind === 'pendente' && 'Alterações a salvar...'}
              {saveStatus.kind === 'erro' && `Não salvou: ${saveStatus.msg}`}
            </span>
          )}
          {saveStatus?.kind === 'erro' && drawing.id && <button onClick={() => flushSave()} className="text-xs font-medium bg-brand-600 text-white rounded-lg px-3 py-1">Tentar de novo</button>}
        </div>
      )}

      {!model && !loading && (
        <section className="border border-surface-border rounded-card bg-white p-4">
          <p className="text-sm font-bold text-navy mb-2">Meus desenhos</p>
          {drawings === null && <p className="text-sm text-gray-400">Carregando...</p>}
          {drawings?.length === 0 && <p className="text-sm text-gray-400">Nenhum desenho salvo ainda. O que você abrir acima fica guardado aqui.</p>}
          <div className="divide-y divide-gray-100">
            {drawings?.map(d => (
              <div key={d.id} className="flex items-center gap-3 py-2">
                <button onClick={() => openSaved(d.id)} className="flex-1 min-w-0 text-left">
                  <span className="block text-sm font-medium text-navy truncate hover:text-brand-600">{d.name}</span>
                  <span className="block text-xs text-gray-400 truncate">{d.file_name} · {(d.size_bytes / 1e6).toFixed(1)} MB · alterado em {new Date(d.updated_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                </button>
                <button onClick={() => openSaved(d.id)} className="text-xs font-medium bg-brand-600 text-white rounded-lg px-3 py-1.5">Abrir</button>
                <button onClick={() => renameDrawing(d.id, d.name)} className="text-xs text-gray-500 underline">renomear</button>
                <button onClick={() => removeDrawing(d.id, d.name)} title="Apagar desenho" className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </section>
      )}

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
              <TB id="perfil" icon={<RectangleHorizontal className="w-3.5 h-3.5" />} label="Perfil + Fita" k="P" />
              <TB id="fita" icon={<MoreHorizontal className="w-3.5 h-3.5" />} label="Fita" k="F" />
              <TB id="centro" icon={<SeparatorHorizontal className="w-3.5 h-3.5" />} label="Centerline" k="E" />
              <TB id="distribuir" icon={<GripHorizontal className="w-3.5 h-3.5" />} label="Distribuir luz" k="D" />
              <TB id="texto" icon={<TypeIcon className="w-3.5 h-3.5" />} label="Texto" k="T" />
              <TB id="seta" icon={<ArrowUpRight className="w-3.5 h-3.5" />} label="Seta" k="A" />
              <span className="w-px h-5 bg-gray-200 mx-1" />
              <button onClick={() => { setTool('select'); setPlotUi(true) }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-brand-400 text-brand-600 hover:bg-brand-50"><FileDown className="w-3.5 h-3.5" /> Gerar PDF</button>
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
              <AB onClick={() => openSpecs(sel)} icon={<Tag className="w-3.5 h-3.5" />} label="Especificações" disabled={!specKeys(sel).length} />
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
              onDoubleClick={onDbl} onContextMenu={e => { e.preventDefault(); if (tool === 'fita') finishFita(); else setDraft([]) }}>
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
                  {tool === 'perfil' && (draft.length ? 'Clique pra definir a direção/fim do perfil (Shift = reto)' : 'Perfil + fita: clique no ponto inicial')}
                  {tool === 'fita' && (draft.length ? 'Clique os próximos pontos — Enter, botão direito ou duplo clique termina' : 'Fita: clique no ponto inicial')}
                  {tool === 'centro' && (centroA ? 'Centerline: clique na SEGUNDA linha' : 'Centerline: clique na PRIMEIRA linha')}
                  {tool === 'distribuir' && (dist.escolhendo ? 'Clique na luminária modelo' : ['Distribuir luz: clique na 1ª extremidade da parede', 'Clique na 2ª extremidade da parede (Shift = reto)', 'Clique no LADO onde as luminárias devem ficar', 'Confira os valores na caixa à direita'][dist.pts.length])}
                  {tool === 'plotar' && 'Arraste um retângulo em volta da área que vai pro PDF (Esc cancela)'}
                  {tool === 'texto' && 'Clique onde o texto começa e digite (Enter confirma). Duplo clique num texto edita.'}
                  {tool === 'seta' && (draft.length ? 'Clique onde o texto da seta vai ficar' : 'Seta com texto: clique na PONTA da seta')}
                  {tool === 'inserir' && (placing ? `Inserindo "${placing.name}" — clique pra colocar (Esc termina)` : '')}
                  {tool === 'medir' && (draft.length === 0 ? 'Cota: clique no 1º ponto' : draft.length === 1 ? 'Clique no 2º ponto' : 'Clique onde a cota deve ficar (distância da linha)')}
                </div>
              )}
              {plotUi && (() => {
                const L = plot.area ? plotLayout(plot, items.length, plot.area, model.unitToMeters) : null
                const set = (p: Partial<PlotInfo>) => setPlot(v => ({ ...v, ...p }))
                const input = 'w-full text-sm border border-gray-200 rounded px-2 py-1 text-gray-800 bg-white'
                const area2 = (label: string, k: 'endereco' | 'proprietario' | 'escritorio', ph: string) => (
                  <label className="block text-[11px] text-gray-500">{label}
                    <textarea rows={2} value={plot[k]} onChange={e => set({ [k]: e.target.value })} onKeyDown={e => e.stopPropagation()} placeholder={ph} className={`${input} resize-none`} /></label>
                )
                return (
                  <div data-nozoom className="absolute inset-y-2 right-2 z-30 w-80 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-2xl p-4 space-y-2 cursor-default" onMouseDown={e => e.stopPropagation()} onMouseUp={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
                    <p className="text-sm font-bold text-navy flex items-center gap-1.5"><FileDown className="w-4 h-4 text-brand-500" /> Gerar PDF</p>
                    {area2('Endereço da obra', 'endereco', 'Condomínio, quadra, lote, cidade')}
                    {area2('Proprietário', 'proprietario', 'Nome do cliente')}
                    {area2('Escritório responsável', 'escritorio', 'Escritório e telefone')}
                    <div className="grid grid-cols-3 gap-2">
                      <label className="text-[11px] text-gray-500">Data<input value={plot.data} onChange={e => set({ data: e.target.value })} onKeyDown={e => e.stopPropagation()} className={input} /></label>
                      <label className="text-[11px] text-gray-500">Pavimento<input value={plot.pavimento} onChange={e => set({ pavimento: e.target.value })} onKeyDown={e => e.stopPropagation()} className={input} /></label>
                      <label className="text-[11px] text-gray-500">Desenho<input value={plot.desenho} onChange={e => set({ desenho: e.target.value })} onKeyDown={e => e.stopPropagation()} className={input} /></label>
                      <label className="text-[11px] text-gray-500">Folha<select value={plot.papel} onChange={e => set({ papel: e.target.value as Papel })} className={input}>{Object.keys(PAPEIS).map(p => <option key={p}>{p}</option>)}</select></label>
                      <label className="col-span-2 text-[11px] text-gray-500">Escala<select value={plot.escala} onChange={e => set({ escala: Number(e.target.value) })} className={input}>{ESCALAS.map(v => <option key={v} value={v}>{v ? `1/${v}` : 'Ajustar à folha'}</option>)}</select></label>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600"><input type="checkbox" checked={plot.legenda} onChange={e => set({ legenda: e.target.checked })} /> Incluir a legenda ({items.length} {items.length === 1 ? 'item' : 'itens'})</label>
                    {L && plot.area ? (
                      <p className={cn('text-[11px] rounded px-2 py-1', L.cabe ? 'bg-gray-50 text-gray-600' : 'bg-red-50 text-red-600')}>
                        Área marcada: {fmtM((plot.area[2] - plot.area[0]) * model.unitToMeters)} × {fmtM((plot.area[3] - plot.area[1]) * model.unitToMeters)} · escala {L.rotuloEscala}{!L.cabe && ' — não cabe: use uma folha maior ou outra escala'}
                      </p>
                    ) : <p className="text-[11px] bg-amber-50 text-amber-700 rounded px-2 py-1">Marque no desenho a área que vai pro PDF.</p>}
                    <button onClick={() => { setPlotUi(false); setTool('plotar') }} className={cn('w-full text-xs font-medium rounded-lg py-2', plot.area ? 'border border-brand-400 text-brand-600' : 'bg-brand-600 text-white')}>{plot.area ? 'Marcar outra área' : 'Marcar área na planta'}</button>
                    {plot.area && <button onClick={gerarPdf} disabled={gerando} className="w-full text-xs font-medium bg-brand-600 text-white rounded-lg py-2 disabled:opacity-50">{gerando ? 'Gerando...' : 'Gerar PDF'}</button>}
                    <button onClick={() => setPlotUi(false)} className="w-full text-xs text-gray-400">fechar</button>
                  </div>
                )
              })()}
              {tool === 'distribuir' && dist.pts.length === 3 && !dist.escolhendo && (() => {
                const plano = planoDistribuir()
                const sel2 = modelaveis(sel)
                const campo = (label: string, v: string, set: (v: string) => void, un: string) => (
                  <label className="flex items-center gap-2"><span className="flex-1">{label}</span><input value={v} onChange={e => set(e.target.value)} onKeyDown={e => e.stopPropagation()} className="w-16 text-xs border border-gray-200 rounded px-1.5 py-0.5 text-right" /><span className="w-5">{un}</span></label>
                )
                return (
                  <div className="absolute right-2 top-2 z-10 w-64 space-y-1.5 text-xs bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-gray-600 cursor-default" onMouseDown={e => e.stopPropagation()} onMouseUp={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
                    <p className="font-bold text-navy">Distribuir luz</p>
                    {campo('Afastamento da parede', distAfast, setDistAfast, 'cm')}
                    {campo('Quantidade', distQtd, setDistQtd, '')}
                    {campo('Cotas pra fora das luminárias', distCota, setDistCota, 'cm')}
                    {plano ? <p className="text-[11px] bg-gray-50 rounded px-2 py-1">Entre elas: <b>{fmtM(plano.passo * u2m)}</b> · nas pontas: <b>{fmtM((plano.passo * u2m) / 2)}</b></p> : <p className="text-[11px] text-amber-600">Informe a quantidade.</p>}
                    <button onClick={inverterLado} className="w-full border border-gray-200 rounded-lg py-1 hover:bg-gray-50">Inverter lado</button>
                    {sel2.length > 0 && <button onClick={() => aplicarDistribuir(sel2)} disabled={!plano} className="w-full font-medium bg-brand-600 text-white rounded-lg py-1.5 disabled:opacity-40">Usar a luminária selecionada</button>}
                    <button onClick={() => setDist(d => ({ ...d, escolhendo: true }))} disabled={!plano} className={cn('w-full font-medium rounded-lg py-1.5 disabled:opacity-40', sel2.length ? 'border border-brand-400 text-brand-600' : 'bg-brand-600 text-white')}>Clicar na luminária modelo</button>
                  </div>
                )
              })()}
              {aviso && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-2 z-10 flex items-center gap-2 text-[11px] bg-white border border-gray-200 rounded-lg shadow px-3 py-1.5 text-gray-700" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                  {aviso} <button onClick={() => setAviso(null)} className="text-gray-400">✕</button>
                </div>
              )}
              {(tool === 'perfil' || tool === 'fita') && (
                <div className="absolute right-2 top-2 z-10 flex items-center gap-2 text-[11px] bg-white/95 border border-gray-200 rounded px-2 py-1 text-gray-600" onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
                  {tool === 'perfil' && (<>
                    <label className="flex items-center gap-1">Espessura <input value={perfilCm} onChange={e => setPerfilCm(e.target.value)} className="w-11 text-xs border border-gray-200 rounded px-1 py-0.5 text-center" /> cm</label>
                    <label className="flex items-center gap-1">Comprimento <input value={perfilM} onChange={e => setPerfilM(e.target.value)} placeholder="livre" className="w-14 text-xs border border-gray-200 rounded px-1 py-0.5 text-center" /> m</label>
                    <label className="flex items-center gap-1">Perfil <input type="color" value={perfilCor} onChange={e => setPerfilCor(e.target.value)} className="w-5 h-5 p-0 border-0" /></label>
                  </>)}
                  <label className="flex items-center gap-1">Fita <input type="color" value={fitaCor} onChange={e => setFitaCor(e.target.value)} className="w-5 h-5 p-0 border-0" /></label>
                </div>
              )}
              {fonteModal && (() => {
                const tape = ed.shapes.find(x => x.id === fonteModal.id)
                if (!tape) return null
                const comp = polyLength(tape.pts) * model.unitToMeters
                const wm = num(fonteModal.wm)
                const r = wm > 0 ? dimensionarFonte(comp, wm) : null
                const jaTem = ed.shapes.some(x => x.kind === 'fonte' && x.link === tape.id)
                return (
                  <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40" onMouseDown={e => e.stopPropagation()} onMouseUp={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
                    <form className="w-96 max-h-full overflow-y-auto bg-white rounded-xl shadow-2xl p-4 space-y-3 cursor-default" onSubmit={e => { e.preventDefault(); confirmFonte(true) }}>
                      <p className="text-sm font-bold text-navy flex items-center gap-1.5"><Zap className="w-4 h-4 text-amber-500" /> {tape.kind === 'perfil' ? 'Perfil + fita' : 'Fita'} — {fmtM(comp)}</p>
                      <CadSpecFields value={fonteModal.spec} onChange={spec => setFonteModal({ ...fonteModal, spec })} showPower={false} />
                      <div className="flex gap-4 text-[11px] text-gray-500">
                        <label className="flex items-center gap-1.5">{tape.kind === 'perfil' ? 'Cor do perfil' : 'Cor da fita'} <input type="color" value={fonteModal.spec.color || '#e5e7eb'} onChange={e => setFonteModal({ ...fonteModal, spec: { ...fonteModal.spec, color: e.target.value } })} className="w-6 h-6 p-0 border-0" /></label>
                        {tape.kind === 'perfil' && <label className="flex items-center gap-1.5">Cor da fita <input type="color" value={fonteModal.tapeColor} onChange={e => setFonteModal({ ...fonteModal, tapeColor: e.target.value })} className="w-6 h-6 p-0 border-0" /></label>}
                      </div>
                      <div className="flex gap-2">
                        <label className="flex-1 text-[11px] text-gray-500">Potência da fita (W/m)
                          <input value={fonteModal.wm} onChange={e => setFonteModal({ ...fonteModal, wm: e.target.value })} onKeyDown={e => e.stopPropagation()} className="w-full text-sm border border-gray-200 rounded px-2 py-1 text-gray-800" /></label>
                        <label className="w-24 text-[11px] text-gray-500">Tensão
                          <select value={fonteModal.volt} onChange={e => setFonteModal({ ...fonteModal, volt: Number(e.target.value) })} className="w-full text-sm border border-gray-200 rounded px-2 py-1 text-gray-800"><option value={12}>12 V</option><option value={24}>24 V</option></select></label>
                      </div>
                      {r ? (
                        <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 space-y-0.5">
                          <p className="flex justify-between"><span>Consumo</span><b>{r.consumoW.toLocaleString('pt-BR')} W</b></p>
                          <p className="flex justify-between"><span>Mínimo com 20% de folga</span><b>{r.minimaW.toLocaleString('pt-BR')} W</b></p>
                          <p className="flex justify-between text-sm text-navy pt-1 border-t border-gray-200"><span>Fonte sugerida</span><b>{r.quantidade > 1 ? `${r.quantidade} × ` : ''}{r.potencia} W {fonteModal.volt}V</b></p>
                        </div>
                      ) : <p className="text-xs text-amber-600">Informe a potência por metro.</p>}
                      <div className="flex gap-2">
                        <button type="submit" disabled={!r} className="flex-1 text-xs font-medium bg-brand-600 text-white rounded-lg py-2 disabled:opacity-40">{jaTem ? 'Atualizar fonte na planta' : 'Incluir fonte na planta'}</button>
                        <button type="button" onClick={() => confirmFonte(false)} className="text-xs text-gray-500 px-3">Salvar sem fonte</button>
                      </div>
                    </form>
                  </div>
                )
              })()}
              {specModal && (() => {
                const familia = specModal.block ? groupOfName.get(specModal.block.name)?.key ?? specModal.block.name : null
                const jaTem = familia ? items.filter(i => i.kind === 'bloco' && i.block === specModal.block!.name) : []
                return (
                  <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40" onMouseDown={e => e.stopPropagation()} onMouseUp={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
                    <form className="w-96 max-h-full overflow-y-auto bg-white rounded-xl shadow-2xl p-4 space-y-3 cursor-default" onSubmit={e => { e.preventDefault(); confirmSpec() }}>
                      <p className="text-sm font-bold text-navy flex items-center gap-1.5"><Tag className="w-4 h-4 text-brand-500" /> Especificações — {specModal.title}</p>
                      {jaTem.length > 0 && (
                        <div>
                          <p className="text-[11px] text-gray-500 mb-1">Já no projeto (clique pra continuar somando no mesmo item):</p>
                          <div className="flex flex-wrap gap-1">
                            {jaTem.map(i => (
                              <button type="button" key={i.key} onClick={() => setSpecModal({ ...specModal, form: { name: i.name, mounting: i.mounting, power: i.power, light: i.light, color: i.color } })}
                                className="flex items-center gap-1 text-[11px] border border-gray-200 rounded-full px-2 py-0.5 hover:border-brand-400 text-gray-700">
                                <span className="w-2.5 h-2.5 rounded-sm border border-gray-300" style={{ background: i.color || 'transparent' }} />{i.name} {[i.mounting, i.power, i.light].filter(Boolean).join(' · ')} ({i.qty})
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <CadSpecFields value={specModal.form} onChange={form => setSpecModal({ ...specModal, form })} showPower={specModal.showPower} />
                      <div className="flex items-center gap-3 text-[11px] text-gray-500">
                        <label className="flex items-center gap-1.5">Cor no desenho <input type="color" value={specModal.form.color || '#e5e7eb'} onChange={e => setSpecModal({ ...specModal, form: { ...specModal.form, color: e.target.value } })} className="w-6 h-6 p-0 border-0" /></label>
                        {specModal.showPower && <label className="flex items-center gap-1"><input type="checkbox" checked={!specModal.form.color} onChange={e => setSpecModal({ ...specModal, form: { ...specModal.form, color: e.target.checked ? '' : '#ff69b4' } })} /> cores originais do bloco</label>}
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" className="flex-1 text-xs font-medium bg-brand-600 text-white rounded-lg py-2">{specModal.block ? 'Colocar na planta' : 'Salvar'}</button>
                        <button type="button" onClick={() => setSpecModal(null)} className="text-xs text-gray-500 px-3">Cancelar</button>
                      </div>
                    </form>
                  </div>
                )
              })()}
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
            {attrCp && (
              <section className="border border-sky-200 rounded-xl bg-sky-50/40 p-3">
                <p className="text-xs font-bold text-sky-800 uppercase mb-1">Atributos — {model.objs[attrCp.src].name}</p>
                <p className="text-[10px] text-gray-500 mb-2">Preencha os campos deste bloco. Enter ou sair do campo confirma.</p>
                <div className="space-y-1.5">
                  {(model.objs[attrCp.src].attdefs ?? []).filter(d => !d.constant).map((d, i) => {
                    const cur = attrCp.attrs?.[d.tag] ?? d.def
                    return (
                      <label key={`${attrCp.id}:${d.tag}:${i}:${cur}`} className="block">
                        <span className="text-[10px] text-gray-500">{d.prompt || d.tag}{d.hidden && ' (oculto)'}</span>
                        <input id={`attr-${i}`} defaultValue={cur}
                          onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          onBlur={e => {
                            const v = e.target.value
                            if (v === cur) return
                            const e0 = edRef.current
                            commit({ ...e0, cp: e0.cp.map(c => (c.id === attrCp.id ? { ...c, attrs: { ...(c.attrs ?? {}), [d.tag]: v } } : c)) })
                          }}
                          className="w-full text-xs border border-gray-200 rounded px-1.5 py-1 bg-white" />
                      </label>
                    )
                  })}
                </div>
              </section>
            )}

            {tapeSel && (() => {
              const comp = polyLength(tapeSel.pts) * model.unitToMeters
              const fontes = ed.shapes.filter(x => x.kind === 'fonte' && x.link === tapeSel.id)
              const r = tapeSel.wm ? dimensionarFonte(comp, tapeSel.wm) : null
              const instalada = fontes.reduce((a, f) => a + (f.watts ?? 0), 0)
              const campo = (label: string, valor: string, aplicar: (v: number) => void, unidade: string, chave: string) => (
                <label key={`${tapeSel.id}:${chave}:${valor}`} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span className="flex-1">{label}</span>
                  <input defaultValue={valor} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    onBlur={e => { const v = num(e.target.value); if (v > 0 && e.target.value !== valor) aplicar(v) }}
                    className="w-20 text-xs border border-gray-200 rounded px-1.5 py-0.5 text-right bg-white" />
                  <span className="w-6">{unidade}</span>
                </label>
              )
              return (
                <section className="border border-sky-200 rounded-xl bg-sky-50/40 p-3 space-y-1.5">
                  <p className="text-xs font-bold text-sky-800 uppercase">{tapeSel.kind === 'perfil' ? 'Perfil + fita' : 'Fita'}</p>
                  {tapeSel.pts.length === 4
                    ? campo('Comprimento', comp.toFixed(2), v => patchShape(tapeSel.id, x => setLength(x, v / model.unitToMeters)), 'm', 'len')
                    : <p className="flex justify-between text-xs text-gray-600"><span>Comprimento</span><b>{fmtM(comp)}</b></p>}
                  {tapeSel.kind === 'perfil' && campo('Espessura', ((tapeSel.w ?? 0) * model.unitToMeters * 100).toFixed(1), v => patchShape(tapeSel.id, x => ({ ...x, w: v / 100 / model.unitToMeters })), 'cm', 'esp')}
                  <div className="flex items-center gap-3 text-xs text-gray-600">
                    {tapeSel.kind === 'perfil' && <label className="flex items-center gap-1">Cor do perfil <input type="color" value={tapeSel.stroke} onChange={e => patchShape(tapeSel.id, x => ({ ...x, stroke: e.target.value }))} className="w-6 h-6 p-0 border-0" /></label>}
                    <label className="flex items-center gap-1">Cor da fita <input type="color" value={tapeSel.kind === 'perfil' ? tapeSel.tapeColor ?? '#f43f5e' : tapeSel.stroke} onChange={e => patchShape(tapeSel.id, x => (x.kind === 'perfil' ? { ...x, tapeColor: e.target.value } : { ...x, stroke: e.target.value }))} className="w-6 h-6 p-0 border-0" /></label>
                  </div>
                  <p className="text-xs text-gray-600">{tapeSel.wm ? `${String(tapeSel.wm).replace('.', ',')} W/m · ${tapeSel.volt ?? 12} V` : 'Potência da fita não informada'}{fontes.length > 0 && ` · fonte: ${fontes.length > 1 ? `${fontes.length} × ` : ''}${fontes[0].watts} W`}</p>
                  {r && fontes.length > 0 && instalada < r.minimaW && <p className="text-[11px] text-red-600 bg-red-50 rounded px-2 py-1">A fonte ficou pequena: precisa de {r.minimaW.toLocaleString('pt-BR')} W. Recalcule.</p>}
                  <button onClick={() => openFonte(tapeSel.id)} className="w-full text-xs font-medium bg-brand-600 text-white rounded-lg py-1.5">{fontes.length ? 'Recalcular fonte' : 'Calcular e incluir fonte'}</button>
                  <p className="text-[10px] text-gray-400">{tapeSel.kind === 'perfil' ? 'No desenho: quadrados azuis esticam o comprimento (Alt gira), o amarelo muda a espessura.' : 'No desenho: arraste os quadrados azuis pra ajustar os pontos da fita.'}</p>
                </section>
              )
            })()}

            <section className="border border-gray-200 rounded-xl bg-white p-3">
              <p className="text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> Itens do projeto ({items.reduce((a, i) => a + i.qty, 0)})</p>
              {items.length === 0 && <p className="text-xs text-gray-400">Blocos da biblioteca, perfis, fitas e fontes que você colocar aparecem aqui, somados por especificação.</p>}
              <div className="max-h-60 overflow-y-auto divide-y divide-gray-100">
                {items.map(i => (
                  <div key={i.key} className="flex items-center gap-2 py-1">
                    <span className="w-3 h-3 rounded-sm border border-gray-300 shrink-0" style={{ background: i.color || 'transparent' }} title={i.color ? 'cor no desenho' : 'cores originais'} />
                    <button onClick={() => setSel(i.keys)} title="Selecionar no desenho" className="flex-1 min-w-0 text-left">
                      <span className="block text-xs font-medium text-gray-800 truncate">{describe(i)}</span>
                      <span className="block text-[10px] text-gray-400 truncate">{[i.mounting, i.power, i.light].filter(Boolean).join(' · ') || 'sem especificações'}</span>
                    </button>
                    <b className="text-xs text-gray-800 whitespace-nowrap">{qtyLabel(i)}</b>
                    <button onClick={() => openSpecs(i.keys)} className="text-[10px] text-brand-600 underline">editar</button>
                  </div>
                ))}
              </div>
              {legendShape ? (
                <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-600">
                  <span className="flex-1">Legenda na planta</span>
                  <button onClick={() => patchShape(legendShape.id, x => ({ ...x, h: (x.h ?? 0.2) / 1.25 }))} className="border border-gray-200 rounded px-2" title="Diminuir">A−</button>
                  <button onClick={() => patchShape(legendShape.id, x => ({ ...x, h: (x.h ?? 0.2) * 1.25 }))} className="border border-gray-200 rounded px-2" title="Aumentar">A+</button>
                  <button onClick={() => setSel(['s' + legendShape.id])} className="text-brand-600 underline">selecionar</button>
                  <button onClick={() => { commit(deleteKeys(ed, ['s' + legendShape.id])); setSel([]) }} className="text-gray-400 hover:text-red-500 underline">remover</button>
                </div>
              ) : (
                <button onClick={insertLegend} disabled={!items.length} className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg py-1.5 disabled:opacity-40"><Table className="w-3.5 h-3.5" /> Inserir legenda na planta</button>
              )}
            </section>

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
