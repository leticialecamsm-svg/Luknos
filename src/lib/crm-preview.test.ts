import { describe, it, expect } from 'vitest'
import { messagePreview, canDeleteForEveryone, canEditMessage, isGroupJid, DELETE_WINDOW_MS } from './crm-preview'

describe('messagePreview', () => {
  it('tipos de mídia', () => {
    expect(messagePreview({ message_type: 'audio' })).toBe('🎤 Áudio')
    expect(messagePreview({ message_type: 'image' })).toBe('📷 Foto')
    expect(messagePreview({ message_type: 'image', body: '*olha*' })).toBe('📷 olha')
    expect(messagePreview({ message_type: 'video' })).toBe('🎥 Vídeo')
    expect(messagePreview({ message_type: 'document', file_name: 'planta.dwg' })).toBe('📄 planta.dwg')
    expect(messagePreview({ message_type: 'document' })).toBe('📄 Documento')
  })
  it('texto sem marcadores e apagada', () => {
    expect(messagePreview({ message_type: 'text', body: 'oi *tudo* bem' })).toBe('oi tudo bem')
    expect(messagePreview({ message_type: 'text', body: 'segredo', deleted: true })).toBe('🚫 Mensagem apagada')
    expect(messagePreview({ message_type: 'other' })).toBe('Mensagem não suportada')
  })
})

describe('canDeleteForEveryone', () => {
  const now = Date.parse('2026-10-10T12:00:00Z')
  const base = { direction: 'outbound', provider_message_id: 'ABC', deleted_at: null, created_at: '2026-10-10T11:00:00Z' }
  it('nossa, recente, com id → pode', () => expect(canDeleteForEveryone(base, now)).toBe(true))
  it('do cliente → não', () => expect(canDeleteForEveryone({ ...base, direction: 'inbound' }, now)).toBe(false))
  it('sem id do WhatsApp → não', () => expect(canDeleteForEveryone({ ...base, provider_message_id: null }, now)).toBe(false))
  it('já apagada → não', () => expect(canDeleteForEveryone({ ...base, deleted_at: '2026-10-10T11:30:00Z' }, now)).toBe(false))
  it('limite de tempo: dentro de 2 dias sim, depois não', () => {
    expect(canDeleteForEveryone({ ...base, created_at: new Date(now - DELETE_WINDOW_MS + 1000).toISOString() }, now)).toBe(true)
    expect(canDeleteForEveryone({ ...base, created_at: new Date(now - DELETE_WINDOW_MS - 1000).toISOString() }, now)).toBe(false)
  })
})

describe('isGroupJid', () => {
  it('grupo x contato', () => {
    expect(isGroupJid('120363025@g.us')).toBe(true)
    expect(isGroupJid('558299@s.whatsapp.net')).toBe(false)
    expect(isGroupJid(null)).toBe(false)
  })
})

describe('canEditMessage', () => {
  const now = Date.parse('2026-10-12T15:00:00Z')
  const base = { direction: 'outbound', message_type: 'text', provider_message_id: 'X', deleted_at: null, created_at: '2026-10-12T14:50:00Z' }
  it('texto nosso dentro de 15 min', () => expect(canEditMessage(base, now)).toBe(true))
  it('depois de 15 min, não', () => expect(canEditMessage({ ...base, created_at: '2026-10-12T14:40:00Z' }, now)).toBe(false))
  it('áudio, recebida ou apagada, não', () => {
    expect(canEditMessage({ ...base, message_type: 'audio' }, now)).toBe(false)
    expect(canEditMessage({ ...base, direction: 'inbound' }, now)).toBe(false)
    expect(canEditMessage({ ...base, deleted_at: '2026-10-12T14:55:00Z' }, now)).toBe(false)
  })
})
