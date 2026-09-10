'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import {
  getQuoteAttachments,
  uploadQuoteAttachment,
  deleteQuoteAttachment,
  getQuoteAttachmentUrl,
} from '@/lib/actions'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/useConfirm'
import { cn } from '@/lib/utils'
import {
  Paperclip, Upload, FileText, Image as ImageIcon, Box, Trash2, Download, Loader2, Bot,
} from 'lucide-react'

type Item = {
  id: string
  source: 'manual' | 'robot'
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  detected_kind?: string | null
  created_at: string
  uploaded_by_name?: string | null
}

const MAX_BYTES = 25 * 1024 * 1024

function humanSize(n: number | null): string {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function iconFor(name: string, mime: string | null) {
  const ext = (name.split('.').pop() ?? '').toLowerCase()
  const m = (mime ?? '').toLowerCase()
  if (ext === 'pdf' || m === 'application/pdf') return FileText
  if (['dwg', 'skp', 'skb'].includes(ext) || m.includes('sketchup') || m.includes('acad')) return Box
  if (m.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'tif', 'tiff'].includes(ext)) return ImageIcon
  return FileText
}

// quoteId presente = anexa direto no orçamento.
// sem quoteId = modo "rascunho": segura os arquivos e devolve via onStagedChange
// (o QuoteForm sobe depois que o orçamento é criado).
export function QuoteAttachments({
  quoteId,
  onStagedChange,
}: {
  quoteId?: string
  onStagedChange?: (files: File[]) => void
}) {
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()

  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(!!quoteId)
  const [staged, setStaged] = useState<File[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const refresh = useCallback(() => {
    if (!quoteId) return
    setLoading(true)
    getQuoteAttachments(quoteId)
      .then((r) => setItems([...r.robot, ...r.manual] as Item[]))
      .finally(() => setLoading(false))
  }, [quoteId])

  useEffect(() => { refresh() }, [refresh])

  function pushStaged(files: File[]) {
    const next = [...staged, ...files].slice(0, 20)
    setStaged(next)
    onStagedChange?.(next)
  }
  function removeStaged(i: number) {
    const next = staged.filter((_, idx) => idx !== i)
    setStaged(next)
    onStagedChange?.(next)
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList)
    const tooBig = files.find((f) => f.size > MAX_BYTES)
    if (tooBig) {
      toast.error('ARQUIVO GRANDE DEMAIS', `"${tooBig.name}" passa de 25 MB.`)
      return
    }
    if (!quoteId) {
      pushStaged(files)
      return
    }
    startTransition(async () => {
      let ok = 0
      for (const file of files) {
        const fd = new FormData()
        fd.set('quote_id', quoteId)
        fd.set('file', file)
        const res = await uploadQuoteAttachment(fd)
        if (res.error) toast.error('OCORREU UM ERRO', `${file.name}: ${res.error}`)
        else ok++
      }
      if (ok > 0) toast.success('TUDO CERTO!', `${ok} arquivo(s) anexado(s).`)
      refresh()
    })
  }

  async function open(item: Item) {
    setBusyId(item.id)
    try {
      const res = await getQuoteAttachmentUrl(item.id, item.source)
      if (res.error || !res.url) {
        toast.error('OCORREU UM ERRO', res.error ?? 'Não foi possível abrir o arquivo.')
        return
      }
      window.open(res.url, '_blank', 'noopener,noreferrer')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(item: Item) {
    if (item.source === 'robot') return
    const yes = await confirm(`Remover "${item.file_name}"? O arquivo será apagado permanentemente.`, 'Remover')
    if (!yes) return
    setBusyId(item.id)
    const res = await deleteQuoteAttachment(item.id, quoteId!)
    setBusyId(null)
    if (res.error) toast.error('OCORREU UM ERRO', res.error)
    else { toast.success('TUDO CERTO!', 'Anexo removido.'); refresh() }
  }

  const empty = !loading && items.length === 0 && staged.length === 0

  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <Paperclip className="w-4 h-4" /> Anexos
      </h2>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-3 py-4 text-center cursor-pointer transition-colors',
          dragOver ? 'border-brand-400 bg-brand-50' : 'border-surface-border hover:border-brand-300 hover:bg-gray-50',
        )}
      >
        {pending ? (
          <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
        ) : (
          <Upload className="w-5 h-5 text-gray-400" />
        )}
        <p className="text-xs text-gray-500">
          Arraste arquivos aqui ou <span className="text-brand-600 font-medium">clique para escolher</span>
        </p>
        <p className="text-[10px] text-gray-400">PDF, imagem, DWG, SketchUp — até 25 MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }}
      />

      {loading && (
        <p className="text-xs text-gray-400 mt-3 flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…
        </p>
      )}

      {empty && (
        <p className="text-xs text-gray-400 mt-3">Nenhum arquivo anexado ainda.</p>
      )}

      {(items.length > 0 || staged.length > 0) && (
        <ul className="mt-3 space-y-1.5">
          {items.map((item) => {
            const Icon = iconFor(item.file_name, item.mime_type)
            return (
              <li
                key={`${item.source}-${item.id}`}
                className="flex items-center gap-2 rounded-lg border border-surface-border px-2.5 py-2 text-sm"
              >
                <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-gray-700">{item.file_name}</p>
                  <p className="text-[10px] text-gray-400 flex items-center gap-1">
                    {item.source === 'robot' && <><Bot className="w-3 h-3" /> Robô ·</>}
                    {item.uploaded_by_name && `${item.uploaded_by_name} · `}
                    {humanSize(item.size_bytes)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => open(item)}
                  disabled={busyId === item.id}
                  className="p-1 text-gray-400 hover:text-brand-600"
                  title="Abrir"
                >
                  {busyId === item.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Download className="w-4 h-4" />}
                </button>
                {item.source === 'manual' && quoteId && (
                  <button
                    type="button"
                    onClick={() => remove(item)}
                    disabled={busyId === item.id}
                    className="p-1 text-gray-400 hover:text-red-600"
                    title="Remover"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </li>
            )
          })}

          {staged.map((f, i) => {
            const Icon = iconFor(f.name, f.type)
            return (
              <li
                key={`staged-${i}`}
                className="flex items-center gap-2 rounded-lg border border-dashed border-brand-200 bg-brand-50/40 px-2.5 py-2 text-sm"
              >
                <Icon className="w-4 h-4 text-brand-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-gray-700">{f.name}</p>
                  <p className="text-[10px] text-gray-400">{humanSize(f.size)} · sobe ao salvar</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeStaged(i)}
                  className="p-1 text-gray-400 hover:text-red-600"
                  title="Tirar da lista"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {ConfirmDialog}
    </div>
  )
}
