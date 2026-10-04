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

// Busca dados do contato. Tenta múltiplas variantes de endpoint pois o caminho
// varia entre versões da Evolution API.
export async function fetchContact(
  instance: string,
  remoteJid: string,
): Promise<EvolutionContact | null> {
  const number = remoteJid.split('@')[0]

  // v2 GET com query param
  try {
    const r = await evolutionFetch(`/contact/fetchContacts/${instance}?where[id]=${encodeURIComponent(remoteJid)}`)
    if (r.ok) {
      const d = await r.json().catch(() => null)
      const item = Array.isArray(d) ? d[0] : (d && !Array.isArray(d) ? d : null)
      if (item) return item as EvolutionContact
    }
  } catch { /* continua */ }

  // v2 POST com body
  try {
    const r = await evolutionFetch(`/contact/fetchContacts/${instance}`, {
      method: 'POST',
      body: JSON.stringify({ where: { id: remoteJid } }),
    })
    if (r.ok) {
      const d = await r.json().catch(() => null)
      const item = Array.isArray(d) ? d[0] : (d && !Array.isArray(d) ? d : null)
      if (item) return item as EvolutionContact
    }
  } catch { /* continua */ }

  // v1 / alternativo: número como path
  try {
    const r = await evolutionFetch(`/contact/find/${instance}?number=${number}`)
    if (r.ok) {
      const d = await r.json().catch(() => null)
      if (d) return d as EvolutionContact
    }
  } catch { /* continua */ }

  return null
}

// URL da foto de perfil. Tenta variantes de endpoint entre versões da Evolution.
export async function getProfilePicture(
  instance: string,
  remoteJid: string,
): Promise<string | null> {
  const number = remoteJid.split('@')[0]

  const attempts = [
    // v2 GET padrão
    () => evolutionFetch(`/contact/getProfilePicture/${instance}?number=${number}`),
    // via /chat
    () => evolutionFetch(`/chat/fetchProfilePictureUrl/${instance}?number=${number}`),
    // POST variante
    () => evolutionFetch(`/contact/getProfilePicture/${instance}`, {
      method: 'POST',
      body: JSON.stringify({ number }),
    }),
    // v1 sem instância no path
    () => evolutionFetch(`/profile/picture?instance=${encodeURIComponent(instance)}&number=${number}`),
  ]

  for (const attempt of attempts) {
    try {
      const res = await attempt()
      if (!res.ok) continue
      const data = await res.json().catch(() => null)
      const url = data?.profilePictureUrl ?? data?.picture ?? data?.url ?? null
      if (url && typeof url === 'string') return url
    } catch { /* continua */ }
  }

  return null
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
