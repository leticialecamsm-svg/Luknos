'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import {
  createEnvironment, updateEnvironment, deleteEnvironment,
  createLegendItem, updateLegendItem, deleteLegendItem,
  createSymbolOccurrence, updateSymbolOccurrence, deleteSymbolOccurrence,
  createMeasurement, updateMeasurement, deleteMeasurement,
  createAnnotation, deleteAnnotation, updatePlanScale,
} from '@/lib/project-reading/actions'
import { pointInPolygon, polylineLength, computeScaleMetersPerPixel, type Point } from '@/lib/project-reading/geometry'
import { calcularFita, calcularPlanoDeCorte, round2, type TrechoNecessario } from '@/lib/project-reading/calculations'
import { cn } from '@/lib/utils'
import {
  ZoomIn, ZoomOut, Maximize, ChevronLeft, ChevronRight, MousePointer2, Shapes, Ruler,
  Lightbulb, Ruler as RulerCalib, Square, Pencil, Type, Trash2, Loader2, Undo2,
} from 'lucide-react'

// O worker fica em /public (fora do bundle do webpack) porque o Terser do
// build de produção quebra ao tentar minificar o .mjs do pdfjs-dist como se
// fosse um asset comum — servir como arquivo estático evita esse pipeline.
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
}

// ── Tipos ─────────────────────────────────────────────────────────────────

type Tool = 'select' | 'ambiente' | 'medir-perfil' | 'medir-fita' | 'simbolo' | 'calibrar' | 'anot-retangulo' | 'anot-livre' | 'anot-texto'

interface Environment { id: string; page: number; name: string; polygon: Point[]; origin: string; status: string }
interface LegendItem { id: string; code: string; description?: string | null; power_w?: number | null; color_temp_k?: number | null; lumen_flux?: number | null; finish?: string | null; notes?: string | null }
interface SymbolOccurrence { id: string; page: number; x: number; y: number; legend_item_id: string | null; environment_id: string | null; status: string }
interface Measurement { id: string; page: number; kind: 'perfil' | 'fita'; label: string | null; points: Point[]; length_m: number; power_w_per_m: number | null; environment_id: string | null }
interface Annotation { id: string; page: number; kind: 'freehand' | 'rect' | 'highlight' | 'text'; data: any }

interface Plan { id: string; name: string; num_pages: number; pdfUrl: string; scale_m_per_px: Record<string, number> }

const TOOLS: { id: Tool; label: string; icon: any }[] = [
  { id: 'select', label: 'Selecionar', icon: MousePointer2 },
  { id: 'ambiente', label: 'Ambiente', icon: Shapes },
  { id: 'simbolo', label: 'Símbolo', icon: Lightbulb },
  { id: 'medir-perfil', label: 'Medir perfil', icon: Ruler },
  { id: 'medir-fita', label: 'Medir fita', icon: Ruler },
  { id: 'calibrar', label: 'Calibrar escala', icon: RulerCalib },
  { id: 'anot-retangulo', label: 'Retângulo', icon: Square },
  { id: 'anot-livre', label: 'Desenho livre', icon: Pencil },
  { id: 'anot-texto', label: 'Texto', icon: Type },
]

const ENV_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#ef4444', '#84cc16']

