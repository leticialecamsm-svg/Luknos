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

export interface EvolutionContact {
  id?: string
  name?: string | null       // nome salvo nos contatos do celular
  pushName?: string | null   // nome do perfil WhatsApp do contato
  profilePictureUrl?: string | null
}

// Busca dados do contato (nome salvo + foto). Silencia erros para não
// bloquear o fluxo principal.
export async function fetchContact(
  instance: string,
  remoteJid: string,
): Promise<EvolutionContact | null> {
  try {
    const res = await evolutionFetch(`/contact/fetchContacts/${instance}`, {
      method: 'POST',
      body: JSON.stringify({ where: { id: remoteJid } }),
    })
    if (!res.ok) return null
    const data = await res.json().catch(() => null)
    if (Array.isArray(data) && data.length > 0) return data[0] as EvolutionContact
    if (data && typeof data === 'object' && !Array.isArray(data)) return data as EvolutionContact
    return null
  } catch {
    return null
  }
}

// URL da foto de perfil do WhatsApp para qualquer usuário.
// Evolution v2: GET /contact/getProfilePicture/{instance}?number=558296268111
export async function getProfilePicture(
  instance: string,
  remoteJid: string,
): Promise<string | null> {
  try {
    const number = remoteJid.split('@')[0]
    const res = await evolutionFetch(`/contact/getProfilePicture/${instance}?number=${number}`)
    if (!res.ok) return null
    const data = await res.json().catch(() => null)
    return (data?.profilePictureUrl as string | null | undefined) ?? null
  } catch {
    return null
  }
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
