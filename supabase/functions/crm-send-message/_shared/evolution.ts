import { env } from './env.ts'

export function verifyWebhookSecret(req: Request): boolean {
  const expected = env.evolutionWebhookSecret
  if (!expected) return false
  const header = req.headers.get('x-evolution-webhook-secret')
  if (header && header === expected) return true
  try { const url = new URL(req.url); if (url.searchParams.get('secret') === expected) return true } catch {}
  return false
}

export async function evolutionFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${env.evolutionUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
  return await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', apikey: env.evolutionKey, ...(init.headers ?? {}) } })
}

export interface EvolutionSendResult { sent: boolean; providerMessageId?: string; error?: string }
export interface EvolutionMedia { base64?: string; mimetype?: string; fileName?: string; size?: number }

// Mensagem citada (resposta). A Evolution quer a chave e uma copia do conteudo.
export interface Quoted { id: string; remoteJid: string; text: string }

function quotedPayload(q?: Quoted) {
  if (!q) return undefined
  return { key: { id: q.id, remoteJid: q.remoteJid }, message: { conversation: q.text || ' ' } }
}

async function readSend(res: Response, label: string): Promise<EvolutionSendResult> {
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`${label} falhou`, res.status, body)
    return { sent: false, error: `evolution_${res.status}: ${body.slice(0, 160)}` }
  }
  const rawText = await res.text()
  console.log(`${label} resposta Evolution:`, rawText.slice(0, 500))
  const parsed = JSON.parse(rawText || '{}') as { key?: { id?: string }; messageId?: string } | null
  const providerMessageId = parsed?.key?.id ?? parsed?.messageId ?? undefined
  if (!providerMessageId) console.warn(`${label}: sem message id`)
  return { sent: true, providerMessageId }
}

// Texto. Em grupo pode mencionar pessoas: o texto traz "@<numero>" e `mentioned` os JIDs.
export async function sendTextMessage(
  instanceName: string,
  number: string,
  text: string,
  quoted?: Quoted,
  mentions?: { mentioned?: string[]; everyone?: boolean },
): Promise<EvolutionSendResult> {
  try {
    const res = await evolutionFetch(`/message/sendText/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        number,
        text,
        quoted: quotedPayload(quoted),
        ...(mentions?.mentioned?.length ? { mentioned: mentions.mentioned } : {}),
        ...(mentions?.everyone ? { mentionsEveryOne: true } : {}),
      }),
    })
    return await readSend(res, 'sendText')
  } catch (e) {
    console.error('sendText erro', e)
    return { sent: false, error: String((e as Error)?.message ?? e) }
  }
}

// Membros de um grupo: id (para mencionar), telefone e nome.
export interface GroupParticipant { jid: string; phone: string | null; name: string | null; admin: boolean }
export async function fetchGroupParticipants(instanceName: string, groupJid: string): Promise<{ ok: boolean; participants?: GroupParticipant[]; error?: string }> {
  try {
    const res = await evolutionFetch(`/group/participants/${instanceName}?groupJid=${encodeURIComponent(groupJid)}`)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `Não foi possível listar os participantes (Evolution ${res.status}): ${body.slice(0, 120)}` }
    }
    const d = await res.json().catch(() => null)
    const arr: any[] = Array.isArray(d) ? d : (d?.participants ?? [])
    return {
      ok: true,
      participants: arr
        .map((p) => {
          const jid = String(p?.id ?? p?.jid ?? '')
          const phoneJid = String(p?.phoneNumber ?? (jid.endsWith('@s.whatsapp.net') ? jid : ''))
          return {
            jid,
            phone: phoneJid ? phoneJid.split('@')[0] : null,
            name: (p?.name ?? p?.pushName ?? null) || null,
            admin: !!p?.admin,
          }
        })
        .filter((p) => /^\d+@(lid|s\.whatsapp\.net)$/.test(p.jid)),
    }
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) }
  }
}

// Figurinha (sticker): imagem .webp em base64 (ou URL).
export async function sendStickerMessage(instanceName: string, number: string, stickerBase64: string): Promise<EvolutionSendResult> {
  try {
    const res = await evolutionFetch(`/message/sendSticker/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({ number, sticker: stickerBase64 }),
    })
    return await readSend(res, 'sendSticker')
  } catch (e) {
    console.error('sendSticker erro', e)
    return { sent: false, error: String((e as Error)?.message ?? e) }
  }
}

