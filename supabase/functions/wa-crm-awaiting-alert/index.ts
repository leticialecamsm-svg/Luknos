// wa-crm-awaiting-alert — o robô avisa, pelo WhatsApp, o atendente que tem cliente
// esperando resposta há mais de 3 h no CRM. Agendada por pg_cron (a cada 30 min).
//
// - Só envia seg–sáb, 08h–18h (America/Sao_Paulo); fora disso, não faz nada.
// - Quem recebe: wa_collaborators com is_active e receives_crm_alerts, ligados a um usuário.
// - O que entra: conversas abertas (não grupos) atribuídas à pessoa ou liberadas para ela;
//   administradores recebem também as conversas sem atendente.
// - Cada (conversa, início da espera, colaborador) é avisado uma única vez (crm_awaiting_alerts).
//
// Auth: interna (service role + x-internal-call) ou cabeçalho x-cron-secret (pg_cron).
// Input:  {} | { dry_run?: boolean, only_phone?: string }   (dry_run ignora o horário, mostra o texto para todos e não envia)
// Output: { processed, sent, skipped, ... }

import { createClient } from '@supabase/supabase-js'

const TZ = 'America/Sao_Paulo'
const URGENT_MS = 3 * 60 * 60 * 1000
const MAX_LISTED = 10
const GAP_MS = 400

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

function isInternalCall(req: Request): boolean {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  return req.headers.get('x-internal-call') === '1' && token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
}

// O pg_cron chama com uma senha própria desta função (tabela internal_cron_secrets),
// porque o cofre do banco não guarda a service role.
async function hasCronSecret(req: Request): Promise<boolean> {
  const given = req.headers.get('x-cron-secret')
  if (!given) return false
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data } = await db.from('internal_cron_secrets').select('secret').eq('name', 'crm-awaiting-alert').maybeSingle()
  return !!data?.secret && data.secret === given
}

function inBusinessHours(): boolean {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(new Date())
  const wd = p.find((x) => x.type === 'weekday')?.value ?? ''
  const hour = Number(p.find((x) => x.type === 'hour')?.value ?? 0) % 24
  return wd !== 'Sun' && hour >= 8 && hour < 18
}

function waited(since: string): string {
  const min = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000))
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  return h % 24 ? `há ${d} d ${h % 24} h` : `há ${d} d`
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!isInternalCall(req) && !(await hasCronSecret(req))) return json({ error: 'unauthorized' }, 401)
  const body = (await req.json().catch(() => ({}))) ?? {}
  try {
    return json(await run(body.dry_run === true, typeof body.only_phone === 'string' ? digits(body.only_phone) : null))
  } catch (err) {
    console.error('wa-crm-awaiting-alert erro:', err)
    return json({ error: String((err as Error)?.message ?? err) }, 500)
  }
})

