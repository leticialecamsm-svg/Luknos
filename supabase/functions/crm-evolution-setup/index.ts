// crm-evolution-setup — fala com a Evolution a pedido do painel do CRM (a chave da Evolution fica só aqui).
//
// Auth: interna (service role) — chamada pelas server actions do CRM (admin), nunca direto do browser.
//
// action: 'connect'      -> cria a instância (se não existir), aponta o webhook pra whatsapp-webhook
//                           (mantendo os eventos já ligados) e devolve o QR Code (base64) pra parear.
// action: 'status'       -> estado da conexão (open/connecting/close).
// action: 'restart'      -> reinicia a conexão do número (sem QR code); para número "conectado mas mudo".
// action: 'contact_info' -> nome/foto de um contato.
// action: 'debug_contact'-> tenta vários endpoints de contato (diagnóstico).

import { handleOptions, json } from './_shared/cors.ts'
import { isInternalCall } from './_shared/internal.ts'
import { env } from './_shared/env.ts'
import { evolutionFetch, fetchContact, getProfilePicture } from './_shared/evolution.ts'

Deno.serve(async (req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!isInternalCall(req)) return json({ error: 'unauthorized' }, 401)

  let payload: { action?: string; instance_name?: string; remote_jid?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  const instanceName = payload.instance_name?.trim()
  if (!instanceName) return json({ error: 'instance_name_required' }, 400)

  try {
    if (payload.action === 'status') return json(await status(instanceName))
    if (payload.action === 'restart') return json(await restart(instanceName))
    if (payload.action === 'contact_info') {
      if (!payload.remote_jid) return json({ error: 'remote_jid_required' }, 400)
      return json(await contactInfo(instanceName, payload.remote_jid))
    }
    if (payload.action === 'debug_contact') {
      if (!payload.remote_jid) return json({ error: 'remote_jid_required' }, 400)
      return json(await debugContact(instanceName, payload.remote_jid))
    }
    return json(await connect(instanceName))
  } catch (err) {
    console.error('crm-evolution-setup erro:', err)
    return json({ error: String((err as Error)?.message ?? err) }, 500)
  }
})

// Reinicia a conexão do número na Evolution (religa a sessão do WhatsApp sem pedir QR code).
// Serve para o número que aparece "conectado" mas parou de entregar mensagens.
async function restart(instanceName: string) {
  let res = await evolutionFetch(`/instance/restart/${instanceName}`, { method: 'PUT' })
  if (res.status === 404 || res.status === 405) res = await evolutionFetch(`/instance/restart/${instanceName}`, { method: 'POST' })
  const body = await res.text().catch(() => '')
  if (!res.ok) return { error: `A Evolution não reiniciou a conexão (${res.status}) ${body.slice(0, 160)}` }
  return { ok: true }
}

async function instanceExists(instanceName: string): Promise<boolean> {
  const res = await evolutionFetch(`/instance/connectionState/${instanceName}`)
  return res.ok
}

