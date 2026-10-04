// crm-evolution-setup — automatiza o que o EVOLUTION_SETUP.md manda fazer na
// mão (instance/create + webhook/set + instance/connect) pra um número novo
// do CRM multiatendente. Devolve o QR Code pra mostrar direto no painel.
//
// Auth: interna (service role) — chamada pelo server action do /crm-instances
// (admin), nunca direto do browser (a Evolution API key fica só aqui).
//
// action: 'connect'  -> cria a instância (se não existir), aponta o webhook
//                        pra esta mesma função whatsapp-webhook, e devolve o
//                        QR Code (base64) pra parear.
// action: 'status'   -> consulta o estado da conexão (open/connecting/close).

import { handleOptions, json } from '../_shared/cors.ts'
import { isInternalCall } from '../_shared/internal.ts'
import { env } from '../_shared/env.ts'
import { evolutionFetch, fetchContact, getProfilePicture } from '../_shared/evolution.ts'

Deno.serve(async (req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!isInternalCall(req)) return json({ error: 'unauthorized' }, 401)

  let payload: { action?: 'connect' | 'status' | 'contact_info'; instance_name?: string; remote_jid?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  const instanceName = payload.instance_name?.trim()
  if (!instanceName) return json({ error: 'instance_name_required' }, 400)

  try {
    if (payload.action === 'status') return json(await status(instanceName))
    if (payload.action === 'contact_info') {
      if (!payload.remote_jid) return json({ error: 'remote_jid_required' }, 400)
      return json(await contactInfo(instanceName, payload.remote_jid))
    }
    return json(await connect(instanceName))
  } catch (err) {
    console.error('crm-evolution-setup erro:', err)
    return json({ error: String((err as Error)?.message ?? err) }, 500)
  }
})

async function instanceExists(instanceName: string): Promise<boolean> {
  const res = await evolutionFetch(`/instance/connectionState/${instanceName}`)
  return res.ok
}

async function connect(instanceName: string) {
  // 1) cria a instância se ainda não existir (idempotente: se já existe, a
  // Evolution responde erro "already in use" — seguimos em frente).
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

  // 2) aponta o webhook da instância pra mesma função que o robô já usa —
  // o roteamento por instância dentro dela decide pra onde cada mensagem vai.
  const webhookUrl = `${env.supabaseUrl}/functions/v1/whatsapp-webhook`
  const webhookRes = await evolutionFetch(`/webhook/set/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        events: ['MESSAGES_UPSERT'],
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

  // 3) pede o QR Code pra parear.
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
    // instance/connectionState pode já estar "open" (já conectado antes).
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
    | { instance?: { state?: string } ; state?: string }
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
