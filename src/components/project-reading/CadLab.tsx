'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadCadFile, computeRegions, type CadModel } from '@/lib/project-reading/cad'
import { Loader2, Upload, Ruler, Move, Maximize } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tool = 'mover' | 'medir'
interface Snap { x: number; y: number; kind: 'ponta' | 'meio' | 'bloco' }
interface Medida { a: Snap; b: Snap }

const cor = (c: string) => (['#1f2937', '#374151', '#4b5563'].includes(c) ? '#e5e7eb' : c)
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
  const [tool, setTool] = useState<Tool>('mover')
  const BG = '#1b1d23'
  const [selBlock, setSelBlock] = useState<string | null>(null)
  const [medidas, setMedidas] = useState<Medida[]>([])
  const [pendente, setPendente] = useState<Snap | null>(null)
  const [hover, setHover] = useState<Snap | null>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [, setTick] = useState(0)
  const redraw = useCallback(() => setTick(t => t + 1), [])

  // vista: centro (coordenadas do desenho) + escala (px por unidade)
  const view = useRef({ cx: 0, cy: 0, scale: 1 })
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)

  const toScreen = (x: number, y: number, w: number, h: number): [number, number] =>
    [(x - view.current.cx) * view.current.scale + w / 2, h / 2 - (y - view.current.cy) * view.current.scale]
  const toWorld = (px: number, py: number, w: number, h: number): [number, number] =>
    [(px - w / 2) / view.current.scale + view.current.cx, (h / 2 - py) / view.current.scale + view.current.cy]

  // ── Índice de pontos de snap (pontas, meios e pontos de bloco) ───────────
  const snapIndex = useMemo(() => {
    if (!model) return null
    const pts: { x: number; y: number; kind: Snap['kind']; layer: number }[] = []
    const s = model.segs
    for (let i = 0; i < model.segLayer.length; i++) {
      const x1 = s[i * 4], y1 = s[i * 4 + 1], x2 = s[i * 4 + 2], y2 = s[i * 4 + 3]
      pts.push({ x: x1, y: y1, kind: 'ponta', layer: model.segLayer[i] }, { x: x2, y: y2, kind: 'ponta', layer: model.segLayer[i] },
        { x: (x1 + x2) / 2, y: (y1 + y2) / 2, kind: 'meio', layer: model.segLayer[i] })
    }
    for (const b of model.inserts) pts.push({ x: b.x, y: b.y, kind: 'bloco', layer: b.layer })
    const cell = 0.5
    const grid = new Map<string, number[]>()
    pts.forEach((p, i) => {
      const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`
      const arr = grid.get(k); if (arr) arr.push(i); else grid.set(k, [i])
    })
    return { pts, grid, cell }
  }, [model])

  function findSnap(wx: number, wy: number, w: number, h: number): Snap | null {
    if (!snapIndex || !model) return null
    const rWorld = 12 / view.current.scale
    const { pts, grid, cell } = snapIndex
    const n = Math.ceil(rWorld / cell)
    if (n > 15) return null // muito afastado: sem snap
    let best: Snap | null = null, bestD = rWorld
    const cx = Math.floor(wx / cell), cy = Math.floor(wy / cell)
    for (let gx = cx - n; gx <= cx + n; gx++) for (let gy = cy - n; gy <= cy + n; gy++) {
      const arr = grid.get(`${gx},${gy}`); if (!arr) continue
      for (const i of arr) {
        const p = pts[i]
        if (!layerVis[p.layer]) continue
        // prioriza ponta > bloco > meio em empate de distância
        const d = Math.hypot(p.x - wx, p.y - wy) + (p.kind === 'meio' ? rWorld * 0.05 : 0)
        if (d < bestD) { bestD = d; best = { x: p.x, y: p.y, kind: p.kind } }
      }
    }
    return best
  }

  // ── Carregar arquivo ─────────────────────────────────────────────────────
  async function handleFile(file: File) {
    setError(null); setLoading(true); setModel(null); setMedidas([]); setPendente(null); setSelBlock(null)
    setFileName(file.name)
    try {
      const t0 = performance.now()
      const m = await loadCadFile(await file.arrayBuffer())
      setTempo(Math.round(performance.now() - t0))
      setLayerVis(m.layers.map(l => l.visible))
      setModel(m)
    } catch (e: any) {
      setError(e?.message ?? 'Falha ao ler o arquivo.')
    } finally {
      setLoading(false)
    }
  }

  // Desenhos de CAD costumam ter vários desenhos no mesmo espaço (planta,
  // cortes, detalhes) e às vezes lixo muito longe. Agrupa os traços em
  // "regiões" (vizinhos a menos de ~20 m) e começa pela maior.
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
  // Vai para UMA instância do bloco (as cópias podem estar a km umas das outras),
  // com zoom perto o bastante pra enxergar o desenho. Clicar de novo vai pra próxima.
  function irParaBloco(nome: string, proximo = false) {
    if (!model) return
    const list = model.inserts.filter(b => b.name === nome)
    if (!list.length) return
    instIdx.current = proximo ? (instIdx.current + 1) % list.length : 0
    const b = list[instIdx.current]
    const half = 1.5 / model.unitToMeters // ~3 m de largura
    fitBox(b.x - half, b.y - half, b.x + half, b.y + half)
  }
  useEffect(() => { if (model && regioes.length) fit(0) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [model, regioes])

  // ── Desenho ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current, canvas = canvasRef.current
    if (!el || !canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = el.clientWidth, h = el.clientHeight
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr }
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h)
    if (!model) return
    const { scale } = view.current
    const [wx0, wy1] = toWorld(0, 0, w, h), [wx1, wy0] = toWorld(w, h, w, h)
    const byLayer = new Map<number, number[]>()
    for (let i = 0; i < model.segLayer.length; i++) {
      const l = model.segLayer[i]
      if (!layerVis[l]) continue
      const x1 = model.segs[i * 4], y1 = model.segs[i * 4 + 1], x2 = model.segs[i * 4 + 2], y2 = model.segs[i * 4 + 3]
      if (Math.max(x1, x2) < wx0 || Math.min(x1, x2) > wx1 || Math.max(y1, y2) < wy0 || Math.min(y1, y2) > wy1) continue
      const arr = byLayer.get(l); if (arr) arr.push(i); else byLayer.set(l, [i])
    }
    ctx.lineWidth = 1; ctx.lineCap = 'round'
    byLayer.forEach((idx, l) => {
      ctx.strokeStyle = cor(model.layers[l].color)
      ctx.beginPath()
      for (const i of idx) {
        const [a, b] = toScreen(model.segs[i * 4], model.segs[i * 4 + 1], w, h)
        const [c, d] = toScreen(model.segs[i * 4 + 2], model.segs[i * 4 + 3], w, h)
        ctx.moveTo(a, b); ctx.lineTo(c, d)
      }
      ctx.stroke()
    })
    for (const t of model.texts) {
      if (!layerVis[t.layer] || !t.text) continue
      const px = t.h * scale
      if (px < 5 || px > 400) continue
      const [x, y] = toScreen(t.x, t.y, w, h)
      if (x < -200 || x > w + 200 || y < -50 || y > h + 50) continue
      ctx.save(); ctx.translate(x, y); ctx.rotate(-t.rot)
      ctx.fillStyle = cor(model.layers[t.layer].color); ctx.font = `${px}px sans-serif`; ctx.fillText(t.text, 0, 0)
      ctx.restore()
    }
    if (selBlock) {
      ctx.strokeStyle = '#d946ef'; ctx.fillStyle = 'rgba(217,70,239,0.25)'; ctx.lineWidth = 2
      for (const b of model.inserts) {
        if (b.name !== selBlock) continue
        const [x, y] = toScreen(b.x, b.y, w, h)
        ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      }
    }
    // medidas
    ctx.lineWidth = 2
    const fm = (a: Snap, b: Snap) => Math.hypot(a.x - b.x, a.y - b.y) * model.unitToMeters
    const draw = (a: Snap, b: Snap, color: string) => {
      const [x1, y1] = toScreen(a.x, a.y, w, h), [x2, y2] = toScreen(b.x, b.y, w, h)
      ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      ctx.fillStyle = color; for (const [x, y] of [[x1, y1], [x2, y2]]) { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill() }
      const label = `${fm(a, b).toFixed(2)} m`
      ctx.font = 'bold 12px sans-serif'
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
      ctx.lineWidth = 4; ctx.strokeStyle = BG; ctx.strokeText(label, mx + 4, my - 4); ctx.lineWidth = 2
      ctx.fillStyle = color; ctx.fillText(label, mx + 4, my - 4)
    }
    for (const m of medidas) draw(m.a, m.b, '#dc2626')
    if (pendente && (hover || cursor)) {
      const end = hover ?? { x: cursor!.x, y: cursor!.y, kind: 'ponta' as const }
      draw(pendente, end, '#f59e0b')
    }
    if (hover) {
      const [x, y] = toScreen(hover.x, hover.y, w, h)
      ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 2
      if (hover.kind === 'meio') { ctx.beginPath(); ctx.moveTo(x - 6, y + 5); ctx.lineTo(x + 6, y + 5); ctx.lineTo(x, y - 6); ctx.closePath(); ctx.stroke() }
      else if (hover.kind === 'bloco') { ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke() }
      else ctx.strokeRect(x - 6, y - 6, 12, 12)
    }
  })

  // zoom com a rodinha (listener nativo pra poder cancelar o scroll da página)
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
    // a área do desenho só existe depois que o arquivo carrega
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model])

  function pos(e: React.MouseEvent) {
    const r = wrapRef.current!.getBoundingClientRect()
    return { px: e.clientX - r.left, py: e.clientY - r.top, w: r.width, h: r.height }
  }
  function onDown(e: React.MouseEvent) {
    const { px, py } = pos(e)
    if (e.button === 1 || tool === 'mover') drag.current = { x: px, y: py, cx: view.current.cx, cy: view.current.cy }
  }
  function onMove(e: React.MouseEvent) {
    const { px, py, w, h } = pos(e)
    if (drag.current) {
      view.current.cx = drag.current.cx - (px - drag.current.x) / view.current.scale
      view.current.cy = drag.current.cy + (py - drag.current.y) / view.current.scale
      redraw(); return
    }
    const [wx, wy] = toWorld(px, py, w, h)
    setCursor({ x: wx, y: wy })
    setHover(findSnap(wx, wy, w, h))
  }
  function onUp() { drag.current = null }
  function onClick(e: React.MouseEvent) {
    if (tool !== 'medir') return
    const { px, py, w, h } = pos(e)
    const [wx, wy] = toWorld(px, py, w, h)
    const p: Snap = findSnap(wx, wy, w, h) ?? { x: wx, y: wy, kind: 'ponta' }
    if (!pendente) setPendente(p)
    else { setMedidas(m => [...m, { a: pendente, b: p }]); setPendente(null) }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPendente(null); setTool('mover') }
      if ((e.key === 'm' || e.key === 'M') && !(e.target instanceof HTMLInputElement)) setTool('medir')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const blocos = useMemo(() => {
    if (!model) return []
    const c = new Map<string, number>()
    for (const b of model.inserts) c.set(b.name, (c.get(b.name) ?? 0) + 1)
    return Array.from(c.entries()).filter(([n]) => !n.startsWith('*')).sort((a, b) => b[1] - a[1])
  }, [model])

  const totalMedido = model ? medidas.reduce((s, m) => s + Math.hypot(m.a.x - m.b.x, m.a.y - m.b.y) * model.unitToMeters, 0) : 0

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-bold text-navy">Laboratório CAD <span className="text-xs font-semibold align-middle bg-amber-100 text-amber-700 rounded px-2 py-0.5">protótipo · só você vê</span></h1>
        <p className="text-sm text-navy-muted">Abre DWG ou DXF direto no navegador (o arquivo não é enviado pra lugar nenhum). Camadas, blocos contados, snap nas pontas/meios e medição em metros reais.</p>
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
            <div className="flex items-center gap-1 mb-2">
              <button onClick={() => setTool('mover')} className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium', tool === 'mover' ? 'bg-brand-600 text-white' : 'text-navy-muted hover:bg-surface-secondary')}><Move className="w-3.5 h-3.5" /> Mover</button>
              <button onClick={() => setTool('medir')} className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium', tool === 'medir' ? 'bg-brand-600 text-white' : 'text-navy-muted hover:bg-surface-secondary')}><Ruler className="w-3.5 h-3.5" /> Medir (M)</button>
              <button onClick={() => fit(0)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-navy-muted hover:bg-surface-secondary"><Maximize className="w-3.5 h-3.5" /> Ajustar</button>
              <span className="ml-auto text-[11px] text-gray-400">
                {tempo != null && `lido em ${(tempo / 1000).toFixed(1)}s · `}{(model.segLayer.length).toLocaleString('pt-BR')} traços · unidade: {model.unitName}
                {cursor && ` · x ${cursor.x.toFixed(2)} y ${cursor.y.toFixed(2)}`}
              </span>
            </div>
            <div ref={wrapRef} className="relative w-full border border-surface-border rounded-xl overflow-hidden" style={{ background: BG, height: '70vh', cursor: tool === 'medir' ? 'crosshair' : drag.current ? 'grabbing' : 'grab' }}
              onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => { onUp(); setHover(null) }} onClick={onClick}>
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ width: '100%', height: '100%' }} />
              {hover && <div className="absolute left-2 bottom-2 text-[11px] bg-white/90 border border-gray-200 rounded px-2 py-0.5 text-green-700 font-medium">snap: {hover.kind}</div>}
              {tool === 'medir' && <div className="absolute left-2 top-2 text-[11px] bg-amber-50 border border-amber-200 rounded px-2 py-0.5 text-amber-700">{pendente ? 'Clique no segundo ponto (Esc cancela)' : 'Clique no primeiro ponto'}</div>}
            </div>
            {!model.unitKnown && <p className="text-[11px] text-amber-600 mt-1">O arquivo não informa a unidade — as medidas estão assumindo metros.</p>}
          </div>

          <div className="w-72 shrink-0 space-y-3 max-h-[78vh] overflow-y-auto">
            <section className="border border-gray-200 rounded-xl bg-white p-3">
              <p className="text-xs font-bold text-gray-500 uppercase mb-1">Medidas</p>
              {medidas.length === 0 && <p className="text-xs text-gray-400">Use "Medir" e clique em dois pontos — o cursor gruda nas pontas (□), meios (△) e blocos (○).</p>}
              {medidas.map((m, i) => (
                <p key={i} className="text-xs text-gray-700 flex justify-between"><span>#{i + 1}</span><b>{(Math.hypot(m.a.x - m.b.x, m.a.y - m.b.y) * model.unitToMeters).toFixed(2)} m</b></p>
              ))}
              {medidas.length > 0 && (
                <div className="flex justify-between text-xs border-t border-gray-100 mt-1 pt-1">
                  <span className="text-gray-500">Total</span><b>{totalMedido.toFixed(2)} m</b>
                  <button onClick={() => setMedidas([])} className="text-gray-400 hover:text-red-500 underline">limpar</button>
                </div>
              )}
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
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: l.color }} />
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