async function run(dryRun: boolean, onlyPhone: string | null) {
  if (!dryRun && !inBusinessHours()) return { skipped: 'fora_do_horario' }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: cfg } = await db
    .from('wa_bot_config')
    .select('evolution_instance_name, system_api_base_url')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  const instance = cfg?.evolution_instance_name ?? null
  const base = (cfg?.system_api_base_url ?? '').replace(/\/$/, '')

  // dry_run mostra o texto para todos os colaboradores ativos, mesmo sem o aviso ligado
  let cq = db
    .from('wa_collaborators')
    .select('id, phone_e164, display_name, system_user_id')
    .eq('is_active', true)
    .not('system_user_id', 'is', null)
  if (!dryRun) cq = cq.eq('receives_crm_alerts', true)
  const { data: collabs } = await cq
  const targets = (collabs ?? []).filter((c) => !onlyPhone || digits(c.phone_e164) === onlyPhone)

  const cutoff = Date.now() - URGENT_MS
  const results: Record<string, unknown>[] = []
  let sent = 0

  for (const c of targets) {
    const { data: u } = await db.from('users').select('name, role, is_active').eq('id', c.system_user_id).maybeSingle()
    if (!u || u.is_active === false) continue
    const firstName = String(u.name ?? c.display_name ?? '').split(/[\s(]/)[0]

    const { data: shared } = await db.from('crm_conversation_access').select('conversation_id').eq('user_id', c.system_user_id)
    const sharedIds = (shared ?? []).map((s) => s.conversation_id as string)
    const filters = [`assigned_user_id.eq.${c.system_user_id}`, ...(u.role === 'admin' ? ['assigned_user_id.is.null'] : []), ...(sharedIds.length ? [`id.in.(${sharedIds.join(',')})`] : [])]
    const { data: convs } = await db
      .from('crm_conversations')
      .select('id, remote_jid, contact_name_cache, assigned_user_id, contacts(name), crm_instances(label)')
      .eq('status', 'open')
      .not('remote_jid', 'like', '%@g.us')
      .or(filters.join(','))
      .limit(500)
    const rows = (convs ?? []) as any[]
    if (!rows.length) continue

    const { data: info } = await db.rpc('crm_awaiting_info', { conv_ids: rows.map((r) => r.id) })
    const byId = new Map<string, any>((info ?? []).map((i: any) => [i.conversation_id, i]))
    const urgent = rows
      .map((r) => ({ r, w: byId.get(r.id) }))
      .filter((x) => x.w && new Date(x.w.waiting_since).getTime() <= cutoff)
      .sort((a, b) => a.w.waiting_since.localeCompare(b.w.waiting_since))
    if (!urgent.length) continue

    const { data: already } = await db
      .from('crm_awaiting_alerts')
      .select('conversation_id, waiting_since')
      .eq('collaborator_id', c.id)
      .in('conversation_id', urgent.map((x) => x.r.id))
    const done = new Set((already ?? []).map((a) => `${a.conversation_id}|${new Date(a.waiting_since as string).getTime()}`))
    const fresh = urgent.filter((x) => !done.has(`${x.r.id}|${new Date(x.w.waiting_since).getTime()}`))
    if (!fresh.length) continue

    const line = (x: { r: any; w: any }) => {
      const name = x.r.contacts?.name ?? x.r.contact_name_cache ?? String(x.r.remote_jid).split('@')[0]
      return `• *${name}* — ${waited(x.w.waiting_since)} (${x.r.crm_instances?.label ?? '—'})`
    }
    const mine = urgent.filter((x) => x.r.assigned_user_id !== null)
    const unassigned = urgent.filter((x) => x.r.assigned_user_id === null)
    const section = (title: string, list: typeof urgent) =>
      list.length
        ? `${title}\n${list.slice(0, MAX_LISTED).map(line).join('\n')}${list.length > MAX_LISTED ? `\n… e mais ${list.length - MAX_LISTED}` : ''}`
        : ''
    const text = [
      `Oi, *${firstName}*! 🔔`,
      '',
      section('Clientes esperando resposta no WhatsApp há mais de 3 h:', mine),
      section(mine.length ? '\nSem atendente (ninguém assumiu):' : 'Sem atendente (ninguém assumiu) há mais de 3 h:', unassigned),
      base ? `\nResponda pelo sistema: ${base}/crm/conversas` : '',
    ].filter((p) => p !== '').join('\n')

    if (dryRun) { results.push({ to: c.phone_e164, text }); continue }
    if (!instance) { results.push({ to: c.phone_e164, error: 'no_instance' }); continue }

    const res = await fetch(`${Deno.env.get('EVOLUTION_API_URL')!.replace(/\/$/, '')}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: Deno.env.get('EVOLUTION_API_KEY')! },
      body: JSON.stringify({ number: digits(c.phone_e164), text }),
    }).catch((e) => ({ ok: false, status: String(e) }) as any)
    if (!res.ok) { results.push({ to: c.phone_e164, error: `evolution_${res.status}` }); continue }

    sent++
    await db.from('crm_awaiting_alerts').upsert(
      [...mine.slice(0, MAX_LISTED), ...unassigned.slice(0, MAX_LISTED)].map((x) => ({ conversation_id: x.r.id, waiting_since: x.w.waiting_since, collaborator_id: c.id })),
      { onConflict: 'conversation_id,waiting_since,collaborator_id', ignoreDuplicates: true },
    )
    results.push({ to: c.phone_e164, listed: Math.min(mine.length, MAX_LISTED) + Math.min(unassigned.length, MAX_LISTED) })
    await sleep(GAP_MS)
  }

  return { processed: targets.length, sent, results }
}
