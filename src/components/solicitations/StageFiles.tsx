'use client'

// Coluna "Arquivos" de cada etapa: upload pro Drive (subpasta da etapa),
// cards empilhados (data + nome em cima, miniatura grande embaixo) e o modal
// de pré-visualização via proxy same-origin (/api/solicitacoes/drive-file).

import { useEffect, useState } from 'react'
import { Check, CloudOff, FileText, Image as ImageIcon, Box, Loader2, UploadCloud, Paperclip } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import {
  uploadStageFileForSolicitation, checkDriveConnected, listStageFilesForSolicitation, type StageFileStage,
} from '@/lib/solicitations/actions'

export function StageFileUpload({ solicitationId, stage, onUploaded }: { solicitationId: string; stage: StageFileStage; onUploaded?: () => void }) {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [uploading, setUploading] = useState(false)
  // Progresso agregado ("3 de 5 enviados") em vez de um único resultado —
  // suporta múltiplos arquivos selecionados/arrastados de uma vez (pedido
  // Letícia: só aceitava 1 arquivo por vez).
  const [progress, setProgress] = useState<{ total: number; done: number } | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [lastOkNames, setLastOkNames] = useState<string[]>([])

  useEffect(() => {
    checkDriveConnected().then(setConnected).catch(() => setConnected(false))
  }, [])

  async function handleFiles(fileList: FileList | File[] | undefined) {
    const files = Array.from(fileList ?? [])
    if (files.length === 0) return
    setUploading(true)
    setErrors([])
    setLastOkNames([])
    setProgress({ total: files.length, done: 0 })
    const okNames: string[] = []
    const errMsgs: string[] = []
    // Sequencial (não Promise.all) de propósito: evita sobrecarregar a API
    // do Drive com N uploads simultâneos e permite mostrar "X de N" real.
    for (const file of files) {
      try {
        const fd = new FormData()
        fd.set('file', file)
        const res = await uploadStageFileForSolicitation(solicitationId, stage, fd)
        if (res.error) errMsgs.push(`${file.name}: ${res.error}`)
        else okNames.push(file.name)
      } catch (e: any) {
        errMsgs.push(`${file.name}: ${e?.message ?? 'Falha ao enviar arquivo'}`)
      } finally {
        setProgress(p => (p ? { ...p, done: p.done + 1 } : p))
      }
    }
    setLastOkNames(okNames)
    setErrors(errMsgs)
    setUploading(false)
    if (okNames.length > 0) onUploaded?.()
  }

  if (connected === false) {
    return (
      <p className="text-xs text-gray-400 flex items-center gap-1.5">
        <CloudOff className="w-3.5 h-3.5" /> Google Drive não conectado — conecte em Configurações para enviar arquivos.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <label className={cn('btn-secondary text-sm cursor-pointer', (uploading || connected === null) && 'opacity-60 pointer-events-none')}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
          {uploading && progress ? `Enviando ${progress.done} de ${progress.total}…` : 'Enviar arquivo(s)'}
          <input
            type="file"
            multiple
            className="hidden"
            disabled={uploading || connected !== true}
            onChange={(e) => { handleFiles(e.target.files ?? undefined); e.target.value = '' }}
          />
        </label>
        {!uploading && progress && errors.length === 0 && lastOkNames.length > 0 && (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <Check className="w-3.5 h-3.5" />
            {progress.total} de {progress.total} enviados.
          </span>
        )}
        {!uploading && progress && errors.length > 0 && (
          <span className="text-xs text-amber-600 flex items-center gap-1">
            {lastOkNames.length} de {progress.total} enviados.
          </span>
        )}
      </div>
      {errors.length > 0 && (
        <div className="text-xs text-red-600 space-y-0.5">
          {errors.map((err, i) => <div key={i}>{err}</div>)}
        </div>
      )}
    </div>
  )
}

function stageFileIcon(name: string, mime: string) {
  const ext = (name.split('.').pop() ?? '').toLowerCase()
  if (ext === 'pdf' || mime === 'application/pdf') return FileText
  if (['dwg', 'skp', 'skb'].includes(ext) || mime.includes('sketchup') || mime.includes('acad')) return Box
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'tif', 'tiff'].includes(ext)) return ImageIcon
  return FileText
}

