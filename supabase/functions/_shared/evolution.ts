import { env } from './env.ts'

// Wrapper fino da Evolution API: base de chamada, validação do webhook de
// entrada e download de mídia. O envio de mensagens fica em send-whatsapp-message.

export function verifyWebhookSecret(req: Request): boolean {
  const expected = env.evolutionWebhookSecret
  if (!expected) return false
  const header = req.headers.get('x-evolution-webhook-secret')
  if (header && header === expected) return true
  // Fallback: alguns provedores só permitem query param no webhook.
  try {
    const url = new URL(req.url)
    if (url.searchParams.get('secret') === expected) return true
  } catch {
    // ignore
  }
  return false
}

export async function evolutionFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${env.evolutionUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
  return await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: env.evolutionKey,
      ...(init.headers ?? {}),
    },
  })
}

export interface EvolutionSendResult {
  sent: boolean
  providerMessageId?: string
  error?: string
}

// Envio genérico por instância — usado pelo CRM multiatendente (várias
// instâncias). O robô de orçamentos continua usando _shared/wa-send.ts
// (que resolve a instância única de wa_bot_config e já loga em wa_messages).
export async function sendTextMessage(
  instanceName: string,
  number: string,
  text: string,
): Promise<EvolutionSendResult> {
  try {
    const res = await evolutionFetch(`/message/sendText/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({ number, text }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('sendText falhou', res.status, body)
      return { sent: false, error: `evolution_${res.status}` }
    }
    const parsed = (await res.json().catch(() => null)) as
      | { key?: { id?: string }; messageId?: string }
      | null
    return { sent: true, providerMessageId: parsed?.key?.id ?? parsed?.messageId ?? undefined }
  } catch (e) {
    console.error('sendText erro', e)
    return { sent: false, error: String((e as Error)?.message ?? e) }
  }
}

// Evolution v2: POST /message/sendMedia/{instance} — media em base64 (sem
// prefixo data:), mediatype 'image' | 'document' | 'audio' | 'video'.
export async function sendMediaMessage(
  instanceName: string,
  number: string,
  opts: { mediatype: 'image' | 'document' | 'audio' | 'video'; base64: string; fileName: string; mimetype: string; caption?: string },
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
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('sendMedia falhou', res.status, body)
      return { sent: false, error: `evolution_${res.status}` }
    }
    const parsed = (await res.json().catch(() => null)) as
      | { key?: { id?: string }; messageId?: string }
      | null
    return { sent: true, providerMessageId: parsed?.key?.id ?? parsed?.messageId ?? undefined }
  } catch (e) {
    console.error('sendMedia erro', e)
    return { sent: false, error: String((e as Error)?.message ?? e) }
  }
}

export interface EvolutionMedia {
  base64?: string
  mimetype?: string
  fileName?: string
  size?: number
}

// Baixa a mídia (documento/imagem/áudio) de uma mensagem recebida.
// Evolution v2: POST /chat/getBase64FromMediaMessage/{instance}
export async function getMediaBase64(
  instance: string,
  key: unknown,
): Promise<EvolutionMedia | null> {
  const res = await evolutionFetch(`/chat/getBase64FromMediaMessage/${instance}`, {
    method: 'POST',
    body: JSON.stringify({ message: { key }, convertToMp4: false }),
  })
  if (!res.ok) {
    console.warn(
      'getBase64FromMediaMessage falhou',
      res.status,
      await res.text().catch(() => ''),
    )
    return null
  }
  return (await res.json().catch(() => null)) as EvolutionMedia | null
}
