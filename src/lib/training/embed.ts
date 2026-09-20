// Converte links colados pela gestora em URLs seguras de embed.
export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/)
  return m ? m[1] : null
}

export function driveId(url: string): string | null {
  const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([\w-]+)/)
    ?? url.match(/docs\.google\.com\/(?:document|presentation|spreadsheets)\/d\/([\w-]+)/)
  return m ? m[1] : null
}

export function driveEmbedUrl(url: string): string | null {
  const id = driveId(url)
  if (!id) return null
  if (/docs\.google\.com\/document/.test(url)) return `https://docs.google.com/document/d/${id}/preview`
  if (/docs\.google\.com\/presentation/.test(url)) return `https://docs.google.com/presentation/d/${id}/embed`
  if (/docs\.google\.com\/spreadsheets/.test(url)) return `https://docs.google.com/spreadsheets/d/${id}/preview`
  return `https://drive.google.com/file/d/${id}/preview`
}

export const LESSON_KIND_LABEL: Record<string, string> = {
  text: 'Texto', image: 'Imagem', pdf: 'PDF', youtube: 'Vídeo do YouTube', drive: 'Google Drive', link: 'Link externo',
}
