'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import {
  createEnvironment, updateEnvironment, deleteEnvironment,
  createLegendItem, updateLegendItem, deleteLegendItem,
  createSymbolOccurrence, updateSymbolOccurrence, deleteSymbolOccurrence,
  createMeasurement, updateMeasurement, deleteMeasurement,
  createAnnotation, deleteAnnotation, updatePlanScale, restoreRow,
} from '@/lib/project-reading/actions'
import { pointInPolygon, polylineLength, distance, computeScaleMetersPerPixel, type Point } from '@/lib/project-reading/geometry'
import { calcularFita, calcularPlanoDeCorte, round2, type TrechoNecessario } from '@/lib/project-reading/calculations'
import { cn } from '@/lib/utils'
import {
  ZoomIn, ZoomOut, Maximize, ChevronLeft, ChevronRight, MousePointer2, Shapes, Ruler,
  Lightbulb, Square, Pencil, Type, Trash2, Loader2, Undo2, Redo2, PanelRightClose, PanelRightOpen,
} from 'lucide-react'

// O worker fica em /public (fora do bundle do webpack) porque o Terser do
// build de produção quebra ao tentar minificar o .mjs do pdfjs-dist como se
// fosse um asset comum — servir como arquivo estático evita esse pipeline.
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
}

// ── Tipos ─────────────────────────────────────────────────────────────────

type Tool = 'select' | 'ambiente' | 'medir' | 'medir-perfil' | 'medir-fita' | 'simbolo' | 'calibrar' | 'anot-retangulo' | 'anot-livre' | 'anot-texto'
type MeasureKind = 'perfil' | 'fita' | 'medida'
type EntityKind = 'environment' | 'symbol' | 'measurement' | 'annotation'

interface Environment { id: string; page: number; name: string; polygon: Point[]; origin: string; status: string }
interface LegendItem { id: string; code: string; description?: string | null; power_w?: number | null; color_temp_k?: number | null; lumen_flux?: number | null; finish?: string | null; notes?: string | null }
interface SymbolOccurrence { id: string; page: number; x: number; y: number; legend_item_id: string | null; environment_id: string | null; status: string }
interface Measurement { id: string; page: number; kind: MeasureKind; label: string | null; points: Point[]; length_m: number; power_w_per_m: number | null; environment_id: string | null }
interface Annotation { id: string; page: number; kind: 'freehand' | 'rect' | 'highlight' | 'text'; data: any }

interface Plan { id: string; name: string; num_pages: number; pdfUrl: string; scale_m_per_px: Record<string, number> }

const TOOLS: { id: Tool; label: string; icon: any }[] = [
  { id: 'select', label: 'Selecionar', icon: MousePointer2 },
  { id: 'ambiente', label: 'Ambiente', icon: Shapes },
  { id: 'simbolo', label: 'Símbolo', icon: Lightbulb },
  { id: 'medir', label: 'Medir', icon: Ruler },
  { id: 'medir-perfil', label: 'Medir perfil', icon: Ruler },
  { id: 'medir-fita', label: 'Medir fita', icon: Ruler },
  { id: 'calibrar', label: 'Calibrar escala', icon: Ruler },
  { id: 'anot-retangulo', label: 'Retângulo', icon: Square },
  { id: 'anot-livre', label: 'Desenho livre', icon: Pencil },
  { id: 'anot-texto', label: 'Texto', icon: Type },
]

const ENV_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#ef4444', '#84cc16']
const MEASURE_COLOR: Record<MeasureKind, string> = { perfil: '#0ea5e9', fita: '#ec4899', medida: '#f97316' }
const MEASURE_LABEL: Record<MeasureKind, string> = { perfil: 'Perfil', fita: 'Fita', medida: 'Medida' }

type Selection = { kind: EntityKind; id: string } | null
type HistoryEntry = { label: string; undo: () => Promise<void>; redo: () => Promise<void> }

