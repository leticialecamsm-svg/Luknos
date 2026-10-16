// Parsing de payloads de mensagem da Evolution API (Baileys) — compartilhado
// entre whatsapp-webhook (robô de orçamentos) e o CRM multiatendente, já que
// ambos recebem o mesmo formato de evento (messages.upsert), só em instâncias
// diferentes.

export function detectKind(fileName: string, mime: string | null): string {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase()
  const m = (mime ?? '').toLowerCase()
  if (ext === 'pdf' || m === 'application/pdf') return 'plant_pdf'
  if (ext === 'dwg' || m.includes('dwg') || m.includes('acad')) return 'dwg'
  if (['skp', 'skb'].includes(ext) || m.includes('sketchup')) return 'sketchup'
  if (
    ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'heic'].includes(ext) ||
    m.startsWith('image/')
  ) {
    return 'image_3d'
  }
  return 'other'
}

export function extForMime(mime?: string): string {
  if (!mime) return ''
  if (mime === 'application/pdf') return '.pdf'
  if (mime.startsWith('image/')) return '.' + mime.split('/')[1]
  return ''
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(',') ? b64.split(',')[1] : b64
  const bin = atob(clean)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export function inferMessageType(message?: Record<string, unknown>): string {
  if (!message) return 'unknown'
  if (message.conversation || message.extendedTextMessage) return 'conversation'
  if (message.imageMessage) return 'imageMessage'
  if (message.documentMessage || message.documentWithCaptionMessage) return 'documentMessage'
  if (message.audioMessage) return 'audioMessage'
  return 'unknown'
}

export function mapMessageType(t: string): 'text' | 'document' | 'image' | 'audio' | 'other' {
  switch (t) {
    case 'conversation':
    case 'extendedTextMessage':
      return 'text'
    case 'documentMessage':
    case 'documentWithCaptionMessage':
      return 'document'
    case 'imageMessage':
      return 'image'
    case 'audioMessage':
    case 'pttMessage':
      return 'audio'
    default:
      return 'other'
  }
}

export function extractBody(message?: Record<string, unknown>): string | null {
  if (!message) return null
  if (typeof message.conversation === 'string') return message.conversation
  const ext = message.extendedTextMessage as { text?: string } | undefined
  if (ext?.text) return ext.text
  const img = message.imageMessage as { caption?: string } | undefined
  if (img?.caption) return img.caption
  const doc = message.documentMessage as { caption?: string } | undefined
  if (doc?.caption) return doc.caption
  const docCap = message.documentWithCaptionMessage as
    | { message?: { documentMessage?: { caption?: string } } }
    | undefined
  if (docCap?.message?.documentMessage?.caption) return docCap.message.documentMessage.caption
  return null
}

export function extractMediaFileName(
  message: Record<string, unknown> | undefined,
  media: { fileName?: string; mimetype?: string } | null,
): string {
  const docWithCaption = message?.documentWithCaptionMessage as
    | { message?: { documentMessage?: { fileName?: string; mimetype?: string } } }
    | undefined
  const docNode =
    (message?.documentMessage as { fileName?: string; mimetype?: string } | undefined) ??
    docWithCaption?.message?.documentMessage
  return (
    media?.fileName ??
    docNode?.fileName ??
    `arquivo-${Date.now()}${extForMime(media?.mimetype)}`
  )
}

export function extractMediaMimeType(
  message: Record<string, unknown> | undefined,
  media: { mimetype?: string } | null,
): string | null {
  const docWithCaption = message?.documentWithCaptionMessage as
    | { message?: { documentMessage?: { mimetype?: string } } }
    | undefined
  const docNode =
    (message?.documentMessage as { mimetype?: string } | undefined) ?? docWithCaption?.message?.documentMessage
  const imgNode = message?.imageMessage as { mimetype?: string } | undefined
  return media?.mimetype ?? docNode?.mimetype ?? imgNode?.mimetype ?? null
}
