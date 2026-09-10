// wa-agenda-daily — dispara a agenda (resumo do dia + resto da semana) para
// todos os colaboradores ativos do robô. Agendado para 08h30 (America/Sao_Paulo)
// por um cron da Vercel que chama esta função.
//
// Auth: interna (service role) — via /api/cron/agenda-broadcast do Next.
// Input:  {} | { dry_run?: boolean }
// Output: { processed, sent, failed }

import { handleOptions, json } from '../_shared/cors.ts'
import { isInternalCall } from '../_shared/internal.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { sendWhatsappMessage } from '../_shared/wa-send.ts'
import { buildAgendaText } from '../_shared/agenda.ts'

const GAP_MS = 400 // respeita rate limit do WhatsApp entre envios

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function firstNameOf(name: string | null | undefined): string {
  return (name ?? '').split(/[\s(]/)[0].trim()
}

Deno.serve(async (req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!isInternalCall(req)) return json({ error: 'unauthorized' }, 401)

  let dryRun = false
  try {
    const body = (await req.json().catch(() => ({}))) ?? {}
    dryRun = body.dry_run === true
  } catch { /* ignore */ }

  try {
    return json(await run(dryRun))
  } catch (err) {
    console.error('wa-agenda-daily erro:', err)
    return json({ error: String((err as Error)?.message ?? err) }, 500)
  }
})

async function run(dryRun: boolean) {
  const db = createServiceClient()

  const { data: cfg } = await db
    .from('wa_bot_config')
    .select('evolution_instance_name')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  const instance = cfg?.evolution_instance_name ?? null

  const { data: collaborators } = await db
    .from('wa_collaborators')
    .select('id, phone_e164, display_name, system_user_id, is_active')
    .eq('is_active', true)

  // dedupe por telefone (uma pessoa pode ter linha "loja" e "pessoal")
  const seen = new Set<string>()
  const targets = (collaborators ?? []).filter((c) => {
    const key = (c.phone_e164 ?? '').replace(/\D/g, '')
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })

  let sent = 0
  let failed = 0
  const preview: string[] = []

  for (const c of targets) {
    let name = c.display_name ?? ''
    if (c.system_user_id) {
      const { data: u } = await db.from('users').select('name').eq('id', c.system_user_id).maybeSingle()
      if (u?.name) name = u.name
    }
    const firstName = firstNameOf(name)

    const text = await buildAgendaText(db, {
      sellerId: c.system_user_id ?? null,
      firstName,
      mode: 'both',
    })

    if (dryRun) {
      preview.push(`→ ${c.phone_e164}\n${text}\n`)
      continue
    }

    try {
      const r = await sendWhatsappMessage({
        conversationId: null,
        toPhoneE164: c.phone_e164,
        text,
        instanceName: instance,
      })
      if (r.sent) sent++
      else { failed++; console.warn('agenda não enviada', c.phone_e164, r.error) }
    } catch (e) {
      failed++
      console.error('agenda erro', c.phone_e164, e)
    }
    await sleep(GAP_MS)
  }

  return { processed: targets.length, sent, failed, ...(dryRun ? { preview } : {}) }
}
