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

export interface EvolutionMedia { base64?: string; mimetype?: string; fileName?: string; size?: number }
export interface EvolutionContact {
  id?: string
  name?: string | null
  pushName?: string | null
  profilePictureUrl?: string | null
}

export async function fetchContact(instance: string, remoteJid: string): Promise<EvolutionContact | null> {
  const number = remoteJid.split('@')[0]

  const attempts: Array<() => Promise<Response>> = [
    // v2 GET com query param
    () => evolutionFetch(`/contact/fetchContacts/${instance}?where[id]=${encodeURIComponent(remoteJid)}`),
    // v2 POST com body
    () => evolutionFetch(`/contact/fetchContacts/${instance}`, { method: 'POST', body: JSON.stringify({ where: { id: remoteJid } }) }),
    // v1 GET todos os contatos (filtra depois)
    () => evolutionFetch(`/chat/contactsAll/${instance}`),
    // variante find
    () => evolutionFetch(`/contact/find/${instance}?number=${number}`),
  ]

  for (const attempt of attempts) {
    try {
      const r = await attempt()
      if (!r.ok) continue
      const d = await r.json().catch(() => null)
      // Se vier array, procura pelo remoteJid ou numero
      if (Array.isArray(d)) {
        const found = d.find((c: any) => c?.id === remoteJid || c?.phone === number || c?.id?.includes(number))
        if (found) return found as EvolutionContact
        // Se for a primeira tentativa (fetchContacts filtrado), qualquer item serve
        if (d.length === 1) return d[0] as EvolutionContact
        continue
      }
      if (d && typeof d === 'object') return d as EvolutionContact
    } catch { /* continua */ }
  }

  return null
}

export async function getProfilePicture(instance: string, remoteJid: string): Promise<string | null> {
  const number = remoteJid.split('@')[0]

  const attempts: Array<() => Promise<Response>> = [
    // v2 GET padrão
    () => evolutionFetch(`/contact/getProfilePicture/${instance}?number=${number}`),
    // v1 POST
    () => evolutionFetch(`/chat/profilePicture/${instance}`, { method: 'POST', body: JSON.stringify({ number }) }),
    // v2 via /chat
    () => evolutionFetch(`/chat/fetchProfilePictureUrl/${instance}?number=${number}`),
    // v2 POST variante
    () => evolutionFetch(`/contact/getProfilePicture/${instance}`, { method: 'POST', body: JSON.stringify({ number }) }),
    // com JID completo
    () => evolutionFetch(`/contact/getProfilePicture/${instance}`, { method: 'POST', body: JSON.stringify({ number: remoteJid }) }),
    // v1 sem instancia no path
    () => evolutionFetch(`/profile/picture?instance=${encodeURIComponent(instance)}&number=${number}`),
  ]

  for (const attempt of attempts) {
    try {
      const res = await attempt()
      if (!res.ok) continue
      const data = await res.json().catch(() => null)
      const url = data?.profilePictureUrl ?? data?.picture ?? data?.url ?? data?.wuid?.profilePictureUrl ?? null
      if (url && typeof url === 'string') return url
    } catch { /* continua */ }
  }
  return null
}

export async function getMediaBase64(instance: string, key: unknown): Promise<EvolutionMedia | null> {
  const res = await evolutionFetch(`/chat/getBase64FromMediaMessage/${instance}`, { method: 'POST', body: JSON.stringify({ message: { key }, convertToMp4: false }) })
  if (!res.ok) { console.warn('getBase64FromMediaMessage falhou', res.status, await res.text().catch(() => '')); return null }
  return (await res.json().catch(() => null)) as EvolutionMedia | null
}
