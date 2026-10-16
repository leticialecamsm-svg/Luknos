import { NextRequest, NextResponse } from 'next/server'
import { crmMediaForViewer } from '@/lib/crm-actions'
import { driveDownload } from '@/lib/google-drive'

export const dynamic = 'force-dynamic'

// Entrega um arquivo do CRM guardado no Google Drive, só para quem pode ver a conversa.
// A resposta de uma função da Vercel vai até 4,5 MB: áudio e vídeo vão em partes (Range),
// como o navegador já pede; documento grande abre no próprio Drive.
const CHUNK = 4 * 1024 * 1024

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const media = await crmMediaForViewer(params.id)
  if (!media) return new NextResponse('Arquivo não encontrado', { status: 404 })

  const download = req.nextUrl.searchParams.get('download') === '1'
  const isStream = media.mimeType.startsWith('audio/') || media.mimeType.startsWith('video/')
  const size = media.size

  if (!isStream && size && size > CHUNK) {
    if (media.webViewLink) return NextResponse.redirect(media.webViewLink)
    return new NextResponse('Arquivo grande demais para abrir aqui', { status: 413 })
  }

  let range: string | null = null
  if (isStream && size) {
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') ?? '')
    const start = m && m[1] ? Number(m[1]) : 0
    const askedEnd = m && m[2] ? Number(m[2]) : size - 1
    const end = Math.min(askedEnd, start + CHUNK - 1, size - 1)
    range = `bytes=${start}-${end}`
  }

  const res = await driveDownload(media.driveFileId, range)
  if (!res.ok && res.status !== 206) return new NextResponse('Não foi possível abrir o arquivo', { status: 502 })

  const headers = new Headers({
    'Content-Type': media.mimeType,
    'Cache-Control': 'private, max-age=86400',
    'Accept-Ranges': 'bytes',
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(media.fileName)}`,
  })
  const len = res.headers.get('content-length')
  if (len) headers.set('Content-Length', len)
  const cr = res.headers.get('content-range')
  if (cr) headers.set('Content-Range', cr)
  return new NextResponse(res.body, { status: range ? 206 : 200, headers })
}