export function ProjectReadingWorkspace({ plan, environments: initEnvs, legendItems: initLegend, symbols: initSymbols, measurements: initMeasurements, annotations: initAnnotations }: {
  plan: Plan; environments: Environment[]; legendItems: LegendItem[]
  symbols: SymbolOccurrence[]; measurements: Measurement[]; annotations: Annotation[]
}) {
  const [tab, setTab] = useState<'ambientes' | 'legenda' | 'medicoes' | 'resultado'>('ambientes')
  const [panelOpen, setPanelOpen] = useState(true)
  const [tool, setTool] = useState<Tool>('select')
  const [pageNum, setPageNum] = useState(1)
  const [renderScale, setRenderScale] = useState(1.4)
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [rendering, setRendering] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 })

  const [environments, setEnvironments] = useState<Environment[]>(initEnvs)
  const [legendItems, setLegendItems] = useState<LegendItem[]>(initLegend)
  const [symbols, setSymbols] = useState<SymbolOccurrence[]>(initSymbols)
  const [measurements, setMeasurements] = useState<Measurement[]>(initMeasurements)
  const [annotations, setAnnotations] = useState<Annotation[]>(initAnnotations)
  const [scaleMap, setScaleMap] = useState<Record<string, number>>(plan.scale_m_per_px ?? {})

  const [draftPoints, setDraftPoints] = useState<Point[]>([])
  const [draftFreehand, setDraftFreehand] = useState<Point[]>([])
  const [drawingFreehand, setDrawingFreehand] = useState(false)
  const [rectStart, setRectStart] = useState<Point | null>(null)
  const [rectCur, setRectCur] = useState<Point | null>(null)
  const [pendingSymbol, setPendingSymbol] = useState<Point | null>(null)
  const [busy, setBusy] = useState(false)
  const [selection, setSelection] = useState<Selection>(null)

  // ── Undo/redo genérico ──────────────────────────────────────────────────
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([])
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([])

  function pushHistory(entry: HistoryEntry) {
    setUndoStack(prev => [...prev, entry])
    setRedoStack([])
  }
  // Não usa a forma funcional do setState pra disparar o efeito colateral
  // (entry.undo()/redo() chamam server actions) — isso rodaria em fase de
  // render e poderia duplicar em StrictMode. Lê o array normalmente: como
  // undo/redo só são chamados por evento discreto do usuário (clique,
  // atalho), a closure recriada a cada render já reflete o estado atual.
  async function undo() {
    if (undoStack.length === 0) return
    const entry = undoStack[undoStack.length - 1]
    setUndoStack(prev => prev.slice(0, -1))
    setRedoStack(prev => [...prev, entry])
    await entry.undo()
  }
  async function redo() {
    if (redoStack.length === 0) return
    const entry = redoStack[redoStack.length - 1]
    setRedoStack(prev => prev.slice(0, -1))
    setUndoStack(prev => [...prev, entry])
    await entry.redo()
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if (!typing && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo(); else undo()
      }
      if (!typing && (e.key === 'Delete' || e.key === 'Backspace') && selection) {
        e.preventDefault()
        deleteSelected()
      }
      if (!typing && e.key === 'Escape') setSelection(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, undo, redo])

  // ── Entidades desenhadas no PDF: acesso genérico (delete/restore/undo) ────

  function entityState(kind: EntityKind) {
    switch (kind) {
      case 'environment': return { list: environments as any[], set: setEnvironments as any, table: 'plan_environments' as const, del: deleteEnvironment }
      case 'symbol': return { list: symbols as any[], set: setSymbols as any, table: 'plan_symbol_occurrences' as const, del: deleteSymbolOccurrence }
      case 'measurement': return { list: measurements as any[], set: setMeasurements as any, table: 'plan_measurements' as const, del: deleteMeasurement }
      case 'annotation': return { list: annotations as any[], set: setAnnotations as any, table: 'plan_annotations' as const, del: deleteAnnotation }
    }
  }

  function pushCreateHistory(kind: EntityKind, row: any) {
    const { set, table, del } = entityState(kind)
    pushHistory({
      label: `criar ${kind}`,
      undo: async () => { set((prev: any[]) => prev.filter(x => x.id !== row.id)); await del(plan.id, row.id) },
      redo: async () => { set((prev: any[]) => [...prev, row]); await restoreRow(table, row) },
    })
  }

  async function deleteEntity(kind: EntityKind, id: string) {
    const { list, set, table, del } = entityState(kind)
    const row = list.find(x => x.id === id)
    if (!row) return
    set((prev: any[]) => prev.filter(x => x.id !== id))
    await del(plan.id, id)
    pushHistory({
      label: `excluir ${kind}`,
      undo: async () => { set((prev: any[]) => [...prev, row]); await restoreRow(table, row) },
      redo: async () => { set((prev: any[]) => prev.filter(x => x.id !== id)); await del(plan.id, id) },
    })
  }

  function updateEntity(kind: EntityKind, id: string, before: Record<string, unknown>, after: Record<string, unknown>, updateFn: (planId: string, id: string, updates: any) => Promise<any>) {
    const { set } = entityState(kind)
    set((prev: any[]) => prev.map(x => x.id === id ? { ...x, ...after } : x))
    updateFn(plan.id, id, after)
    pushHistory({
      label: `editar ${kind}`,
      undo: async () => { set((prev: any[]) => prev.map(x => x.id === id ? { ...x, ...before } : x)); await updateFn(plan.id, id, before) },
      redo: async () => { set((prev: any[]) => prev.map(x => x.id === id ? { ...x, ...after } : x)); await updateFn(plan.id, id, after) },
    })
  }

  async function deleteSelected() {
    if (!selection) return
    await deleteEntity(selection.kind, selection.id)
    setSelection(null)
  }

  function selectShape(kind: EntityKind, id: string) {
    if (tool !== 'select') return
    setSelection({ kind, id })
  }

  const scale = scaleMap[String(pageNum)] ?? null
  const pagePoints = useMemo(() => ({
    environments: environments.filter(e => e.page === pageNum),
    symbols: symbols.filter(s => s.page === pageNum),
    measurements: measurements.filter(m => m.page === pageNum),
    annotations: annotations.filter(a => a.page === pageNum),
  }), [environments, symbols, measurements, annotations, pageNum])

  // ── Carrega e renderiza o PDF ─────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    setRendering(true)
    pdfjsLib.getDocument(plan.pdfUrl).promise.then(doc => { if (!cancelled) setPdfDoc(doc) })
    return () => { cancelled = true }
  }, [plan.pdfUrl])

  useEffect(() => {
    if (!pdfDoc) return
    let cancelled = false
    setRendering(true)
    pdfDoc.getPage(pageNum).then((page: any) => {
      const viewport = page.getViewport({ scale: renderScale })
      const canvas = canvasRef.current
      if (!canvas || cancelled) return
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
      page.render({ canvasContext: ctx, viewport }).promise.then(() => {
        if (!cancelled) { setPageSize({ width: viewport.width, height: viewport.height }); setRendering(false) }
      })
    })
    return () => { cancelled = true }
  }, [pdfDoc, pageNum, renderScale])

  function fitToScreen() {
    const container = canvasRef.current?.parentElement?.parentElement
    if (!container || !pdfDoc) return
    pdfDoc.getPage(pageNum).then((page: any) => {
      const base = page.getViewport({ scale: 1 })
      const targetWidth = container.clientWidth - 32
      setRenderScale(Math.max(0.3, targetWidth / base.width))
    })
  }

  // ── Coordenadas: tela → espaço base do PDF (scale 1), independente de zoom ─

  function toBase(e: React.MouseEvent): Point {
    const rect = canvasRef.current!.getBoundingClientRect()
    const px = (e.clientX - rect.left) * (canvasRef.current!.width / rect.width)
    const py = (e.clientY - rect.top) * (canvasRef.current!.height / rect.height)
    return [px / renderScale, py / renderScale]
  }
  function toScreen([x, y]: Point): Point { return [x * renderScale, y * renderScale] }

  // ── Interações do canvas ──────────────────────────────────────────────────

  function resetDrafts() { setDraftPoints([]); setDraftFreehand([]); setRectStart(null); setRectCur(null); setPendingSymbol(null) }

  useEffect(() => { resetDrafts(); setSelection(null) }, [tool])

  const MEASURE_TOOLS: Tool[] = ['medir', 'medir-perfil', 'medir-fita']

  async function handleCanvasClick(e: React.MouseEvent) {
    if (tool === 'select') { setSelection(null); return }
    const p = toBase(e)
    if (tool === 'ambiente' || MEASURE_TOOLS.includes(tool) || tool === 'calibrar') {
      setDraftPoints(prev => [...prev, p])
      return
    }
    if (tool === 'simbolo') {
      setPendingSymbol(p)
      return
    }
    if (tool === 'anot-texto') {
      const text = window.prompt('Texto da anotação:')
      if (text) {
        setBusy(true)
        const res = await createAnnotation(plan.id, { page: pageNum, kind: 'text', data: { x: p[0], y: p[1], text } })
        if (res?.data) { setAnnotations(prev => [...prev, res.data]); pushCreateHistory('annotation', res.data) }
        setBusy(false)
      }
      return
    }
  }

  async function handleCanvasDoubleClick() {
    if (tool === 'ambiente' && draftPoints.length >= 3) {
      const name = window.prompt('Nome do ambiente:')
      if (name?.trim()) {
        setBusy(true)
        const res = await createEnvironment(plan.id, { page: pageNum, name: name.trim(), polygon: draftPoints })
        if (res?.data) { setEnvironments(prev => [...prev, res.data]); pushCreateHistory('environment', res.data) }
        setBusy(false)
      }
      resetDrafts()
      return
    }
    if (MEASURE_TOOLS.includes(tool) && draftPoints.length >= 2) {
      if (!scale) {
        window.alert('Calibre a escala desta página primeiro (ferramenta "Calibrar escala").')
        resetDrafts()
        return
      }
      const kind: MeasureKind = tool === 'medir-perfil' ? 'perfil' : tool === 'medir-fita' ? 'fita' : 'medida'
      const lengthM = round2(polylineLength(draftPoints) * scale)
      const envMatch = environments.find(env => env.page === pageNum && pointInPolygon(draftPoints[0], env.polygon))
      const countSameKind = measurements.filter(m => m.kind === kind).length
      setBusy(true)
      const res = await createMeasurement(plan.id, {
        page: pageNum, kind, label: `${MEASURE_LABEL[kind]} ${countSameKind + 1}`,
        points: draftPoints, length_m: lengthM, environment_id: envMatch?.id ?? null,
        power_w_per_m: kind === 'fita' ? 0 : undefined,
      })
      if (res?.data) { setMeasurements(prev => [...prev, res.data]); pushCreateHistory('measurement', res.data) }
      setBusy(false)
      resetDrafts()
      return
    }
    if (tool === 'calibrar' && draftPoints.length >= 2) {
      const distStr = window.prompt('Distância real entre os dois pontos marcados (em metros):')
      const dist = distStr ? Number(distStr.replace(',', '.')) : NaN
      if (dist > 0) {
        try {
          const mpp = computeScaleMetersPerPixel(draftPoints[0], draftPoints[1], dist)
          setBusy(true)
          await updatePlanScale(plan.id, pageNum, mpp)
          setScaleMap(prev => ({ ...prev, [String(pageNum)]: mpp }))
          setBusy(false)
        } catch (err: any) {
          window.alert(err.message)
        }
      }
      resetDrafts()
      return
    }
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (tool === 'select') return
    const p = toBase(e)
    if (tool === 'anot-retangulo') { setRectStart(p); setRectCur(p) }
    if (tool === 'anot-livre') { setDrawingFreehand(true); setDraftFreehand([p]) }
  }
  function handleMouseMove(e: React.MouseEvent) {
    const p = toBase(e)
    if (tool === 'anot-retangulo' && rectStart) setRectCur(p)
    if (tool === 'anot-livre' && drawingFreehand) setDraftFreehand(prev => [...prev, p])
  }
  async function handleMouseUp() {
    if (tool === 'anot-retangulo' && rectStart && rectCur) {
      const x = Math.min(rectStart[0], rectCur[0]), y = Math.min(rectStart[1], rectCur[1])
      const width = Math.abs(rectCur[0] - rectStart[0]), height = Math.abs(rectCur[1] - rectStart[1])
      if (width > 2 && height > 2) {
        setBusy(true)
        const res = await createAnnotation(plan.id, { page: pageNum, kind: 'rect', data: { x, y, width, height } })
        if (res?.data) { setAnnotations(prev => [...prev, res.data]); pushCreateHistory('annotation', res.data) }
        setBusy(false)
      }
      setRectStart(null); setRectCur(null)
    }
    if (tool === 'anot-livre' && drawingFreehand) {
      setDrawingFreehand(false)
      if (draftFreehand.length > 2) {
        setBusy(true)
        const res = await createAnnotation(plan.id, { page: pageNum, kind: 'freehand', data: { points: draftFreehand } })
        if (res?.data) { setAnnotations(prev => [...prev, res.data]); pushCreateHistory('annotation', res.data) }
        setBusy(false)
      }
      setDraftFreehand([])
    }
  }

  async function confirmSymbol(legendItemId: string) {
    if (!pendingSymbol) return
    const envMatch = environments.find(env => env.page === pageNum && pointInPolygon(pendingSymbol, env.polygon))
    setBusy(true)
    const res = await createSymbolOccurrence(plan.id, {
      page: pageNum, x: pendingSymbol[0], y: pendingSymbol[1],
      legend_item_id: legendItemId, environment_id: envMatch?.id ?? null,
    })
    if (res?.data) { setSymbols(prev => [...prev, res.data]); pushCreateHistory('symbol', res.data) }
    setBusy(false)
    setPendingSymbol(null)
  }

  // ── Cota (dimensão estilo AutoCAD) ─────────────────────────────────────────
  // Desenha linhas de extensão + linha de cota deslocada + o comprimento em
  // metros escrito ao lado, por segmento — igual uma cota de projeto.
  function renderCota(points: Point[], color: string, key: string, mScale: number | null, opts?: { selected?: boolean; onClick?: () => void; dashed?: boolean }) {
    const offsetPx = 16
    const segs: JSX.Element[] = []
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1]
      const [sax, say] = toScreen(a)
      const [sbx, sby] = toScreen(b)
      const dx = sbx - sax, dy = sby - say
      const segScreenLen = Math.hypot(dx, dy) || 1
      const nx = -dy / segScreenLen, ny = dx / segScreenLen
      const ox = nx * offsetPx, oy = ny * offsetPx
      const a2x = sax + ox, a2y = say + oy
      const b2x = sbx + ox, b2y = sby + oy
      const segLenM = mScale ? round2(distance(a, b) * mScale) : null
      const midX = (a2x + b2x) / 2, midY = (a2y + b2y) / 2
      let angleDeg = Math.atan2(dy, dx) * 180 / Math.PI
      if (angleDeg > 90 || angleDeg < -90) angleDeg += 180
      segs.push(
        <g key={`${key}-${i}`}>
          <line x1={sax} y1={say} x2={a2x} y2={a2y} stroke={color} strokeWidth={1} opacity={0.5} />
          <line x1={sbx} y1={sby} x2={b2x} y2={b2y} stroke={color} strokeWidth={1} opacity={0.5} />
          <line x1={a2x} y1={a2y} x2={b2x} y2={b2y} stroke={color} strokeWidth={opts?.selected ? 3 : 2}
            strokeDasharray={opts?.dashed ? '4 3' : undefined} />
          {opts?.onClick && (
            <line x1={a2x} y1={a2y} x2={b2x} y2={b2y} stroke="transparent" strokeWidth={14}
              style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); opts.onClick!() }} />
          )}
          {segLenM != null && (
            <text x={midX} y={midY - 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={color}
              stroke="white" strokeWidth={3} paintOrder="stroke" transform={`rotate(${angleDeg} ${midX} ${midY})`}>
              {segLenM.toFixed(2)}m
            </text>
          )}
        </g>
      )
    }
    return <g>{segs}</g>
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const draftPolygonScreen = draftPoints.map(toScreen)
  const draftFreehandScreen = draftFreehand.map(toScreen)
  const isMeasuring = MEASURE_TOOLS.includes(tool)

  return (
    <div className="flex h-full gap-4 min-h-0">
      {/* Viewer */}
      <div className="flex-1 flex flex-col min-w-0 bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 bg-gray-50 flex-wrap">
          {TOOLS.map(t => (
            <button key={t.id} onClick={() => setTool(t.id)} title={t.label}
              className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                tool === t.id ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-200')}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1">
            <button onClick={undo} disabled={undoStack.length === 0} title="Desfazer (Cmd+Z)"
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent">
              <Undo2 className="w-4 h-4" />
            </button>
            <button onClick={redo} disabled={redoStack.length === 0} title="Refazer (Cmd+Shift+Z)"
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-transparent">
              <Redo2 className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-gray-200 mx-1" />
            <button onClick={() => setRenderScale(s => Math.max(0.3, s - 0.2))} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200"><ZoomOut className="w-4 h-4" /></button>
            <button onClick={fitToScreen} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200" title="Ajustar à tela"><Maximize className="w-4 h-4" /></button>
            <button onClick={() => setRenderScale(s => Math.min(4, s + 0.2))} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200"><ZoomIn className="w-4 h-4" /></button>
            {plan.num_pages > 1 && (
              <>
                <button disabled={pageNum <= 1} onClick={() => setPageNum(p => p - 1)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-xs text-gray-500 w-16 text-center">{pageNum} / {plan.num_pages}</span>
                <button disabled={pageNum >= plan.num_pages} onClick={() => setPageNum(p => p + 1)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
              </>
            )}
          </div>
        </div>

        {tool !== 'select' && (
          <div className="px-3 py-1.5 bg-brand-50 text-brand-700 text-xs font-medium border-b border-brand-100">
            {tool === 'ambiente' && 'Clique pra marcar os cantos do ambiente, dê dois cliques (ou clique duas vezes no último ponto) pra fechar o polígono.'}
            {isMeasuring && `Clique nos pontos do trecho a medir e dê dois cliques pra concluir.${!scale ? ' Escala não calibrada nesta página ainda.' : ''}`}
            {tool === 'calibrar' && 'Clique em dois pontos de distância real conhecida na planta e finalize com um duplo clique.'}
            {tool === 'simbolo' && 'Clique no ponto onde tem uma luminária pra marcar a ocorrência.'}
            {tool === 'anot-retangulo' && 'Clique e arraste pra desenhar um retângulo.'}
            {tool === 'anot-livre' && 'Clique e arraste pra desenhar livremente.'}
            {tool === 'anot-texto' && 'Clique onde quer inserir o texto.'}
          </div>
        )}
        {tool === 'select' && selection && (
          <div className="px-3 py-1.5 bg-red-50 text-red-700 text-xs font-medium border-b border-red-100 flex items-center gap-2">
            <span>Selecionado: {selection.kind}.</span>
            <button onClick={deleteSelected} className="flex items-center gap-1 font-semibold hover:underline">
              <Trash2 className="w-3 h-3" /> Excluir (ou tecla Delete)
            </button>
            <button onClick={() => setSelection(null)} className="text-red-400 hover:text-red-600 ml-auto">Cancelar (Esc)</button>
          </div>
        )}

        {pendingSymbol && (
          <div className="px-3 py-2 bg-violet-50 border-b border-violet-100 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-violet-700">Qual símbolo da legenda?</span>
            {legendItems.length === 0 && <span className="text-xs text-gray-500">Cadastre pelo menos um item na aba Legenda primeiro.</span>}
            {legendItems.map(li => (
              <button key={li.id} onClick={() => confirmSymbol(li.id)}
                className="text-xs font-semibold px-2 py-1 rounded-md bg-white border border-violet-200 text-violet-700 hover:bg-violet-100">
                {li.code}
              </button>
            ))}
            <button onClick={() => setPendingSymbol(null)} className="text-xs text-gray-400 hover:text-gray-600 ml-auto">Cancelar</button>
          </div>
        )}

        {/* Canvas + overlay */}
        <div className="flex-1 overflow-auto bg-gray-100 p-4">
          <div className="relative inline-block" style={{ width: pageSize.width, height: pageSize.height }}>
            <canvas ref={canvasRef} className="block shadow-md" />
            {rendering && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            )}
            <svg
              width={pageSize.width} height={pageSize.height}
              className="absolute inset-0"
              style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}
              onClick={handleCanvasClick}
              onDoubleClick={handleCanvasDoubleClick}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              {/* Ambientes confirmados */}
              {pagePoints.environments.map((env, i) => (
                <polygon key={env.id}
                  points={env.polygon.map(toScreen).map(p => p.join(',')).join(' ')}
                  fill={ENV_COLORS[i % ENV_COLORS.length] + '22'}
                  stroke={ENV_COLORS[i % ENV_COLORS.length]}
                  strokeWidth={selection?.kind === 'environment' && selection.id === env.id ? 4 : 2}
                  style={{ cursor: tool === 'select' ? 'pointer' : undefined }}
                  onClick={e => { e.stopPropagation(); selectShape('environment', env.id) }}
                />
              ))}
              {/* Rótulo do ambiente no centroide */}
              {pagePoints.environments.map((env, i) => {
                const cx = env.polygon.reduce((s, p) => s + p[0], 0) / env.polygon.length
                const cy = env.polygon.reduce((s, p) => s + p[1], 0) / env.polygon.length
                const [sx, sy] = toScreen([cx, cy])
                return (
                  <text key={env.id + '-label'} x={sx} y={sy} textAnchor="middle" pointerEvents="none"
                    fontSize={12} fontWeight={700} fill={ENV_COLORS[i % ENV_COLORS.length]} stroke="white" strokeWidth={3} paintOrder="stroke">
                    {env.name}
                  </text>
                )
              })}
              {/* Polígono/polilinha em desenho (ambiente ou calibração) */}
              {draftPoints.length > 0 && !isMeasuring && (tool === 'ambiente'
                ? <polygon points={draftPolygonScreen.map(p => p.join(',')).join(' ')} fill="#f5940022" stroke="#f59400" strokeWidth={2} strokeDasharray="4 3" />
                : <polyline points={draftPolygonScreen.map(p => p.join(',')).join(' ')} fill="none" stroke="#f59400" strokeWidth={2} strokeDasharray="4 3" />
              )}
              {/* Cota da medição em desenho (preview ao vivo) */}
              {draftPoints.length > 0 && isMeasuring && renderCota(draftPoints, '#f59400', 'draft-medida', scale, { dashed: true })}
              {draftPoints.map((p, i) => { const [sx, sy] = toScreen(p); return <circle key={i} cx={sx} cy={sy} r={3.5} fill="#f59400" /> })}

              {/* Medições — sempre como cota (linha de extensão + medida em metros) */}
              {pagePoints.measurements.map(m => (
                <g key={m.id}>
                  {renderCota(m.points, MEASURE_COLOR[m.kind], m.id, scale, {
                    selected: selection?.kind === 'measurement' && selection.id === m.id,
                    onClick: () => selectShape('measurement', m.id),
                  })}
                </g>
              ))}

              {/* Símbolos */}
              {pagePoints.symbols.map(s => {
                const [sx, sy] = toScreen([s.x, s.y])
                const code = legendItems.find(li => li.id === s.legend_item_id)?.code ?? '?'
                const selected = selection?.kind === 'symbol' && selection.id === s.id
                return (
                  <g key={s.id} style={{ cursor: tool === 'select' ? 'pointer' : undefined }} onClick={e => { e.stopPropagation(); selectShape('symbol', s.id) }}>
                    <circle cx={sx} cy={sy} r={selected ? 11 : 9} fill="#7c3aed" stroke="white" strokeWidth={selected ? 2.5 : 1.5} />
                    <text x={sx} y={sy + 3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="white" pointerEvents="none">{code}</text>
                  </g>
                )
              })}

              {/* Anotações */}
              {pagePoints.annotations.map(a => {
                const selected = selection?.kind === 'annotation' && selection.id === a.id
                const onSel = (e: React.MouseEvent) => { e.stopPropagation(); selectShape('annotation', a.id) }
                if (a.kind === 'rect') {
                  const [sx, sy] = toScreen([a.data.x, a.data.y])
                  return <rect key={a.id} x={sx} y={sy} width={a.data.width * renderScale} height={a.data.height * renderScale}
                    fill="transparent" stroke="#dc2626" strokeWidth={selected ? 3 : 2}
                    style={{ cursor: tool === 'select' ? 'pointer' : undefined }} onClick={onSel} />
                }
                if (a.kind === 'freehand') {
                  const pts = (a.data.points as Point[]).map(toScreen).map(p => p.join(',')).join(' ')
                  return (
                    <g key={a.id}>
                      <polyline points={pts} fill="none" stroke="#dc2626" strokeWidth={selected ? 3.5 : 2} strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points={pts} fill="none" stroke="transparent" strokeWidth={14} style={{ cursor: tool === 'select' ? 'pointer' : undefined }} onClick={onSel} />
                    </g>
                  )
                }
                if (a.kind === 'text') {
                  const [sx, sy] = toScreen([a.data.x, a.data.y])
                  return <text key={a.id} x={sx} y={sy} fontSize={13} fontWeight={600} fill="#dc2626"
                    style={{ cursor: tool === 'select' ? 'pointer' : undefined }} onClick={onSel}
                    stroke={selected ? '#fecaca' : undefined} strokeWidth={selected ? 4 : undefined} paintOrder="stroke">
                    {a.data.text}
                  </text>
                }
                return null
              })}
              {rectStart && rectCur && (() => {
                const x = Math.min(rectStart[0], rectCur[0]), y = Math.min(rectStart[1], rectCur[1])
                const [sx, sy] = toScreen([x, y])
                return <rect x={sx} y={sy} width={Math.abs(rectCur[0] - rectStart[0]) * renderScale} height={Math.abs(rectCur[1] - rectStart[1]) * renderScale} fill="none" stroke="#dc2626" strokeDasharray="4 3" strokeWidth={2} />
              })()}
              {draftFreehand.length > 1 && <polyline points={draftFreehandScreen.map(p => p.join(',')).join(' ')} fill="none" stroke="#dc2626" strokeWidth={2} strokeLinecap="round" />}
            </svg>
          </div>
        </div>
      </div>

      {/* Painel lateral — recolhível pra dar mais espaço ao PDF */}
      <div className={cn('shrink-0 flex flex-col bg-white rounded-2xl border border-gray-200 overflow-hidden transition-[width] duration-150', panelOpen ? 'w-96' : 'w-11')}>
        <div className="flex items-center border-b border-gray-100">
          {panelOpen && (['ambientes', 'legenda', 'medicoes', 'resultado'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('flex-1 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors',
                tab === t ? 'text-brand-600 border-b-2 border-brand-600' : 'text-gray-400 hover:text-gray-600')}>
              {t}
            </button>
          ))}
          <button onClick={() => setPanelOpen(o => !o)} title={panelOpen ? 'Recolher painel' : 'Expandir painel'}
            className={cn('p-2.5 text-gray-400 hover:text-gray-700 shrink-0', !panelOpen && 'w-full flex justify-center')}>
            {panelOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
        </div>
        {panelOpen && (
          <div className="flex-1 overflow-y-auto p-4">
            {tab === 'ambientes' && (
              <AmbientesTab environments={environments} symbols={symbols} legendItems={legendItems}
                onRename={(id, name) => {
                  const before = environments.find(e => e.id === id)
                  if (before) updateEntity('environment', id, { name: before.name }, { name, status: 'editado' }, updateEnvironment)
                }}
                onDelete={id => deleteEntity('environment', id)}
              />
            )}
            {tab === 'legenda' && (
              <LegendaTab planId={plan.id} items={legendItems}
                onCreate={row => setLegendItems(prev => [...prev, row])}
                onUpdate={(id, updates) => setLegendItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i))}
                onDelete={async id => { setLegendItems(prev => prev.filter(i => i.id !== id)); await deleteLegendItem(plan.id, id) }}
              />
            )}
            {tab === 'medicoes' && (
              <MedicoesTab planId={plan.id} measurements={measurements} environments={environments}
                onUpdate={(id, updates) => {
                  const before = measurements.find(m => m.id === id)
                  if (before) updateEntity('measurement', id, { power_w_per_m: before.power_w_per_m }, updates, updateMeasurement)
                }}
                onDelete={id => deleteEntity('measurement', id)}
                busy={busy}
              />
            )}
            {tab === 'resultado' && (
              <ResultadoTab environments={environments} legendItems={legendItems} symbols={symbols} measurements={measurements} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Aba: Ambientes ──────────────────────────────────────────────────────────

function AmbientesTab({ environments, symbols, legendItems, onRename, onDelete }: {
  environments: Environment[]; symbols: SymbolOccurrence[]; legendItems: LegendItem[]
  onRename: (id: string, name: string) => void; onDelete: (id: string) => void
}) {
  if (environments.length === 0) {
    return <p className="text-xs text-gray-400">Nenhum ambiente ainda. Use a ferramenta "Ambiente" no viewer pra desenhar um polígono sobre a planta.</p>
  }
  return (
    <div className="space-y-3">
      {environments.map(env => {
        const count = symbols.filter(s => s.environment_id === env.id).length
        return (
          <div key={env.id} className="border border-gray-200 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <input defaultValue={env.name} onBlur={e => e.target.value.trim() && e.target.value !== env.name && onRename(env.id, e.target.value.trim())}
                className="flex-1 text-sm font-semibold text-gray-800 outline-none border-b border-transparent focus:border-brand-300" />
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{env.status}</span>
              <button onClick={() => onDelete(env.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <p className="text-xs text-gray-400 mt-1">{count} símbolo(s) marcado(s)</p>
          </div>
        )
      })}
    </div>
  )
}

// ── Aba: Legenda ─────────────────────────────────────────────────────────────

function LegendaTab({ planId, items, onCreate, onUpdate, onDelete }: {
  planId: string; items: LegendItem[]
  onCreate: (row: LegendItem) => void; onUpdate: (id: string, updates: Partial<LegendItem>) => void; onDelete: (id: string) => void
}) {
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [powerW, setPowerW] = useState('')
  const [colorTemp, setColorTemp] = useState('')
  const [saving, setSaving] = useState(false)

  async function add() {
    if (!code.trim()) return
    setSaving(true)
    const res = await createLegendItem(planId, {
      code: code.trim(), description: description.trim() || undefined,
      power_w: powerW ? Number(powerW) : undefined, color_temp_k: colorTemp ? Number(colorTemp) : undefined,
    })
    if (res?.data) onCreate(res.data)
    setCode(''); setDescription(''); setPowerW(''); setColorTemp('')
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <div className="border border-dashed border-gray-300 rounded-xl p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase">Novo item</p>
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Código (L1...)" value={code} onChange={e => setCode(e.target.value)} className="input text-xs !py-1.5" />
          <input placeholder="Potência (W)" value={powerW} onChange={e => setPowerW(e.target.value)} className="input text-xs !py-1.5" />
        </div>
        <input placeholder="Descrição (spot embutido...)" value={description} onChange={e => setDescription(e.target.value)} className="input text-xs !py-1.5 w-full" />
        <input placeholder="Temp. de cor (K)" value={colorTemp} onChange={e => setColorTemp(e.target.value)} className="input text-xs !py-1.5 w-full" />
        <button onClick={add} disabled={saving || !code.trim()} className="btn-primary text-xs w-full justify-center !py-1.5">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Adicionar à legenda'}
        </button>
      </div>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="border border-gray-200 rounded-lg p-2.5 flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-violet-700">{item.code} <span className="font-normal text-gray-600">{item.description}</span></p>
              <p className="text-[11px] text-gray-400">
                {item.power_w ? `${item.power_w}W` : ''}{item.color_temp_k ? ` · ${item.color_temp_k}K` : ''}
                {!item.power_w && !item.color_temp_k && 'sem especificação'}
              </p>
            </div>
            <button onClick={() => onDelete(item.id)} className="text-gray-300 hover:text-red-500 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-gray-400">Nenhum item na legenda ainda.</p>}
      </div>
    </div>
  )
}

// ── Aba: Medições (perfil / fita + plano de corte / medidas soltas) ─────────

function MedicoesTab({ planId, measurements, environments, onUpdate, onDelete, busy }: {
  planId: string; measurements: Measurement[]; environments: Environment[]
  onUpdate: (id: string, updates: Partial<Measurement>) => void; onDelete: (id: string) => void; busy: boolean
}) {
  const [comercialPerfil, setComercialPerfil] = useState('3')
  const [comercialFita, setComercialFita] = useState('5')

  const perfis = measurements.filter(m => m.kind === 'perfil')
  const fitas = measurements.filter(m => m.kind === 'fita')
  const medidas = measurements.filter(m => m.kind === 'medida')

  function changePotencia(id: string, value: string) {
    const w = Number(value.replace(',', '.')) || 0
    onUpdate(id, { power_w_per_m: w })
  }

  function envName(id: string | null) { return environments.find(e => e.id === id)?.name ?? 'Sem ambiente' }

  type PlanoResult = { kind: 'erro'; mensagem: string } | { kind: 'ok'; plano: ReturnType<typeof calcularPlanoDeCorte> } | null

  function planoDeCorte(trechos: Measurement[], comercial: number): PlanoResult {
    if (trechos.length === 0 || comercial <= 0) return null
    const list: TrechoNecessario[] = trechos.map(t => ({ id: t.id, comprimentoM: t.length_m, ambiente: envName(t.environment_id) }))
    const excedentes = list.filter(t => t.comprimentoM > comercial)
    if (excedentes.length > 0) {
      return { kind: 'erro', mensagem: `${excedentes.length} trecho(s) mais longos que a peça comercial de ${comercial}m — ajuste o comercial ou divida o trecho.` }
    }
    return { kind: 'ok', plano: calcularPlanoDeCorte(list, comercial) }
  }

  const planoPerfil = planoDeCorte(perfis, Number(comercialPerfil.replace(',', '.')) || 0)
  const planoFita = planoDeCorte(fitas, Number(comercialFita.replace(',', '.')) || 0)

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-bold text-orange-600 uppercase mb-2">Medidas soltas ({medidas.length})</p>
        <div className="space-y-2">
          {medidas.map(m => (
            <div key={m.id} className="border border-gray-200 rounded-lg p-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-gray-700">{m.label} · {envName(m.environment_id)}</p>
                <p className="text-xs text-gray-400">{m.length_m.toFixed(2)} m</p>
              </div>
              <button onClick={() => onDelete(m.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          {medidas.length === 0 && <p className="text-xs text-gray-400">Nenhuma medida solta ainda — use a ferramenta "Medir" pra medir qualquer coisa na planta.</p>}
        </div>
      </section>

      <section>
        <p className="text-xs font-bold text-sky-600 uppercase mb-2">Perfis ({perfis.length})</p>
        <div className="space-y-2 mb-3">
          {perfis.map(m => (
            <div key={m.id} className="border border-gray-200 rounded-lg p-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-gray-700">{m.label} · {envName(m.environment_id)}</p>
                <p className="text-xs text-gray-400">{m.length_m.toFixed(2)} m</p>
              </div>
              <button onClick={() => onDelete(m.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          {perfis.length === 0 && <p className="text-xs text-gray-400">Nenhum perfil medido ainda.</p>}
        </div>
        {perfis.length > 0 && (
          <div className="bg-sky-50 rounded-lg p-2.5 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">Barra comercial:</span>
              <input value={comercialPerfil} onChange={e => setComercialPerfil(e.target.value)} className="w-14 text-xs border border-gray-200 rounded px-1.5 py-0.5" /> m
            </div>
            {planoPerfil?.kind === 'erro' && <p className="text-xs text-red-600">{planoPerfil.mensagem}</p>}
            {planoPerfil?.kind === 'ok' && <PlanoDeCorteView plano={planoPerfil.plano} />}
          </div>
        )}
      </section>

      <section>
        <p className="text-xs font-bold text-pink-600 uppercase mb-2">Fitas de LED ({fitas.length})</p>
        <div className="space-y-2 mb-3">
          {fitas.map(m => {
            const calc = calcularFita(m.length_m, m.power_w_per_m ?? 0)
            return (
              <div key={m.id} className="border border-gray-200 rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-700">{m.label} · {envName(m.environment_id)}</p>
                  <button onClick={() => onDelete(m.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <p className="text-xs text-gray-400">{m.length_m.toFixed(2)} m</p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500">Consumo da fita:</span>
                  <input defaultValue={m.power_w_per_m ?? 0} onBlur={e => changePotencia(m.id, e.target.value)}
                    className="w-14 text-xs border border-gray-200 rounded px-1.5 py-0.5" /> W/m
                </div>
                <div className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5">
                  {m.length_m.toFixed(2)}m × {(m.power_w_per_m ?? 0)}W/m = <b>{calc.consumoW}W</b> · com margem de 20%: <b>{calc.fonteMinimaW}W</b>
                  <div className="text-emerald-700 font-semibold mt-0.5">Fonte mínima: {Math.ceil(calc.fonteMinimaW)}W</div>
                </div>
              </div>
            )
          })}
          {fitas.length === 0 && <p className="text-xs text-gray-400">Nenhuma fita medida ainda.</p>}
        </div>
        {fitas.length > 0 && (
          <div className="bg-pink-50 rounded-lg p-2.5 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">Rolo comercial:</span>
              <input value={comercialFita} onChange={e => setComercialFita(e.target.value)} className="w-14 text-xs border border-gray-200 rounded px-1.5 py-0.5" /> m
            </div>
            {planoFita?.kind === 'erro' && <p className="text-xs text-red-600">{planoFita.mensagem}</p>}
            {planoFita?.kind === 'ok' && <PlanoDeCorteView plano={planoFita.plano} />}
          </div>
        )}
      </section>
    </div>
  )
}

function PlanoDeCorteView({ plano }: { plano: ReturnType<typeof calcularPlanoDeCorte> }) {
  return (
    <div className="text-xs space-y-1.5">
      <p><b>{plano.quantidadePecas}</b> peça(s) · sobra total <b>{plano.sobraTotalM}m</b> ({plano.desperdicioPct}% de desperdício)</p>
      <div className="space-y-1">
        {plano.pecas.map(p => (
          <div key={p.pecaIndex} className="bg-white rounded px-2 py-1 border border-gray-100">
            <span className="font-semibold">Peça {p.pecaIndex}:</span>{' '}
            {p.cortes.map(c => `${c.comprimentoM}m (${c.ambiente ?? '—'})`).join(' + ')}
            {' '}<span className="text-gray-400">→ sobra {p.sobraM}m</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Aba: Resultado ────────────────────────────────────────────────────────

function ResultadoTab({ environments, legendItems, symbols, measurements }: {
  environments: Environment[]; legendItems: LegendItem[]; symbols: SymbolOccurrence[]; measurements: Measurement[]
}) {
  const perfis = measurements.filter(m => m.kind === 'perfil')
  const fitas = measurements.filter(m => m.kind === 'fita')
  const totalPerfilM = round2(perfis.reduce((s, m) => s + m.length_m, 0))
  const totalFitaM = round2(fitas.reduce((s, m) => s + m.length_m, 0))
  const totalFonteW = round2(fitas.reduce((s, m) => s + calcularFita(m.length_m, m.power_w_per_m ?? 0).fonteMinimaW, 0))
  const semAmbiente = symbols.filter(s => !s.environment_id).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <StatBox label="Ambientes" value={environments.length} />
        <StatBox label="Pontos de luz" value={symbols.length} />
        <StatBox label="Metros de perfil" value={`${totalPerfilM}m`} />
        <StatBox label="Metros de fita" value={`${totalFitaM}m`} />
        <StatBox label="Fonte mínima total" value={`${Math.ceil(totalFonteW)}W`} />
        <StatBox label="Sem ambiente" value={semAmbiente} warn={semAmbiente > 0} />
      </div>

      <div className="space-y-3">
        {environments.map(env => {
          const envSymbols = symbols.filter(s => s.environment_id === env.id)
          const byCode = new Map<string, number>()
          for (const s of envSymbols) {
            const code = legendItems.find(li => li.id === s.legend_item_id)?.code ?? '?'
            byCode.set(code, (byCode.get(code) ?? 0) + 1)
          }
          const envMeasurements = measurements.filter(m => m.environment_id === env.id)
          return (
            <div key={env.id} className="border border-gray-200 rounded-xl p-3">
              <p className="text-sm font-bold text-gray-800">{env.name}</p>
              {Array.from(byCode.entries()).map(([code, n]) => (
                <p key={code} className="text-xs text-gray-600">{code} — {n} un</p>
              ))}
              {envMeasurements.map(m => (
                <p key={m.id} className="text-xs text-gray-500">{MEASURE_LABEL[m.kind]} {m.label} — {m.length_m.toFixed(2)}m</p>
              ))}
              {byCode.size === 0 && envMeasurements.length === 0 && <p className="text-xs text-gray-400">Nada registrado ainda.</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatBox({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className={cn('rounded-xl p-3 border', warn ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100')}>
      <p className="text-[11px] text-gray-500 uppercase font-semibold">{label}</p>
      <p className={cn('text-lg font-bold', warn ? 'text-amber-600' : 'text-gray-800')}>{value}</p>
    </div>
  )
}
