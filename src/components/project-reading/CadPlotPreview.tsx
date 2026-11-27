'use client'

// Prévia da plotagem: mostra a folha exatamente como vai sair, com os dados do
// carimbo e os ajustes de tamanho e posição da planta.
import { useEffect, useRef, useState } from 'react'
import { FileDown, Loader2, Minus, Plus, RotateCcw, RotateCw, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CadAttach, AvisoAnexo, anexarPdf, nomeDaEtapa, type Anexo } from './CadAttach'
import { plotLayout, PAPEIS, ESCALAS, type PlotInfo, type Papel, type Cores, type Giro } from '@/lib/project-reading/cad-plot'

interface Props {
  plot: PlotInfo
  setPlot: React.Dispatch<React.SetStateAction<PlotInfo>>
  unitToMeters: number
  nItens: number
  temAmbientes: boolean
  conteudo: unknown // muda quando o desenho muda
  build: () => Promise<Uint8Array | null>
  onDownload: (bytes: Uint8Array, manterAberto?: boolean) => void
  nomeArquivo: string
  onClose: () => void
  onMarcar: () => void
}

const input = 'w-full text-sm border border-gray-200 rounded px-2 py-1 text-gray-800 bg-white'

export function CadPlotPreview({ plot, setPlot, unitToMeters, nItens, temAmbientes, conteudo, build, onDownload, nomeArquivo, onClose, onMarcar }: Props) {
  // anexar começa desligado a cada vez; a solicitação escolhida fica guardada no desenho
  const [anexar, setAnexar] = useState(false)
  const [envio, setEnvio] = useState<null | { pct?: number; erro?: string; feito?: Anexo }>(null)
  const enviando = envio?.pct !== undefined
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const bytes = useRef<Uint8Array | null>(null)
  const seq = useRef(0)
  const buildRef = useRef(build); buildRef.current = build
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pagina, setPagina] = useState(1)
  const [total, setTotal] = useState(1)
  const [arrasto, setArrasto] = useState<null | { x: number; y: number; dx: number; dy: number }>(null)
  const set = (p: Partial<PlotInfo>) => setPlot(v => ({ ...v, ...p }))
  const L = plot.area ? plotLayout(plot, nItens, plot.area, unitToMeters) : null

  // textos esperam a digitação parar; ajustes da folha atualizam logo
  const textos = [plot.endereco, plot.proprietario, plot.escritorio, plot.data, plot.pavimento, plot.desenho].join('|')
  const folha = JSON.stringify([plot.area, plot.papel, plot.escala, plot.legenda, plot.ambientes, plot.cores, plot.zoom, plot.desloc, plot.giro, plot.resumo, plot.legendaPos])
  const textosAntes = useRef(textos)
  useEffect(() => {
    if (!plot.area) return
    const digitando = textosAntes.current !== textos
    textosAntes.current = textos
    const n = ++seq.current
    setBusy(true)
    const timer = setTimeout(async () => {
      try {
        const out = await buildRef.current()
        if (n !== seq.current || !out) return
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const doc = await pdfjs.getDocument({ data: out.slice() }).promise
        const mostrar = Math.min(pagina, doc.numPages)
        setTotal(doc.numPages)
        const page = await doc.getPage(mostrar)
        const el = boxRef.current, cv = canvasRef.current
        if (n !== seq.current || !el || !cv) return
        const base = page.getViewport({ scale: 1 })
        const k = Math.min((el.clientWidth - 24) / base.width, (el.clientHeight - 24) / base.height)
        const dpr = window.devicePixelRatio || 1
        const vp = page.getViewport({ scale: k * dpr })
        // desenha fora da tela e só então troca, pra prévia não piscar
        const tmp = document.createElement('canvas'); tmp.width = vp.width; tmp.height = vp.height
        await page.render({ canvasContext: tmp.getContext('2d')!, viewport: vp }).promise
        if (n !== seq.current) return
        cv.width = tmp.width; cv.height = tmp.height
        cv.style.width = `${base.width * k}px`; cv.style.height = `${base.height * k}px`
        cv.getContext('2d')!.drawImage(tmp, 0, 0)
        bytes.current = out
        setErro(null); setArrasto(null); setBusy(false)
      } catch (e: any) {
        if (n === seq.current) { setErro(e?.message ?? 'Não consegui montar a prévia.'); setBusy(false) }
      }
    }, digitando ? 1100 : 250)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textos, folha, conteudo, nItens, pagina])

  async function baixar() {
    const pdf = bytes.current
    if (!pdf || enviando) return
    const alvo = anexar ? plot.anexo : undefined
    onDownload(pdf, !!alvo)
    if (!alvo) return
    // data e hora no nome: cada envio fica como uma versão, sem se confundir com a anterior
    const agora = new Date()
    const quando = `${agora.toLocaleDateString('pt-BR').replace(/\//g, '-')} ${String(agora.getHours()).padStart(2, '0')}h${String(agora.getMinutes()).padStart(2, '0')}`
    setEnvio({ pct: 0 })
    try {
      await anexarPdf(alvo, `${nomeArquivo} - ${quando}.pdf`.replace(/[\\/:*?"<>|]+/g, '-'), pdf, pct => setEnvio({ pct }))
      setEnvio({ feito: alvo })
    } catch (e: any) {
      setEnvio({ erro: e?.message ?? 'Não foi possível anexar o PDF.' })
    }
  }
  const zoom = plot.zoom ?? 1
  const setZoom = (z: number) => set({ zoom: Math.round(Math.max(0.3, Math.min(4, z)) * 100) / 100 })
  const giro = plot.giro ?? 0
  const girar = (d: number) => set({ giro: ((giro + d + 360) % 360) as Giro, zoom: 1, desloc: [0, 0] })
  // quanto a planta cresceria virada de lado (só faz sentido com escala livre)
  const ganho = L && plot.area && !plot.escala ? plotLayout({ ...plot, giro: ((giro + 90) % 360) as Giro }, nItens, plot.area, unitToMeters).ptPorUnidade / plotLayout(plot, nItens, plot.area, unitToMeters).ptPorUnidade : 1
  // quanto a planta cresceria com a legenda no outro lugar
  const outraPos = plot.legendaPos === 'lado' ? 'baixo' : 'lado'
  const ganhoLegenda = L && plot.area && !plot.escala && plot.legenda && nItens ? plotLayout({ ...plot, legendaPos: outraPos }, nItens, plot.area, unitToMeters).ptPorUnidade / plotLayout(plot, nItens, plot.area, unitToMeters).ptPorUnidade : 1
  const porLegenda = (legendaPos: 'baixo' | 'lado') => set({ legendaPos, zoom: 1, desloc: [0, 0] })
  function soltar() {
    if (!arrasto || !canvasRef.current || !L) return
    if (!arrasto.dx && !arrasto.dy) { setArrasto(null); return }
    // pixels da prévia → pontos de A4
    const k = L.W / canvasRef.current.clientWidth / L.f
    const [x, y] = plot.desloc ?? [0, 0]
    set({ desloc: [x + arrasto.dx * k, y + arrasto.dy * k] })
  }

  const area2 = (label: string, k: 'endereco' | 'proprietario' | 'escritorio', ph: string) => (
    <label className="block text-[11px] text-gray-500">{label}
      <textarea rows={2} value={plot[k]} onChange={e => set({ [k]: e.target.value })} onKeyDown={e => e.stopPropagation()} placeholder={ph} className={`${input} resize-none`} /></label>
  )
  const campo = (label: string, k: 'data' | 'pavimento' | 'desenho') => (
    <label className="text-[11px] text-gray-500">{label}<input value={plot[k]} onChange={e => set({ [k]: e.target.value })} onKeyDown={e => e.stopPropagation()} className={input} /></label>
  )

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 p-3 flex gap-3">
      <div ref={boxRef} className="relative flex-1 min-w-0 flex items-center justify-center overflow-hidden rounded-xl bg-gray-600"
        onWheel={e => { if (plot.area && !plot.escala && pagina === 1) setZoom(zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06)) }}>
        {!plot.area && <button onClick={onMarcar} className="text-sm font-medium bg-brand-600 text-white rounded-lg px-5 py-3">Marcar área na planta</button>}
        <canvas ref={canvasRef} className={cn('bg-white shadow-2xl select-none', !plot.area && 'hidden', arrasto ? 'cursor-grabbing' : 'cursor-grab')}
          style={{ transform: arrasto ? `translate(${arrasto.dx * 0.15}px, ${arrasto.dy * 0.15}px)` : undefined }}
          onPointerDown={e => { if (pagina > 1) return; (e.target as HTMLElement).setPointerCapture(e.pointerId); setArrasto({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 }) }}
          onPointerMove={e => { if (arrasto && e.buttons & 1) setArrasto({ ...arrasto, dx: e.clientX - arrasto.x, dy: e.clientY - arrasto.y }) }}
          onPointerUp={soltar} />
        {busy && plot.area && <span className="absolute top-3 left-3 flex items-center gap-1.5 text-xs bg-white/95 rounded-full px-3 py-1 text-gray-600"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Atualizando a prévia...</span>}
        {total > 1 && plot.area && (
          <div className="absolute top-3 right-3 flex items-center gap-2 text-xs bg-white/95 rounded-full px-2 py-1 text-gray-700">
            <button onClick={() => setPagina(1)} className={cn('rounded-full px-2.5 py-0.5', pagina === 1 && 'bg-brand-600 text-white')}>Planta</button>
            <button onClick={() => setPagina(2)} className={cn('rounded-full px-2.5 py-0.5', pagina === 2 && 'bg-brand-600 text-white')}>Resumo</button>
            {total > 2 && pagina > 1 && <>
              <button disabled={pagina <= 2} onClick={() => setPagina(p => p - 1)} className="px-1 disabled:opacity-30">‹</button>
              <span>{Math.min(pagina, total) - 1}/{total - 1}</span>
              <button disabled={pagina >= total} onClick={() => setPagina(p => p + 1)} className="px-1 disabled:opacity-30">›</button>
            </>}
          </div>
        )}
        {erro && <span className="absolute bottom-3 text-xs bg-red-50 text-red-600 rounded px-3 py-1">{erro}</span>}
        {plot.area && pagina === 1 && <span className="absolute bottom-3 right-3 text-[11px] text-white/80">Arraste a folha pra posicionar a planta · rodinha muda o tamanho</span>}
      </div>

      <div className="w-80 shrink-0 overflow-y-auto bg-white rounded-xl p-4 space-y-2">
        <div className="flex items-center">
          <p className="text-sm font-bold text-navy flex items-center gap-1.5"><FileDown className="w-4 h-4 text-brand-500" /> Plotar PDF</p>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-700" title="Fechar"><X className="w-4 h-4" /></button>
        </div>
        {plot.area && (
          <div className="rounded-lg border border-gray-200 p-2 space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span className="flex-1">Tamanho da planta</span>
              {plot.escala ? <span className="text-[11px] text-gray-400">definido pela escala</span> : (<>
                <button onClick={() => setZoom(zoom / 1.1)} className="border border-gray-200 rounded p-1"><Minus className="w-3 h-3" /></button>
                <b className="w-10 text-center">{Math.round(zoom * 100)}%</b>
                <button onClick={() => setZoom(zoom * 1.1)} className="border border-gray-200 rounded p-1"><Plus className="w-3 h-3" /></button>
              </>)}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span className="flex-1">Girar planta</span>
              <button onClick={() => girar(-90)} className="border border-gray-200 rounded p-1" title="Girar 90° pra esquerda"><RotateCcw className="w-3 h-3" /></button>
              <b className="w-10 text-center">{giro}°</b>
              <button onClick={() => girar(90)} className="border border-gray-200 rounded p-1" title="Girar 90° pra direita"><RotateCw className="w-3 h-3" /></button>
            </div>
            {ganho > 1.1 && <button onClick={() => girar(90)} className="w-full text-[11px] bg-amber-50 text-amber-700 rounded px-2 py-1 text-left">Girando, a planta fica {Math.round((ganho - 1) * 100)}% maior. <u>Girar</u></button>}
            <div className="flex gap-2">
              <button onClick={() => set({ zoom: 1, desloc: [0, 0] })} className="flex-1 text-[11px] border border-gray-200 rounded py-1 text-gray-600">Ajustar e centralizar</button>
              <button onClick={onMarcar} className="flex-1 text-[11px] border border-brand-400 text-brand-600 rounded py-1">Marcar outra área</button>
            </div>
            {L && <p className={cn('text-[11px]', L.cabe ? 'text-gray-500' : 'text-red-600')}>Escala {L.rotuloEscala}{!L.cabe && ' — não cabe inteira: use uma folha maior ou outra escala'}{zoom > 1.001 && !plot.escala && ' — o que passar do quadro é cortado'}</p>}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-gray-500">Folha<select value={plot.papel} onChange={e => set({ papel: e.target.value as Papel })} className={input}>{Object.keys(PAPEIS).map(p => <option key={p}>{p}</option>)}</select></label>
          <label className="text-[11px] text-gray-500">Escala<select value={plot.escala} onChange={e => set({ escala: Number(e.target.value) })} className={input}>{ESCALAS.map(v => <option key={v} value={v}>{v ? `1/${v}` : 'Ajustar à folha'}</option>)}</select></label>
          <label className="col-span-2 text-[11px] text-gray-500">Cores no papel
            <select value={plot.cores} onChange={e => set({ cores: e.target.value as Cores })} className={input}>
              <option value="ajustadas">Ajustadas pro papel (claras escurecem)</option>
              <option value="originais">Originais da tela</option>
              <option value="pb">Preto e branco</option>
            </select></label>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600"><input type="checkbox" checked={plot.legenda} onChange={e => set({ legenda: e.target.checked })} /> Legenda na prancha ({nItens} {nItens === 1 ? 'item' : 'itens'})</label>
        {plot.legenda && nItens > 0 && (
          <div className="pl-5 space-y-1">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[11px]">
              {([['baixo', 'Embaixo'], ['lado', 'Lado direito']] as const).map(([v, nome]) => (
                <button key={v} onClick={() => porLegenda(v)} className={cn('flex-1 py-1', (plot.legendaPos ?? 'baixo') === v ? 'bg-brand-600 text-white font-medium' : 'text-gray-600 hover:bg-gray-50')}>{nome}</button>
              ))}
            </div>
            {ganhoLegenda > 1.1 && <button onClick={() => porLegenda(outraPos)} className="w-full text-[11px] bg-amber-50 text-amber-700 rounded px-2 py-1 text-left">Com a legenda {outraPos === 'lado' ? 'ao lado' : 'embaixo'}, a planta fica {Math.round((ganhoLegenda - 1) * 100)}% maior. <u>Mudar</u></button>}
          </div>
        )}
        {temAmbientes && <label className="flex items-center gap-1.5 text-xs text-gray-600"><input type="checkbox" checked={plot.ambientes} onChange={e => set({ ambientes: e.target.checked })} /> Escrever nome e área dos ambientes</label>}
        <label className={cn('flex items-start gap-1.5 text-xs rounded-lg border p-2 cursor-pointer', plot.resumo ? 'border-brand-400 bg-brand-50 text-navy' : 'border-gray-200 text-gray-600', !nItens && 'opacity-50')}>
          <input type="checkbox" className="mt-0.5" disabled={!nItens} checked={!!plot.resumo} onChange={e => { set({ resumo: e.target.checked }); setPagina(e.target.checked ? 2 : 1) }} />
          <span><b className="block">Incluir resumo para o orçamentista</b>Página extra com quantidades por ambiente e total geral{!nItens && ' (adicione itens ao projeto)'}</span>
        </label>
        {area2('Endereço da obra', 'endereco', 'Condomínio, quadra, lote, cidade')}
        {area2('Proprietário', 'proprietario', 'Nome do cliente')}
        {area2('Escritório responsável', 'escritorio', 'Escritório e telefone')}
        <div className="grid grid-cols-3 gap-2">{campo('Data', 'data')}{campo('Pavimento', 'pavimento')}{campo('Desenho', 'desenho')}</div>
        <CadAttach ativo={anexar} setAtivo={v => { setAnexar(v); setEnvio(null) }} anexo={plot.anexo} setAnexo={a => { set({ anexo: a }); setEnvio(null) }} />
        <button onClick={baixar} disabled={!plot.area || busy || enviando || (anexar && !plot.anexo)} className="w-full text-sm font-medium bg-brand-600 text-white rounded-lg py-2 disabled:opacity-50">
          {enviando ? `Anexando... ${envio!.pct}%` : busy && plot.area ? 'Preparando...' : !anexar ? 'Baixar PDF' : plot.anexo ? `Baixar e anexar em ${nomeDaEtapa(plot.anexo.etapa)}` : 'Escolha a solicitação'}
        </button>
        {envio?.erro && <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1.5">O PDF foi baixado, mas não anexou: {envio.erro} Clique no botão pra tentar de novo.</p>}
        {envio?.feito && <AvisoAnexo anexo={envio.feito} />}
      </div>
    </div>
  )
}
