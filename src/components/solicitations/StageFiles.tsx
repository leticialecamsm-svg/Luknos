'use client'

// Coluna "Arquivos" de cada etapa: upload pro Drive (subpasta da etapa),
// cards empilhados (data + nome em cima, miniatura grande embaixo) e o modal
// de pré-visualização via proxy same-origin (/api/solicitacoes/drive-file).

import { useEffect, useState } from 'react'
import { Check, CloudOff, FileText, Image as ImageIcon, Box, Loader2, UploadCloud, Paperclip, Trash2 } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import {
  uploadStageFileForSolicitation, createStageFileUploadSession, confirmStageFileUploaded,
  deleteStageFileForSolicitation,
  checkDriveConnected, listStageFilesForSolicitation, type StageFileStage,
} from '@/lib/solicitations/actions'
import { useConfirm } from '@/components/ui/useConfirm'

// Vercel Functions aceitam body de até 4,5 MB. Acima disso usamos upload
// resumable direto do browser pro Google Drive via session URL emitida pelo
// servidor. Deixamos uma margem de segurança.
const DIRECT_UPLOAD_LIMIT = 4 * 1024 * 1024 // 4 MB

type UploadStats = { loaded: number; total: number; speedBps: number; etaSec: number }

// Resumable upload do Drive em chunks com retry — bem mais robusto que
// um único PUT para arquivos grandes em conexões instáveis:
// - Chunks de 8 MB (múltiplo de 256 KB, exigido pelo Drive).
// - Status 308 "Resume Incomplete" para chunks intermediários; 200/201 no fim.
// - Em erro de rede, tenta de novo o mesmo chunk até 4 vezes com backoff.
// - Progresso é calculado por byte real enviado (incluindo retries).
const CHUNK_SIZE = 8 * 1024 * 1024

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)) }

