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
