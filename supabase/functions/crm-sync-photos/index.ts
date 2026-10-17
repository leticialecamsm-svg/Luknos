// crm-sync-photos — busca a foto de perfil do WhatsApp de cada conversa do CRM e guarda
// uma cópia no bucket público crm-avatars (o link do WhatsApp expira em poucos dias).
// Agendada por pg_cron a cada 10 min: primeiro as conversas nunca conferidas, depois as
// conferidas há mais de 7 dias. Quem não tem foto (ou esconde) fica sem, até a próxima conferida.
//
// Auth: interna (service role + x-internal-call) ou cabeçalho x-cron-secret (pg_cron).
// Input:  {} | { conversation_id?: string, limit?: number }
// Output: { checked, saved, cleared, failed }

import { createClient } from '@supabase/supabase-js'

const BUCKET = 'crm-avatars'
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000
const RETRY_MS = 24 * 60 * 60 * 1000
const DEFAULT_LIMIT = 40

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function isInternalCall(req: Request): boolean {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  return req.headers.get('x-internal-call') === '1' && token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
}

async function hasCronSecret(req: Request): Promise<boolean> {
  const given = req.headers.get('x-cron-secret')
  if (!given) return false
  const { data } = await db.from('internal_cron_secrets').select('secret').eq('name', 'crm-sync-photos').maybeSingle()
  return !!data?.secret && data.secret === given
}

function evolution(path: string, init: RequestInit = {}) {
  return fetch(`${Deno.env.get('EVOLUTION_API_URL')!.replace(/\/$/, '')}/${path.replace(/^\//, '')}`, {
    ...init,
    signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json', apikey: Deno.env.get('EVOLUTION_API_KEY')! },
  })
}

// undefined = a Evolution não respondeu (tenta de novo amanhã); null = o contato não tem foto visível
async function pictureUrl(instance: string, remoteJid: string): Promise<string | null | undefined> {
  // grupos e LIDs vão com o jid inteiro; números, só os dígitos
  const number = /@(g\.us|lid)$/.test(remoteJid) ? remoteJid : remoteJid.split('@')[0]
  let answered = false
  try {
    const res = await evolution(`/chat/fetchProfilePictureUrl/${instance}`, { method: 'POST', body: JSON.stringify({ number }) })
    if (res.ok) {
      answered = true
      const data = await res.json().catch(() => null)
      const url = data?.profilePictureUrl ?? data?.profilePicUrl ?? null
      if (typeof url === 'string' && url.startsWith('http')) return url
    }
  } catch { /* tenta o contato */ }
  try {
    const res = await evolution(`/chat/findContacts/${instance}`, { method: 'POST', body: JSON.stringify({ where: { remoteJid } }) })
    if (res.ok) {
      answered = true
      const data = await res.json().catch(() => null)
      const c = Array.isArray(data) ? data[0] : data
      const url = c?.profilePicUrl ?? c?.profilePictureUrl ?? null
      if (typeof url === 'string' && url.startsWith('http')) return url
    }
  } catch { /* sem resposta */ }
  return answered ? null : undefined
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!isInternalCall(req) && !(await hasCronSecret(req))) return json({ error: 'unauthorized' }, 401)
  const body = (await req.json().catch(() => ({}))) ?? {}
  try {
    // fotos de quem fala num grupo (chamado ao abrir o grupo no CRM)
    if (body.participants?.conversation_id && Array.isArray(body.participants.jids)) {
      return json(await syncParticipants(String(body.participants.conversation_id), body.participants.jids.map(String)))
    }
    return json(await run(typeof body.conversation_id === 'string' ? body.conversation_id : null, Number(body.limit) || DEFAULT_LIMIT))
  } catch (err) {
    console.error('crm-sync-photos erro:', err)
    return json({ error: String((err as Error)?.message ?? err) }, 500)
  }
})