function sendChunk(uploadUrl: string, chunk: Blob, start: number, totalSize: number): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl, true)
    const end = start + chunk.size - 1
    xhr.setRequestHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`)
    xhr.onload = () => resolve({ status: xhr.status })
    xhr.onerror = () => reject(new Error('network'))
    xhr.ontimeout = () => reject(new Error('timeout'))
    xhr.timeout = 10 * 60 * 1000 // 10 min por chunk
    xhr.send(chunk)
  })
}

async function putDirectToDrive(uploadUrl: string, file: File, onProgress: (stats: UploadStats) => void): Promise<void> {
  const total = file.size
  let offset = 0
  const t0 = Date.now()
  let lastT = t0
  let lastLoaded = 0
  let speedBps = 0

  while (offset < total) {
    const end = Math.min(offset + CHUNK_SIZE, total)
    const chunk = file.slice(offset, end)

    // Retry por chunk — backoff 1s/2s/4s.
    let attempt = 0
    let status = 0
    while (true) {
      try {
        const r = await sendChunk(uploadUrl, chunk, offset, total)
        status = r.status
        break
      } catch (e) {
        attempt++
        if (attempt >= 4) throw new Error(`Falha de rede após ${attempt} tentativas no chunk ${offset}`)
        await sleep(1000 * Math.pow(2, attempt - 1))
      }
    }

    if (status === 308 || status === 200 || status === 201) {
      offset = end
      const now = Date.now()
      const dt = Math.max(1, now - lastT) / 1000
      const inst = (offset - lastLoaded) / dt
      speedBps = speedBps === 0 ? inst : speedBps * 0.7 + inst * 0.3
      lastT = now; lastLoaded = offset
      const remaining = total - offset
      const etaSec = speedBps > 0 ? Math.round(remaining / speedBps) : 0
      onProgress({ loaded: offset, total, speedBps, etaSec })
      if (status === 200 || status === 201) return
    } else {
      throw new Error(`Drive respondeu ${status} no chunk ${offset}`)
    }
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatEta(sec: number): string {
  if (!sec || !isFinite(sec)) return '—'
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60); const s = sec % 60
  if (m < 60) return `${m}min ${s}s`
  const h = Math.floor(m / 60); const mm = m % 60
  return `${h}h ${mm}min`
}

export function StageFileUpload({ solicitationId, stage, onUploaded }: { solicitationId: string; stage: StageFileStage; onUploaded?: () => void }) {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [uploading, setUploading] = useState(false)
  // Progresso agregado ("3 de 5 enviados") em vez de um único resultado —
  // suporta múltiplos arquivos selecionados/arrastados de uma vez (pedido
  // Letícia: só aceitava 1 arquivo por vez).
  const [progress, setProgress] = useState<{
    total: number; done: number
    currentName?: string
    currentStats?: UploadStats
  } | null>(null)
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
        setProgress(p => p ? { ...p, currentName: file.name, currentStats: undefined } : p)
        if (file.size > DIRECT_UPLOAD_LIMIT) {
          // Caminho resumable: servidor cria session, browser envia o
          // binário direto pro Google Drive (contorna o limite de 4,5 MB).
          const session = await createStageFileUploadSession(solicitationId, stage, file.name, file.type || 'application/octet-stream')
          if (session.error || !session.uploadUrl) throw new Error(session.error ?? 'Falha ao iniciar upload')
          await putDirectToDrive(session.uploadUrl, file, stats => {
            setProgress(p => p ? { ...p, currentStats: stats } : p)
          })
          // Avisa o servidor que o upload concluiu — só agora loga + revalida.
          await confirmStageFileUploaded(solicitationId, stage, file.name)
          okNames.push(file.name)
        } else {
          // Arquivos pequenos continuam no caminho simples (server action).
          const fd = new FormData()
          fd.set('file', file)
          const res = await uploadStageFileForSolicitation(solicitationId, stage, fd)
          if (res.error) errMsgs.push(`${file.name}: ${res.error}`)
          else okNames.push(file.name)
        }
      } catch (e: any) {
        errMsgs.push(`${file.name}: ${e?.message ?? 'Falha ao enviar arquivo'}`)
      } finally {
        setProgress(p => (p ? { ...p, done: p.done + 1, currentName: undefined, currentStats: undefined } : p))
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

  const stats = progress?.currentStats
  const pct = stats ? Math.round((stats.loaded / stats.total) * 100) : null

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <label className={cn('btn-secondary text-sm cursor-pointer', (uploading || connected === null) && 'opacity-60 pointer-events-none')}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
          {uploading && progress
            ? (progress.currentName
                ? `Enviando ${progress.currentName} (${progress.done + 1}/${progress.total})`
                : `Enviando ${progress.done} de ${progress.total}…`)
            : 'Enviar arquivo(s)'}
          <input
            type="file"
            multiple
            className="hidden"
            disabled={uploading || connected !== true}
            onChange={(e) => { handleFiles(e.target.files ?? undefined); e.target.value = '' }}
          />
        </label>
      </div>
      {uploading && stats && pct !== null && (
        <div className="space-y-1">
          <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-gray-500 flex-wrap">
            <span className="font-medium">{pct}%</span>
            <span>·</span>
            <span>{formatBytes(stats.loaded)} / {formatBytes(stats.total)}</span>
            <span>·</span>
            <span>{formatBytes(stats.speedBps)}/s</span>
            <span>·</span>
            <span>~ {formatEta(stats.etaSec)} restante</span>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
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

// Cor pastel do "selo" central do arquivo por extensão.
function extBadgeColors(ext: string): { bg: string; text: string } {
  const e = ext.toLowerCase()
  if (['pdf'].includes(e))                   return { bg: 'bg-red-50',     text: 'text-red-700' }
  if (['dwg', 'dxf'].includes(e))            return { bg: 'bg-sky-50',     text: 'text-sky-700' }
  if (['skp', 'skb'].includes(e))            return { bg: 'bg-amber-50',   text: 'text-amber-700' }
  if (['doc', 'docx'].includes(e))           return { bg: 'bg-blue-50',    text: 'text-blue-700' }
  if (['xls', 'xlsx', 'csv'].includes(e))    return { bg: 'bg-green-50',   text: 'text-green-700' }
  if (['ppt', 'pptx'].includes(e))           return { bg: 'bg-orange-50',  text: 'text-orange-700' }
  if (['zip', 'rar', '7z'].includes(e))      return { bg: 'bg-violet-50',  text: 'text-violet-700' }
  return { bg: 'bg-gray-50', text: 'text-gray-500' }
}

function StageFileList({ solicitationId, stage, refreshKey, onChanged }: { solicitationId: string; stage: StageFileStage; refreshKey: number; onChanged?: () => void }) {
  const [files, setFiles] = useState<{ id: string; name: string; mimeType: string; webViewLink: string; createdTime?: string }[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<{ id: string; name: string; mimeType: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { confirm, ConfirmDialog } = useConfirm()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listStageFilesForSolicitation(solicitationId, stage)
      .then(r => { if (!cancelled) setFiles(r.files) })
      .catch(() => { if (!cancelled) setFiles([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [solicitationId, stage, refreshKey])

  async function handleDelete(file: { id: string; name: string }) {
    const yes = await confirm(`Remover "${file.name}" do Drive? O arquivo vai para a lixeira.`, 'Remover')
    if (!yes) return
    setDeletingId(file.id)
    const res = await deleteStageFileForSolicitation(solicitationId, stage, file.id, file.name)
    setDeletingId(null)
    if (res.ok) {
      setFiles(prev => prev ? prev.filter(f => f.id !== file.id) : prev)
      onChanged?.()
    }
  }

  // só na primeira carga: ao atualizar, a lista continua na tela (não pula a página)
  if (loading && !files) {
    return <p className="text-xs text-gray-400 flex items-center gap-1.5 mt-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando arquivos…</p>
  }
  if (!files || files.length === 0) {
    return <p className="text-xs text-gray-400 italic mt-2">Nenhum arquivo enviado ainda.</p>
  }

  return (
    <>
      <div className="mt-3 space-y-2.5">
        {files.map(f => {
          const image = isImageFile(f.name, f.mimeType)
          const ext = (f.name.split('.').pop() ?? '').toLowerCase()
          const colors = extBadgeColors(ext)
          const isDeleting = deletingId === f.id
          return (
            <div key={f.id} className="relative group rounded-2xl border border-surface-border bg-white p-2 hover:border-brand-300 hover:shadow-sm transition-shadow">
              <button
                type="button"
                onClick={() => setPreview(f)}
                title={f.name}
                className="w-full text-left"
              >
                <div className="px-1 pb-1.5">
                  {f.createdTime && <div className="text-[10px] text-gray-400">{formatDate(f.createdTime)}</div>}
                  <div className="text-xs font-medium text-navy truncate">{f.name}</div>
                </div>
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/solicitacoes/drive-file/${f.id}?thumb=1`} alt={f.name} loading="lazy" className="w-full h-32 object-cover rounded-xl" />
                ) : (
                  <div className={cn('w-full h-32 flex items-center justify-center rounded-xl', colors.bg)}>
                    <span className={cn('font-bold tracking-wide text-lg uppercase', colors.text)}>
                      .{ext || 'file'}
                    </span>
                  </div>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleDelete({ id: f.id, name: f.name })}
                disabled={isDeleting}
                title="Remover arquivo"
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 border border-gray-200 flex items-center justify-center text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-600 hover:border-red-200 transition-all shadow-sm disabled:opacity-100"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          )
        })}
      </div>
      {preview && <FilePreviewModal file={preview} onClose={() => setPreview(null)} />}
      {ConfirmDialog}
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
      <StageFileList solicitationId={solicitationId} stage={stage} refreshKey={refreshKey} onChanged={() => setRefreshKey(k => k + 1)} />
    </div>
  )
}