export function ProjectReadingWorkspace({ plan, environments: initEnvs, legendItems: initLegend, symbols: initSymbols, measurements: initMeasurements, annotations: initAnnotations }: {
  plan: Plan; environments: Environment[]; legendItems: LegendItem[]
  symbols: SymbolOccurrence[]; measurements: Measurement[]; annotations: Annotation[]
}) {
  const [tab, setTab] = useState<'ambientes' | 'legenda' | 'medicoes' | 'resultado'>('ambientes')
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

  useEffect(() => { resetDrafts() }, [tool])

  async function handleCanvasClick(e: React.MouseEvent) {
    const p = toBase(e)
    if (tool === 'ambiente' || tool === 'medir-perfil' || tool === 'medir-fita' || tool === 'calibrar') {
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
        if (res?.data) setAnnotations(prev => [...prev, res.data])
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
        if (res?.data) setEnvironments(prev => [...prev, res.data])
        setBusy(false)
      }
      resetDrafts()
      return
    }
    if ((tool === 'medir-perfil' || tool === 'medir-fita') && draftPoints.length >= 2) {
      if (!scale) {
        window.alert('Calibre a escala desta página primeiro (ferramenta "Calibrar escala").')
        resetDrafts()
        return
      }
      const lengthM = round2(polylineLength(draftPoints) * scale)
      const kind = tool === 'medir-perfil' ? 'perfil' : 'fita'
      const envMatch = environments.find(env => env.page === pageNum && pointInPolygon(draftPoints[0], env.polygon))
      const countSameKind = measurements.filter(m => m.kind === kind).length
      setBusy(true)
      const res = await createMeasurement(plan.id, {
        page: pageNum, kind, label: `${kind === 'perfil' ? 'Perfil' : 'Fita'} ${countSameKind + 1}`,
        points: draftPoints, length_m: lengthM, environment_id: envMatch?.id ?? null,
        power_w_per_m: kind === 'fita' ? 0 : undefined,
      })
      if (res?.data) setMeasurements(prev => [...prev, res.data])
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
        if (res?.data) setAnnotations(prev => [...prev, res.data])
        setBusy(false)
      }
      setRectStart(null); setRectCur(null)
    }
    if (tool === 'anot-livre' && drawingFreehand) {
      setDrawingFreehand(false)
      if (draftFreehand.length > 2) {
        setBusy(true)
        const res = await createAnnotation(plan.id, { page: pageNum, kind: 'freehand', data: { points: draftFreehand } })
        if (res?.data) setAnnotations(prev => [...prev, res.data])
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
    if (res?.data) setSymbols(prev => [...prev, res.data])
    setBusy(false)
    setPendingSymbol(null)
  }

  async function removeAnnotation(id: string) {
    setAnnotations(prev => prev.filter(a => a.id !== id))
    await deleteAnnotation(plan.id, id)
  }
  async function undoLastAnnotation() {
    const last = pagePoints.annotations[pagePoints.annotations.length - 1]
    if (last) await removeAnnotation(last.id)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const draftPolygonScreen = draftPoints.map(toScreen)
  const draftFreehandScreen = draftFreehand.map(toScreen)

  return (
    <div className="flex h-full gap-4">
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
            {pagePoints.annotations.length > 0 && (
              <button onClick={undoLastAnnotation} title="Desfazer última anotação" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200">
                <Undo2 className="w-4 h-4" />
              </button>
            )}
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
            {(tool === 'medir-perfil' || tool === 'medir-fita') && `Clique nos pontos do trecho a medir e dê dois cliques pra concluir.${!scale ? ' Escala não calibrada nesta página ainda.' : ''}`}
            {tool === 'calibrar' && 'Clique em dois pontos de distância real conhecida na planta e finalize com um duplo clique.'}
            {tool === 'simbolo' && 'Clique no ponto onde tem uma luminária pra marcar a ocorrência.'}
            {tool === 'anot-retangulo' && 'Clique e arraste pra desenhar um retângulo.'}
            {tool === 'anot-livre' && 'Clique e arraste pra desenhar livremente.'}
            {tool === 'anot-texto' && 'Clique onde quer inserir o texto.'}
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
                  stroke={ENV_COLORS[i % ENV_COLORS.length]} strokeWidth={2}
                />
              ))}
              {/* Rótulo do ambiente no centroide */}
              {pagePoints.environments.map((env, i) => {
                const cx = env.polygon.reduce((s, p) => s + p[0], 0) / env.polygon.length
                const cy = env.polygon.reduce((s, p) => s + p[1], 0) / env.polygon.length
                const [sx, sy] = toScreen([cx, cy])
                return (
                  <text key={env.id + '-label'} x={sx} y={sy} textAnchor="middle"
                    fontSize={12} fontWeight={700} fill={ENV_COLORS[i % ENV_COLORS.length]} stroke="white" strokeWidth={3} paintOrder="stroke">
                    {env.name}
                  </text>
                )
              })}
              {/* Polígono/polilinha em desenho */}
              {draftPoints.length > 0 && (tool === 'ambiente'
                ? <polygon points={draftPolygonScreen.map(p => p.join(',')).join(' ')} fill="#f5940022" stroke="#f59400" strokeWidth={2} strokeDasharray="4 3" />
                : <polyline points={draftPolygonScreen.map(p => p.join(',')).join(' ')} fill="none" stroke="#f59400" strokeWidth={2} strokeDasharray="4 3" />
              )}
              {draftPoints.map((p, i) => { const [sx, sy] = toScreen(p); return <circle key={i} cx={sx} cy={sy} r={3.5} fill="#f59400" /> })}

              {/* Medições */}
              {pagePoints.measurements.map(m => (
                <polyline key={m.id} points={m.points.map(toScreen).map(p => p.join(',')).join(' ')}
                  fill="none" stroke={m.kind === 'fita' ? '#ec4899' : '#0ea5e9'} strokeWidth={3} strokeLinecap="round" />
              ))}

              {/* Símbolos */}
              {pagePoints.symbols.map(s => {
                const [sx, sy] = toScreen([s.x, s.y])
                const code = legendItems.find(li => li.id === s.legend_item_id)?.code ?? '?'
                return (
                  <g key={s.id}>
                    <circle cx={sx} cy={sy} r={9} fill="#7c3aed" stroke="white" strokeWidth={1.5} />
                    <text x={sx} y={sy + 3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="white">{code}</text>
                  </g>
                )
              })}

              {/* Anotações */}
              {pagePoints.annotations.map(a => {
                if (a.kind === 'rect') { const [sx, sy] = toScreen([a.data.x, a.data.y]); return <rect key={a.id} x={sx} y={sy} width={a.data.width * renderScale} height={a.data.height * renderScale} fill="none" stroke="#dc2626" strokeWidth={2} />}
                if (a.kind === 'freehand') return <polyline key={a.id} points={(a.data.points as Point[]).map(toScreen).map(p => p.join(',')).join(' ')} fill="none" stroke="#dc2626" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                if (a.kind === 'text') { const [sx, sy] = toScreen([a.data.x, a.data.y]); return <text key={a.id} x={sx} y={sy} fontSize={13} fontWeight={600} fill="#dc2626">{a.data.text}</text> }
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

      {/* Painel lateral */}
      <div className="w-96 shrink-0 flex flex-col bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-100">
          {(['ambientes', 'legenda', 'medicoes', 'resultado'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('flex-1 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors',
                tab === t ? 'text-brand-600 border-b-2 border-brand-600' : 'text-gray-400 hover:text-gray-600')}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'ambientes' && (
            <AmbientesTab environments={environments} symbols={symbols} legendItems={legendItems}
              onRename={async (id, name) => { setEnvironments(prev => prev.map(e => e.id === id ? { ...e, name } : e)); await updateEnvironment(plan.id, id, { name }) }}
              onDelete={async id => { setEnvironments(prev => prev.filter(e => e.id !== id)); await deleteEnvironment(plan.id, id) }}
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
              onUpdate={(id, updates) => setMeasurements(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m))}
              onDelete={async id => { setMeasurements(prev => prev.filter(m => m.id !== id)); await deleteMeasurement(plan.id, id) }}
              busy={busy}
            />
          )}
          {tab === 'resultado' && (
            <ResultadoTab environments={environments} legendItems={legendItems} symbols={symbols} measurements={measurements} />
          )}
        </div>
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

// ── Aba: Medições (perfil / fita + plano de corte) ───────────────────────────

function MedicoesTab({ planId, measurements, environments, onUpdate, onDelete, busy }: {
  planId: string; measurements: Measurement[]; environments: Environment[]
  onUpdate: (id: string, updates: Partial<Measurement>) => void; onDelete: (id: string) => void; busy: boolean
}) {
  const [comercialPerfil, setComercialPerfil] = useState('3')
  const [comercialFita, setComercialFita] = useState('5')

  const perfis = measurements.filter(m => m.kind === 'perfil')
  const fitas = measurements.filter(m => m.kind === 'fita')

  async function changePotencia(id: string, value: string) {
    const w = Number(value.replace(',', '.')) || 0
    onUpdate(id, { power_w_per_m: w })
    await updateMeasurement(planId, id, { power_w_per_m: w })
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
                <p key={m.id} className="text-xs text-gray-500">{m.kind === 'perfil' ? 'Perfil' : 'Fita'} {m.label} — {m.length_m.toFixed(2)}m</p>
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