async function connect(instanceName: string) {
  if (!(await instanceExists(instanceName))) {
    const createRes = await evolutionFetch('/instance/create', {
      method: 'POST',
      body: JSON.stringify({ instanceName, integration: 'WHATSAPP-BAILEYS' }),
    })
    if (!createRes.ok) {
      const body = await createRes.text().catch(() => '')
      if (!/already|exists|em uso/i.test(body)) {
        return { error: `Falha ao criar a instância na Evolution: ${createRes.status} ${body.slice(0, 200)}` }
      }
    }
  }

  // webhook/set troca a configuração inteira: mantém os eventos que já estavam ligados
  // (ex.: edição/apagar de mensagem e "digitando") em vez de deixar só MESSAGES_UPSERT.
  let events = ['MESSAGES_UPSERT']
  try {
    const cur = await evolutionFetch(`/webhook/find/${instanceName}`)
    const d = cur.ok ? ((await cur.json().catch(() => null)) as any) : null
    const w = d?.webhook ?? d ?? {}
    if (Array.isArray(w.events)) events = Array.from(new Set<string>([...w.events, 'MESSAGES_UPSERT']))
  } catch { /* segue só com MESSAGES_UPSERT */ }

  const webhookUrl = `${env.supabaseUrl}/functions/v1/whatsapp-webhook`
  const webhookRes = await evolutionFetch(`/webhook/set/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        events,
        headers: env.evolutionWebhookSecret
          ? { 'x-evolution-webhook-secret': env.evolutionWebhookSecret }
          : undefined,
      },
    }),
  })
  if (!webhookRes.ok) {
    const body = await webhookRes.text().catch(() => '')
    console.warn('webhook/set falhou (seguindo mesmo assim)', webhookRes.status, body)
  }

  const connectRes = await evolutionFetch(`/instance/connect/${instanceName}`)
  if (!connectRes.ok) {
    const body = await connectRes.text().catch(() => '')
    return { error: `Falha ao gerar o QR Code: ${connectRes.status} ${body.slice(0, 200)}` }
  }
  const data = (await connectRes.json().catch(() => null)) as
    | { base64?: string; qrcode?: { base64?: string }; pairingCode?: string; count?: number }
    | null

  const qr = data?.base64 ?? data?.qrcode?.base64 ?? null
  if (!qr) {
    const st = await status(instanceName)
    if (st.state === 'open') return { already_connected: true }
    return { error: 'A Evolution não devolveu QR Code. Confira se a instância já não está conectada.' }
  }

  return { qrcode_base64: qr, pairing_code: data?.pairingCode ?? null }
}

async function status(instanceName: string) {
  const res = await evolutionFetch(`/instance/connectionState/${instanceName}`)
  if (!res.ok) return { state: 'unknown' }
  const data = (await res.json().catch(() => null)) as
    | { instance?: { state?: string }; state?: string }
    | null
  return { state: data?.instance?.state ?? data?.state ?? 'unknown' }
}

async function contactInfo(instanceName: string, remoteJid: string) {
  const [contact, photoUrl] = await Promise.all([
    fetchContact(instanceName, remoteJid),
    getProfilePicture(instanceName, remoteJid),
  ])
  return {
    name: contact?.name ?? null,
    pushName: contact?.pushName ?? null,
    photo_url: photoUrl ?? contact?.profilePictureUrl ?? null,
  }
}

async function debugContact(instanceName: string, remoteJid: string) {
  const number = remoteJid.split('@')[0]
  const results: Record<string, unknown> = { instance: instanceName, remoteJid, number }

  // Tenta várias variantes de endpoint para descobrir o que existe nessa versão
  const attempts = [
    { key: 'contact_fetchContacts_POST', method: 'POST', path: `/contact/fetchContacts/${instanceName}`, body: JSON.stringify({ where: { id: remoteJid } }) },
    { key: 'contact_findContacts_GET', method: 'GET', path: `/contact/findContacts/${instanceName}?id=${remoteJid}` },
    { key: 'contact_find_POST', method: 'POST', path: `/contact/find/${instanceName}`, body: JSON.stringify({ number }) },
    { key: 'contact_GET_number', method: 'GET', path: `/contact/${instanceName}?number=${number}` },
    { key: 'chat_fetchProfilePictureUrl_GET', method: 'GET', path: `/chat/fetchProfilePictureUrl/${instanceName}?number=${number}` },
    { key: 'contact_getProfilePicture_GET', method: 'GET', path: `/contact/getProfilePicture/${instanceName}?number=${number}` },
    { key: 'profile_GET', method: 'GET', path: `/profile/${instanceName}?number=${number}` },
  ]

  for (const a of attempts) {
    const res = await evolutionFetch(a.path, a.body ? { method: a.method, body: a.body } : { method: a.method })
    const text = await res.text().catch(() => '')
    results[a.key] = { status: res.status, body: text.slice(0, 300) }
  }

  return results
}
