'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import {
  createEnvironment, updateEnvironment, deleteEnvironment,
  createLegendItem, updateLegendItem, deleteLegendItem,
  createSymbolOccurrence, updateSymbolOccurrence, deleteSymbolOccurrence,
  createMeasurement, updateMeasurement, deleteMeasurement,
  createAnnotation, deleteAnnotation, updateAnnotation, updatePlanScale, updatePlanRotation, updateWorkingPage, restoreRow,
  createPowerSupply, updatePowerSupply, deletePowerSupply,
} from '@/lib/project-reading/actions'
import { pointInPolygon, polylineLength, distance, computeScaleMetersPerPixel, closestPointOnPolyline, type Point } from '@/lib/project-reading/geometry'
import { calcularFita, calcularPlanoDeCorte, round2, sugerirFonte, CATALOGO_FONTES_12V, type TrechoNecessario } from '@/lib/project-reading/calculations'
import { cn } from '@/lib/utils'
import {
  ZoomIn, ZoomOut, Maximize, ChevronLeft, ChevronRight, MousePointer2, Shapes, Ruler,
  Lightbulb, Square, Pencil, Type, Trash2, Loader2, Undo2, Redo2, PanelRightClose, PanelRightOpen,
  RotateCw, X, Layers, Download, Zap, EyeOff, Locate, Copy,
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
type EntityKind = 'environment' | 'symbol' | 'measurement' | 'annotation' | 'powerSupply'

interface Environment { id: string; page: number; name: string; polygon: Point[]; origin: string; status: string }
interface LegendItem {
  id: string; code: string; description?: string | null; power_w?: number | null; color_temp_k?: number | null
  lumen_flux?: number | null; finish?: string | null; notes?: string | null; mount_type?: 'embutir' | 'sobrepor' | null
  has_lamp?: boolean; lamp_name?: string | null; lamp_color_temp_k?: number | null; lamp_angle_deg?: number | null; lamp_qty?: number
}
interface SymbolOccurrence { id: string; page: number; x: number; y: number; legend_item_id: string | null; environment_id: string | null; status: string }
interface Measurement {
  id: string; page: number; kind: MeasureKind; label: string | null; points: Point[]; length_m: number
  power_w_per_m: number | null; environment_id: string | null; linked_measurement_id?: string | null; notes?: string | null
  cota_offset?: number | null
  product_model?: string | null; mount_type?: 'embutir' | 'sobrepor' | null; bar_size?: number | null
  voltage?: '12V' | '24V' | null; packaging?: 'rolo_5m' | 'metro' | null; strand_count?: number | null
  installation_location?: string | null; color_temp_k?: number | null
}
interface Annotation { id: string; page: number; kind: 'freehand' | 'rect' | 'highlight' | 'text'; data: any }
interface PowerSupply { id: string; measurement_id: string; page: number; x: number; y: number; watts: number }

interface Plan {
  id: string; name: string; num_pages: number; pdfUrl: string
  scale_m_per_px: Record<string, number>; page_rotation?: Record<string, number>; working_page?: number
}

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

// Cor determinística a partir de uma chave de produto (ex: modelo do perfil
// + modelo da fita) — a mesma composição sempre cai na mesma cor, e trocar
// qualquer um dos dois já muda pra outra cor, sem precisar de cadastro.
// Paleta curada (não hue contínuo) — com hue aleatório dois produtos podiam
// cair a poucos graus um do outro e ficarem visualmente quase idênticos.
// Uma paleta fixa de cores bem distintas entre si garante contraste mesmo
// com poucos produtos cadastrados.
const DISTINCT_PALETTE = [
  '#e11d48', '#0ea5e9', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#db2777', '#65a30d',
  '#c026d3', '#0284c7', '#ea580c', '#059669', '#9333ea', '#0d9488', '#d97706', '#4f46e5',
]
function productColor(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0
  return DISTINCT_PALETTE[Math.abs(hash) % DISTINCT_PALETTE.length]
}

// Um ponto marcado (símbolo) usa point-in-polygon direto. Já uma medição é
// uma LINHA — testar só o primeiro ponto clicado é frágil, porque é
// justamente o ponto mais comum de cair em cima de uma parede/canto (onde a
// gente sempre começa a medir um perfil), ficando por pouquíssimo fora do
// polígono do ambiente. Considera vinculado se QUALQUER ponto da linha cair
// dentro.
function pointsMatchEnv(points: Point[], polygon: Point[]): boolean {
  return points.some(p => pointInPolygon(p, polygon))
}

// Nota de vínculo perfil↔fita automático, mostrada no card de cada um.
function linkNoteFor(m: Measurement, list: Measurement[]): string | undefined {
  if (m.linked_measurement_id) {
    const parent = list.find(x => x.id === m.linked_measurement_id)
    return parent ? `🔗 metragem repetida do ${parent.label}` : undefined
  }
  const child = list.find(x => x.linked_measurement_id === m.id)
  return child ? `🔗 gerou a ${child.label} automaticamente` : undefined
}
const PIECE_COLORS = ['#0284c7', '#db2777', '#7c3aed', '#059669', '#d97706', '#0891b2', '#65a30d', '#e11d48']
type PlanoResult = { kind: 'erro'; mensagem: string } | { kind: 'ok'; plano: ReturnType<typeof calcularPlanoDeCorte> } | null

// Um grupo de trechos que compartilham modelo+tamanho/embalagem comercial —
// não dá pra misturar barra de perfil de 2m com 3m (nem fita 12V com 24V)
// num mesmo plano de corte, então cada combinação vira seu próprio grupo.
interface GrupoPlano {
  key: string
  groupLabel: string
  trechos: Measurement[]
  comercialM: number | null // null = vendido no metro, sem plano de corte
  plano: PlanoResult
  emendaWarnings: string[] // trechos maiores que a peça comercial, quebrados em partes
}
type PieceBadge = { label: string; color: string; siblings: string[] }

type Selection = { kind: EntityKind; id: string } | null
type HistoryEntry = { label: string; undo: () => Promise<void>; redo: () => Promise<void> }

export function ProjectReadingWorkspace({ plan, environments: initEnvs, legendItems: initLegend, symbols: initSymbols, measurements: initMeasurements, annotations: initAnnotations, powerSupplies: initPowerSupplies }: {
  plan: Plan; environments: Environment[]; legendItems: LegendItem[]
  symbols: SymbolOccurrence[]; measurements: Measurement[]; annotations: Annotation[]; powerSupplies: PowerSupply[]
}) {
  const [tab, setTab] = useState<'ambientes' | 'legenda' | 'medicoes' | 'resultado'>('ambientes')
  const [panelOpen, setPanelOpen] = useState(true)
  const [tool, setTool] = useState<Tool>('select')
  // Abre direto na última página que o consultor deixou selecionada — útil
  // pra PDF de várias páginas onde só uma é a planta luminotécnica.
  const [pageNum, setPageNum] = useState(plan.working_page ?? 1)
  const [renderScale, setRenderScale] = useState(1.4)
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [rendering, setRendering] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 })
  // Viewport atual do pdf.js (zoom + rotação já aplicados) — usado pra
  // converter coordenadas de tela ↔ PDF de forma correta em qualquer
  // rotação, em vez de só dividir/multiplicar pelo zoom.
  const viewportRef = useRef<any>(null)
  // Incrementa toda vez que a página termina de renderizar de verdade no
  // canvas — usado pra saber quando dá pra capturar em alta resolução na
  // exportação (aguardar o zoom temporário terminar de desenhar).
  const renderVersionRef = useRef(0)

  const [environments, setEnvironments] = useState<Environment[]>(initEnvs)
  const [legendItems, setLegendItems] = useState<LegendItem[]>(initLegend)
  const [symbols, setSymbols] = useState<SymbolOccurrence[]>(initSymbols)
  const [measurements, setMeasurements] = useState<Measurement[]>(initMeasurements)
  const [annotations, setAnnotations] = useState<Annotation[]>(initAnnotations)
  const [powerSupplies, setPowerSupplies] = useState<PowerSupply[]>(initPowerSupplies)
  const [scaleMap, setScaleMap] = useState<Record<string, number>>(plan.scale_m_per_px ?? {})
  const [rotationMap, setRotationMap] = useState<Record<string, number>>(plan.page_rotation ?? {})
  const [popoverAnchor, setPopoverAnchor] = useState<{ x: number; y: number } | null>(null)
  // "Visualizar reaproveitamento": visão limpa só com perfil/fita + peça/rolo
  // + onde há corte reaproveitado da mesma peça, escondendo ambiente/símbolo/
  // anotação — pensada pra exportar em PDF pro instalador.
  const [reaproveitamentoView, setReaproveitamentoView] = useState(false)
  // "Visualizar fontes": mostra só as fitas (contexto) + as fontes já
  // posicionadas + o cabo até a fita — escondido por padrão pra não poluir
  // a visão geral (as fontes só aparecem aqui, nunca na visão normal).
  const [fontesView, setFontesView] = useState(false)
  // Ambientes "discretos": some o preenchimento colorido e o contorno
  // tracejado, deixa só o nome em cinza como guia — continua clicável (área
  // invisível), só não fica com aquela pintura toda por cima da planta.
  const [ambientesDiscretos, setAmbientesDiscretos] = useState(false)
  const [draggingAnnotation, setDraggingAnnotation] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null)
  // Arrastar a ponta de uma medição selecionada pra redimensionar.
  const [draggingPoint, setDraggingPoint] = useState<{ measurementId: string; pointIndex: number } | null>(null)
  // Arrastar a própria cota (linha de medida) pro lado, sem alterar o
  // comprimento medido — só o deslocamento visual da linha de cota.
  const [draggingCotaOffset, setDraggingCotaOffset] = useState<{ measurementId: string } | null>(null)
  const [draggingFonte, setDraggingFonte] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const [draggingSymbol, setDraggingSymbol] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null)
  // Empilha badges (Peça/Rolo) que caem perto do mesmo pontinho na planta —
  // sem isso, duas medições que terminam próximas uma da outra (comum em
  // ambientes pequenos) desenhavam os badges um em cima do outro.
  const badgeStackByPoint = useRef(new Map<string, number>()).current
  // Depois de confirmar a potência, aguarda o próximo clique na planta pra
  // saber onde a fonte fica fisicamente (o buraco do forro mais próximo).
  const [pendingFontePlacement, setPendingFontePlacement] = useState<{ measurementId: string; watts: number } | null>(null)
  // Idem, mas pra apontar a seta de uma anotação de texto pra um ponto da planta.
  const [pendingArrowFor, setPendingArrowFor] = useState<string | null>(null)

  const [draftPoints, setDraftPoints] = useState<Point[]>([])
  const [draftFreehand, setDraftFreehand] = useState<Point[]>([])
  const [drawingFreehand, setDrawingFreehand] = useState(false)
  const [rectStart, setRectStart] = useState<Point | null>(null)
  const [rectCur, setRectCur] = useState<Point | null>(null)
  const [pendingSymbol, setPendingSymbol] = useState<Point | null>(null)
  const [pendingSymbolAnchor, setPendingSymbolAnchor] = useState<{ x: number; y: number } | null>(null)
  // "Carimbo" — depois de escolher um produto uma vez, continua marcando
  // esse mesmo produto em cada clique, sem abrir o seletor de novo.
  const [stampLegendItemId, setStampLegendItemId] = useState<string | null>(null)
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

  // Sem array de dependências (roda de novo a cada render) de propósito —
  // o listener precisa sempre fechar sobre o `tool`/`draftPoints`/`selection`
  // atuais; o custo de re-anexar um keydown a cada render é irrelevante.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if (typing) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo(); else undo()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
        e.preventDefault()
        deleteSelected()
        return
      }
      if (e.key === 'Enter' && draftPoints.length > 0) {
        e.preventDefault()
        finalizeDraft()
        return
      }
      if (e.key === 'Escape') {
        setSelection(null)
        resetDrafts()
        setPendingFontePlacement(null)
        setPendingArrowFor(null)
        setStampLegendItemId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  // ── Entidades desenhadas no PDF: acesso genérico (delete/restore/undo) ────

  function entityState(kind: EntityKind) {
    switch (kind) {
      case 'environment': return { list: environments as any[], set: setEnvironments as any, table: 'plan_environments' as const, del: deleteEnvironment }
      case 'symbol': return { list: symbols as any[], set: setSymbols as any, table: 'plan_symbol_occurrences' as const, del: deleteSymbolOccurrence }
      case 'measurement': return { list: measurements as any[], set: setMeasurements as any, table: 'plan_measurements' as const, del: deleteMeasurement }
      case 'annotation': return { list: annotations as any[], set: setAnnotations as any, table: 'plan_annotations' as const, del: deleteAnnotation }
      case 'powerSupply': return { list: powerSupplies as any[], set: setPowerSupplies as any, table: 'plan_power_supplies' as const, del: deletePowerSupply }
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
    // A fonte de uma fita excluída fica órfã no banco (cascade cuida disso
    // lá), mas o estado local não sabe — tira ela da tela também.
    let orphanFonte: PowerSupply | undefined
    if (kind === 'measurement') {
      orphanFonte = powerSupplies.find(ps => ps.measurement_id === id)
      if (orphanFonte) setPowerSupplies(prev => prev.filter(ps => ps.measurement_id !== id))
    }
    await del(plan.id, id)
    pushHistory({
      label: `excluir ${kind}`,
      undo: async () => {
        set((prev: any[]) => [...prev, row])
        await restoreRow(table, row)
        if (orphanFonte) { setPowerSupplies(prev => [...prev, orphanFonte!]); await restoreRow('plan_power_supplies', orphanFonte as any) }
      },
      redo: async () => {
        set((prev: any[]) => prev.filter(x => x.id !== id))
        if (orphanFonte) setPowerSupplies(prev => prev.filter(ps => ps.id !== orphanFonte!.id))
        await del(plan.id, id)
      },
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

  // Junta duas medições do mesmo tipo (ex: os dois trechos de uma fita em L
  // medidos separados por engano) numa única — pra casos como esse não
  // precisar remedir. Orienta os pontos pra minimizar o "salto" entre as
  // duas pontas (assumindo que elas se encontram, ex: no canto do L).
  // Reprocessa símbolos/medições "sem ambiente" da página contra os ambientes
  // já desenhados — corrige casos que ficaram presos antes do vínculo
  // automático existir, ou que escaparam por qualquer motivo.
  async function relinkUnassigned() {
    const pageEnvs = environments.filter(e => e.page === pageNum)
    if (pageEnvs.length === 0) { window.alert('Nenhum ambiente desenhado nesta página ainda.'); return }
    let count = 0
    for (const s of symbols) {
      if (s.page === pageNum && !s.environment_id) {
        const env = pageEnvs.find(e => pointInPolygon([s.x, s.y], e.polygon))
        if (env) { updateEntity('symbol', s.id, { environment_id: null }, { environment_id: env.id }, updateSymbolOccurrence); count++ }
      }
    }
    for (const m of measurements) {
      if (m.page === pageNum && !m.environment_id) {
        const env = pageEnvs.find(e => pointsMatchEnv(m.points, e.polygon))
        if (env) { updateEntity('measurement', m.id, { environment_id: null }, { environment_id: env.id }, updateMeasurement); count++ }
      }
    }
    window.alert(count > 0 ? `${count} marcação(ões) vinculada(s).` : 'Nada pra vincular — o que ficou "sem ambiente" está mesmo fora de qualquer polígono desenhado.')
  }

  async function mergeMeasurements(idA: string, idB: string) {
    const a = measurements.find(m => m.id === idA)
    const b = measurements.find(m => m.id === idB)
    if (!a || !b || a.kind !== b.kind || a.id === b.id) return

    // Escolhe, entre as 4 combinações de ordem/direção possíveis, a que
    // encosta a ponta de A na ponta de B com a menor distância — assumindo
    // que os dois trechos se encontram (ex: no canto do L).
    const combos: [Point[], number][] = [
      [[...a.points, ...b.points], distance(a.points[a.points.length - 1], b.points[0])],
      [[...a.points, ...[...b.points].reverse()], distance(a.points[a.points.length - 1], b.points[b.points.length - 1])],
      [[...[...a.points].reverse(), ...b.points], distance(a.points[0], b.points[0])],
      [[...[...a.points].reverse(), ...[...b.points].reverse()], distance(a.points[0], b.points[b.points.length - 1])],
    ]
    let bestPoints = combos[0][0]
    let bestGap = combos[0][1]
    for (const [pts, gap] of combos) { if (gap < bestGap) { bestGap = gap; bestPoints = pts } }

    setBusy(true)
    const res = await createMeasurement(plan.id, {
      page: a.page, kind: a.kind, label: a.label ?? MEASURE_LABEL[a.kind],
      points: bestPoints, length_m: round2(a.length_m + b.length_m),
      environment_id: a.environment_id ?? b.environment_id ?? null,
      power_w_per_m: a.kind === 'fita' ? (a.power_w_per_m || b.power_w_per_m || 0) : undefined,
    })
    setBusy(false)
    if (!res?.data) return
    const merged = res.data as Measurement

    setMeasurements(prev => [...prev.filter(m => m.id !== a.id && m.id !== b.id), merged])
    await Promise.all([deleteMeasurement(plan.id, a.id), deleteMeasurement(plan.id, b.id)])

    pushHistory({
      label: 'mesclar medições',
      undo: async () => {
        setMeasurements(prev => [...prev.filter(m => m.id !== merged.id), a, b])
        await Promise.all([
          restoreRow('plan_measurements', a as any),
          restoreRow('plan_measurements', b as any),
          deleteMeasurement(plan.id, merged.id),
        ])
      },
      redo: async () => {
        setMeasurements(prev => [...prev.filter(m => m.id !== a.id && m.id !== b.id), merged])
        await Promise.all([
          deleteMeasurement(plan.id, a.id),
          deleteMeasurement(plan.id, b.id),
          restoreRow('plan_measurements', merged as any),
        ])
      },
    })
  }

  async function deleteSelected() {
    if (!selection) return
    await deleteEntity(selection.kind, selection.id)
    setSelection(null)
  }

  function updateMeasurementField(id: string, updates: Partial<Measurement>) {
    const beforeRow = measurements.find(m => m.id === id)
    if (!beforeRow) return
    const before = Object.fromEntries(Object.keys(updates).map(k => [k, (beforeRow as any)[k]]))
    updateEntity('measurement', id, before, updates, updateMeasurement)
  }

  // Anotações guardam tudo dentro de `data` (jsonb) — o merge com o valor
  // anterior evita perder campos que não estão sendo alterados agora (ex:
  // mudar só a fonte sem apagar o texto).
  function updateAnnotationData(id: string, patch: Record<string, unknown>) {
    const row = annotations.find(a => a.id === id)
    if (!row) return
    const before = { data: row.data }
    const after = { data: { ...row.data, ...patch } }
    updateEntity('annotation', id, before, after, (planId, annId, updates) => updateAnnotation(planId, annId, (updates as any).data))
  }

  // Usuário já escolheu a potência no card — só falta clicar na planta pra
  // dizer onde a fonte fica fisicamente (o buraco do forro mais próximo).
  function startFontePlacement(measurementId: string, watts: number) {
    setPendingFontePlacement({ measurementId, watts })
    setSelection(null)
  }
  function deleteFonte(id: string) {
    deleteEntity('powerSupply', id)
  }

  // Duplicar — pra quando existem trechos idênticos no orçamento (mesma
  // metragem, mesmo produto) e não vale a pena medir/preencher tudo de
  // novo. A cópia nasce com os pontos levemente deslocados (pra não ficar
  // exatamente em cima do original e dar pra clicar nela) — o consultor
  // arrasta pro lugar certo ou só troca o ambiente/comprimento no card.
  function offsetPoints(points: Point[]): Point[] { return points.map(([x, y]) => [x + 24, y + 24] as Point) }

  async function duplicatePerfilFita(perfil: Measurement, fita: Measurement) {
    setBusy(true)
    const newPoints = offsetPoints(perfil.points)
    const resPerfil = await createMeasurement(plan.id, {
      page: perfil.page, kind: 'perfil', label: `${perfil.label ?? 'Perfil'} (cópia)`,
      points: newPoints, length_m: perfil.length_m, environment_id: perfil.environment_id,
      bar_size: perfil.bar_size ?? undefined, product_model: perfil.product_model ?? undefined,
      mount_type: perfil.mount_type ?? undefined, installation_location: perfil.installation_location ?? undefined,
    })
    if (resPerfil?.data) {
      setMeasurements(prev => [...prev, resPerfil.data]); pushCreateHistory('measurement', resPerfil.data)
      const resFita = await createMeasurement(plan.id, {
        page: fita.page, kind: 'fita', label: `${fita.label ?? 'Fita'} (cópia)`,
        points: newPoints, length_m: fita.length_m, environment_id: fita.environment_id,
        power_w_per_m: fita.power_w_per_m ?? 0, linked_measurement_id: resPerfil.data.id,
        packaging: fita.packaging ?? undefined, product_model: fita.product_model ?? undefined,
        voltage: fita.voltage ?? undefined, color_temp_k: fita.color_temp_k ?? undefined, strand_count: fita.strand_count ?? undefined,
      })
      if (resFita?.data) { setMeasurements(prev => [...prev, resFita.data]); pushCreateHistory('measurement', resFita.data) }
    }
    setBusy(false)
  }

  async function duplicateFita(fita: Measurement) {
    setBusy(true)
    const res = await createMeasurement(plan.id, {
      page: fita.page, kind: 'fita', label: `${fita.label ?? 'Fita'} (cópia)`,
      points: offsetPoints(fita.points), length_m: fita.length_m, environment_id: fita.environment_id,
      power_w_per_m: fita.power_w_per_m ?? 0, packaging: fita.packaging ?? undefined,
      product_model: fita.product_model ?? undefined, voltage: fita.voltage ?? undefined,
      color_temp_k: fita.color_temp_k ?? undefined, strand_count: fita.strand_count ?? undefined,
      installation_location: fita.installation_location ?? undefined,
    })
    if (res?.data) { setMeasurements(prev => [...prev, res.data]); pushCreateHistory('measurement', res.data) }
    setBusy(false)
  }

  async function duplicateLegendItem(item: LegendItem) {
    const nextCode = String(legendItems.reduce((max, i) => Math.max(max, parseInt(i.code, 10) || 0), 0) + 1).padStart(2, '0')
    const res = await createLegendItem(plan.id, {
      code: nextCode, description: item.description ?? undefined, power_w: item.power_w ?? undefined,
      color_temp_k: item.color_temp_k ?? undefined, mount_type: item.mount_type ?? undefined,
      has_lamp: item.has_lamp, lamp_name: item.lamp_name ?? undefined,
      lamp_color_temp_k: item.lamp_color_temp_k ?? undefined, lamp_angle_deg: item.lamp_angle_deg ?? undefined,
      lamp_qty: item.lamp_qty ?? undefined,
    })
    if (res?.data) setLegendItems(prev => [...prev, res.data])
  }
  // Enquanto o usuário está posicionando uma fonte (ou qualquer outra
  // ferramenta ativa), cliques em cima de ambiente/símbolo/medição/anotação
  // não podem "roubar" o clique pra seleção — senão nunca dá pra marcar um
  // ponto que caia dentro de um ambiente já desenhado.
  function canSelectShape() { return tool === 'select' && !pendingFontePlacement }

  function selectShape(kind: EntityKind, id: string, e: React.MouseEvent) {
    if (!canSelectShape()) return
    setSelection({ kind, id })
    setPopoverAnchor({ x: e.clientX, y: e.clientY })
  }

  const scale = scaleMap[String(pageNum)] ?? null
  const pagePoints = useMemo(() => ({
    environments: environments.filter(e => e.page === pageNum),
    symbols: symbols.filter(s => s.page === pageNum),
    measurements: measurements.filter(m => m.page === pageNum),
    annotations: annotations.filter(a => a.page === pageNum),
  }), [environments, symbols, measurements, annotations, pageNum])

  // ── Plano de corte (mora aqui, não na aba, pra poder rotular a peça de
  // cada trecho tanto no card quanto direto na planta) — agrupado por
  // modelo+tipo+tamanho de barra (perfil) ou modelo+tensão+embalagem (fita),
  // já que barras/rolos diferentes não podem ser misturados numa mesma peça
  // comercial. Mistura de tamanhos (ex: 2m + 3m numa mesma instalação longa)
  // fica pra uma versão futura — por ora cada grupo usa um tamanho só.
  function envNameFor(id: string | null) { return environments.find(e => e.id === id)?.name ?? 'Sem ambiente' }

  function groupAndPlan(items: Measurement[], kind: 'perfil' | 'fita'): GrupoPlano[] {
    const groups = new Map<string, Measurement[]>()
    for (const m of items) {
      const key = kind === 'perfil'
        ? `${m.product_model || '—'}__${m.mount_type || '—'}__${m.bar_size ?? 3}`
        : `${m.product_model || '—'}__${m.voltage || '12V'}__${m.packaging || 'rolo_5m'}__${m.color_temp_k ?? '—'}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(m)
    }
    return Array.from(groups.entries()).map(([key, trechos]) => {
      const first = trechos[0]
      let groupLabel: string
      let comercialM: number | null
      if (kind === 'perfil') {
        const bar = first.bar_size ?? 3
        groupLabel = `${first.product_model || 'Sem modelo'} · ${first.mount_type === 'sobrepor' ? 'Sobrepor' : 'Embutir'} · barra ${bar}m`
        comercialM = bar
      } else {
        const isMetro = first.packaging === 'metro'
        groupLabel = `${first.product_model || 'Sem modelo'} · ${first.voltage || '12V'}${first.color_temp_k ? ` · ${first.color_temp_k}K` : ''} · ${isMetro ? 'vendida no metro' : 'rolo de 5m'}`
        comercialM = isMetro ? null : 5
      }
      let plano: PlanoResult = null
      const emendaWarnings: string[] = []
      if (comercialM != null) {
        // Perfil largo pode levar mais de uma tira de fita lado a lado
        // (strand_count) — cada tira consome seu próprio pedaço de rolo.
        // Um trecho medido MAIOR que a peça comercial (ex: 4.52m medidos de
        // uma vez, mas só tem barra de 3m) antes travava o plano de corte
        // inteiro do grupo com erro — e como o erro não aparecia em lugar
        // nenhum fora da aba Medições, o produto simplesmente sumia do
        // quantitativo sem explicação. Agora esse trecho é quebrado
        // automaticamente em pedaços do tamanho comercial (indicando que
        // precisa de emenda), e o plano sempre é gerado.
        const list: TrechoNecessario[] = trechos.flatMap(t => {
          const strands = kind === 'fita' ? (t.strand_count ?? 1) : 1
          const parts: TrechoNecessario[] = []
          for (let i = 0; i < strands; i++) {
            const baseId = strands > 1 ? `${t.id}#${i + 1}` : t.id
            const ambiente = envNameFor(t.environment_id)
            if (t.length_m > comercialM!) {
              const n = Math.ceil(t.length_m / comercialM!)
              emendaWarnings.push(`${t.label || MEASURE_LABEL[t.kind]} (${round2(t.length_m)}m, ${ambiente}) precisa de emenda: ${n} ${kind === 'perfil' ? 'barras' : 'rolos'} de ${comercialM}m.`)
              for (let p = 0; p < n; p++) {
                const restante = round2(t.length_m - comercialM! * p)
                parts.push({ id: p === 0 ? baseId : `${baseId}~emenda${p}`, comprimentoM: Math.min(comercialM!, restante), ambiente })
              }
            } else {
              parts.push({ id: baseId, comprimentoM: t.length_m, ambiente })
            }
          }
          return parts
        })
        plano = { kind: 'ok', plano: calcularPlanoDeCorte(list, comercialM) }
      }
      return { key, groupLabel, trechos, comercialM, plano, emendaWarnings }
    })
  }

  const perfisList = measurements.filter(m => m.kind === 'perfil')
  const fitasList = measurements.filter(m => m.kind === 'fita')
  const perfilGroups = useMemo(() => groupAndPlan(perfisList, 'perfil'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [measurements, environments])
  const fitaGroups = useMemo(() => groupAndPlan(fitasList, 'fita'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [measurements, environments])

  // Perfil compra em "peça" (barra), fita compra em "rolo" — nomes
  // diferentes mesmo sendo o mesmo mecanismo de plano de corte por baixo.
  // A cor do badge é a cor do GRUPO (produto+config) inteiro, não da peça —
  // senão "Peça 1" de um perfil e "Peça 1" de outro perfil bem diferente
  // saíam com a mesma cor só por coincidência do índice, dando a entender
  // (errado) que eram a mesma coisa.
  function buildPieceMap(group: GrupoPlano, noun: string) {
    const map = new Map<string, { label: string; color: string; siblings: string[] }>()
    const color = productColor(group.key)
    if (group.plano?.kind === 'ok') {
      for (const peca of group.plano.plano.pecas) {
        for (const corte of peca.cortes) {
          const siblings = peca.cortes.filter(c => c.id !== corte.id).map(c => `${c.comprimentoM}m (${c.ambiente ?? '—'})`)
          map.set(corte.id, { label: `${noun} ${peca.pecaIndex}`, color, siblings })
        }
      }
    }
    return map
  }
  const pieceBadgeMap = useMemo(() => {
    const merged = new Map<string, { label: string; color: string; siblings: string[] }>()
    for (const g of perfilGroups) for (const [k, v] of Array.from(buildPieceMap(g, 'Peça'))) merged.set(k, v)
    for (const g of fitaGroups) for (const [k, v] of Array.from(buildPieceMap(g, 'Rolo'))) merged.set(k, v)
    return merged
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfilGroups, fitaGroups])

  // ── Carrega e renderiza o PDF ─────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    setRendering(true)
    pdfjsLib.getDocument(plan.pdfUrl).promise.then(doc => { if (!cancelled) setPdfDoc(doc) })
    return () => { cancelled = true }
  }, [plan.pdfUrl])

  // Rotação total = a que já vem embutida no PDF + a que o consultor pediu
  // pra corrigir (0/90/180/270). Sempre passada explícita pro getViewport,
  // senão o pdf.js ignora a nossa e usa só a do próprio arquivo.
  function totalRotation(page: any) {
    const extra = rotationMap[String(pageNum)] ?? 0
    return ((page.rotate ?? 0) + extra) % 360
  }

  useEffect(() => {
    if (!pdfDoc) return
    let cancelled = false
    setRendering(true)
    pdfDoc.getPage(pageNum).then((page: any) => {
      const viewport = page.getViewport({ scale: renderScale, rotation: totalRotation(page) })
      const canvas = canvasRef.current
      if (!canvas || cancelled) return
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
      page.render({ canvasContext: ctx, viewport }).promise.then(() => {
        if (!cancelled) {
          viewportRef.current = viewport
          setPageSize({ width: viewport.width, height: viewport.height })
          setRendering(false)
          renderVersionRef.current++
        }
      })
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, pageNum, renderScale, rotationMap])

  function fitToScreen() {
    const container = canvasRef.current?.parentElement?.parentElement
    if (!container || !pdfDoc) return
    pdfDoc.getPage(pageNum).then((page: any) => {
      const base = page.getViewport({ scale: 1, rotation: totalRotation(page) })
      const targetWidth = container.clientWidth - 32
      setRenderScale(Math.max(0.3, targetWidth / base.width))
    })
  }

  // Clicar num ambiente na aba lateral centraliza e dá zoom nele na planta,
  // pra conferir aquele cômodo específico sem precisar procurar na mão.
  async function focusOnEnvironment(env: Environment) {
    const container = canvasRef.current?.parentElement?.parentElement
    if (!container || env.polygon.length === 0) return
    const xs = env.polygon.map(p => p[0]), ys = env.polygon.map(p => p[1])
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const bboxW = Math.max(1, maxX - minX), bboxH = Math.max(1, maxY - minY)
    const availW = container.clientWidth - 80, availH = container.clientHeight - 80
    const targetScale = Math.min(4, Math.max(0.4, Math.min(availW / bboxW, availH / bboxH)))

    setSelection({ kind: 'environment', id: env.id })
    setPopoverAnchor(null)
    setTool('select')

    const v0 = renderVersionRef.current
    const pageChanged = env.page !== pageNum
    if (pageChanged) setPageNum(env.page)
    setRenderScale(targetScale)
    await new Promise<void>(resolve => {
      const iv = setInterval(() => {
        if (renderVersionRef.current > v0) { clearInterval(iv); resolve() }
      }, 30)
    })

    const cx = (minX + maxX) / 2 * targetScale
    const cy = (minY + maxY) / 2 * targetScale
    container.scrollTo({ left: cx - container.clientWidth / 2, top: cy - container.clientHeight / 2, behavior: 'smooth' })
  }

  async function rotatePage() {
    const current = rotationMap[String(pageNum)] ?? 0
    const next = (current + 90) % 360
    setRotationMap(prev => ({ ...prev, [String(pageNum)]: next }))
    await updatePlanRotation(plan.id, pageNum, next)
  }

  // Exporta exatamente o que está na tela agora (PDF + tudo que está
  // marcado por cima, incluindo a visão de reaproveitamento se estiver
  // ativa) como um novo PDF de uma página só, pra baixar.
  async function exportViewToPdf() {
    if (!canvasRef.current) return
    setBusy(true)
    // Exportar sempre na escala em que a tela está renderizada, na hora,
    // significa que dar zoom out antes de exportar saía em baixa
    // resolução. Sobe temporariamente pra uma escala mínima "de impressão"
    // (ou mantém a atual, se já for maior), espera o re-render de verdade
    // terminar, captura, e volta pro zoom que a Letícia estava usando.
    const originalScale = renderScale
    const targetScale = Math.min(4, Math.max(renderScale, 2.5))
    const upscaling = targetScale !== originalScale
    if (upscaling) {
      const v0 = renderVersionRef.current
      setRenderScale(targetScale)
      await new Promise<void>(resolve => {
        const iv = setInterval(() => {
          if (renderVersionRef.current > v0) { clearInterval(iv); resolve() }
        }, 30)
      })
    }
    try {
      const canvas = canvasRef.current
      const svgEl = canvas?.parentElement?.querySelector('svg')
      if (!canvas || !svgEl) return
      const svgClone = svgEl.cloneNode(true) as SVGSVGElement
      svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      const svgString = new XMLSerializer().serializeToString(svgClone)
      const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)))

      const svgImg = new Image()
      await new Promise<void>((resolve, reject) => {
        svgImg.onload = () => resolve()
        svgImg.onerror = () => reject(new Error('Falha ao rasterizar as marcações.'))
        svgImg.src = svgDataUrl
      })

      const composite = document.createElement('canvas')
      composite.width = canvas.width
      composite.height = canvas.height
      const ctx = composite.getContext('2d')!
      ctx.drawImage(canvas, 0, 0)
      ctx.drawImage(svgImg, 0, 0, canvas.width, canvas.height)

      const pngBytes = await new Promise<ArrayBuffer>((resolve, reject) => {
        composite.toBlob(blob => {
          if (!blob) { reject(new Error('Falha ao gerar a imagem.')); return }
          blob.arrayBuffer().then(resolve, reject)
        }, 'image/png')
      })

      const { PDFDocument } = await import('pdf-lib')
      const pdfDoc = await PDFDocument.create()
      const pngImage = await pdfDoc.embedPng(pngBytes)
      const page = pdfDoc.addPage([composite.width, composite.height])
      page.drawImage(pngImage, { x: 0, y: 0, width: composite.width, height: composite.height })
      const pdfBytes = await pdfDoc.save()

      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${plan.name}${reaproveitamentoView ? '-reaproveitamento' : ''}-pagina${pageNum}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
      window.alert('Não foi possível exportar o PDF. Tente novamente.')
    } finally {
      if (upscaling) setRenderScale(originalScale)
      setBusy(false)
    }
  }

  // Persiste a página aberta como "página de trabalho" — sem isso, reabrir
  // um PDF de várias páginas sempre voltava pra página 1.
  const firstPageRender = useRef(true)
  useEffect(() => {
    if (firstPageRender.current) { firstPageRender.current = false; return }
    updateWorkingPage(plan.id, pageNum)
  }, [pageNum, plan.id])

  // ── Coordenadas: tela → espaço "canvas em escala 1" ──────────────────────
  // IMPORTANTE: isso precisa ser sempre pixel do canvas ÷ zoom (não o ponto
  // PDF de verdade via convertToPdfPoint). O espaço PDF nativo tem origem no
  // canto inferior esquerdo com Y crescendo pra cima — diferente do espaço
  // de pixel do canvas (origem no canto superior esquerdo, Y pra baixo) que
  // é o que sempre foi salvo no banco. Usar convertToPdfPoint quebrava TODAS
  // as marcações já salvas (aparecem deslocadas/invertidas), porque passou
  // a gravar num sistema de coordenadas diferente do que já existia.
  function toBase(e: React.MouseEvent): Point {
    const rect = canvasRef.current!.getBoundingClientRect()
    const px = (e.clientX - rect.left) * (canvasRef.current!.width / rect.width)
    const py = (e.clientY - rect.top) * (canvasRef.current!.height / rect.height)
    return [px / renderScale, py / renderScale]
  }
  function toScreen([x, y]: Point): Point { return [x * renderScale, y * renderScale] }

  // ── Interações do canvas ──────────────────────────────────────────────────

  function resetDrafts() { setDraftPoints([]); setDraftFreehand([]); setRectStart(null); setRectCur(null); setPendingSymbol(null); setPendingSymbolAnchor(null) }

  useEffect(() => { resetDrafts(); setSelection(null); setStampLegendItemId(null) }, [tool])

  const MEASURE_TOOLS: Tool[] = ['medir', 'medir-perfil', 'medir-fita']

  async function handleCanvasClick(e: React.MouseEvent) {
    // Colocar a fonte ou apontar a seta têm prioridade sobre a ferramenta
    // ativa — o usuário já confirmou a ação no popover, só falta o clique.
    if (pendingFontePlacement) {
      const p = toBase(e)
      const { measurementId, watts } = pendingFontePlacement
      setPendingFontePlacement(null)
      setBusy(true)
      const res = await createPowerSupply(plan.id, { measurementId, page: pageNum, x: p[0], y: p[1], watts })
      if (res?.data) { setPowerSupplies(prev => [...prev, res.data]); pushCreateHistory('powerSupply', res.data) }
      setBusy(false)
      return
    }
    if (pendingArrowFor) {
      const p = toBase(e)
      updateAnnotationData(pendingArrowFor, { arrowTo: p })
      setPendingArrowFor(null)
      return
    }
    if (tool === 'select') { setSelection(null); return }
    const p = toBase(e)
    if (tool === 'ambiente' || MEASURE_TOOLS.includes(tool) || tool === 'calibrar') {
      setDraftPoints(prev => [...prev, p])
      return
    }
    if (tool === 'simbolo') {
      if (stampLegendItemId) { placeSymbolAt(p, stampLegendItemId); return }
      setPendingSymbol(p)
      setPendingSymbolAnchor({ x: e.clientX, y: e.clientY })
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

  // Finaliza o polígono/polilinha em desenho — chamado pela tecla Enter (não
  // por duplo clique: o navegador dispara click+click+dblclick numa sequência
  // de duplo clique, então os 2 cliques de "fechar" viravam pontos extras
  // fantasmas antes de conseguirmos interceptar, criando cotas erradas).
  async function finalizeDraft() {
    if (tool === 'ambiente' && draftPoints.length >= 3) {
      const name = window.prompt('Nome do ambiente:')
      if (name?.trim()) {
        setBusy(true)
        const res = await createEnvironment(plan.id, { page: pageNum, name: name.trim(), polygon: draftPoints })
        if (res?.data) {
          const env = res.data as Environment
          setEnvironments(prev => [...prev, env])
          pushCreateHistory('environment', env)
          // Puxa pro ambiente recém-criado tudo que já estava marcado na
          // página e ainda não tinha ambiente — sem isso, desenhar o
          // ambiente DEPOIS de medir/marcar símbolos nunca associava nada
          // (o vínculo só era calculado uma vez, no momento da criação).
          for (const s of symbols) {
            if (s.page === pageNum && !s.environment_id && pointInPolygon([s.x, s.y], env.polygon)) {
              updateEntity('symbol', s.id, { environment_id: null }, { environment_id: env.id }, updateSymbolOccurrence)
            }
          }
          for (const m of measurements) {
            if (m.page === pageNum && !m.environment_id && pointsMatchEnv(m.points, env.polygon)) {
              updateEntity('measurement', m.id, { environment_id: null }, { environment_id: env.id }, updateMeasurement)
            }
          }
        }
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
      const envMatch = environments.find(env => env.page === pageNum && pointsMatchEnv(draftPoints, env.polygon))
      const countSameKind = measurements.filter(m => m.kind === kind).length
      // Puxa modelo/config do último perfil (ou fita) medido — um ambiente
      // inteiro costuma usar o mesmo produto, então repetir isso a cada
      // medição era o maior peso de preenchimento manual.
      const lastSameKind = [...measurements].reverse().find(m => m.kind === kind)
      setBusy(true)
      const res = await createMeasurement(plan.id, {
        page: pageNum, kind, label: `${MEASURE_LABEL[kind]} ${countSameKind + 1}`,
        points: draftPoints, length_m: lengthM, environment_id: envMatch?.id ?? null,
        power_w_per_m: kind === 'fita' ? (lastSameKind?.power_w_per_m ?? 0) : undefined,
        bar_size: kind === 'perfil' ? (lastSameKind?.bar_size ?? 3) : undefined,
        packaging: kind === 'fita' ? (lastSameKind?.packaging ?? 'rolo_5m') : undefined,
        product_model: lastSameKind?.product_model ?? undefined,
        mount_type: kind === 'perfil' ? (lastSameKind?.mount_type ?? undefined) : undefined,
        voltage: kind === 'fita' ? (lastSameKind?.voltage ?? undefined) : undefined,
        color_temp_k: kind === 'fita' ? (lastSameKind?.color_temp_k ?? undefined) : undefined,
        strand_count: kind === 'fita' ? (lastSameKind?.strand_count ?? undefined) : undefined,
      })
      if (res?.data) {
        setMeasurements(prev => [...prev, res.data])
        pushCreateHistory('measurement', res.data)

        // Todo perfil tem fita (nem toda fita tem perfil): ao marcar um
        // perfil, já cria a fita correspondente com a mesma metragem,
        // vinculada — o consultor só precisa preencher o W/m dela.
        if (kind === 'perfil') {
          const countFitas = measurements.filter(m => m.kind === 'fita').length
          const lastFita = [...measurements].reverse().find(m => m.kind === 'fita')
          const resFita = await createMeasurement(plan.id, {
            page: pageNum, kind: 'fita', label: `Fita ${countFitas + 1} (do ${res.data.label})`,
            points: draftPoints, length_m: lengthM, environment_id: envMatch?.id ?? null,
            power_w_per_m: lastFita?.power_w_per_m ?? 0, linked_measurement_id: res.data.id,
            packaging: lastFita?.packaging ?? 'rolo_5m',
            product_model: lastFita?.product_model ?? undefined, voltage: lastFita?.voltage ?? undefined,
            color_temp_k: lastFita?.color_temp_k ?? undefined, strand_count: lastFita?.strand_count ?? undefined,
          })
          if (resFita?.data) { setMeasurements(prev => [...prev, resFita.data]); pushCreateHistory('measurement', resFita.data) }
        }
      }
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
    if (draggingAnnotation) {
      const nx = p[0] - draggingAnnotation.offsetX, ny = p[1] - draggingAnnotation.offsetY
      setAnnotations(prev => prev.map(a => a.id === draggingAnnotation.id ? { ...a, data: { ...a.data, x: nx, y: ny } } : a))
    }
    if (draggingFonte) {
      const nx = p[0] - draggingFonte.offsetX, ny = p[1] - draggingFonte.offsetY
      setPowerSupplies(prev => prev.map(ps => ps.id === draggingFonte.id ? { ...ps, x: nx, y: ny } : ps))
    }
    if (draggingSymbol) {
      const nx = p[0] - draggingSymbol.offsetX, ny = p[1] - draggingSymbol.offsetY
      setSymbols(prev => prev.map(s => s.id === draggingSymbol.id ? { ...s, x: nx, y: ny } : s))
    }
    if (draggingPoint) {
      setMeasurements(prev => prev.map(m => {
        if (m.id !== draggingPoint.measurementId) return m
        const newPoints = m.points.map((pt, i) => i === draggingPoint.pointIndex ? p : pt)
        const newLength = scale ? round2(polylineLength(newPoints) * scale) : m.length_m
        return { ...m, points: newPoints, length_m: newLength }
      }))
    }
    if (draggingCotaOffset) {
      const m = measurements.find(x => x.id === draggingCotaOffset.measurementId)
      if (m && m.points.length >= 2) {
        const a = m.points[0], b = m.points[1]
        const dx = b[0] - a[0], dy = b[1] - a[1]
        const len = Math.hypot(dx, dy) || 1
        const nx = -dy / len, ny = dx / len // mesma perpendicular usada no renderCota
        const signedDistBase = (p[0] - a[0]) * nx + (p[1] - a[1]) * ny
        const newOffsetPx = round2(signedDistBase * renderScale)
        setMeasurements(prev => prev.map(x => x.id === m.id ? { ...x, cota_offset: newOffsetPx } : x))
      }
    }
  }
  async function handleMouseUp() {
    if (draggingAnnotation) {
      const a = annotations.find(x => x.id === draggingAnnotation.id)
      setDraggingAnnotation(null)
      if (a) await updateAnnotation(plan.id, a.id, a.data)
      return
    }
    if (draggingSymbol) {
      const s = symbols.find(x => x.id === draggingSymbol.id)
      setDraggingSymbol(null)
      if (s) {
        const envMatch = environments.find(env => env.page === s.page && pointInPolygon([s.x, s.y], env.polygon))
        setSymbols(prev => prev.map(x => x.id === s.id ? { ...x, environment_id: envMatch?.id ?? null } : x))
        await updateSymbolOccurrence(plan.id, s.id, { x: s.x, y: s.y, environment_id: envMatch?.id ?? null })
      }
      return
    }
    if (draggingFonte) {
      const ps = powerSupplies.find(x => x.id === draggingFonte.id)
      setDraggingFonte(null)
      if (ps) await updatePowerSupply(plan.id, ps.id, { x: ps.x, y: ps.y })
      return
    }
    if (draggingPoint) {
      const dp = draggingPoint
      setDraggingPoint(null)
      const m = measurements.find(x => x.id === dp.measurementId)
      if (m) {
        setBusy(true)
        await updateMeasurement(plan.id, m.id, { points: m.points, length_m: m.length_m })
        // Perfil e sua fita andam com a mesma medida — se um dos dois for
        // redimensionado, o outro segue junto.
        const linked = m.linked_measurement_id
          ? measurements.find(x => x.id === m.linked_measurement_id)
          : measurements.find(x => x.linked_measurement_id === m.id)
        if (linked) {
          setMeasurements(prev => prev.map(x => x.id === linked.id ? { ...x, points: m.points, length_m: m.length_m } : x))
          await updateMeasurement(plan.id, linked.id, { points: m.points, length_m: m.length_m })
        }
        setBusy(false)
      }
      return
    }
    if (draggingCotaOffset) {
      const dc = draggingCotaOffset
      setDraggingCotaOffset(null)
      const m = measurements.find(x => x.id === dc.measurementId)
      if (m) await updateMeasurement(plan.id, m.id, { cota_offset: m.cota_offset ?? 16 })
      return
    }
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

  async function placeSymbolAt(point: Point, legendItemId: string) {
    const envMatch = environments.find(env => env.page === pageNum && pointInPolygon(point, env.polygon))
    setBusy(true)
    const res = await createSymbolOccurrence(plan.id, {
      page: pageNum, x: point[0], y: point[1],
      legend_item_id: legendItemId, environment_id: envMatch?.id ?? null,
    })
    if (res?.data) { setSymbols(prev => [...prev, res.data]); pushCreateHistory('symbol', res.data) }
    setBusy(false)
  }

  async function confirmSymbol(legendItemId: string, keepStamping?: boolean) {
    if (!pendingSymbol) return
    await placeSymbolAt(pendingSymbol, legendItemId)
    setPendingSymbol(null)
    setPendingSymbolAnchor(null)
    if (keepStamping) setStampLegendItemId(legendItemId)
  }

  // ── Cota (dimensão estilo AutoCAD) ─────────────────────────────────────────
  // Desenha linhas de extensão + linha de cota deslocada + o comprimento em
  // metros escrito ao lado, por segmento — igual uma cota de projeto.
  function renderCota(points: Point[], color: string, key: string, mScale: number | null, opts?: {
    selected?: boolean; onClick?: (e: React.MouseEvent) => void; dashed?: boolean; badges?: PieceBadge[]
    cotaOffset?: number; onOffsetDragStart?: () => void; totalLengthM?: number; badgeYOffset?: number
  }) {
    const offsetPx = opts?.cotaOffset ?? 16
    // Quando a medição já foi salva, o número mostrado na cota vem do
    // comprimento SALVO (totalLengthM) — o mesmo que aparece no card —
    // distribuído proporcionalmente entre os segmentos. Sem isso, corrigir
    // manualmente o comprimento no card não mudava nada na planta (a cota
    // recalculava sempre a partir do desenho, ignorando a correção).
    const totalPx = opts?.totalLengthM != null ? polylineLength(points) : 0
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
      const segLenM = opts?.totalLengthM != null
        ? (totalPx > 0 ? round2((distance(a, b) / totalPx) * opts.totalLengthM) : opts.totalLengthM)
        : (mScale ? round2(distance(a, b) * mScale) : null)
      const midX = (a2x + b2x) / 2, midY = (a2y + b2y) / 2
      let angleDeg = Math.atan2(dy, dx) * 180 / Math.PI
      if (angleDeg > 90 || angleDeg < -90) angleDeg += 180
      const dimWidth = opts?.selected ? 3.5 : 2.5
      segs.push(
        <g key={`${key}-${i}`}>
          {/* Halo branco por baixo de tudo — sem isso a cota some no meio dos
              traços que já existem no PDF original (linhas, cotas do CAD). */}
          <line x1={sax} y1={say} x2={a2x} y2={a2y} stroke="white" strokeWidth={3.5} opacity={0.95} />
          <line x1={sbx} y1={sby} x2={b2x} y2={b2y} stroke="white" strokeWidth={3.5} opacity={0.95} />
          <line x1={a2x} y1={a2y} x2={b2x} y2={b2y} stroke="white" strokeWidth={dimWidth + 3}
            strokeDasharray={opts?.dashed ? '4 3' : undefined} />

          <line x1={sax} y1={say} x2={a2x} y2={a2y} stroke={color} strokeWidth={1.25} opacity={0.7} />
          <line x1={sbx} y1={sby} x2={b2x} y2={b2y} stroke={color} strokeWidth={1.25} opacity={0.7} />
          <line x1={a2x} y1={a2y} x2={b2x} y2={b2y} stroke={color} strokeWidth={dimWidth}
            strokeDasharray={opts?.dashed ? '4 3' : undefined} />
          {opts?.onClick && (
            <line x1={a2x} y1={a2y} x2={b2x} y2={b2y} stroke="transparent" strokeWidth={14}
              style={{ cursor: opts.onOffsetDragStart ? 'move' : 'pointer' }}
              onClick={e => { if (!canSelectShape()) return; e.stopPropagation(); opts.onClick!(e) }}
              onMouseDown={opts.onOffsetDragStart ? e => { e.stopPropagation(); opts.onOffsetDragStart!() } : undefined} />
          )}
          {segLenM != null && (
            <text x={midX} y={midY - 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={color}
              stroke="white" strokeWidth={3.5} paintOrder="stroke" transform={`rotate(${angleDeg} ${midX} ${midY})`}>
              {segLenM.toFixed(2)}m
            </text>
          )}
        </g>
      )
    }
    if (opts?.badges && opts.badges.length > 0 && points.length > 0) {
      const [lx, lyBase] = toScreen(points[points.length - 1])
      const ly = lyBase - (opts.badgeYOffset ?? 0)
      let cursorX = lx + 8
      opts.badges.forEach((badge, bi) => {
        const w = badge.label.length * 5.5 + 14
        segs.push(
          <g key={`${key}-badge-${bi}`} style={{ cursor: opts.onClick ? 'pointer' : undefined }}
            onClick={opts.onClick ? e => { if (!canSelectShape()) return; e.stopPropagation(); opts.onClick!(e) } : undefined}>
            <rect x={cursorX} y={ly - 21} width={w} height={16} rx={8} fill={badge.color} stroke="white" strokeWidth={1.5} />
            <text x={cursorX + w / 2} y={ly - 9} textAnchor="middle" fontSize={9} fontWeight={700} fill="white" pointerEvents="none">{badge.label}</text>
          </g>
        )
        cursorX += w + 4
      })
    }
    return <g>{segs}</g>
  }

  // ── Fita colorida por composição ────────────────────────────────────────
  // Substitui a antiga dupla linha de cota (uma pro perfil, outra pra fita)
  // por um retângulo de borda colorida e sem preenchimento, seguindo o
  // trecho medido — a cor é sempre a mesma pra composição idêntica
  // (mesmo perfil + mesma fita, ou mesma fita sozinha) e muda assim que
  // qualquer um dos dois produtos muda.
  function renderComposicaoRibbon(points: Point[], color: string, key: string, halfWidthPx = 6) {
    const screenPts = points.map(toScreen)
    if (screenPts.length < 2) return null
    const left: [number, number][] = []
    const right: [number, number][] = []
    for (let i = 0; i < screenPts.length - 1; i++) {
      const [ax, ay] = screenPts[i]
      const [bx, by] = screenPts[i + 1]
      const dx = bx - ax, dy = by - ay
      const len = Math.hypot(dx, dy) || 1
      const nx = (-dy / len) * halfWidthPx, ny = (dx / len) * halfWidthPx
      left.push([ax + nx, ay + ny])
      right.push([ax - nx, ay - ny])
      if (i === screenPts.length - 2) {
        left.push([bx + nx, by + ny])
        right.push([bx - nx, by - ny])
      }
    }
    // Duas polilinhas abertas (uma de cada lado) em vez de um polígono
    // fechado — um trecho em L ou que "volta" sobre si mesmo fazia o
    // polígono se auto-cruzar, desenhando um X feio na virada.
    const leftPts = left.map(p => p.join(',')).join(' ')
    const rightPts = right.map(p => p.join(',')).join(' ')
    return (
      <g key={key}>
        <polyline points={leftPts} fill="none" stroke="white" strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={rightPts} fill="none" stroke="white" strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={leftPts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={rightPts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </g>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const draftPolygonScreen = draftPoints.map(toScreen)
  const draftFreehandScreen = draftFreehand.map(toScreen)
  const isMeasuring = MEASURE_TOOLS.includes(tool)

  return (
    <>
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
            <button onClick={rotatePage} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200" title="Girar página 90°"><RotateCw className="w-4 h-4" /></button>
            <div className="w-px h-4 bg-gray-200 mx-1" />
            <button onClick={() => { setReaproveitamentoView(v => !v); setFontesView(false) }} title="Visualizar reaproveitamento"
              className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                reaproveitamentoView ? 'bg-amber-500 text-white' : 'text-gray-600 hover:bg-gray-200')}>
              <Layers className="w-3.5 h-3.5" /> Reaproveitamento
            </button>
            <button onClick={() => { setFontesView(v => !v); setReaproveitamentoView(false) }} title="Visualizar só as fontes (12V) já posicionadas"
              className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                fontesView ? 'bg-amber-600 text-white' : 'text-gray-600 hover:bg-gray-200')}>
              <Zap className="w-3.5 h-3.5" /> Fontes
            </button>
            <button onClick={() => setAmbientesDiscretos(v => !v)} title="Ambientes discretos — só o nome em cinza, sem cor nem contorno"
              className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                ambientesDiscretos ? 'bg-gray-500 text-white' : 'text-gray-600 hover:bg-gray-200')}>
              <EyeOff className="w-3.5 h-3.5" /> Ambientes discretos
            </button>
            <button onClick={exportViewToPdf} disabled={busy} title="Exportar esta visualização em PDF"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-40">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Exportar PDF
            </button>
            {plan.num_pages > 1 && (
              <>
                <div className="w-px h-4 bg-gray-200 mx-1" />
                <button disabled={pageNum <= 1} onClick={() => setPageNum(p => p - 1)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                <input type="number" min={1} max={plan.num_pages} value={pageNum}
                  onChange={e => {
                    const n = Number(e.target.value)
                    if (n >= 1 && n <= plan.num_pages) setPageNum(n)
                  }}
                  className="w-10 text-xs text-center border border-gray-200 rounded px-1 py-1" />
                <span className="text-xs text-gray-400">/ {plan.num_pages}</span>
                <button disabled={pageNum >= plan.num_pages} onClick={() => setPageNum(p => p + 1)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
              </>
            )}
          </div>
        </div>

        {tool !== 'select' && (
          <div className="px-3 py-1.5 bg-brand-50 text-brand-700 text-xs font-medium border-b border-brand-100">
            {tool === 'ambiente' && 'Clique pra marcar os cantos do ambiente e aperte Enter pra fechar o polígono (Esc cancela).'}
            {isMeasuring && `Clique em cada ponto do trecho — inclusive nos cantos de um L ou U, sem parar — e aperte Enter só no final pra salvar tudo como uma peça só (Esc cancela).${!scale ? ' Escala não calibrada nesta página ainda.' : ''}`}
            {tool === 'calibrar' && 'Clique em dois pontos de distância real conhecida na planta e aperte Enter pra confirmar (Esc cancela).'}
            {tool === 'simbolo' && !stampLegendItemId && 'Clique no ponto onde tem uma luminária pra marcar a ocorrência.'}
            {tool === 'anot-retangulo' && 'Clique e arraste pra desenhar um retângulo.'}
            {tool === 'anot-livre' && 'Clique e arraste pra desenhar livremente.'}
            {tool === 'anot-texto' && 'Clique onde quer inserir o texto.'}
          </div>
        )}
        {tool === 'simbolo' && stampLegendItemId && (
          <div className="px-3 py-1.5 bg-violet-50 text-violet-700 text-xs font-medium border-b border-violet-100 flex items-center justify-between">
            <span>📌 Carimbando "{legendItems.find(li => li.id === stampLegendItemId)?.description || legendItems.find(li => li.id === stampLegendItemId)?.code}" — clique em quantos pontos quiser.</span>
            <button onClick={() => setStampLegendItemId(null)} className="text-violet-500 hover:text-violet-700 font-semibold">Parar de carimbar (Esc)</button>
          </div>
        )}
        {pendingFontePlacement && (
          <div className="px-3 py-1.5 bg-amber-50 text-amber-700 text-xs font-medium border-b border-amber-100 flex items-center justify-between">
            <span>📍 Clique no buraco do forro/luminária onde essa fonte de {pendingFontePlacement.watts}W vai ficar.</span>
            <button onClick={() => setPendingFontePlacement(null)} className="text-amber-500 hover:text-amber-700">Cancelar (Esc)</button>
          </div>
        )}
        {pendingArrowFor && (
          <div className="px-3 py-1.5 bg-cyan-50 text-cyan-700 text-xs font-medium border-b border-cyan-100 flex items-center justify-between">
            <span>🎯 Clique no ponto da planta pra onde a seta deve apontar.</span>
            <button onClick={() => setPendingArrowFor(null)} className="text-cyan-500 hover:text-cyan-700">Cancelar (Esc)</button>
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
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              <defs>
                <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill="#0891b2" />
                </marker>
              </defs>
              {/* Ambientes confirmados — halo branco + traço tracejado grosso,
                  pra nunca se confundir com uma parede ou cota do próprio
                  projeto (que geralmente são linhas finas contínuas).
                  Escondido na "Visualizar reaproveitamento" (visão limpa). */}
              {!reaproveitamentoView && !fontesView && pagePoints.environments.map((env, i) => {
                const pts = env.polygon.map(toScreen).map(p => p.join(',')).join(' ')
                const color = ENV_COLORS[i % ENV_COLORS.length]
                const selected = selection?.kind === 'environment' && selection.id === env.id
                return (
                  <g key={env.id}>
                    {!ambientesDiscretos && <polygon points={pts} fill={color + '18'} stroke="white" strokeWidth={selected ? 7 : 5.5} />}
                    <polygon points={pts} fill="transparent" stroke={ambientesDiscretos ? 'transparent' : color}
                      strokeWidth={selected ? 3.5 : 2.5} strokeDasharray={ambientesDiscretos ? undefined : '7 4'}
                      style={{ cursor: tool === 'select' ? 'pointer' : undefined }}
                      onClick={e => { if (!canSelectShape()) return; e.stopPropagation(); selectShape('environment', env.id, e) }} />
                  </g>
                )
              })}
              {/* Rótulo do ambiente no centroide — em modo discreto vira só um
                  texto cinza, sem cor nem contorno, só pra guiar. */}
              {!reaproveitamentoView && !fontesView && pagePoints.environments.map((env, i) => {
                const cx = env.polygon.reduce((s, p) => s + p[0], 0) / env.polygon.length
                const cy = env.polygon.reduce((s, p) => s + p[1], 0) / env.polygon.length
                const [sx, sy] = toScreen([cx, cy])
                return (
                  <text key={env.id + '-label'} x={sx} y={sy} textAnchor="middle" pointerEvents="none"
                    fontSize={12} fontWeight={700} fill={ambientesDiscretos ? '#9ca3af' : ENV_COLORS[i % ENV_COLORS.length]}
                    stroke="white" strokeWidth={3} paintOrder="stroke">
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

              {/* Medições — sempre como cota (linha de extensão + medida em metros).
                  Na visão limpa (reaproveitamento), só perfil/fita aparecem.
                  Na visão de fontes, só fita (é o que a fonte alimenta). */}
              {(() => { badgeStackByPoint.clear(); return null })()}
              {pagePoints.measurements
                .filter(m => !reaproveitamentoView || m.kind !== 'medida')
                .filter(m => !fontesView || m.kind === 'fita')
                // A fita de uma composição perfil+fita é desenhada junto com o
                // perfil (mesmo retângulo colorido) — exceto na visão de
                // fontes, onde o perfil nem aparece.
                .filter(m => fontesView || !(m.kind === 'fita' && m.linked_measurement_id))
                .map(m => {
                  const linkedFita = m.kind === 'perfil' && !fontesView ? measurements.find(f => f.linked_measurement_id === m.id) : undefined
                  const selected = selection?.kind === 'measurement' && (selection.id === m.id || selection.id === linkedFita?.id)
                  const isComposicao = m.kind === 'perfil' || m.kind === 'fita'
                  const color = m.kind === 'perfil'
                    ? productColor(`${m.product_model || ''}__${linkedFita?.product_model || ''}`)
                    : m.kind === 'fita' ? productColor(m.product_model || '') : MEASURE_COLOR.medida
                  // Peça/Rolo só aparece na visão de reaproveitamento — na
                  // visão normal virava poluição visual, e cores repetidas
                  // entre tipos diferentes de perfil/fita passavam a
                  // impressão errada de que "Peça 1" de um produto era a
                  // mesma coisa que "Peça 1" de outro.
                  const badges = !reaproveitamentoView ? undefined : [pieceBadgeMap.get(m.id), linkedFita ? pieceBadgeMap.get(linkedFita.id) : undefined]
                    .filter((b): b is PieceBadge => !!b)
                  // Chave por posição arredondada (não pelo id) — assim
                  // medições diferentes que terminam perto uma da outra
                  // também entram na mesma pilha, e cada uma empilha mais
                  // pra baixo em vez de desenhar em cima da anterior.
                  let badgeStackIndex = 0
                  if (badges && badges.length > 0 && m.points.length > 0) {
                    const [lx, ly] = toScreen(m.points[m.points.length - 1])
                    const key = `${Math.round(lx / 24)}_${Math.round(ly / 24)}`
                    badgeStackIndex = badgeStackByPoint.get(key) ?? 0
                    badgeStackByPoint.set(key, badgeStackIndex + 1)
                  }
                  return (
                    <g key={m.id}>
                      {isComposicao && !reaproveitamentoView && renderComposicaoRibbon(m.points, color, `${m.id}-ribbon`)}
                      {renderCota(m.points, color, m.id, scale, {
                        selected,
                        onClick: (e: React.MouseEvent) => selectShape('measurement', m.id, e),
                        badges,
                        badgeYOffset: badgeStackIndex * 20,
                        cotaOffset: m.cota_offset ?? 16,
                        onOffsetDragStart: tool === 'select' ? () => setDraggingCotaOffset({ measurementId: m.id }) : undefined,
                        totalLengthM: m.length_m,
                      })}
                      {!reaproveitamentoView && !fontesView && m.label && (m.kind === 'perfil' || (m.kind === 'fita' && !m.linked_measurement_id)) && (() => {
                        const [fx, fy] = toScreen(m.points[0])
                        return (
                          <text x={fx} y={fy - 8} fontSize={10} fontWeight={700} fill="#374151"
                            stroke="white" strokeWidth={3} paintOrder="stroke">
                            {m.label}
                          </text>
                        )
                      })()}
                      {reaproveitamentoView && (() => {
                        const badge = pieceBadgeMap.get(m.id)
                        if (!badge || badge.siblings.length === 0) return null
                        const [lx, ly] = toScreen(m.points[m.points.length - 1])
                        return (
                          <text key={`${m.id}-emenda`} x={lx + 8} y={ly + 10} fontSize={9} fontWeight={700} fill="#b45309"
                            stroke="white" strokeWidth={3} paintOrder="stroke">
                            ↔ emenda com: {badge.siblings.join(', ')}
                          </text>
                        )
                      })()}
                      {/* Alças pra arrastar a ponta e redimensionar — só na medição selecionada */}
                      {selected && tool === 'select' && m.points.map((pt, i) => {
                        const [sx, sy] = toScreen(pt)
                        return (
                          <circle key={i} cx={sx} cy={sy} r={6} fill="white" stroke={color} strokeWidth={2.5}
                            style={{ cursor: draggingPoint?.measurementId === m.id && draggingPoint.pointIndex === i ? 'grabbing' : 'grab' }}
                            onMouseDown={e => { e.stopPropagation(); setDraggingPoint({ measurementId: m.id, pointIndex: i }) }} />
                        )
                      })}
                    </g>
                  )
                })}

              {/* Fontes (12V) + cabo pontilhado até a fita — só aparece na
                  "Visualizar fontes", pra nunca poluir a visão geral. */}
              {fontesView && powerSupplies.filter(ps => ps.page === pageNum).map(ps => {
                const feeding = measurements.find(m => m.id === ps.measurement_id)
                const [sx, sy] = toScreen([ps.x, ps.y])
                const selected = selection?.kind === 'powerSupply' && selection.id === ps.id
                let cable: JSX.Element | null = null
                if (feeding) {
                  const anchor = closestPointOnPolyline([ps.x, ps.y], feeding.points)
                  const [ex, ey] = toScreen(anchor)
                  const midX = (sx + ex) / 2, midY = (sy + ey) / 2
                  const dx = ex - sx, dy = ey - sy
                  const len = Math.hypot(dx, dy) || 1
                  const nx = -dy / len, ny = dx / len
                  const curve = Math.min(30, len * 0.25)
                  const cx = midX + nx * curve, cy = midY + ny * curve
                  cable = (
                    <g pointerEvents="none">
                      <path d={`M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`} fill="none" stroke="white" strokeWidth={4.5} opacity={0.9} />
                      <path d={`M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`} fill="none" stroke="#d97706" strokeWidth={2} strokeDasharray="5 4" />
                    </g>
                  )
                }
                return (
                  <g key={ps.id}>
                    {cable}
                    <g
                      style={{ cursor: tool === 'select' ? (draggingFonte?.id === ps.id ? 'grabbing' : 'grab') : undefined }}
                      onClick={e => { if (!canSelectShape()) return; e.stopPropagation(); selectShape('powerSupply', ps.id, e) }}
                      onMouseDown={e => {
                        if (!canSelectShape()) return
                        e.stopPropagation()
                        const base = toBase(e)
                        setDraggingFonte({ id: ps.id, offsetX: base[0] - ps.x, offsetY: base[1] - ps.y })
                      }}>
                      <rect x={sx - 12} y={sy - 12} width={24} height={24} rx={5} fill="#d97706" stroke="white" strokeWidth={selected ? 3 : 2} />
                      <text x={sx} y={sy + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="white" pointerEvents="none">F</text>
                      <text x={sx} y={sy + 26} textAnchor="middle" fontSize={10} fontWeight={700} fill="#92400e"
                        stroke="white" strokeWidth={3} paintOrder="stroke" pointerEvents="none">{ps.watts}W</text>
                    </g>
                  </g>
                )
              })}

              {/* Símbolos — escondidos na visão limpa. Um círculo colorido (a
                  cor identifica o produto) em volta do ponto exato, com uma
                  seta apontando pro nome — em vez de uma bolinha com o
                  código, que não dizia nada de cara. */}
              {!reaproveitamentoView && !fontesView && pagePoints.symbols.map(s => {
                const [sx, sy] = toScreen([s.x, s.y])
                const li = legendItems.find(x => x.id === s.legend_item_id)
                const name = li?.description || li?.code || '?'
                const color = productColor(s.legend_item_id || 'sem-produto')
                const selected = selection?.kind === 'symbol' && selection.id === s.id
                const r = selected ? 13 : 10
                const tipX = sx + 24, tipY = sy - 24
                const arrowAngle = Math.atan2(tipY - sy, tipX - sx)
                const ah1 = arrowAngle + Math.PI * 0.85, ah2 = arrowAngle - Math.PI * 0.85
                const arrowHead = `${tipX},${tipY} ${tipX + 5 * Math.cos(ah1)},${tipY + 5 * Math.sin(ah1)} ${tipX + 5 * Math.cos(ah2)},${tipY + 5 * Math.sin(ah2)}`
                return (
                  <g key={s.id} style={{ cursor: tool === 'select' ? (draggingSymbol?.id === s.id ? 'grabbing' : 'grab') : undefined }}
                    onClick={e => { if (!canSelectShape()) return; e.stopPropagation(); selectShape('symbol', s.id, e) }}
                    onMouseDown={e => {
                      if (!canSelectShape()) return
                      e.stopPropagation()
                      const base = toBase(e)
                      setDraggingSymbol({ id: s.id, offsetX: base[0] - s.x, offsetY: base[1] - s.y })
                    }}>
                    <line x1={sx} y1={sy} x2={tipX} y2={tipY} stroke="white" strokeWidth={3.5} />
                    <line x1={sx} y1={sy} x2={tipX} y2={tipY} stroke={color} strokeWidth={1.5} />
                    <polygon points={arrowHead} fill={color} />
                    <circle cx={sx} cy={sy} r={r} fill={color} fillOpacity={0.3} stroke={color} strokeWidth={selected ? 3 : 2} />
                    <circle cx={sx} cy={sy} r={2} fill={color} />
                    <text x={tipX + 4} y={tipY + 3} fontSize={10} fontWeight={700} fill={color}
                      stroke="white" strokeWidth={3} paintOrder="stroke">{name}</text>
                  </g>
                )
              })}

              {/* Anotações — ciano forte (não a cor vermelha que a maioria
                  das plantas já usa pra cotas/observações do próprio CAD),
                  com halo branco por baixo pra sempre se destacar. */}
              {!reaproveitamentoView && !fontesView && pagePoints.annotations.map(a => {
                const selected = selection?.kind === 'annotation' && selection.id === a.id
                const onSel = (e: React.MouseEvent) => { if (!canSelectShape()) return; e.stopPropagation(); selectShape('annotation', a.id, e) }
                const ANOT_COLOR = '#0891b2'
                if (a.kind === 'rect') {
                  const [sx, sy] = toScreen([a.data.x, a.data.y])
                  const w = a.data.width * renderScale, h = a.data.height * renderScale
                  return (
                    <g key={a.id}>
                      <rect x={sx} y={sy} width={w} height={h} fill="transparent" stroke="white" strokeWidth={(selected ? 3 : 2) + 3} />
                      <rect x={sx} y={sy} width={w} height={h} fill="transparent" stroke={ANOT_COLOR} strokeWidth={selected ? 3 : 2}
                        style={{ cursor: tool === 'select' ? 'pointer' : undefined }} onClick={onSel} />
                    </g>
                  )
                }
                if (a.kind === 'freehand') {
                  const pts = (a.data.points as Point[]).map(toScreen).map(p => p.join(',')).join(' ')
                  return (
                    <g key={a.id}>
                      <polyline points={pts} fill="none" stroke="white" strokeWidth={(selected ? 3.5 : 2) + 3} strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points={pts} fill="none" stroke={ANOT_COLOR} strokeWidth={selected ? 3.5 : 2} strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points={pts} fill="none" stroke="transparent" strokeWidth={14} style={{ cursor: tool === 'select' ? 'pointer' : undefined }} onClick={onSel} />
                    </g>
                  )
                }
                if (a.kind === 'text') {
                  const [sx, sy] = toScreen([a.data.x, a.data.y])
                  return (
                    <g key={a.id}>
                      {a.data.arrowTo && (() => {
                        const [ex, ey] = toScreen(a.data.arrowTo)
                        return (
                          <g pointerEvents="none">
                            <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="white" strokeWidth={4.5} opacity={0.9} />
                            <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={ANOT_COLOR} strokeWidth={2} markerEnd="url(#arrowhead)" />
                          </g>
                        )
                      })()}
                      <text x={sx} y={sy} fontSize={a.data.fontSize ?? 13} fontWeight={700} fill={ANOT_COLOR}
                        style={{ cursor: tool === 'select' ? (draggingAnnotation?.id === a.id ? 'grabbing' : 'grab') : undefined }}
                        onClick={onSel}
                        onMouseDown={e => {
                          if (!canSelectShape()) return
                          e.stopPropagation()
                          const base = toBase(e)
                          setDraggingAnnotation({ id: a.id, offsetX: base[0] - a.data.x, offsetY: base[1] - a.data.y })
                        }}
                        stroke={selected ? '#a5f3fc' : 'white'} strokeWidth={selected ? 5 : 3.5} paintOrder="stroke">
                        {a.data.text}
                      </text>
                    </g>
                  )
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
              <AmbientesTab environments={environments} symbols={symbols} legendItems={legendItems} measurements={measurements}
                onRename={(id, name) => {
                  const before = environments.find(e => e.id === id)
                  if (before) updateEntity('environment', id, { name: before.name }, { name, status: 'editado' }, updateEnvironment)
                }}
                onDelete={id => deleteEntity('environment', id)}
                onRelink={relinkUnassigned}
                onDeleteSymbol={id => deleteEntity('symbol', id)}
                onChangeSymbolLegend={(id, legendItemId) => updateEntity('symbol', id, { legend_item_id: symbols.find(s => s.id === id)?.legend_item_id }, { legend_item_id: legendItemId }, updateSymbolOccurrence)}
                onUpdateMeasurement={updateMeasurementField}
                onDeleteMeasurement={id => deleteEntity('measurement', id)}
                onMergeMeasurement={mergeMeasurements}
                pieceBadgeMap={pieceBadgeMap}
                powerSupplies={powerSupplies} onStartFontePlacement={startFontePlacement} onDeleteFonte={deleteFonte}
                onFocusEnvironment={focusOnEnvironment}
                onDuplicatePerfilFita={duplicatePerfilFita} onDuplicateFita={duplicateFita}
              />
            )}
            {tab === 'legenda' && (
              <LegendaTab planId={plan.id} items={legendItems}
                onCreate={row => setLegendItems(prev => [...prev, row])}
                onUpdate={(id, updates) => { setLegendItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i)); updateLegendItem(plan.id, id, updates as Record<string, unknown>) }}
                onDelete={async id => { setLegendItems(prev => prev.filter(i => i.id !== id)); await deleteLegendItem(plan.id, id) }}
                onDuplicate={duplicateLegendItem}
              />
            )}
            {tab === 'medicoes' && (
              <MedicoesTab measurements={measurements} environments={environments}
                onUpdate={updateMeasurementField}
                onDelete={id => deleteEntity('measurement', id)}
                onMerge={mergeMeasurements}
                pieceBadgeMap={pieceBadgeMap}
                perfilGroups={perfilGroups} fitaGroups={fitaGroups}
                powerSupplies={powerSupplies} onStartFontePlacement={startFontePlacement} onDeleteFonte={deleteFonte}
                onDuplicatePerfilFita={duplicatePerfilFita} onDuplicateFita={duplicateFita}
              />
            )}
            {tab === 'resultado' && (
              <ResultadoTab environments={environments} legendItems={legendItems} symbols={symbols} measurements={measurements} powerSupplies={powerSupplies}
                perfilGroups={perfilGroups} fitaGroups={fitaGroups} onFocusEnvironment={focusOnEnvironment} />
            )}
          </div>
        )}
      </div>
      </div>

      {/* Popover flutuante — clicar em qualquer marcação (ambiente, símbolo,
          medição, anotação) mostra os detalhes ali mesmo, sem precisar
          procurar na aba lateral. */}
      {selection && popoverAnchor && (
        <SelectionPopover
          selection={selection} anchor={popoverAnchor} onClose={() => setSelection(null)}
          environments={environments} legendItems={legendItems}
          symbols={symbols} measurements={measurements} annotations={annotations}
          pieceBadgeMap={pieceBadgeMap}
          onDeleteSelected={deleteSelected}
          onRenameEnv={(id, name) => updateEntity('environment', id, { name: environments.find(e => e.id === id)?.name }, { name, status: 'editado' }, updateEnvironment)}
          onChangeSymbolLegend={(id, legendItemId) => updateEntity('symbol', id, { legend_item_id: symbols.find(s => s.id === id)?.legend_item_id }, { legend_item_id: legendItemId }, updateSymbolOccurrence)}
          onChangeSymbolEnv={(id, envId) => updateEntity('symbol', id, { environment_id: symbols.find(s => s.id === id)?.environment_id }, { environment_id: envId }, updateSymbolOccurrence)}
          onUpdateMeasurement={updateMeasurementField}
          onMergeMeasurement={mergeMeasurements}
          onViewContents={() => { setTab('ambientes'); setPanelOpen(true); setSelection(null) }}
          onUpdateAnnotation={updateAnnotationData}
          onDeleteMeasurement={id => deleteEntity('measurement', id)}
          onStartArrow={id => { setPendingArrowFor(id); setSelection(null) }}
          powerSupplies={powerSupplies} onStartFontePlacement={startFontePlacement} onDeleteFonte={deleteFonte}
          onDuplicatePerfilFita={duplicatePerfilFita} onDuplicateFita={duplicateFita}
        />
      )}

      {/* Popover pra escolher o símbolo da legenda, ancorado no ponto que foi
          clicado na planta — mostra código + descrição, não só o código. */}
      {pendingSymbol && pendingSymbolAnchor && (
        <div
          style={{ position: 'fixed', left: Math.min(pendingSymbolAnchor.x + 12, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 260), top: Math.min(pendingSymbolAnchor.y + 12, (typeof window !== 'undefined' ? window.innerHeight : 800) - 220), zIndex: 50, width: 248 }}
          className="bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-3 pt-2">
            <p className="text-[10px] font-bold text-violet-500 uppercase">Qual símbolo?</p>
            <button onClick={() => { setPendingSymbol(null); setPendingSymbolAnchor(null) }} className="p-1 text-gray-300 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
          </div>
          <p className="text-[10px] text-gray-400 px-3 pb-1">📌 marca esse produto e continua marcando nos próximos cliques, sem abrir essa lista de novo.</p>
          <div className="p-2.5 pt-1 space-y-1 max-h-72 overflow-y-auto">
            {legendItems.length === 0 && <p className="text-xs text-gray-400 px-1 py-2">Cadastre pelo menos um item na aba Legenda primeiro.</p>}
            {legendItems.map(li => {
              const color = productColor(li.id)
              return (
                <div key={li.id} className="flex items-center gap-1">
                  <button onClick={() => confirmSymbol(li.id)}
                    className="flex-1 min-w-0 flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-violet-50 transition-colors">
                    <span className="shrink-0 text-xs font-bold text-white rounded-full w-6 h-6 flex items-center justify-center" style={{ backgroundColor: color }}>{li.code}</span>
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-gray-700 truncate">{li.description || 'sem descrição'}</span>
                      {(li.power_w || li.color_temp_k) && (
                        <span className="block text-[10px] text-gray-400">{li.power_w ? `${li.power_w}W` : ''}{li.power_w && li.color_temp_k ? ' · ' : ''}{li.color_temp_k ? `${li.color_temp_k}K` : ''}</span>
                      )}
                    </span>
                  </button>
                  <button onClick={() => confirmSymbol(li.id, true)} title="Marcar e continuar carimbando esse produto"
                    className="shrink-0 text-sm px-1.5 py-1 rounded hover:bg-violet-100">📌</button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

// ── Popover flutuante de seleção ─────────────────────────────────────────────
// Mostra os detalhes de qualquer coisa clicada na planta (ambiente, símbolo,
// medição, anotação) ali mesmo, ancorado no ponto do clique — evita ter que
// procurar o item na lista da aba lateral pra editar ou excluir.

function SelectionPopover({
  selection, anchor, onClose, environments, legendItems, symbols, measurements, annotations, pieceBadgeMap,
  onDeleteSelected, onRenameEnv, onChangeSymbolLegend, onChangeSymbolEnv, onUpdateMeasurement, onMergeMeasurement, onViewContents, onUpdateAnnotation, onDeleteMeasurement, onStartArrow,
  powerSupplies, onStartFontePlacement, onDeleteFonte, onDuplicatePerfilFita, onDuplicateFita,
}: {
  selection: { kind: EntityKind; id: string }
  anchor: { x: number; y: number }
  onClose: () => void
  environments: Environment[]; legendItems: LegendItem[]; symbols: SymbolOccurrence[]
  measurements: Measurement[]; annotations: Annotation[]
  pieceBadgeMap: Map<string, PieceBadge>
  onDeleteSelected: () => void
  onRenameEnv: (id: string, name: string) => void
  onChangeSymbolLegend: (id: string, legendItemId: string | null) => void
  onChangeSymbolEnv: (id: string, envId: string | null) => void
  onUpdateMeasurement: (id: string, updates: Partial<Measurement>) => void
  onMergeMeasurement: (idA: string, idB: string) => void
  onViewContents: () => void
  onUpdateAnnotation: (id: string, patch: Record<string, unknown>) => void
  onDeleteMeasurement: (id: string) => void
  onStartArrow: (id: string) => void
  powerSupplies: PowerSupply[]
  onStartFontePlacement: (measurementId: string, watts: number) => void
  onDeleteFonte: (id: string) => void
  onDuplicatePerfilFita: (perfil: Measurement, fita: Measurement) => void
  onDuplicateFita: (fita: Measurement) => void
}) {
  const winW = typeof window !== 'undefined' ? window.innerWidth : 1200
  const winH = typeof window !== 'undefined' ? window.innerHeight : 800
  const popoverWidth = 340
  const margin = 16
  // O popover precisa caber inteiro na tela mesmo quando abre perto da borda
  // — top é limitado pra sempre sobrar espaço suficiente embaixo pro
  // maxHeight (senão o conteúdo vaza pra fora da viewport sem como rolar
  // até o fim, que era o bug relatado).
  const top = Math.min(anchor.y + 12, winH - margin - 200)
  const style: React.CSSProperties = {
    position: 'fixed', left: Math.min(anchor.x + 12, winW - popoverWidth - margin), top: Math.max(margin, top),
    zIndex: 50, width: popoverWidth, maxHeight: winH - Math.max(margin, top) - margin, display: 'flex', flexDirection: 'column',
  }

  let content: React.ReactNode = null
  let showHeaderDelete = true

  if (selection.kind === 'environment') {
    const env = environments.find(e => e.id === selection.id)
    if (!env) return null
    const countSymbols = symbols.filter(s => s.environment_id === env.id).length
    const countMeasurements = measurements.filter(m => m.environment_id === env.id).length
    content = (
      <div className="p-3 space-y-1.5">
        <p className="text-[10px] font-bold text-gray-400 uppercase">Ambiente</p>
        <input defaultValue={env.name} onBlur={e => e.target.value.trim() && e.target.value !== env.name && onRenameEnv(env.id, e.target.value.trim())}
          className="w-full text-sm font-semibold text-gray-800 outline-none border-b border-transparent focus:border-brand-300" />
        <p className="text-xs text-gray-400">{countSymbols} símbolo(s) · {countMeasurements} medição(ões) · {env.status}</p>
        <button onClick={onViewContents} className="text-xs font-medium text-brand-600 hover:underline">Ver e editar conteúdo →</button>
      </div>
    )
  } else if (selection.kind === 'symbol') {
    const s = symbols.find(x => x.id === selection.id)
    if (!s) return null
    content = (
      <div className="p-3 space-y-2">
        <p className="text-[10px] font-bold text-gray-400 uppercase">Símbolo</p>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {legendItems.map(li => (
            <button key={li.id} onClick={() => onChangeSymbolLegend(s.id, li.id)}
              className={cn('w-full flex items-center gap-2 text-left px-2 py-1 rounded-lg border transition-colors',
                li.id === s.legend_item_id ? 'bg-violet-50 border-violet-300' : 'bg-white border-transparent hover:bg-gray-50')}>
              <span className={cn('shrink-0 text-[11px] font-bold rounded-full w-5 h-5 flex items-center justify-center',
                li.id === s.legend_item_id ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600')}>{li.code}</span>
              <span className="text-xs text-gray-600 truncate">{li.description || 'sem descrição'}</span>
            </button>
          ))}
          {legendItems.length === 0 && <p className="text-xs text-gray-400">Cadastre a legenda primeiro.</p>}
        </div>
        <select value={s.environment_id ?? ''} onChange={e => onChangeSymbolEnv(s.id, e.target.value || null)}
          className="w-full text-xs text-gray-600 border border-gray-200 rounded-md px-2 py-1">
          <option value="">Sem ambiente</option>
          {environments.map(env => <option key={env.id} value={env.id}>{env.name}</option>)}
        </select>
      </div>
    )
  } else if (selection.kind === 'measurement') {
    const m = measurements.find(x => x.id === selection.id)
    if (!m) return null
    showHeaderDelete = false // o card já tem seu próprio botão de excluir

    // Perfil + fita da mesma instalação: mostra o card combinado igual à
    // barra lateral, não importa em qual das duas linhas o clique caiu.
    const comboPerfil = m.kind === 'perfil' ? m : (m.linked_measurement_id ? measurements.find(x => x.id === m.linked_measurement_id) : undefined)
    const comboFita = m.kind === 'fita' ? m : measurements.find(x => x.linked_measurement_id === m.id)

    const profileModelSuggestions = Array.from(new Set(measurements.filter(x => x.kind === 'perfil' && x.product_model).map(x => x.product_model as string)))
    const fitaModelSuggestions = Array.from(new Set(measurements.filter(x => x.kind === 'fita' && x.product_model).map(x => x.product_model as string)))
    const installLocationSuggestions = Array.from(new Set(measurements.filter(x => x.installation_location).map(x => x.installation_location as string)))

    if (comboPerfil && comboFita && comboPerfil.kind === 'perfil' && comboFita.kind === 'fita') {
      content = (
        <div className="p-3">
          <PerfilFitaCard perfil={comboPerfil} fita={comboFita} environments={environments}
            onChangeEnv={envId => { onUpdateMeasurement(comboPerfil.id, { environment_id: envId }); onUpdateMeasurement(comboFita.id, { environment_id: envId }) }}
            onChangeLabel={v => onUpdateMeasurement(comboPerfil.id, { label: v })}
            onChangeLength={v => { const val = Number(v.replace(',', '.')) || 0; onUpdateMeasurement(comboPerfil.id, { length_m: val }); onUpdateMeasurement(comboFita.id, { length_m: val }) }}
            onChangePotencia={v => onUpdateMeasurement(comboFita.id, { power_w_per_m: Number(v.replace(',', '.')) || 0 })}
            onChangeStrandCount={v => onUpdateMeasurement(comboFita.id, { strand_count: v })}
            onDelete={() => { onDeleteMeasurement(comboPerfil.id); onDeleteMeasurement(comboFita.id); onClose() }}
            pieceBadgePerfil={pieceBadgeMap.get(comboPerfil.id)} pieceBadgeFita={pieceBadgeMap.get(comboFita.id)}
            powerSupplies={powerSupplies} onStartFontePlacement={onStartFontePlacement} onDeleteFonte={onDeleteFonte}
            onChangeProfileModel={v => onUpdateMeasurement(comboPerfil.id, { product_model: v })}
            onChangeMountType={v => onUpdateMeasurement(comboPerfil.id, { mount_type: v })}
            onChangeBarSize={v => onUpdateMeasurement(comboPerfil.id, { bar_size: v })}
            profileModelSuggestions={profileModelSuggestions}
            onChangeFitaModel={v => onUpdateMeasurement(comboFita.id, { product_model: v })}
            onChangeVoltage={v => onUpdateMeasurement(comboFita.id, { voltage: v })}
            onChangePackaging={v => onUpdateMeasurement(comboFita.id, { packaging: v })}
            fitaModelSuggestions={fitaModelSuggestions}
            onChangeInstallLocation={v => onUpdateMeasurement(comboPerfil.id, { installation_location: v })}
            installLocationSuggestions={installLocationSuggestions}
            onChangeColorTemp={v => onUpdateMeasurement(comboFita.id, { color_temp_k: v })}
            onDuplicate={() => onDuplicatePerfilFita(comboPerfil, comboFita)} />
        </div>
      )
    } else {
      const shared = {
        m, environments,
        onChangeEnv: (envId: string | null) => onUpdateMeasurement(m.id, { environment_id: envId }),
        onChangeLabel: (v: string) => onUpdateMeasurement(m.id, { label: v }),
        onDelete: onDeleteSelected,
        onChangeLength: (v: string) => onUpdateMeasurement(m.id, { length_m: Number(v.replace(',', '.')) || 0 }),
        mergeCandidates: measurements.filter(x => x.kind === m.kind && x.id !== m.id),
        onMerge: (otherId: string) => onMergeMeasurement(m.id, otherId),
        pieceBadge: pieceBadgeMap.get(m.id),
        linkNote: linkNoteFor(m, measurements),
      }
      content = (
        <div className="p-3">
          {m.kind === 'fita'
            ? <FitaCard {...shared} onChangePotencia={v => onUpdateMeasurement(m.id, { power_w_per_m: Number(v.replace(',', '.')) || 0 })}
                onChangeStrandCount={v => onUpdateMeasurement(m.id, { strand_count: v })}
                powerSupplies={powerSupplies} onStartFontePlacement={onStartFontePlacement} onDeleteFonte={onDeleteFonte}
                onChangeModel={v => onUpdateMeasurement(m.id, { product_model: v })}
                onChangeVoltage={v => onUpdateMeasurement(m.id, { voltage: v })}
                onChangePackaging={v => onUpdateMeasurement(m.id, { packaging: v })}
                modelSuggestions={fitaModelSuggestions}
                onChangeInstallLocation={v => onUpdateMeasurement(m.id, { installation_location: v })}
                installLocationSuggestions={installLocationSuggestions}
                onChangeColorTemp={v => onUpdateMeasurement(m.id, { color_temp_k: v })}
                onDuplicate={() => onDuplicateFita(m)} />
            : <SimpleMeasurementCard {...shared} />}
        </div>
      )
    }
  } else if (selection.kind === 'annotation') {
    const a = annotations.find(x => x.id === selection.id)
    if (!a) return null
    const KIND_LABEL: Record<string, string> = { rect: 'Retângulo', freehand: 'Desenho livre', text: 'Texto', highlight: 'Marca-texto' }
    const fontSize = a.data.fontSize ?? 13
    content = (
      <div className="p-3 space-y-1.5">
        <p className="text-[10px] font-bold text-gray-400 uppercase">Anotação · {KIND_LABEL[a.kind] ?? a.kind}</p>
        {a.kind === 'text' && (
          <>
            <textarea defaultValue={a.data.text} rows={2} onBlur={e => onUpdateAnnotation(a.id, { text: e.target.value })}
              className="w-full text-sm text-gray-700 border border-gray-200 rounded-md p-1.5 outline-none focus:border-brand-400 resize-none" />
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-500">Tamanho</span>
              <button onClick={() => onUpdateAnnotation(a.id, { fontSize: Math.max(9, fontSize - 2) })}
                className="w-6 h-6 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">−</button>
              <span className="text-[11px] text-gray-600 w-6 text-center">{fontSize}</span>
              <button onClick={() => onUpdateAnnotation(a.id, { fontSize: Math.min(40, fontSize + 2) })}
                className="w-6 h-6 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">+</button>
            </div>
            <textarea defaultValue={a.data.note ?? ''} rows={2} placeholder="Observação (opcional, não aparece na planta)..."
              onBlur={e => onUpdateAnnotation(a.id, { note: e.target.value })}
              className="w-full text-xs text-gray-500 border border-gray-100 bg-gray-50 rounded-md p-1.5 outline-none focus:border-brand-300 resize-none" />
            <div className="flex items-center gap-2">
              <button onClick={() => onStartArrow(a.id)} className="text-[11px] font-medium text-brand-600 hover:underline">🎯 {a.data.arrowTo ? 'Reapontar seta' : 'Adicionar seta pra um ponto'}</button>
              {a.data.arrowTo && (
                <button onClick={() => onUpdateAnnotation(a.id, { arrowTo: null })} className="text-[11px] text-gray-400 hover:text-red-500">remover seta</button>
              )}
            </div>
            <p className="text-[10px] text-gray-300">Arraste o texto na planta pra reposicionar.</p>
          </>
        )}
      </div>
    )
  }

  if (!content) return null

  return (
    <div style={style} className="bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-1 pt-1 shrink-0">
        {showHeaderDelete
          ? <button onClick={onDeleteSelected} title="Excluir" className="p-1.5 text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
          : <span />}
        <button onClick={onClose} title="Fechar (Esc)" className="p-1.5 text-gray-300 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className="overflow-y-auto">{content}</div>
    </div>
  )
}

// ── Aba: Ambientes ──────────────────────────────────────────────────────────

function AmbientesTab({
  environments, symbols, legendItems, measurements, onRename, onDelete, onRelink,
  onDeleteSymbol, onChangeSymbolLegend, onUpdateMeasurement, onDeleteMeasurement, onMergeMeasurement, pieceBadgeMap,
  powerSupplies, onStartFontePlacement, onDeleteFonte, onFocusEnvironment, onDuplicatePerfilFita, onDuplicateFita,
}: {
  environments: Environment[]; symbols: SymbolOccurrence[]; legendItems: LegendItem[]; measurements: Measurement[]
  onRename: (id: string, name: string) => void; onDelete: (id: string) => void; onRelink: () => void
  onDeleteSymbol: (id: string) => void; onChangeSymbolLegend: (id: string, legendItemId: string | null) => void
  onUpdateMeasurement: (id: string, updates: Partial<Measurement>) => void; onDeleteMeasurement: (id: string) => void
  onMergeMeasurement: (idA: string, idB: string) => void; pieceBadgeMap: Map<string, PieceBadge>
  powerSupplies: PowerSupply[]; onStartFontePlacement: (measurementId: string, watts: number) => void; onDeleteFonte: (id: string) => void
  onFocusEnvironment: (env: Environment) => void
  onDuplicatePerfilFita: (perfil: Measurement, fita: Measurement) => void
  onDuplicateFita: (fita: Measurement) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const semAmbiente = symbols.filter(s => !s.environment_id).length + measurements.filter(m => !m.environment_id).length
  const profileModelSuggestions = Array.from(new Set(measurements.filter(m => m.kind === 'perfil' && m.product_model).map(m => m.product_model as string)))
  const fitaModelSuggestions = Array.from(new Set(measurements.filter(m => m.kind === 'fita' && m.product_model).map(m => m.product_model as string)))
  const installLocationSuggestions = Array.from(new Set(measurements.filter(m => m.installation_location).map(m => m.installation_location as string)))

  if (environments.length === 0) {
    return <p className="text-xs text-gray-400">Nenhum ambiente ainda. Use a ferramenta "Ambiente" no viewer pra desenhar um polígono sobre a planta.</p>
  }
  return (
    <div className="space-y-3">
      {semAmbiente > 0 && (
        <button onClick={onRelink}
          className="w-full text-xs font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg px-3 py-2 transition-colors">
          🔄 Revincular {semAmbiente} marcação(ões) sem ambiente aos polígonos já desenhados
        </button>
      )}
      {environments.map(env => {
        const envSymbols = symbols.filter(s => s.environment_id === env.id)
        const envMeasurements = measurements.filter(m => m.environment_id === env.id)
        const open = expanded === env.id
        return (
          <div key={env.id} className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="p-3 cursor-pointer hover:bg-gray-50 transition-colors" title="Ver este ambiente na planta"
              onClick={() => onFocusEnvironment(env)}>
              <div className="flex items-center gap-2">
                <input defaultValue={env.name} onClick={e => e.stopPropagation()}
                  onBlur={e => e.target.value.trim() && e.target.value !== env.name && onRename(env.id, e.target.value.trim())}
                  className="flex-1 text-sm font-semibold text-gray-800 outline-none border-b border-transparent focus:border-brand-300" />
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{env.status}</span>
                <Locate className="w-3.5 h-3.5 text-gray-300" />
                <button onClick={e => { e.stopPropagation(); onDelete(env.id) }} className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <button onClick={e => { e.stopPropagation(); setExpanded(open ? null : env.id) }}
                className="text-xs text-gray-400 hover:text-brand-600 mt-1 flex items-center gap-1">
                {envSymbols.length} símbolo(s) · {envMeasurements.length} medição(ões)
                <ChevronRight className={cn('w-3 h-3 transition-transform', open && 'rotate-90')} />
              </button>
            </div>
            {open && (
              <div className="bg-gray-50 border-t border-gray-100 p-3 space-y-2">
                {Array.from(
                  envSymbols.reduce((map, s) => {
                    const key = s.legend_item_id ?? '__sem_legenda__'
                    if (!map.has(key)) map.set(key, [])
                    map.get(key)!.push(s)
                    return map
                  }, new Map<string, SymbolOccurrence[]>())
                ).map(([legendItemId, group]) => {
                  const li = legendItems.find(x => x.id === legendItemId)
                  const groupKey = `${env.id}__${legendItemId}`
                  const groupOpen = expandedGroup === groupKey
                  return (
                    <div key={legendItemId} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                      <button onClick={() => setExpandedGroup(groupOpen ? null : groupKey)}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-gray-50">
                        <span className="shrink-0 text-[10px] font-bold text-white bg-violet-600 rounded-full w-5 h-5 flex items-center justify-center">{li?.code ?? '?'}</span>
                        <span className="text-xs text-gray-600 flex-1 truncate text-left">{li?.description || 'sem descrição'}</span>
                        <span className="text-[11px] font-semibold text-gray-400">{group.length} und</span>
                        <ChevronRight className={cn('w-3 h-3 text-gray-400 transition-transform', groupOpen && 'rotate-90')} />
                      </button>
                      {groupOpen && (
                        <div className="border-t border-gray-100 divide-y divide-gray-100">
                          {group.map(s => (
                            <div key={s.id} className="flex items-center gap-2 px-2.5 py-1.5">
                              <select value={s.legend_item_id ?? ''} onChange={e => onChangeSymbolLegend(s.id, e.target.value || null)}
                                className="flex-1 text-xs text-gray-600 bg-transparent border border-gray-200 rounded px-1.5 py-1 outline-none">
                                <option value="">Sem legenda</option>
                                {legendItems.map(x => <option key={x.id} value={x.id}>{x.code} — {x.description || 'sem descrição'}</option>)}
                              </select>
                              <button onClick={() => onDeleteSymbol(s.id)} className="text-gray-300 hover:text-red-500 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
                {envMeasurements.filter(m => !(m.kind === 'fita' && envMeasurements.some(p => p.kind === 'perfil' && p.id === m.linked_measurement_id))).map(m => {
                  const linkedFita = m.kind === 'perfil' ? envMeasurements.find(f => f.linked_measurement_id === m.id) : undefined
                  if (m.kind === 'perfil' && linkedFita) {
                    return (
                      <PerfilFitaCard key={m.id} perfil={m} fita={linkedFita} environments={environments}
                        onChangeEnv={envId => { onUpdateMeasurement(m.id, { environment_id: envId }); onUpdateMeasurement(linkedFita.id, { environment_id: envId }) }}
                        onChangeLabel={v => onUpdateMeasurement(m.id, { label: v })}
                        onChangeLength={v => { const val = Number(v.replace(',', '.')) || 0; onUpdateMeasurement(m.id, { length_m: val }); onUpdateMeasurement(linkedFita.id, { length_m: val }) }}
                        onChangePotencia={v => onUpdateMeasurement(linkedFita.id, { power_w_per_m: Number(v.replace(',', '.')) || 0 })}
                        onChangeStrandCount={v => onUpdateMeasurement(linkedFita.id, { strand_count: v })}
                        onDelete={() => { onDeleteMeasurement(m.id); onDeleteMeasurement(linkedFita.id) }}
                        pieceBadgePerfil={pieceBadgeMap.get(m.id)} pieceBadgeFita={pieceBadgeMap.get(linkedFita.id)}
                        powerSupplies={powerSupplies} onStartFontePlacement={onStartFontePlacement} onDeleteFonte={onDeleteFonte}
                        onChangeProfileModel={v => onUpdateMeasurement(m.id, { product_model: v })}
                        onChangeMountType={v => onUpdateMeasurement(m.id, { mount_type: v })}
                        onChangeBarSize={v => onUpdateMeasurement(m.id, { bar_size: v })}
                        profileModelSuggestions={profileModelSuggestions}
                        onChangeFitaModel={v => onUpdateMeasurement(linkedFita.id, { product_model: v })}
                        onChangeVoltage={v => onUpdateMeasurement(linkedFita.id, { voltage: v })}
                        onChangePackaging={v => onUpdateMeasurement(linkedFita.id, { packaging: v })}
                        fitaModelSuggestions={fitaModelSuggestions}
                        onChangeInstallLocation={v => onUpdateMeasurement(m.id, { installation_location: v })}
                        installLocationSuggestions={installLocationSuggestions}
                        onChangeColorTemp={v => onUpdateMeasurement(linkedFita.id, { color_temp_k: v })}
                        onDuplicate={() => onDuplicatePerfilFita(m, linkedFita)} />
                    )
                  }
                  return m.kind === 'fita'
                    ? <FitaCard key={m.id} m={m} environments={environments} onChangeEnv={envId => onUpdateMeasurement(m.id, { environment_id: envId })}
                        onChangeLabel={v => onUpdateMeasurement(m.id, { label: v })}
                        onDelete={() => onDeleteMeasurement(m.id)} onChangePotencia={v => onUpdateMeasurement(m.id, { power_w_per_m: Number(v.replace(',', '.')) || 0 })}
                        onChangeLength={v => onUpdateMeasurement(m.id, { length_m: Number(v.replace(',', '.')) || 0 })}
                        onChangeStrandCount={v => onUpdateMeasurement(m.id, { strand_count: v })}
                        pieceBadge={pieceBadgeMap.get(m.id)} linkNote={linkNoteFor(m, measurements)}
                        powerSupplies={powerSupplies} onStartFontePlacement={onStartFontePlacement} onDeleteFonte={onDeleteFonte}
                        onChangeModel={v => onUpdateMeasurement(m.id, { product_model: v })}
                        onChangeVoltage={v => onUpdateMeasurement(m.id, { voltage: v })}
                        onChangePackaging={v => onUpdateMeasurement(m.id, { packaging: v })}
                        modelSuggestions={fitaModelSuggestions}
                        onChangeInstallLocation={v => onUpdateMeasurement(m.id, { installation_location: v })}
                        installLocationSuggestions={installLocationSuggestions}
                        onChangeColorTemp={v => onUpdateMeasurement(m.id, { color_temp_k: v })}
                        onDuplicate={() => onDuplicateFita(m)}
                        mergeCandidates={measurements.filter(x => x.kind === 'fita' && x.id !== m.id)} onMerge={otherId => onMergeMeasurement(m.id, otherId)} />
                    : <SimpleMeasurementCard key={m.id} m={m} environments={environments} onChangeEnv={envId => onUpdateMeasurement(m.id, { environment_id: envId })}
                        onChangeLabel={v => onUpdateMeasurement(m.id, { label: v })}
                        onDelete={() => onDeleteMeasurement(m.id)} onChangeLength={v => onUpdateMeasurement(m.id, { length_m: Number(v.replace(',', '.')) || 0 })}
                        pieceBadge={pieceBadgeMap.get(m.id)} linkNote={linkNoteFor(m, measurements)}
                        mergeCandidates={measurements.filter(x => x.kind === m.kind && x.id !== m.id)} onMerge={otherId => onMergeMeasurement(m.id, otherId)} />
                })}
                {envSymbols.length === 0 && envMeasurements.length === 0 && <p className="text-xs text-gray-400">Nada marcado aqui ainda.</p>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Aba: Legenda ─────────────────────────────────────────────────────────────

function LegendaTab({ planId, items, onCreate, onUpdate, onDelete, onDuplicate }: {
  planId: string; items: LegendItem[]
  onCreate: (row: LegendItem) => void; onUpdate: (id: string, updates: Partial<LegendItem>) => void; onDelete: (id: string) => void
  onDuplicate: (item: LegendItem) => void
}) {
  const [name, setName] = useState('')
  const [powerW, setPowerW] = useState('')
  const [colorTemp, setColorTemp] = useState<number | null>(null)
  const [mountType, setMountType] = useState<'embutir' | 'sobrepor' | null>(null)
  const [hasLamp, setHasLamp] = useState(false)
  const [lampName, setLampName] = useState('')
  const [lampColorTemp, setLampColorTemp] = useState<number | null>(null)
  const [lampAngle, setLampAngle] = useState('')
  const [lampQty, setLampQty] = useState(1)
  const [saving, setSaving] = useState(false)

  // Autocomplete pelos nomes (de produto e de lâmpada) já usados nesse
  // plano — evita redigitar o mesmo nome item após item.
  const nameSuggestions = Array.from(new Set(items.filter(i => i.description).map(i => i.description as string)))
  const lampNameSuggestions = Array.from(new Set(items.filter(i => i.lamp_name).map(i => i.lamp_name as string)))

  // Código sequencial automático dentro do projeto — nunca precisa digitar,
  // só reaproveita o próximo número livre (maior código existente + 1).
  const nextCode = String(items.reduce((max, i) => Math.max(max, parseInt(i.code, 10) || 0), 0) + 1).padStart(2, '0')

  async function add() {
    if (!name.trim()) return
    setSaving(true)
    const res = await createLegendItem(planId, {
      code: nextCode, description: name.trim(),
      power_w: powerW ? Number(powerW.replace(',', '.')) : undefined,
      // Com lâmpada, a temperatura de cor é da lâmpada, não do corpo — pra
      // não duplicar/confundir a informação.
      color_temp_k: hasLamp ? undefined : colorTemp ?? undefined, mount_type: mountType ?? undefined,
      has_lamp: hasLamp,
      lamp_name: hasLamp ? lampName.trim() || undefined : undefined,
      lamp_color_temp_k: hasLamp ? lampColorTemp ?? undefined : undefined,
      lamp_angle_deg: hasLamp && lampAngle ? Number(lampAngle.replace(',', '.')) : undefined,
      lamp_qty: hasLamp ? lampQty : undefined,
    })
    if (res?.data) onCreate(res.data)
    setName(''); setPowerW(''); setColorTemp(null); setMountType(null)
    setHasLamp(false); setLampName(''); setLampColorTemp(null); setLampAngle(''); setLampQty(1)
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <div className="border border-dashed border-gray-300 rounded-xl p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase">Novo item · código {nextCode}</p>
        <ModelInput value={name} onCommit={setName} suggestions={nameSuggestions} listId="legend-name-new"
          placeholder="Nome do produto (spot embutido, fita COB...)" />
        {!hasLamp && (
          <div>
            <p className="text-[10px] text-gray-500 mb-1">Temperatura de cor</p>
            <ChoiceChips options={[2700, 3000, 4000, 6500].map(k => ({ value: k, label: `${k}K` }))} value={colorTemp} onChange={setColorTemp} />
          </div>
        )}
        <div>
          <p className="text-[10px] text-gray-500 mb-1">Instalação</p>
          <ChoiceChips options={[{ value: 'embutir', label: 'Embutir' }, { value: 'sobrepor', label: 'Sobrepor' }]} value={mountType} onChange={setMountType} />
        </div>
        <input placeholder="Potência (W)" value={powerW} onChange={e => setPowerW(e.target.value)} className="input text-xs !py-1.5 w-full" />
        <button type="button" onClick={() => setHasLamp(v => !v)}
          className={cn('text-xs font-medium rounded-lg px-2.5 py-1.5 w-full text-left transition-colors',
            hasLamp ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
          💡 {hasLamp ? '✓ Inclui lâmpada' : '+ Incluir lâmpada (spot que já vem com a lâmpada especificada)'}
        </button>
        {hasLamp && (
          <div className="bg-amber-50 rounded-lg p-2 space-y-1.5">
            <ModelInput value={lampName} onCommit={setLampName} suggestions={lampNameSuggestions} listId="lamp-name-new"
              placeholder="Nome da lâmpada (ex: Dicroica GU10)" />
            <div>
              <p className="text-[10px] text-gray-500 mb-1">Temperatura da lâmpada</p>
              <ChoiceChips options={[2700, 3000, 4000, 6500].map(k => ({ value: k, label: `${k}K` }))} value={lampColorTemp} onChange={setLampColorTemp} />
            </div>
            <input placeholder="Ângulo de abertura (graus)" value={lampAngle} onChange={e => setLampAngle(e.target.value)}
              className="input text-xs !py-1.5 w-full" />
            <div>
              <p className="text-[10px] text-gray-500 mb-1">Quantidade de lâmpadas (spot duplo, triplo...)</p>
              <ChoiceChips options={[1, 2, 3, 4].map(n => ({ value: n, label: String(n) }))} value={lampQty} onChange={setLampQty} />
            </div>
          </div>
        )}
        <button onClick={add} disabled={saving || !name.trim()} className="btn-primary text-xs w-full justify-center !py-1.5">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Adicionar à legenda'}
        </button>
      </div>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="border border-gray-200 rounded-lg p-2.5 space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="w-8 shrink-0 text-sm font-bold text-violet-700 pt-0.5">{item.code}</span>
              <SyncedInput value={item.description ?? ''} onCommit={v => onUpdate(item.id, { description: v || null })}
                placeholder="Nome do produto" list={`legend-name-${item.id}`}
                className="flex-1 min-w-0 text-sm text-gray-700 outline-none border-b border-transparent focus:border-brand-300" />
              <datalist id={`legend-name-${item.id}`}>{nameSuggestions.map(s => <option key={s} value={s} />)}</datalist>
              <button onClick={() => onDuplicate(item)} title="Duplicar" className="text-gray-300 hover:text-brand-600 shrink-0"><Copy className="w-3.5 h-3.5" /></button>
              <button onClick={() => onDelete(item.id)} className="text-gray-300 hover:text-red-500 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex items-center gap-2 flex-wrap pl-8">
              {!item.has_lamp && (
                <ChoiceChips options={[2700, 3000, 4000, 6500].map(k => ({ value: k, label: `${k}K` }))}
                  value={item.color_temp_k ?? null} onChange={v => onUpdate(item.id, { color_temp_k: v })} />
              )}
              <ChoiceChips options={[{ value: 'embutir', label: 'Embutir' }, { value: 'sobrepor', label: 'Sobrepor' }]}
                value={item.mount_type ?? null} onChange={v => onUpdate(item.id, { mount_type: v })} />
              <div className="flex items-center gap-1">
                <SyncedInput value={item.power_w != null ? String(item.power_w) : ''} onCommit={v => onUpdate(item.id, { power_w: v ? Number(v.replace(',', '.')) : null })}
                  placeholder="—" className="w-10 text-[11px] text-gray-500 text-right outline-none border-b border-transparent focus:border-brand-300" />
                <span className="text-[11px] text-gray-400">W</span>
              </div>
            </div>
            <div className="pl-8">
              <button onClick={() => onUpdate(item.id, { has_lamp: !item.has_lamp, ...(!item.has_lamp ? { color_temp_k: null } : {}) })}
                className={cn('text-[11px] font-medium rounded px-2 py-1', item.has_lamp ? 'bg-amber-100 text-amber-700' : 'text-gray-400 hover:bg-gray-100')}>
                💡 {item.has_lamp ? '✓ Inclui lâmpada' : '+ Incluir lâmpada'}
              </button>
              {item.has_lamp && (
                <div className="bg-amber-50 rounded-lg p-2 mt-1 space-y-1.5">
                  <SyncedInput value={item.lamp_name ?? ''} onCommit={v => onUpdate(item.id, { lamp_name: v || null })}
                    placeholder="Nome da lâmpada (ex: Dicroica GU10)" list={`lamp-name-${item.id}`}
                    className="w-full text-xs text-gray-700 outline-none border-b border-transparent focus:border-brand-300 bg-white rounded px-2 py-1" />
                  <datalist id={`lamp-name-${item.id}`}>{lampNameSuggestions.map(s => <option key={s} value={s} />)}</datalist>
                  <div className="flex items-center gap-2 flex-wrap">
                    <ChoiceChips options={[2700, 3000, 4000, 6500].map(k => ({ value: k, label: `${k}K` }))}
                      value={item.lamp_color_temp_k ?? null} onChange={v => onUpdate(item.id, { lamp_color_temp_k: v })} />
                    <div className="flex items-center gap-1">
                      <SyncedInput value={item.lamp_angle_deg != null ? String(item.lamp_angle_deg) : ''} onCommit={v => onUpdate(item.id, { lamp_angle_deg: v ? Number(v.replace(',', '.')) : null })}
                        placeholder="—" className="w-10 text-[11px] text-gray-500 text-right outline-none border-b border-transparent focus:border-brand-300" />
                      <span className="text-[11px] text-gray-400">° abertura</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-500">Qtd. lâmpadas:</span>
                    <ChoiceChips options={[1, 2, 3, 4].map(n => ({ value: n, label: String(n) }))}
                      value={item.lamp_qty ?? 1} onChange={v => onUpdate(item.id, { lamp_qty: v })} />
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-gray-400">Nenhum item na legenda ainda.</p>}
      </div>
    </div>
  )
}

// ── Aba: Medições (perfil / fita + plano de corte / medidas soltas) ─────────

function MedicoesTab({ measurements, environments, onUpdate, onDelete, onMerge, pieceBadgeMap,
  perfilGroups, fitaGroups,
  powerSupplies, onStartFontePlacement, onDeleteFonte, onDuplicatePerfilFita, onDuplicateFita,
}: {
  measurements: Measurement[]; environments: Environment[]
  onUpdate: (id: string, updates: Partial<Measurement>) => void; onDelete: (id: string) => void
  onMerge: (idA: string, idB: string) => void
  pieceBadgeMap: Map<string, PieceBadge>
  perfilGroups: GrupoPlano[]; fitaGroups: GrupoPlano[]
  powerSupplies: PowerSupply[]; onStartFontePlacement: (measurementId: string, watts: number) => void; onDeleteFonte: (id: string) => void
  onDuplicatePerfilFita: (perfil: Measurement, fita: Measurement) => void
  onDuplicateFita: (fita: Measurement) => void
}) {
  const perfis = measurements.filter(m => m.kind === 'perfil')
  const fitas = measurements.filter(m => m.kind === 'fita')
  const medidas = measurements.filter(m => m.kind === 'medida')
  const profileModelSuggestions = Array.from(new Set(measurements.filter(x => x.kind === 'perfil' && x.product_model).map(x => x.product_model as string)))
  const fitaModelSuggestions = Array.from(new Set(measurements.filter(x => x.kind === 'fita' && x.product_model).map(x => x.product_model as string)))
  const installLocationSuggestions = Array.from(new Set(measurements.filter(x => x.installation_location).map(x => x.installation_location as string)))

  // Todo perfil já vem com uma fita automática (mesma metragem) — agrupa os
  // dois como uma instalação só, em vez de espalhar o perfil numa seção e a
  // fita dele em outra, lá embaixo.
  const combos = perfis.map(p => ({ perfil: p, fita: fitas.find(f => f.linked_measurement_id === p.id) }))
  const perfisComFita = combos.filter((c): c is { perfil: Measurement; fita: Measurement } => !!c.fita)
  const perfisSemFita = combos.filter(c => !c.fita).map(c => c.perfil)
  const fitasAvulsas = fitas.filter(f => !f.linked_measurement_id)

  function changePotencia(id: string, value: string) {
    const w = Number(value.replace(',', '.')) || 0
    onUpdate(id, { power_w_per_m: w })
  }
  function changeEnv(id: string, envId: string | null) {
    onUpdate(id, { environment_id: envId })
  }
  function changeLength(id: string, value: string) {
    onUpdate(id, { length_m: Number(value.replace(',', '.')) || 0 })
  }
  // Perfil e fita da mesma instalação andam juntos: corrigir o comprimento
  // de um corrige o outro também (a fita "é" aquele perfil).
  function changeComboLength(perfilId: string, fitaId: string, value: string) {
    const v = Number(value.replace(',', '.')) || 0
    onUpdate(perfilId, { length_m: v })
    onUpdate(fitaId, { length_m: v })
  }
  function changeComboEnv(perfilId: string, fitaId: string, envId: string | null) {
    onUpdate(perfilId, { environment_id: envId })
    onUpdate(fitaId, { environment_id: envId })
  }

  return (
    <div className="space-y-6">
      <p className="text-[11px] text-gray-400 bg-gray-50 rounded-lg px-2.5 py-2">
        💡 Um trecho em L ou U pode ser medido como uma peça só — clique em cada canto sem apertar Enter,
        e só finalize no último ponto. Se já mediu em partes separadas, use <b>Mesclar</b> no card pra juntar.
        O ambiente de cada medição pode ser trocado direto no card, a qualquer momento.
      </p>

      <section>
        <p className="text-xs font-bold text-orange-600 uppercase mb-2">Medidas soltas ({medidas.length})</p>
        <div className="space-y-2">
          {medidas.map(m => (
            <SimpleMeasurementCard key={m.id} m={m} environments={environments} onChangeEnv={envId => changeEnv(m.id, envId)}
              onChangeLabel={v => onUpdate(m.id, { label: v })}
              onDelete={() => onDelete(m.id)} onChangeLength={v => changeLength(m.id, v)} linkNote={linkNoteFor(m, measurements)}
              mergeCandidates={medidas.filter(x => x.id !== m.id)} onMerge={otherId => onMerge(m.id, otherId)} />
          ))}
          {medidas.length === 0 && <p className="text-xs text-gray-400">Nenhuma medida solta ainda — use a ferramenta "Medir" pra medir qualquer coisa na planta.</p>}
        </div>
      </section>

      <section>
        <p className="text-xs font-bold text-indigo-600 uppercase mb-2">Perfil + Fita ({perfisComFita.length})</p>
        <div className="space-y-2">
          {perfisComFita.map(({ perfil, fita }) => (
            <PerfilFitaCard key={perfil.id} perfil={perfil} fita={fita} environments={environments}
              onChangeEnv={envId => changeComboEnv(perfil.id, fita.id, envId)}
              onChangeLabel={v => onUpdate(perfil.id, { label: v })}
              onChangeLength={v => changeComboLength(perfil.id, fita.id, v)}
              onChangePotencia={v => changePotencia(fita.id, v)}
              onChangeStrandCount={v => onUpdate(fita.id, { strand_count: v })}
              onDelete={() => { onDelete(perfil.id); onDelete(fita.id) }}
              pieceBadgePerfil={pieceBadgeMap.get(perfil.id)} pieceBadgeFita={pieceBadgeMap.get(fita.id)}
              powerSupplies={powerSupplies} onStartFontePlacement={onStartFontePlacement} onDeleteFonte={onDeleteFonte}
              onChangeProfileModel={v => onUpdate(perfil.id, { product_model: v })}
              onChangeMountType={v => onUpdate(perfil.id, { mount_type: v })}
              onChangeBarSize={v => onUpdate(perfil.id, { bar_size: v })}
              profileModelSuggestions={profileModelSuggestions}
              onChangeFitaModel={v => onUpdate(fita.id, { product_model: v })}
              onChangeVoltage={v => onUpdate(fita.id, { voltage: v })}
              onChangePackaging={v => onUpdate(fita.id, { packaging: v })}
              fitaModelSuggestions={fitaModelSuggestions}
              onChangeInstallLocation={v => onUpdate(perfil.id, { installation_location: v })}
              installLocationSuggestions={installLocationSuggestions}
              onChangeColorTemp={v => onUpdate(fita.id, { color_temp_k: v })}
              onDuplicate={() => onDuplicatePerfilFita(perfil, fita)} />
          ))}
          {perfisComFita.length === 0 && <p className="text-xs text-gray-400">Nenhum perfil medido ainda — a fita é criada automaticamente junto.</p>}
        </div>
      </section>

      {perfisSemFita.length > 0 && (
        <section>
          <p className="text-xs font-bold text-sky-600 uppercase mb-2">Perfis sem fita ({perfisSemFita.length})</p>
          <div className="space-y-2">
            {perfisSemFita.map(m => (
              <SimpleMeasurementCard key={m.id} m={m} environments={environments} onChangeEnv={envId => changeEnv(m.id, envId)}
                onChangeLabel={v => onUpdate(m.id, { label: v })}
                onDelete={() => onDelete(m.id)} onChangeLength={v => changeLength(m.id, v)} pieceBadge={pieceBadgeMap.get(m.id)} linkNote={linkNoteFor(m, measurements)}
                mergeCandidates={perfis.filter(x => x.id !== m.id)} onMerge={otherId => onMerge(m.id, otherId)} />
            ))}
          </div>
        </section>
      )}

      {perfilGroups.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-sky-600 uppercase">Plano de corte — perfis</p>
          {perfilGroups.map(g => (
            <div key={g.key} className="bg-sky-50 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-sky-700">{g.groupLabel} <span className="text-gray-400 font-normal">({g.trechos.length} trecho{g.trechos.length !== 1 ? 's' : ''})</span></p>
              {g.emendaWarnings.map((w, i) => <p key={i} className="text-xs font-medium text-amber-700 bg-amber-50 rounded px-2 py-1">⚠️ {w}</p>)}
              {g.plano?.kind === 'ok' && <PlanoDeCorteView plano={g.plano.plano} noun="Peça" />}
            </div>
          ))}
        </div>
      )}

      {fitasAvulsas.length > 0 && (
        <section>
          <p className="text-xs font-bold text-pink-600 uppercase mb-2">Fitas avulsas ({fitasAvulsas.length})</p>
          <p className="text-[10px] text-gray-400 mb-2">Medidas direto com "Medir fita", sem perfil vinculado.</p>
          <div className="space-y-2">
            {fitasAvulsas.map(m => (
              <FitaCard key={m.id} m={m} environments={environments} onChangeEnv={envId => changeEnv(m.id, envId)}
                onChangeLabel={v => onUpdate(m.id, { label: v })}
                onDelete={() => onDelete(m.id)} onChangePotencia={v => changePotencia(m.id, v)} onChangeLength={v => changeLength(m.id, v)}
                onChangeStrandCount={v => onUpdate(m.id, { strand_count: v })}
                pieceBadge={pieceBadgeMap.get(m.id)} linkNote={linkNoteFor(m, measurements)}
                powerSupplies={powerSupplies} onStartFontePlacement={onStartFontePlacement} onDeleteFonte={onDeleteFonte}
                onChangeModel={v => onUpdate(m.id, { product_model: v })}
                onChangeVoltage={v => onUpdate(m.id, { voltage: v })}
                onChangePackaging={v => onUpdate(m.id, { packaging: v })}
                modelSuggestions={fitaModelSuggestions}
                onChangeInstallLocation={v => onUpdate(m.id, { installation_location: v })}
                installLocationSuggestions={installLocationSuggestions}
                onChangeColorTemp={v => onUpdate(m.id, { color_temp_k: v })}
                onDuplicate={() => onDuplicateFita(m)}
                mergeCandidates={fitas.filter(x => x.id !== m.id)} onMerge={otherId => onMerge(m.id, otherId)} />
            ))}
          </div>
        </section>
      )}

      {fitaGroups.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-pink-600 uppercase">Plano de corte — fitas</p>
          {fitaGroups.map(g => (
            <div key={g.key} className="bg-pink-50 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-pink-700">{g.groupLabel} <span className="text-gray-400 font-normal">({g.trechos.length} trecho{g.trechos.length !== 1 ? 's' : ''})</span></p>
              {g.comercialM == null && (
                <p className="text-xs text-gray-600">Vendida no metro — total: <b>{round2(g.trechos.reduce((s: number, t: Measurement) => s + t.length_m, 0))}m</b></p>
              )}
              {g.emendaWarnings.map((w, i) => <p key={i} className="text-xs font-medium text-amber-700 bg-amber-50 rounded px-2 py-1">⚠️ {w}</p>)}
              {g.plano?.kind === 'ok' && <PlanoDeCorteView plano={g.plano.plano} noun="Rolo" />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Cabeçalho comum: label + ambiente (secundário) + ações (mesclar / excluir).
// Usado tanto pelas medidas soltas quanto pelos perfis (não têm nenhum dado
// extra pra preencher, então o card inteiro é "baixa hierarquia").
function MeasurementHeader({ m, environments, onChangeEnv, onChangeLabel, onDelete, mergeCandidates, onMerge, pieceBadge, linkNote, onDuplicate }: {
  m: Measurement; environments: Environment[]; onChangeEnv: (envId: string | null) => void
  onChangeLabel: (v: string) => void
  onDelete: () => void; mergeCandidates: Measurement[]; onMerge: (otherId: string) => void
  pieceBadge?: PieceBadge; linkNote?: string; onDuplicate?: () => void
}) {
  const [merging, setMerging] = useState(false)
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <SyncedInput value={m.label ?? ''} onCommit={onChangeLabel} placeholder="Título da instalação (ex: Teto, sanca...)"
            className="text-sm font-semibold text-gray-800 outline-none border-b border-transparent focus:border-brand-300 min-w-0 flex-1" />
        </div>
        {/* Ambiente é editável direto aqui — cobre tanto o vínculo automático
            (point-in-polygon) quanto o caso de medir antes de desenhar o
            ambiente, ou simplesmente errar e querer trocar. */}
        <select value={m.environment_id ?? ''} onChange={e => onChangeEnv(e.target.value || null)}
          className="text-[11px] text-gray-500 bg-transparent border-none outline-none -ml-0.5 cursor-pointer hover:text-brand-600 max-w-full">
          <option value="">Sem ambiente</option>
          {environments.map(env => <option key={env.id} value={env.id}>{env.name}</option>)}
        </select>
        {linkNote && <p className="text-[10px] text-sky-500">{linkNote}</p>}
        {pieceBadge && pieceBadge.siblings.length > 0 && (
          <p className="text-[10px] text-gray-400">↔ mesma peça: {pieceBadge.siblings.join(', ')}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0 relative">
        {mergeCandidates.length > 0 && (
          <button onClick={() => setMerging(v => !v)} title="Mesclar com outra medição"
            className="text-[10px] font-semibold text-gray-400 hover:text-brand-600 border border-gray-200 hover:border-brand-300 rounded px-1.5 py-0.5">
            Mesclar
          </button>
        )}
        {onDuplicate && (
          <button onClick={onDuplicate} title="Duplicar" className="text-gray-300 hover:text-brand-600"><Copy className="w-3.5 h-3.5" /></button>
        )}
        <button onClick={onDelete} className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
        {merging && (
          <div className="absolute right-0 top-6 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-44">
            <p className="text-[10px] text-gray-400 px-2 py-1">Mesclar com:</p>
            {mergeCandidates.map(c => (
              <button key={c.id} onClick={() => { onMerge(c.id); setMerging(false) }}
                className="w-full text-left px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50 truncate">
                {c.label} ({c.length_m.toFixed(2)}m)
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Card enxuto pra medida solta e perfil — só tem comprimento pra mostrar,
// então o comprimento é a única informação em destaque.
// Input controlado que resincroniza com o valor de fora sempre que ele muda
// (correção manual, sincronização perfil↔fita, undo/redo...). O padrão
// `defaultValue` usado antes só define o valor inicial — depois de montado,
// o input nunca mais refletia uma mudança vinda de fora, dando a impressão
// de que a correção "não era mantida".
function SyncedInput({ value, onCommit, className, title, placeholder, list }: {
  value: string; onCommit: (v: string) => void; className?: string; title?: string; placeholder?: string; list?: string
}) {
  const [text, setText] = useState(value)
  useEffect(() => { setText(value) }, [value])
  return (
    <input value={text} onChange={e => setText(e.target.value)} onBlur={e => onCommit(e.target.value)}
      title={title} placeholder={placeholder} list={list} className={className} />
  )
}

// Chips de escolha única (embutir/sobrepor, 2m/3m, 12V/24V, rolo/metro...).
function ChoiceChips<T extends string | number>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T | null | undefined; onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cn('text-[11px] font-semibold px-2 py-1 rounded-md border transition-colors',
            value === o.value ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// Campo de modelo (perfil/fita) com autocomplete nativo — reaproveita nomes
// já usados em outras medições do mesmo plano (sem precisar de um catálogo
// separado), mas deixa digitar um nome novo livremente.
function ModelInput({ value, suggestions, onCommit, placeholder, listId }: {
  value: string; suggestions: string[]; onCommit: (v: string) => void; placeholder: string; listId: string
}) {
  return (
    <>
      <SyncedInput value={value} onCommit={onCommit} placeholder={placeholder} list={listId}
        className="w-full text-xs border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-brand-400"
      />
      <datalist id={listId}>{suggestions.map(s => <option key={s} value={s} />)}</datalist>
    </>
  )
}

function SimpleMeasurementCard({ m, environments, onChangeEnv, onChangeLabel, onDelete, onChangeLength, mergeCandidates, onMerge, pieceBadge, linkNote }: {
  m: Measurement; environments: Environment[]; onChangeEnv: (envId: string | null) => void; onChangeLabel: (v: string) => void; onDelete: () => void
  onChangeLength: (v: string) => void
  mergeCandidates: Measurement[]; onMerge: (otherId: string) => void; pieceBadge?: PieceBadge; linkNote?: string
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-2.5">
      <MeasurementHeader m={m} environments={environments} onChangeEnv={onChangeEnv} onChangeLabel={onChangeLabel} onDelete={onDelete}
        mergeCandidates={mergeCandidates} onMerge={onMerge} pieceBadge={pieceBadge} linkNote={linkNote} />
      <div className="flex items-baseline gap-1 mt-1">
        <SyncedInput value={m.length_m.toFixed(2)} onCommit={onChangeLength}
          title="Medida errada? Corrija aqui direto — sem precisar remedir."
          className="w-20 text-base font-bold text-gray-800 border-b border-transparent focus:border-brand-400 outline-none" />
        <span className="text-sm text-gray-500">m</span>
      </div>
    </div>
  )
}

// Card da fita: o que importa pra decisão é o W/m (a preencher) e a fonte
// mínima resultante — isso fica grande e em destaque. O resto (label,
// ambiente, a conta em si) fica pequeno e discreto.
function FitaCard({ m, environments, onChangeEnv, onChangeLabel, onDelete, onChangePotencia, onChangeLength, onChangeStrandCount, mergeCandidates, onMerge, pieceBadge, linkNote, powerSupplies, onStartFontePlacement, onDeleteFonte, onChangeModel, onChangeVoltage, onChangePackaging, modelSuggestions, onChangeInstallLocation, installLocationSuggestions, onChangeColorTemp, onDuplicate }: {
  m: Measurement; environments: Environment[]; onChangeEnv: (envId: string | null) => void; onChangeLabel: (v: string) => void
  onDelete: () => void; onChangePotencia: (v: string) => void; onChangeLength: (v: string) => void; onChangeStrandCount: (v: number) => void
  mergeCandidates: Measurement[]; onMerge: (otherId: string) => void; pieceBadge?: PieceBadge; linkNote?: string
  powerSupplies: PowerSupply[]; onStartFontePlacement: (measurementId: string, watts: number) => void; onDeleteFonte: (id: string) => void
  onChangeModel: (v: string) => void; onChangeVoltage: (v: '12V' | '24V') => void; onChangePackaging: (v: 'rolo_5m' | 'metro') => void
  modelSuggestions: string[]; onChangeInstallLocation: (v: string) => void; installLocationSuggestions: string[]
  onChangeColorTemp: (v: number) => void; onDuplicate?: () => void
}) {
  const preenchido = !!m.power_w_per_m
  const strands = m.strand_count ?? 1
  const calc = calcularFita(m.length_m * strands, m.power_w_per_m ?? 0)
  return (
    <div className="border border-gray-200 rounded-lg p-2 space-y-1.5">
      <MeasurementHeader m={m} environments={environments} onChangeEnv={onChangeEnv} onChangeLabel={onChangeLabel} onDelete={onDelete}
        mergeCandidates={mergeCandidates} onMerge={onMerge} pieceBadge={pieceBadge} linkNote={linkNote} onDuplicate={onDuplicate} />
      <div className="flex items-baseline gap-1">
        <SyncedInput value={m.length_m.toFixed(2)} onCommit={onChangeLength}
          title="Medida errada? Corrija aqui direto."
          className="w-14 text-xs text-gray-500 border-b border-transparent focus:border-brand-400 outline-none" />
        <span className="text-xs text-gray-400">m de fita</span>
      </div>
      <ModelInput value={m.installation_location ?? ''} suggestions={installLocationSuggestions} onCommit={onChangeInstallLocation}
        placeholder="Ponto de instalação (sanca, marcenaria, cortineiro...)" listId={`install-loc-${m.id}`} />

      <div className="bg-pink-50 rounded-lg p-1.5 space-y-1">
        <ModelInput value={m.product_model ?? ''} suggestions={modelSuggestions} onCommit={onChangeModel}
          placeholder="Modelo da fita" listId={`fita-models-${m.id}`} />
        <div className="flex items-center gap-2 flex-wrap">
          <ChoiceChips options={[{ value: '12V', label: '12V' }, { value: '24V', label: '24V' }]} value={m.voltage} onChange={onChangeVoltage} />
          <ChoiceChips options={[{ value: 'rolo_5m', label: 'Rolo 5m' }, { value: 'metro', label: 'No metro' }]} value={m.packaging} onChange={onChangePackaging} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500">Tonalidade:</span>
          <ChoiceChips options={[2700, 3000, 4000, 6500].map(k => ({ value: k, label: `${k}K` }))} value={m.color_temp_k ?? null} onChange={onChangeColorTemp} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500">Tiras (perfil largo):</span>
          <ChoiceChips options={[1, 2, 3].map(n => ({ value: n, label: String(n) }))} value={strands} onChange={onChangeStrandCount} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-gray-500 shrink-0">Consumo (W/m):</label>
          <SyncedInput value={String(m.power_w_per_m ?? '')} onCommit={onChangePotencia} placeholder="0"
            className="w-14 text-sm font-semibold text-center border border-gray-300 rounded-md px-1.5 py-0.5 bg-white focus:border-brand-400 outline-none" />
        </div>
      </div>

      {preenchido ? (
        <div>
          <p className="text-base font-bold text-emerald-600 leading-tight">Fonte mínima: {Math.ceil(calc.fonteMinimaW)}W</p>
          <FonteSugeridaLine minimaW={calc.fonteMinimaW} measurementId={m.id} powerSupplies={powerSupplies}
            onStartPlacement={onStartFontePlacement} onDeleteFonte={onDeleteFonte} />
          <p className="text-[10px] text-gray-400 mt-0.5">
            {m.length_m.toFixed(2)}m{strands > 1 ? ` × ${strands} tiras` : ''} × {m.power_w_per_m}W/m = {calc.consumoW}W · +20% = {calc.fonteMinimaW}W
          </p>
        </div>
      ) : (
        <p className="text-[11px] font-medium text-amber-600 bg-amber-50 rounded px-2 py-1">⚠ Falta o W/m pra calcular a fonte</p>
      )}
    </div>
  )
}

// Linha "Fonte sugerida: 60W (12V)" — catálogo real de estoque (18 a 400W),
// sempre a próxima potência IGUAL OU ACIMA do mínimo calculado, nunca abaixo.
function FonteSugeridaLine({ minimaW, measurementId, powerSupplies, onStartPlacement, onDeleteFonte }: {
  minimaW: number; measurementId: string; powerSupplies: PowerSupply[]
  onStartPlacement: (measurementId: string, watts: number) => void; onDeleteFonte: (id: string) => void
}) {
  const sugestao = sugerirFonte(minimaW)
  const existente = powerSupplies.find(p => p.measurement_id === measurementId)
  const [picking, setPicking] = useState(false)
  const [escolha, setEscolha] = useState(sugestao ?? CATALOGO_FONTES_12V[0])

  if (existente) {
    return (
      <div className="flex items-center gap-2 text-xs mt-0.5">
        <span className="font-semibold text-amber-700">🔌 Fonte posicionada: {existente.watts}W</span>
        <button onClick={() => onDeleteFonte(existente.id)} className="text-gray-400 hover:text-red-500 underline">remover</button>
      </div>
    )
  }
  return (
    <div className="mt-0.5">
      <p className="text-xs font-semibold text-sky-600">
        {sugestao ? `Fonte sugerida: ${sugestao}W (12V)` : 'Acima do catálogo — divida em mais de uma fonte'}
      </p>
      {sugestao && !picking && (
        <button onClick={() => setPicking(true)} className="text-[11px] font-medium text-brand-600 hover:underline mt-0.5">
          📍 Posicionar fonte na planta
        </button>
      )}
      {picking && (
        <div className="flex items-center gap-1.5 bg-sky-50 rounded-md p-1.5 mt-1 flex-wrap">
          <select value={escolha} onChange={e => setEscolha(Number(e.target.value))} className="text-xs border border-gray-200 rounded px-1 py-0.5">
            {CATALOGO_FONTES_12V.filter(w => w >= minimaW).map(w => <option key={w} value={w}>{w}W</option>)}
          </select>
          <button onClick={() => { onStartPlacement(measurementId, escolha); setPicking(false) }}
            className="text-[11px] font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded px-2 py-0.5">
            Confirmar → clicar na planta
          </button>
          <button onClick={() => setPicking(false)} className="text-[11px] text-gray-400 hover:text-gray-600">Cancelar</button>
        </div>
      )}
    </div>
  )
}

// Perfil + Fita: como todo perfil já gera sua fita automaticamente, faz mais
// sentido tratar os dois como UMA instalação só na interface (título "Perfil
// + Fita X"), em vez de dois cards soltos em seções diferentes — inclusive a
// fonte sugerida já sai calculada em cima dos dois juntos.
function PerfilFitaCard({
  perfil, fita, environments, onChangeEnv, onChangeLabel, onChangeLength, onChangePotencia, onChangeStrandCount, onDelete, pieceBadgePerfil, pieceBadgeFita,
  powerSupplies, onStartFontePlacement, onDeleteFonte,
  onChangeProfileModel, onChangeMountType, onChangeBarSize, profileModelSuggestions,
  onChangeFitaModel, onChangeVoltage, onChangePackaging, fitaModelSuggestions,
  onChangeInstallLocation, installLocationSuggestions, onChangeColorTemp, onDuplicate,
}: {
  perfil: Measurement; fita: Measurement; environments: Environment[]
  onChangeEnv: (envId: string | null) => void; onChangeLabel: (v: string) => void; onChangeLength: (v: string) => void
  onChangePotencia: (v: string) => void; onChangeStrandCount: (v: number) => void; onDelete: () => void
  pieceBadgePerfil?: PieceBadge; pieceBadgeFita?: PieceBadge
  powerSupplies: PowerSupply[]; onStartFontePlacement: (measurementId: string, watts: number) => void; onDeleteFonte: (id: string) => void
  onChangeProfileModel: (v: string) => void; onChangeMountType: (v: 'embutir' | 'sobrepor') => void
  onChangeBarSize: (v: 2 | 3) => void; profileModelSuggestions: string[]
  onChangeFitaModel: (v: string) => void; onChangeVoltage: (v: '12V' | '24V') => void
  onChangePackaging: (v: 'rolo_5m' | 'metro') => void; fitaModelSuggestions: string[]
  onChangeInstallLocation: (v: string) => void; installLocationSuggestions: string[]
  onChangeColorTemp: (v: number) => void; onDuplicate?: () => void
}) {
  const preenchido = !!fita.power_w_per_m
  const strands = fita.strand_count ?? 1
  const calc = calcularFita(fita.length_m * strands, fita.power_w_per_m ?? 0)
  return (
    <div className="border border-gray-200 rounded-lg p-2 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <SyncedInput value={perfil.label ?? ''} onCommit={onChangeLabel} placeholder="Título (ex: Teto, sanca...)"
              className="text-sm font-semibold text-gray-800 outline-none border-b border-transparent focus:border-brand-300 min-w-0 flex-1" />
          </div>
          <div className="flex items-center gap-1.5">
            <select value={perfil.environment_id ?? ''} onChange={e => onChangeEnv(e.target.value || null)}
              className="text-[11px] text-gray-500 bg-transparent border-none outline-none -ml-0.5 cursor-pointer hover:text-brand-600 max-w-full">
              <option value="">Sem ambiente</option>
              {environments.map(env => <option key={env.id} value={env.id}>{env.name}</option>)}
            </select>
            <span className="text-gray-300">·</span>
            <SyncedInput value={perfil.length_m.toFixed(2)} onCommit={onChangeLength}
              title="Medida errada? Corrija aqui direto — perfil e fita andam juntos."
              className="w-14 text-xs font-semibold text-gray-700 border-b border-transparent focus:border-brand-400 outline-none" />
            <span className="text-[11px] text-gray-400">m</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onDuplicate && <button onClick={onDuplicate} title="Duplicar perfil + fita" className="text-gray-300 hover:text-brand-600"><Copy className="w-3.5 h-3.5" /></button>}
          <button onClick={onDelete} title="Excluir perfil e fita" className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      <ModelInput value={perfil.installation_location ?? ''} suggestions={installLocationSuggestions} onCommit={onChangeInstallLocation}
        placeholder="Ponto de instalação (sanca, marcenaria, cortineiro...)" listId={`install-loc-${perfil.id}`} />

      {/* Perfil: modelo + tipo de instalação + tamanho da barra comercial */}
      <div className="bg-sky-50 rounded-lg p-1.5 space-y-1">
        <ModelInput value={perfil.product_model ?? ''} suggestions={profileModelSuggestions} onCommit={onChangeProfileModel}
          placeholder="Modelo do perfil" listId={`perfil-models-${perfil.id}`} />
        <div className="flex items-center gap-2 flex-wrap">
          <ChoiceChips options={[{ value: 'embutir', label: 'Embutir' }, { value: 'sobrepor', label: 'Sobrepor' }]}
            value={perfil.mount_type} onChange={onChangeMountType} />
          <ChoiceChips options={[{ value: 2, label: '2m' }, { value: 3, label: '3m' }]}
            value={perfil.bar_size as 2 | 3 | null | undefined} onChange={onChangeBarSize} />
        </div>
      </div>

      {/* Fita: modelo + tensão + embalagem + tiras */}
      <div className="bg-pink-50 rounded-lg p-1.5 space-y-1">
        <ModelInput value={fita.product_model ?? ''} suggestions={fitaModelSuggestions} onCommit={onChangeFitaModel}
          placeholder="Modelo da fita" listId={`fita-models-${fita.id}`} />
        <div className="flex items-center gap-2 flex-wrap">
          <ChoiceChips options={[{ value: '12V', label: '12V' }, { value: '24V', label: '24V' }]} value={fita.voltage} onChange={onChangeVoltage} />
          <ChoiceChips options={[{ value: 'rolo_5m', label: 'Rolo 5m' }, { value: 'metro', label: 'No metro' }]} value={fita.packaging} onChange={onChangePackaging} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500">Tonalidade:</span>
          <ChoiceChips options={[2700, 3000, 4000, 6500].map(k => ({ value: k, label: `${k}K` }))} value={fita.color_temp_k ?? null} onChange={onChangeColorTemp} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500">Tiras (perfil largo):</span>
          <ChoiceChips options={[1, 2, 3].map(n => ({ value: n, label: String(n) }))} value={strands} onChange={onChangeStrandCount} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-gray-500 shrink-0">Consumo (W/m):</label>
          <SyncedInput value={String(fita.power_w_per_m ?? '')} onCommit={onChangePotencia} placeholder="0"
            className="w-14 text-sm font-semibold text-center border border-gray-300 rounded-md px-1.5 py-0.5 bg-white focus:border-brand-400 outline-none" />
        </div>
      </div>

      {preenchido ? (
        <div>
          <p className="text-base font-bold text-emerald-600 leading-tight">Fonte mínima: {Math.ceil(calc.fonteMinimaW)}W</p>
          <FonteSugeridaLine minimaW={calc.fonteMinimaW} measurementId={fita.id} powerSupplies={powerSupplies}
            onStartPlacement={onStartFontePlacement} onDeleteFonte={onDeleteFonte} />
          <p className="text-[10px] text-gray-400 mt-0.5">
            {fita.length_m.toFixed(2)}m{strands > 1 ? ` × ${strands} tiras` : ''} × {fita.power_w_per_m}W/m = {calc.consumoW}W · +20% = {calc.fonteMinimaW}W
          </p>
        </div>
      ) : (
        <p className="text-[11px] font-medium text-amber-600 bg-amber-50 rounded px-2 py-1">⚠ Falta o W/m pra calcular a fonte</p>
      )}
    </div>
  )
}

// O número que importa pra decisão é "quantas peças comprar" — fica grande.
// Sobra/desperdício é contexto, fica secundário. O detalhe de corte por peça
// (o "como") é o que menos precisa saltar aos olhos — cor combina com o
// badge que aparece no card da medição e direto na planta, pra fechar o elo.
function PlanoDeCorteView({ plano, noun = 'Peça' }: { plano: ReturnType<typeof calcularPlanoDeCorte>; noun?: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-bold text-gray-900 leading-none">{plano.quantidadePecas}</p>
        <p className="text-xs text-gray-500 leading-tight">{noun.toLowerCase()}(s) pra comprar</p>
      </div>
      <p className="text-[11px] text-gray-400">sobra total {plano.sobraTotalM}m · {plano.desperdicioPct}% de desperdício</p>
      <div className="space-y-1">
        {plano.pecas.map(p => (
          <div key={p.pecaIndex} className="bg-white rounded-md px-2 py-1.5 border border-gray-100 flex items-start gap-1.5 text-[11px]">
            <span className="shrink-0 mt-0.5 w-3 h-3 rounded-full" style={{ backgroundColor: PIECE_COLORS[(p.pecaIndex - 1) % PIECE_COLORS.length] }} />
            <span className="text-gray-600">
              <span className="font-semibold text-gray-700">{noun} {p.pecaIndex}</span>{' '}
              {p.cortes.map(c => `${c.comprimentoM}m (${c.ambiente ?? '—'})`).join(' + ')}
              <span className="text-gray-400"> → sobra {p.sobraM}m</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Aba: Resultado ────────────────────────────────────────────────────────

// Uma linha do quantitativo — um produto com sua unidade e quantidade,
// pronto pra digitar no Master Lojista sem precisar recalcular nada.
interface BomLine { produto: string; unidade: string; quantidade: string; detalhe?: string; compartilhada?: boolean; subgrupo?: string | null }

// Ids sintéticos ganham sufixo (tira #N, emenda ~emendaN) — pra achar de
// volta a medição original (e seu ponto de instalação) a partir do id de
// um corte do plano.
function baseMeasurementId(id: string): string { return id.split('#')[0].split('~')[0] }

// Botão de copiar texto — usado na nota de reaproveitamento, pra colar
// direto na observação do orçamento no Master Lojista sem digitar de novo.
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
      }}
      className="text-[11px] font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded px-2 py-1 shrink-0"
    >
      {copied ? '✓ Copiado' : '📋 Copiar'}
    </button>
  )
}

// A partir do plano de corte GLOBAL (que já faz bin-packing entre ambientes),
// monta as linhas de compra por ambiente e detecta peças compartilhadas —
// quando uma barra/rolo atende mais de um ambiente, só o "dono" (primeiro
// corte da peça) deve comprar; o outro ambiente reaproveita a sobra.
function bomFromGroups(groups: GrupoPlano[], noun: 'barra' | 'rolo', envId: string, envName: string): { lines: BomLine[]; sharedNotes: { text: string; copyText: string }[] } {
  const lines: BomLine[] = []
  const sharedNotes: { text: string; copyText: string }[] = []
  for (const g of groups) {
    if (g.comercialM == null) {
      // Vendida no metro — cortada exata, não há sobra pra reaproveitar.
      const trechos = g.trechos.filter(t => t.environment_id === envId)
      if (trechos.length === 0) continue
      const bySub = new Map<string, number>()
      for (const t of trechos) {
        const sub = t.installation_location || ''
        bySub.set(sub, round2((bySub.get(sub) ?? 0) + t.length_m * (t.strand_count ?? 1)))
      }
      for (const [sub, totalM] of Array.from(bySub.entries())) {
        lines.push({ produto: g.groupLabel, unidade: 'm', quantidade: String(totalM), subgrupo: sub || null })
      }
      continue
    }
    if (g.plano?.kind !== 'ok') continue
    for (const peca of g.plano.plano.pecas) {
      const ambientesDaPeca = Array.from(new Set(peca.cortes.map(c => c.ambiente ?? 'Sem ambiente')))
      const dono = peca.cortes[0]?.ambiente ?? 'Sem ambiente'
      if (!ambientesDaPeca.includes(envName)) continue
      const corteDesteAmbiente = peca.cortes.find(c => c.ambiente === envName)
      const origem = corteDesteAmbiente ? g.trechos.find(t => t.id === baseMeasurementId(corteDesteAmbiente.id)) : undefined
      const subgrupo = origem?.installation_location || null
      if (ambientesDaPeca.length === 1) {
        lines.push({ produto: g.groupLabel, unidade: noun, quantidade: '1', subgrupo })
      } else if (envName === dono) {
        lines.push({ produto: g.groupLabel, unidade: noun, quantidade: '1', compartilhada: true, subgrupo,
          detalhe: `compartilhada com ${ambientesDaPeca.filter(a => a !== envName).join(', ')}` })
        const detalheCortes = peca.cortes.map(c => `${c.comprimentoM}m (${c.ambiente})`).join(' + ')
        sharedNotes.push({
          text: `${g.groupLabel} — 1 ${noun} atende ${ambientesDaPeca.join(' + ')}: ${detalheCortes}. Comprar só 1 no total.`,
          copyText: `Reaproveitamento: 1 ${noun} de ${g.groupLabel} atende ${ambientesDaPeca.join(' e ')} (${detalheCortes}) — comprar apenas 1 ${noun} no total, não uma pra cada ambiente.`,
        })
      } else {
        lines.push({ produto: g.groupLabel, unidade: noun, quantidade: '0', compartilhada: true, subgrupo,
          detalhe: `reaproveita sobra de ${dono} — não comprar` })
      }
    }
  }
  // Agrupa linhas iguais (mesmo produto, mesmo subgrupo, não-compartilhadas) somando quantidade.
  const merged = new Map<string, BomLine>()
  for (const l of lines) {
    const key = `${l.produto}__${l.subgrupo ?? ''}__${l.compartilhada ? 'shared' : 'plain'}__${l.detalhe ?? ''}`
    if (l.compartilhada) { merged.set(key + Math.random(), l); continue } // compartilhadas ficam cada uma na sua linha
    const existing = merged.get(key)
    if (existing) existing.quantidade = String(Number(existing.quantidade) + Number(l.quantidade))
    else merged.set(key, { ...l })
  }
  return { lines: Array.from(merged.values()), sharedNotes }
}

function ResultadoTab({ environments, legendItems, symbols, measurements, powerSupplies, perfilGroups, fitaGroups, onFocusEnvironment }: {
  environments: Environment[]; legendItems: LegendItem[]; symbols: SymbolOccurrence[]; measurements: Measurement[]
  powerSupplies: PowerSupply[]; perfilGroups: GrupoPlano[]; fitaGroups: GrupoPlano[]
  onFocusEnvironment: (env: Environment) => void
}) {
  const perfis = measurements.filter(m => m.kind === 'perfil')
  const fitas = measurements.filter(m => m.kind === 'fita')
  const totalPerfilM = round2(perfis.reduce((s, m) => s + m.length_m, 0))
  const totalFitaM = round2(fitas.reduce((s, m) => s + m.length_m * (m.strand_count ?? 1), 0))
  const totalFonteW = round2(fitas.reduce((s, m) => s + calcularFita(m.length_m * (m.strand_count ?? 1), m.power_w_per_m ?? 0).fonteMinimaW, 0))
  const semAmbiente = symbols.filter(s => !s.environment_id).length

  function fonteBomFor(envId: string | null): BomLine[] {
    const envMeasurementIds = new Set(measurements.filter(m => m.environment_id === envId).map(m => m.id))
    const envFontes = powerSupplies.filter(ps => envMeasurementIds.has(ps.measurement_id))
    const byWatts = new Map<number, number>()
    for (const f of envFontes) byWatts.set(f.watts, (byWatts.get(f.watts) ?? 0) + 1)
    return Array.from(byWatts.entries()).sort((a, b) => a[0] - b[0])
      .map(([w, n]) => ({ produto: `Fonte 12V ${w}W`, unidade: 'un', quantidade: String(n) }))
  }

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

      <p className="text-[11px] text-gray-400 bg-gray-50 rounded-lg px-2.5 py-2">
        💡 Quantitativo por ambiente — pra digitar direto no Master Lojista. Quando uma barra/rolo é
        compartilhado entre ambientes (sobra reaproveitada), aparece um aviso com botão de copiar.
      </p>

      {[...perfilGroups, ...fitaGroups].flatMap(g => g.emendaWarnings).length > 0 && (
        <div className="space-y-1">
          {[...perfilGroups, ...fitaGroups].flatMap(g => g.emendaWarnings).map((w, i) => (
            <p key={i} className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">⚠️ {w}</p>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {environments.map(env => {
          const envSymbols = symbols.filter(s => s.environment_id === env.id)
          const byName = new Map<string, number>()
          // Lâmpadas contam separado do corpo da luminária — um spot duplo
          // é 1 peça de corpo, mas 2 lâmpadas, e no Master Lojista isso é
          // comprado como itens distintos.
          const byLamp = new Map<string, number>()
          for (const s of envSymbols) {
            const li = legendItems.find(x => x.id === s.legend_item_id)
            const base = li?.description || li?.code || 'Item sem legenda'
            byName.set(base, (byName.get(base) ?? 0) + 1)
            if (li?.has_lamp) {
              const lampDesc = [li.lamp_name || 'Lâmpada', li.lamp_color_temp_k ? `${li.lamp_color_temp_k}K` : null, li.lamp_angle_deg ? `${li.lamp_angle_deg}°` : null]
                .filter(Boolean).join(' · ')
              byLamp.set(lampDesc, (byLamp.get(lampDesc) ?? 0) + (li.lamp_qty ?? 1))
            }
          }
          const envMedidas = measurements.filter(m => m.environment_id === env.id && m.kind === 'medida')
          const perfilBom = bomFromGroups(perfilGroups, 'barra', env.id, env.name)
          const fitaBom = bomFromGroups(fitaGroups, 'rolo', env.id, env.name)
          // Símbolos e fontes não têm ponto de instalação — ficam no
          // subgrupo "Geral" junto com qualquer perfil/fita sem local
          // definido. Os demais viram sub-blocos tipo "Sanca", "Marcenaria"
          // — igual à convenção "Ambiente - Subgrupo" do Master Lojista,
          // sem repetir o nome do ambiente (que já é o título do card).
          const allLines: BomLine[] = [
            ...Array.from(byName.entries()).map(([nome, n]) => ({ produto: nome, unidade: 'un', quantidade: String(n) })),
            ...Array.from(byLamp.entries()).map(([nome, n]) => ({ produto: `💡 ${nome}`, unidade: 'un', quantidade: String(n) })),
            ...perfilBom.lines,
            ...fitaBom.lines,
            ...fonteBomFor(env.id),
          ]
          const sharedNotes = [...perfilBom.sharedNotes, ...fitaBom.sharedNotes]
          const bySubgrupo = new Map<string, BomLine[]>()
          for (const l of allLines) {
            const key = l.subgrupo || 'Geral'
            if (!bySubgrupo.has(key)) bySubgrupo.set(key, [])
            bySubgrupo.get(key)!.push(l)
          }
          const subgrupos = Array.from(bySubgrupo.keys()).sort((a, b) => a === 'Geral' ? 1 : b === 'Geral' ? -1 : a.localeCompare(b))
          return (
            <div key={env.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
              <button onClick={() => onFocusEnvironment(env)} title="Ver este ambiente na planta"
                className="text-sm font-bold text-gray-800 hover:text-brand-600 hover:underline text-left">{env.name}</button>
              {sharedNotes.length > 0 && sharedNotes.map((n, i) => (
                <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  <p className="text-[11px] text-amber-800 flex-1">⚠️ {n.text}</p>
                  <CopyButton text={n.copyText} />
                </div>
              ))}
              {subgrupos.map(sub => (
                <div key={sub}>
                  {sub !== 'Geral' && <p className="text-[11px] font-bold text-gray-500 mt-1">{sub}</p>}
                  <table className="w-full text-xs">
                    <tbody>
                      {bySubgrupo.get(sub)!.map((l, i) => (
                        <tr key={i} className={cn('border-t border-gray-100', l.compartilhada && 'bg-amber-50/60')}>
                          <td className="py-0.5 text-gray-700">{l.produto}{l.detalhe && <span className="text-amber-600 text-[10px]"> · {l.detalhe}</span>}</td>
                          <td className={cn('py-0.5 text-right font-semibold whitespace-nowrap', l.quantidade === '0' ? 'text-gray-300' : 'text-gray-800')}>{l.quantidade} {l.unidade}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              {envMedidas.map(m => (
                <p key={m.id} className="text-xs text-gray-500">{MEASURE_LABEL[m.kind]} {m.label} — {m.length_m.toFixed(2)}m</p>
              ))}
              {allLines.length === 0 && envMedidas.length === 0 && <p className="text-xs text-gray-400">Nada registrado ainda.</p>}
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