// Cartao(oes) de contato (vCard).
export async function sendContactMessage(
  instanceName: string,
  number: string,
  contacts: { fullName: string; wuid: string; phoneNumber: string; organization?: string; email?: string }[],
): Promise<EvolutionSendResult> {
  try {
    const res = await evolutionFetch(`/message/sendContact/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({ number, contact: contacts }),
    })
    return await readSend(res, 'sendContact')
  } catch (e) {
    console.error('sendContact erro', e)
    return { sent: false, error: String((e as Error)?.message ?? e) }
  }
}

export async function sendMediaMessage(
  instanceName: string,
  number: string,
  opts: {
    mediatype: 'image' | 'document' | 'audio' | 'video'
    base64: string
    fileName: string
    mimetype: string
    caption?: string
    ptt?: boolean
    quoted?: Quoted
  },
): Promise<EvolutionSendResult> {
  try {
    const res = await evolutionFetch(`/message/sendMedia/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        number,
        mediatype: opts.mediatype,
        mimetype: opts.mimetype,
        media: opts.base64,
        fileName: opts.fileName,
        caption: opts.caption,
        ptt: opts.ptt,
        quoted: quotedPayload(opts.quoted),
      }),
    })
    return await readSend(res, 'sendMedia')
  } catch (e) {
    console.error('sendMedia erro', e)
    return { sent: false, error: String((e as Error)?.message ?? e) }
  }
}

// Nota de voz (ptt). A Evolution converte o audio para ogg/opus quando encoding=true.
export async function sendVoiceNote(instanceName: string, number: string, base64: string, quoted?: Quoted): Promise<EvolutionSendResult> {
  try {
    const res = await evolutionFetch(`/message/sendWhatsAppAudio/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({ number, audio: base64, encoding: true, quoted: quotedPayload(quoted) }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('sendWhatsAppAudio falhou', res.status, body)
      return { sent: false, error: `Não foi possível enviar o áudio (Evolution ${res.status}): ${body.slice(0, 160)}` }
    }
    const rawText = await res.text()
    console.log('sendWhatsAppAudio resposta Evolution:', rawText.slice(0, 500))
    const parsed = JSON.parse(rawText || '{}') as { key?: { id?: string }; messageId?: string } | null
    const providerMessageId = parsed?.key?.id ?? parsed?.messageId ?? undefined
    if (!providerMessageId) {
      console.warn('sendWhatsAppAudio: sem message id')
      return { sent: false, error: 'A Evolution não confirmou o envio do áudio (sem identificador da mensagem).' }
    }
    return { sent: true, providerMessageId }
  } catch (e) {
    console.error('sendWhatsAppAudio erro', e)
    return { sent: false, error: String((e as Error)?.message ?? e) }
  }
}

// Apagar para todos (so mensagens enviadas por esta instancia; o WhatsApp limita o prazo).
export async function deleteMessageForEveryone(
  instanceName: string,
  m: { id: string; remoteJid: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await evolutionFetch(`/chat/deleteMessageForEveryone/${instanceName}`, {
      method: 'DELETE',
      body: JSON.stringify({ id: m.id, remoteJid: m.remoteJid, fromMe: true }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('deleteMessageForEveryone falhou', res.status, body)
      return { ok: false, error: `Não foi possível apagar (Evolution ${res.status}): ${body.slice(0, 160)}` }
    }
    return { ok: true }
  } catch (e) {
    console.error('deleteMessageForEveryone erro', e)
    return { ok: false, error: String((e as Error)?.message ?? e) }
  }
}

// Editar o texto de uma mensagem enviada por esta instancia.
export async function editTextMessage(
  instanceName: string,
  number: string,
  m: { id: string; remoteJid: string },
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await evolutionFetch(`/chat/updateMessage/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({ number, key: { id: m.id, remoteJid: m.remoteJid, fromMe: true }, text }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('updateMessage falhou', res.status, body)
      return { ok: false, error: `Não foi possível editar (Evolution ${res.status}): ${body.slice(0, 160)}` }
    }
    return { ok: true }
  } catch (e) {
    console.error('updateMessage erro', e)
    return { ok: false, error: String((e as Error)?.message ?? e) }
  }
}

// Reagir a uma mensagem. key = chave da mensagem alvo; reaction vazio tira a reacao.
export async function sendReactionMessage(
  instanceName: string,
  key: { remoteJid: string; fromMe: boolean; id: string; participant?: string },
  reaction: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await evolutionFetch(`/message/sendReaction/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({ key, reaction }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('sendReaction falhou', res.status, body)
      return { ok: false, error: `Não foi possível reagir (Evolution ${res.status}): ${body.slice(0, 160)}` }
    }
    return { ok: true }
  } catch (e) {
    console.error('sendReaction erro', e)
    return { ok: false, error: String((e as Error)?.message ?? e) }
  }
}

export async function getMediaBase64(instance: string, key: unknown): Promise<EvolutionMedia | null> {
  const res = await evolutionFetch(`/chat/getBase64FromMediaMessage/${instance}`, {
    method: 'POST',
    body: JSON.stringify({ message: { key }, convertToMp4: false }),
  })
  if (!res.ok) { console.warn('getBase64 falhou', res.status, await res.text().catch(() => '')); return null }
  return (await res.json().catch(() => null)) as EvolutionMedia | null
}