async function run(conversationId: string | null, limit: number) {
  let q = db
    .from('crm_conversations')
    .select('id, remote_jid, contact_photo_url, crm_instances(instance_name, is_active)')
  if (conversationId) q = q.eq('id', conversationId)
  else {
    q = q
      .or(`contact_photo_checked_at.is.null,contact_photo_checked_at.lt.${new Date(Date.now() - REFRESH_MS).toISOString()}`)
      .order('contact_photo_checked_at', { ascending: true, nullsFirst: true })
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(Math.min(limit, 100))
  }
  const { data: convs, error } = await q
  if (error) throw error

  let saved = 0, cleared = 0, failed = 0
  for (const c of (convs ?? []) as any[]) {
    const inst = c.crm_instances
    if (!inst?.is_active || !inst?.instance_name) continue
    const url = await pictureUrl(inst.instance_name, c.remote_jid)

    if (url === undefined) {
      // tenta de novo daqui a ~1 dia
      failed++
      await db.from('crm_conversations')
        .update({ contact_photo_checked_at: new Date(Date.now() - REFRESH_MS + RETRY_MS).toISOString() })
        .eq('id', c.id)
      continue
    }

    const update: Record<string, string | null> = { contact_photo_checked_at: new Date().toISOString() }
    if (url === null) {
      update.contact_photo_url = null
      if (c.contact_photo_url) await db.storage.from(BUCKET).remove([`${c.id}.jpg`])
      cleared++
    } else {
      try {
        const img = await fetch(url, { signal: AbortSignal.timeout(10000) })
        if (!img.ok) throw new Error(`download ${img.status}`)
        const bytes = new Uint8Array(await img.arrayBuffer())
        const { error: upErr } = await db.storage.from(BUCKET).upload(`${c.id}.jpg`, bytes, {
          contentType: img.headers.get('content-type') ?? 'image/jpeg',
          upsert: true,
          cacheControl: '604800',
        })
        if (upErr) throw upErr
        const { data: pub } = db.storage.from(BUCKET).getPublicUrl(`${c.id}.jpg`)
        update.contact_photo_url = `${pub.publicUrl}?v=${Date.now()}`
        saved++
      } catch (e) {
        console.warn('crm-sync-photos: falha ao salvar a foto', c.id, String(e))
        failed++
        update.contact_photo_checked_at = new Date(Date.now() - REFRESH_MS + RETRY_MS).toISOString()
      }
    }
    await db.from('crm_conversations').update(update).eq('id', c.id)
  }

  return { checked: (convs ?? []).length, saved, cleared, failed }
}

// Foto de cada participante (jid do remetente: @lid ou número) numa conversa de grupo.
// Guarda a cópia em crm-avatars/p/<instância>/<jid>.jpg e o link em crm_participant_photos.
async function syncParticipants(conversationId: string, jids: string[]) {
  const { data: conv } = await db.from('crm_conversations').select('instance_id, crm_instances(instance_name, is_active)').eq('id', conversationId).maybeSingle()
  const inst = (conv as any)?.crm_instances
  if (!conv || !inst?.is_active) return { checked: 0, saved: 0 }
  let saved = 0, empty = 0, failed = 0
  const list = jids.slice(0, 15)
  for (let i = 0; i < list.length; i += 5) {
    await Promise.all(list.slice(i, i + 5).map(async (jid) => {
      const url = await pictureUrl(inst.instance_name, jid)
      if (url === undefined) { failed++; return }
      let photo: string | null = null
      if (url) {
        try {
          const img = await fetch(url, { signal: AbortSignal.timeout(10000) })
          if (!img.ok) throw new Error(`download ${img.status}`)
          const path = `p/${conv.instance_id}/${jid.replace(/[^\w]/g, '_')}.jpg`
          const { error: upErr } = await db.storage.from(BUCKET).upload(path, new Uint8Array(await img.arrayBuffer()), {
            contentType: img.headers.get('content-type') ?? 'image/jpeg', upsert: true, cacheControl: '604800',
          })
          if (upErr) throw upErr
          photo = `${db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
          saved++
        } catch (e) { console.warn('foto de participante', jid, String(e)); failed++; return }
      } else empty++
      await db.from('crm_participant_photos').upsert({ instance_id: conv.instance_id, participant_jid: jid, photo_url: photo, checked_at: new Date().toISOString() }, { onConflict: 'instance_id,participant_jid' })
    }))
  }
  return { checked: list.length, saved, empty, failed }
}