function isImageFile(name: string, mime: string) {
  const ext = (name.split('.').pop() ?? '').toLowerCase()
  return mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'tif', 'tiff'].includes(ext)
}

function isPdfFile(name: string, mime: string) {
  const ext = (name.split('.').pop() ?? '').toLowerCase()
  return mime === 'application/pdf' || ext === 'pdf'
}

export function FilePreviewModal({ file, onClose }: { file: { id: string; name: string; mimeType: string }; onClose: () => void }) {
  const url = `/api/solicitacoes/drive-file/${file.id}`
  const isImage = isImageFile(file.name, file.mimeType)
  const isPdf = isPdfFile(file.name, file.mimeType)

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[9998] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-surface-border">
          <p className="text-sm font-medium truncate" title={file.name}>{file.name}</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1" aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[200px]">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={file.name} className="max-w-full max-h-[70vh] object-contain" />
          ) : isPdf ? (
            <iframe src={url} title={file.name} className="w-full h-[70vh] border-0" />
          ) : (
            <div className="text-center text-sm text-gray-500 space-y-3">
              <p>Não é possível pré-visualizar este tipo de arquivo.</p>
              <a href={url} target="_blank" rel="noreferrer" className="inline-block text-brand-700 hover:underline font-medium">
                Baixar arquivo
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StageFileList({ solicitationId, stage, refreshKey }: { solicitationId: string; stage: StageFileStage; refreshKey: number }) {
  const [files, setFiles] = useState<{ id: string; name: string; mimeType: string; webViewLink: string; createdTime?: string }[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<{ id: string; name: string; mimeType: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listStageFilesForSolicitation(solicitationId, stage)
      .then(r => { if (!cancelled) setFiles(r.files) })
      .catch(() => { if (!cancelled) setFiles([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [solicitationId, stage, refreshKey])

  if (loading) {
    return <p className="text-xs text-gray-400 flex items-center gap-1.5 mt-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando arquivos…</p>
  }
  if (!files || files.length === 0) {
    return <p className="text-xs text-gray-400 italic mt-2">Nenhum arquivo enviado ainda.</p>
  }

  return (
    <>
      <div className="mt-3 space-y-2.5">
        {files.map(f => {
          const Icon = stageFileIcon(f.name, f.mimeType)
          const image = isImageFile(f.name, f.mimeType)
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setPreview(f)}
              title={f.name}
              className="w-full text-left rounded-2xl border border-surface-border bg-white p-2 hover:border-brand-300 hover:shadow-sm transition-shadow"
            >
              <div className="px-1 pb-1.5">
                {f.createdTime && <div className="text-[10px] text-gray-400">{formatDate(f.createdTime)}</div>}
                <div className="text-xs font-medium text-navy truncate">{f.name}</div>
              </div>
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/solicitacoes/drive-file/${f.id}?thumb=1`} alt={f.name} loading="lazy" className="w-full h-32 object-cover rounded-xl" />
              ) : (
                <div className="w-full h-32 flex items-center justify-center rounded-xl bg-gray-50">
                  <Icon className="w-9 h-9 text-gray-300" />
                </div>
              )}
            </button>
          )
        })}
      </div>
      {preview && <FilePreviewModal file={preview} onClose={() => setPreview(null)} />}
    </>
  )
}

export function StageFilesColumn({ solicitationId, stage }: { solicitationId: string; stage: StageFileStage }) {
  const [refreshKey, setRefreshKey] = useState(0)
  return (
    <div className="rounded-card bg-sky-50/60 border border-surface-border p-3">
      <div className="flex items-center gap-2 mb-2 text-navy">
        <Paperclip className="w-4 h-4" />
        <h3 className="eyebrow">Arquivos</h3>
      </div>
      <StageFileUpload solicitationId={solicitationId} stage={stage} onUploaded={() => setRefreshKey(k => k + 1)} />
      <StageFileList solicitationId={solicitationId} stage={stage} refreshKey={refreshKey} />
    </div>
  )
}
