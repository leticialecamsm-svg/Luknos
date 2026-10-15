'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Plus, RotateCw, Pencil, Undo2, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FileBadge } from './FileBadge'

// Tela antes de enviar arquivos (como no WhatsApp Web): prévia grande, legenda por arquivo,
// mais arquivos (+, colar ou arrastar), girar e desenhar por cima das imagens. Nada sai sem "Enviar".

export interface ComposedFile { file: File; caption: string }

interface Item {
  id: string
  file: File
  caption: string
  isImage: boolean
  thumb: string | null // miniatura (URL local)
  edited: boolean
}

const COLORS = ['#111827', '#ffffff', '#ef4444', '#f59e0b', '#22c55e', '#0ea5e9', '#a855f7', '#CBA455']
const SIZES = [0.004, 0.008, 0.016] // fração do maior lado da imagem
const MAX_FILES = 10

const newId = () => Math.random().toString(36).slice(2)
const isEditableImage = (f: File) => /^image\/(png|jpe?g|webp|gif|bmp)$/i.test(f.type) && f.type !== 'image/gif'

export function MediaComposer({ initialFiles, onSend, onClose, contactName }: {
  initialFiles: File[]
  onSend: (items: ComposedFile[]) => void
  onClose: () => void
  contactName?: string
}) {
  const [items, setItems] = useState<Item[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [color, setColor] = useState(COLORS[2])
  const [size, setSize] = useState(1)
  const [busy, setBusy] = useState(false)
  // cada imagem tem seu próprio canvas (fica fora do React para não perder o desenho ao trocar)
  const canvases = useRef(new Map<string, HTMLCanvasElement>())
  const history = useRef(new Map<string, ImageData[]>())
  const stageRef = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const captionRef = useRef<HTMLTextAreaElement>(null)
  const [, force] = useState(0)

  const addFiles = useCallback((files: File[]) => {
    const fresh = files.slice(0, MAX_FILES).map((file) => {
      const isImage = isEditableImage(file)
      return { id: newId(), file, caption: '', isImage, thumb: file.type.startsWith('image/') ? URL.createObjectURL(file) : null, edited: false }
    })
    setItems((cur) => {
      const next = [...cur, ...fresh].slice(0, MAX_FILES)
      return next
    })
    if (fresh[0]) setActiveId((cur) => cur ?? fresh[0].id)
    // carrega as imagens editáveis num canvas
    for (const it of fresh) {
      if (!it.isImage || !it.thumb) continue
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        c.getContext('2d')!.drawImage(img, 0, 0)
        c.className = 'block max-w-full max-h-full object-contain rounded-md shadow-lg touch-none'
        canvases.current.set(it.id, c)
        force((n) => n + 1)
      }
      img.src = it.thumb
    }
  }, [])

  useEffect(() => { addFiles(initialFiles) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])
  useEffect(() => () => { items.forEach((i) => i.thumb && URL.revokeObjectURL(i.thumb)) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const active = items.find((i) => i.id === activeId) ?? items[0] ?? null
  const activeCanvas = active ? canvases.current.get(active.id) : undefined

  // coloca o canvas da imagem ativa no palco
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    stage.innerHTML = ''
    if (activeCanvas) stage.appendChild(activeCanvas)
  })
  useEffect(() => { requestAnimationFrame(() => captionRef.current?.focus()) }, [active?.id])
  useEffect(() => { if (!active?.isImage) setDrawing(false) }, [active?.isImage])

  // editou: a miniatura passa a mostrar a imagem como vai sair
  const markEdited = (id: string) => {
    const c = canvases.current.get(id)
    const thumb = c ? c.toDataURL('image/jpeg', 0.6) : null
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, edited: true, thumb: thumb ?? i.thumb } : i)))
  }
  const pushHistory = (id: string, c: HTMLCanvasElement) => {
    const h = history.current.get(id) ?? []
    h.push(c.getContext('2d')!.getImageData(0, 0, c.width, c.height))
    if (h.length > 15) h.shift()
    history.current.set(id, h)
  }

  const rotate = () => {
    if (!active || !activeCanvas) return
    pushHistory(active.id, activeCanvas)
    const src = activeCanvas
    const tmp = document.createElement('canvas')
    tmp.width = src.height
    tmp.height = src.width
    const ctx = tmp.getContext('2d')!
    ctx.translate(tmp.width, 0)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(src, 0, 0)
    src.width = tmp.width
    src.height = tmp.height
    src.getContext('2d')!.drawImage(tmp, 0, 0)
    markEdited(active.id)
  }

  const undo = () => {
    if (!active || !activeCanvas) return
    const h = history.current.get(active.id)
    const last = h?.pop()
    if (!last) return
    activeCanvas.width = last.width
    activeCanvas.height = last.height
    activeCanvas.getContext('2d')!.putImageData(last, 0, 0)
    markEdited(active.id)
  }

  // desenho livre por cima da imagem
  useEffect(() => {
    const c = activeCanvas
    if (!c || !drawing || !active) return
    let down = false
    let last: { x: number; y: number } | null = null
    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect()
      return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height }
    }
    const ctx = c.getContext('2d')!
    const onDown = (e: PointerEvent) => {
      down = true
      c.setPointerCapture(e.pointerId)
      pushHistory(active.id, c)
      last = pos(e)
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = Math.max(2, SIZES[size] * Math.max(c.width, c.height))
      ctx.beginPath()
      ctx.arc(last.x, last.y, ctx.lineWidth / 2, 0, Math.PI * 2)
      ctx.fill()
    }
    const onMove = (e: PointerEvent) => {
      if (!down || !last) return
      const p = pos(e)
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      last = p
    }
    const onUp = () => { if (down) markEdited(active.id); down = false; last = null }
    c.style.cursor = 'crosshair'
    c.addEventListener('pointerdown', onDown)
    c.addEventListener('pointermove', onMove)
    c.addEventListener('pointerup', onUp)
    c.addEventListener('pointercancel', onUp)
    return () => {
      c.style.cursor = ''
      c.removeEventListener('pointerdown', onDown)
      c.removeEventListener('pointermove', onMove)
      c.removeEventListener('pointerup', onUp)
      c.removeEventListener('pointercancel', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCanvas, drawing, color, size, active?.id])

  const removeItem = (id: string) => {
    setItems((cur) => {
      const next = cur.filter((i) => i.id !== id)
      if (!next.length) onClose()
      if (activeId === id) setActiveId(next[0]?.id ?? null)
      return next
    })
    canvases.current.delete(id)
    history.current.delete(id)
  }

  const send = async () => {
    if (busy || !items.length) return
    setBusy(true)
    const out: ComposedFile[] = []
    for (const it of items) {
      const c = canvases.current.get(it.id)
      if (it.isImage && it.edited && c) {
        const png = it.file.type === 'image/png'
        const blob = await new Promise<Blob | null>((res) => c.toBlob(res, png ? 'image/png' : 'image/jpeg', 0.92))
        if (blob) {
          const name = it.file.name.replace(/\.[^.]+$/, '') + (png ? '.png' : '.jpg')
          out.push({ file: new File([blob], name, { type: blob.type }), caption: it.caption.trim() })
          continue
        }
      }
      out.push({ file: it.file, caption: it.caption.trim() })
    }
    onSend(out)
  }

  // Esc fecha; colar ou arrastar mais arquivos enquanto a tela está aberta
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length) { e.preventDefault(); addFiles(files) }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('paste', onPaste)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('paste', onPaste) }
  }, [onClose, addFiles])

  const toolBtn = (on: boolean) => cn('w-10 h-10 rounded-full flex items-center justify-center transition-colors', on ? 'bg-gray-200 text-gray-900' : 'text-gray-600 hover:bg-gray-100')

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Enviar arquivos"
      className="absolute inset-0 z-30 bg-[#F7F8FA] flex flex-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)) }}
    >
      {/* barra de cima */}
      <div className="h-14 shrink-0 flex items-center gap-2 px-3 border-b border-gray-200 bg-white">
        <button type="button" onClick={onClose} aria-label="Cancelar" title="Cancelar (Esc)" className={toolBtn(false)}><X className="w-5 h-5" /></button>
        <p className="text-sm text-gray-500 truncate">{contactName ? `Para ${contactName}` : 'Enviar arquivos'}</p>
        {active?.isImage && (
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={undo} disabled={!history.current.get(active.id)?.length} aria-label="Desfazer" title="Desfazer" className={cn(toolBtn(false), 'disabled:opacity-30')}><Undo2 className="w-5 h-5" /></button>
            <button type="button" onClick={rotate} aria-label="Girar" title="Girar" className={toolBtn(false)}><RotateCw className="w-5 h-5" /></button>
            <button type="button" onClick={() => setDrawing((v) => !v)} aria-pressed={drawing} aria-label="Desenhar" title="Desenhar" className={toolBtn(drawing)}><Pencil className="w-5 h-5" /></button>
          </div>
        )}
      </div>

      {/* cores e espessura do lápis */}
      {drawing && active?.isImage && (
        <div className="shrink-0 flex items-center justify-center gap-2 py-2 bg-white border-b border-gray-200">
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Cor ${c}`} aria-pressed={color === c}
              className={cn('w-7 h-7 rounded-full border border-black/15', color === c && 'ring-2 ring-offset-2 ring-gray-500')} style={{ background: c }} />
          ))}
          <span className="w-px h-6 bg-gray-200 mx-2" />
          {SIZES.map((_, i) => (
            <button key={i} type="button" onClick={() => setSize(i)} aria-label={`Espessura ${i + 1}`} aria-pressed={size === i}
              className={cn('w-8 h-8 rounded-full flex items-center justify-center', size === i ? 'bg-gray-200' : 'hover:bg-gray-100')}>
              <span className="rounded-full bg-gray-700" style={{ width: 4 + i * 5, height: 4 + i * 5 }} />
            </button>
          ))}
        </div>
      )}

      {/* prévia */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-6">
        {active?.isImage ? (
          <div ref={stageRef} className="w-full h-full flex items-center justify-center [&>canvas]:max-h-full [&>canvas]:max-w-full" />
        ) : active ? (
          <div className="flex flex-col items-center gap-3 text-center">
            {active.thumb
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={active.thumb} alt="" className="max-h-[50vh] rounded-md shadow" />
              : <FileBadge name={active.file.name} size={96} />}
            <p className="font-medium text-gray-800 break-all max-w-md">{active.file.name}</p>
            <p className="text-sm text-gray-500">{formatSize(active.file.size)}</p>
          </div>
        ) : null}
      </div>

      {/* legenda */}
      <div className="shrink-0 px-4 pb-3 flex justify-center">
        <textarea
          ref={captionRef}
          rows={1}
          value={active?.caption ?? ''}
          onChange={(e) => { const v = e.target.value; setItems((cur) => cur.map((i) => (i.id === active?.id ? { ...i, caption: v } : i))) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
          placeholder="Digite uma mensagem"
          aria-label="Legenda"
          className="w-full max-w-2xl resize-none rounded-lg bg-white border border-gray-200 px-4 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        />
      </div>

      {/* miniaturas, + e enviar */}
      <div className="shrink-0 h-24 border-t border-gray-200 bg-white flex items-center gap-2 px-4">
        <div className="flex-1 flex items-center justify-center gap-2 overflow-x-auto">
          {items.map((it) => (
            <div key={it.id} className="relative group shrink-0">
              <button type="button" onClick={() => setActiveId(it.id)} aria-label={`Ver ${it.file.name}`}
                className={cn('w-14 h-14 rounded-md overflow-hidden border-2 bg-gray-50 flex items-center justify-center', it.id === active?.id ? 'border-emerald-500' : 'border-gray-200')}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {it.thumb ? <img src={it.thumb} alt="" className="w-full h-full object-cover" /> : <FileBadge name={it.file.name} size={26} />}
              </button>
              <button type="button" onClick={() => removeItem(it.id)} aria-label={`Tirar ${it.file.name}`}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-800 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {items.length < MAX_FILES && (
            <button type="button" onClick={() => fileInput.current?.click()} aria-label="Adicionar arquivo" title="Adicionar"
              className="w-14 h-14 shrink-0 rounded-md border border-gray-300 text-gray-500 hover:bg-gray-50 flex items-center justify-center">
              <Plus className="w-6 h-6" />
            </button>
          )}
          <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
        </div>
        <button type="button" onClick={() => void send()} disabled={busy || !items.length} aria-label="Enviar" title="Enviar (Enter)"
          className="w-14 h-14 shrink-0 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center shadow-lg">
          <Send className="w-6 h-6" />
        </button>
      </div>
    </div>
  )
}

function formatSize(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}
