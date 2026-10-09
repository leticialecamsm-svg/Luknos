import { stripFormatting } from './wa-format'

// Texto curto de uma mensagem para prévias (lista de conversas, citação de resposta).
export function messagePreview(m: {
  message_type: string
  body?: string | null
  file_name?: string | null
  deleted?: boolean
}): string {
  if (m.deleted) return '🚫 Mensagem apagada'
  const text = stripFormatting(m.body)
  switch (m.message_type) {
    case 'audio': return '🎤 Áudio'
    case 'image': return text ? `📷 ${text}` : '📷 Foto'
    case 'video': return text ? `🎥 ${text}` : '🎥 Vídeo'
    case 'document': return `📄 ${m.file_name || text || 'Documento'}`
    case 'other': return text || 'Mensagem não suportada'
    default: return text
  }
}

// Apagar para todos: o WhatsApp só permite por um tempo. Usamos 2 dias (limite seguro).
export const DELETE_WINDOW_MS = 2 * 24 * 60 * 60 * 1000

export function canDeleteForEveryone(m: {
  direction: string
  provider_message_id?: string | null
  deleted_at?: string | null
  created_at: string
}, now = Date.now()): boolean {
  return m.direction === 'outbound' && !!m.provider_message_id && !m.deleted_at && now - new Date(m.created_at).getTime() <= DELETE_WINDOW_MS
}

export function isGroupJid(jid: string | null | undefined): boolean {
  return !!jid && jid.endsWith('@g.us')
}
