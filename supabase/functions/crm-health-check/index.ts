// crm-health-check — vigia o que o CRM precisa para funcionar e avisa a equipe quando algo cai.
// Roda a cada minuto (pg_cron) e NÃO depende do servidor da Evolution/Hostinger (roda no Supabase).
//
// Verifica:
//  - evolution : o servidor da Evolution responde?
//  - instance:<id> : cada número de WhatsApp está conectado (open)?
//  - vps       : estado da máquina na Hostinger (precisa do segredo HOSTINGER_API_TOKEN)
//  - hostinger : manutenção/incidente de VPS na página de status da Hostinger (explica o motivo)
//  - monitor   : batimento (a tela avisa se o próprio monitor parar)
// Religa sozinho: máquina parada → "start"; máquina ligada mas sem resposta há 10+ min → "restart"
// (com intervalo mínimo e no máximo 3 reinícios em 24 h; não reinicia no meio de manutenção da Hostinger).
// Cada queda/volta vira registro em crm_health_events e um aviso por push para a equipe.
//
// Segredos: EVOLUTION_API_URL, EVOLUTION_API_KEY (já existem); HOSTINGER_API_TOKEN (opcional, liga o
// religamento automático); HOSTINGER_VM_ID (opcional, padrão 1942891).
// Auth: interna (service role + x-internal-call) ou x-cron-secret (internal_cron_secrets 'crm-health').

import { createClient } from '@supabase/supabase-js'

const APP_URL = 'https://luknos.vercel.app'
const HOSTINGER_API = 'https://developers.hostinger.com/api/vps/v1'
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
const get = (url: string, init: RequestInit = {}, ms = 8000) => fetch(url, { ...init, signal: AbortSignal.timeout(ms) })
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { autoRefreshToken: false, persistSession: false } })

type Status = 'ok' | 'warn' | 'down'
interface Row { component: string; label: string; status: Status; detail: string | null; reason: string | null; since: string; last_ok_at: string | null; checked_at: string; meta: Record<string, any> }

function isInternalCall(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  return req.headers.get('x-internal-call') === '1' && token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
}
async function cronSecret(): Promise<string | null> {
  const { data } = await db.from('internal_cron_secrets').select('secret').eq('name', 'crm-health').maybeSingle()
  return (data?.secret as string | undefined) ?? null
}

const fmtTime = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
function fmtDur(ms: number) {
  const m = Math.max(1, Math.round(ms / 60000))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
}

async function notify(title: string, body: string) {
  const secret = await cronSecret()
  if (!secret) return
  try {
    await get(`${APP_URL}/api/push/crm-health`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret }, body: JSON.stringify({ title, body }) }, 15000)
  } catch (e) { console.warn('aviso push falhou', String((e as Error)?.message ?? e)) }
}
async function logEvent(component: string, kind: string, message: string, meta: Record<string, unknown> = {}) {
  await db.from('crm_health_events').insert({ component, kind, message, meta })
}

// Incidente de VPS ou do datacenter de Campinas na página de status da Hostinger (explica uma queda).
async function hostingerNotice(): Promise<{ name: string; status: string; text: string; since: string } | null | undefined> {
  try {
    const r = await get('https://statuspage.hostinger.com/api/v2/summary.json')
    if (!r.ok) return undefined
    const d = await r.json()
    // o servidor fica em Campinas (BR-CAM): incidente do datacenter/rede também derruba a máquina.
    // Fora: manutenção de servidor de hospedagem de sites ("Server BR-1196", cPanel, websites) — não é o nosso VPS.
    const text = (i: any) => `${i.name} ${i.incident_updates?.[i.incident_updates.length - 1]?.body ?? ''}`
    const hosting = (t: string) => /server\s+br-\d+|web hosting|websites? hosted|cpanel|agency hosting/i.test(t) && !/vps|br-cam|campinas/i.test(t)
    const ours = (i: any) => {
      const t = text(i)
      if (hosting(t)) return false
      return /vps|br-cam|campinas/i.test(t) || (i.components ?? []).some((c: any) => /vps/i.test(c.name))
        || (/brasil|brazil/i.test(t) && /data ?center|network|rede/i.test(t))
    }
    const list: any[] = d.incidents ?? []
    const inc = list.find(ours)
    if (!inc) return null
    const body = String(inc.incident_updates?.[0]?.body ?? '').replace(/\s+/g, ' ').trim()
    return { name: inc.name, status: inc.status, text: body.slice(0, 280), since: inc.started_at ?? inc.created_at }
  } catch { return undefined }
}

async function evolutionUp(base: string): Promise<{ up: boolean; err?: string }> {
  try { await get(`${base}/`, { redirect: 'manual' }); return { up: true } }
  catch (e) { return { up: false, err: String((e as Error)?.message ?? e).slice(0, 160) } }
}

async function vpsState(token: string, vmId: string): Promise<string | undefined> {
  try {
    const r = await get(`${HOSTINGER_API}/virtual-machines/${vmId}`, { headers: { Authorization: `Bearer ${token}` } }, 10000)
    if (!r.ok) { console.warn('Hostinger API', r.status); return undefined }
    const d = await r.json()
    return String(d?.state ?? d?.data?.state ?? '').toLowerCase() || undefined
  } catch { return undefined }
}
async function vpsAction(token: string, vmId: string, action: 'start' | 'restart'): Promise<{ ok: boolean; info: string }> {
  try {
    const r = await get(`${HOSTINGER_API}/virtual-machines/${vmId}/${action}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }, 15000)
    const t = (await r.text().catch(() => '')).slice(0, 200)
    return { ok: r.ok, info: `HTTP ${r.status} ${t}` }
  } catch (e) { return { ok: false, info: String((e as Error)?.message ?? e).slice(0, 200) } }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const given = req.headers.get('x-cron-secret')
  if (!isInternalCall(req) && !(given && given === (await cronSecret()))) return json({ error: 'unauthorized' }, 401)

  const now = new Date()
  const nowIso = now.toISOString()
  const base = (Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/$/, '')
  const evoKey = Deno.env.get('EVOLUTION_API_KEY') ?? ''
  const hostToken = Deno.env.get('HOSTINGER_API_TOKEN') || null
  const vmId = Deno.env.get('HOSTINGER_VM_ID') || '1942891'

  const { data: prevRows } = await db.from('crm_health').select('*')
  const prev = new Map<string, Row>((prevRows ?? []).map((r) => [r.component as string, r as Row]))
  const next = new Map<string, Row>()
  const announce: Array<{ title: string; body: string }> = []

  // Estado novo de um componente, com tolerância: só vira "down" depois de 2 falhas seguidas.
  function settle(component: string, label: string, ok: boolean, detailDown: string, detailOk: string | null, reason: string | null, meta: Record<string, any> = {}, severityDown: Status = 'down'): Row {
    const p = prev.get(component)
    const fails = ok ? 0 : ((p?.meta?.fails as number | undefined) ?? 0) + 1
    const status: Status = ok ? 'ok' : (fails >= 2 ? severityDown : (p?.status ?? 'ok'))
    const changed = !p || p.status !== status
    const row: Row = {
      component, label, status,
      detail: status === 'ok' ? detailOk : detailDown,
      reason: status === 'ok' ? null : reason,
      since: changed ? nowIso : p!.since,
      last_ok_at: ok ? nowIso : (p?.last_ok_at ?? null),
      checked_at: nowIso,
      meta: { ...meta, fails },
    }
    next.set(component, row)
    return row
  }

  // 1) Hostinger (página de status) e servidor da Evolution
  const notice = await hostingerNotice()
  const evo = base ? await evolutionUp(base) : { up: false, err: 'EVOLUTION_API_URL não configurado' }

  // 2) Máquina na Hostinger (só com token)
  let vm: string | undefined
  if (hostToken) vm = await vpsState(hostToken, vmId)

  const vmWords: Record<string, string> = { running: 'ligado', stopped: 'parado', starting: 'iniciando', stopping: 'desligando', restarting: 'reiniciando', installing: 'instalando', recreating: 'recriando' }
  const noticeText = notice ? `${notice.name}${notice.text ? ': ' + notice.text : ''}` : null

  // motivo da queda do servidor da Evolution
  const reasonParts: string[] = []
  if (vm && vm !== 'running') reasonParts.push(`a máquina na Hostinger está ${vmWords[vm] ?? vm}`)
  if (noticeText) reasonParts.push(`a Hostinger informa: ${noticeText}`)
  if (!reasonParts.length) reasonParts.push(evo.err ? `sem resposta (${evo.err})` : 'sem resposta do servidor')
  const evoReason = reasonParts.join('. ')

  const evoRow = settle('evolution', 'Servidor do WhatsApp (Evolution)', evo.up,
    'O WhatsApp está fora do ar: mensagens não estão sendo enviadas nem recebidas.', null, evoReason)

  if (hostToken) {
    settle('vps', 'Máquina na Hostinger', vm === 'running' || vm === undefined,
      `Máquina na Hostinger ${vm ? (vmWords[vm] ?? vm) : 'sem informação'}.`, vm ? `Máquina ${vmWords[vm] ?? vm}.` : null,
      noticeText, { state: vm ?? null }, 'warn')
    if (vm === undefined) next.set('vps', { ...next.get('vps')!, status: prev.get('vps')?.status ?? 'ok' }) // API sem resposta: não conta como queda
  }

  // página de status da Hostinger: incidente de VPS em aberto vira aviso informativo
  if (notice !== undefined) {
    const active = !!notice && notice.status !== 'resolved' && notice.status !== 'postmortem'
    const p = prev.get('hostinger')
    const status: Status = active ? 'warn' : 'ok'
    next.set('hostinger', {
      component: 'hostinger', label: 'Hostinger (página de status)', status,
      detail: active ? `Hostinger: ${notice!.name}` : null, reason: active ? notice!.text : null,
      since: !p || p.status !== status ? nowIso : p.since, last_ok_at: active ? (p?.last_ok_at ?? null) : nowIso, checked_at: nowIso, meta: { incident: notice?.name ?? null },
    })
  }

  // 3) Números de WhatsApp (só dá para saber com o servidor no ar)
  if (evo.up) {
    const { data: insts } = await db.from('crm_instances').select('id, instance_name, label').eq('is_active', true)
    await Promise.all((insts ?? []).map(async (i) => {
      const label = String((i as any).label ?? i.instance_name)
      let state: string | null = null
      try {
        const r = await get(`${base}/instance/connectionState/${i.instance_name}`, { headers: { apikey: evoKey } })
        const d = r.ok ? await r.json().catch(() => null) : null
        state = d?.instance?.state ?? d?.state ?? null
      } catch { /* sem resposta: tratado como desconhecido */ }
      if (state === null) return // não deu para saber; mantém o último estado
      const open = state === 'open'
      settle(`instance:${i.id}`, `WhatsApp ${label}`, open,
        `O WhatsApp "${label}" está desconectado (${state}). Mensagens desse número não chegam nem saem. Reconecte lendo o QR code na Evolution.`,
        `Conectado.`, `estado: ${state}`, { instance: i.instance_name, state })
    }))
  } else {
    // servidor fora do ar: os números ficam como estavam (a faixa principal já explica tudo)
    for (const [k, r] of prev) if (k.startsWith('instance:')) next.set(k, { ...r, checked_at: nowIso })
  }

  // 4) Religamento automático
  let recovery: string | null = null
  if (hostToken && evoRow.status === 'down') {
    const downMs = now.getTime() - new Date(evoRow.since).getTime()
    const since24 = new Date(now.getTime() - 24 * 3600_000).toISOString()
    const { data: evs } = await db.from('crm_health_events').select('kind, at').in('kind', ['recovery_start', 'recovery_restart']).gte('at', since24).order('at', { ascending: false })
    const lastOf = (kind: string) => (evs ?? []).find((e) => e.kind === kind)?.at as string | undefined
    const agoMin = (iso?: string) => (iso ? (now.getTime() - new Date(iso).getTime()) / 60000 : Infinity)
    const activeIncident = !!notice && notice.status !== 'resolved' && notice.status !== 'postmortem'
    if (vm === 'stopped' && agoMin(lastOf('recovery_start')) >= 5) {
      const res = await vpsAction(hostToken, vmId, 'start')
      recovery = `start:${res.ok}`
      await logEvent('vps', res.ok ? 'recovery_start' : 'recovery_failed', res.ok ? 'Máquina estava parada: pedi para a Hostinger ligar.' : `Não consegui ligar a máquina (${res.info}).`, { info: res.info })
      announce.push({ title: res.ok ? 'CRM: religando o servidor' : 'CRM: não consegui religar o servidor', body: res.ok ? 'O servidor do WhatsApp estava parado. Mandei ligar na Hostinger.' : `Tentei ligar o servidor e falhou: ${res.info}` })
    } else if (vm === 'running' && downMs >= 10 * 60_000 && !activeIncident && agoMin(lastOf('recovery_restart')) >= 30 && (evs ?? []).filter((e) => e.kind === 'recovery_restart').length < 3) {
      const res = await vpsAction(hostToken, vmId, 'restart')
      recovery = `restart:${res.ok}`
      await logEvent('vps', res.ok ? 'recovery_restart' : 'recovery_failed', res.ok ? `Máquina ligada mas sem resposta há ${fmtDur(downMs)}: pedi reinício.` : `Não consegui reiniciar a máquina (${res.info}).`, { info: res.info })
      announce.push({ title: res.ok ? 'CRM: reiniciando o servidor' : 'CRM: não consegui reiniciar o servidor', body: res.ok ? `O WhatsApp está sem resposta há ${fmtDur(downMs)}. Mandei reiniciar na Hostinger.` : `Tentei reiniciar o servidor e falhou: ${res.info}` })
    }
  }

  // 5) Transições (queda/volta) → registro + aviso
  for (const [k, row] of next) {
    if (k === 'hostinger') continue
    const p = prev.get(k)
    if (row.status === p?.status || (!p && row.status === 'ok')) continue
    if (row.status === 'ok' && p) {
      const dur = fmtDur(now.getTime() - new Date(p.since).getTime())
      const msg = `${row.label}: voltou ao normal (ficou ${dur} fora, desde ${fmtTime(p.since)}).`
      await logEvent(k, 'up', msg, { downMs: now.getTime() - new Date(p.since).getTime() })
      announce.push({ title: k === 'evolution' ? 'CRM: WhatsApp voltou' : `CRM: ${row.label} voltou`, body: k === 'evolution' ? `Voltou às ${fmtTime(nowIso)} (ficou ${dur} fora). Mensagens do período podem chegar com atraso.` : msg })
    } else if (row.status === 'down' || row.status === 'warn') {
      const msg = `${row.detail ?? row.label}${row.reason ? ' Motivo: ' + row.reason : ''}`
      await logEvent(k, row.status === 'down' ? 'down' : 'warn', msg)
      if (row.status === 'down') announce.push({ title: k === 'evolution' ? 'CRM FORA DO AR: WhatsApp' : `CRM: ${row.label} caiu`, body: msg.slice(0, 220) })
    }
  }

  // monitor (batimento)
  next.set('monitor', { component: 'monitor', label: 'Monitoramento', status: 'ok', detail: null, reason: null, since: prev.get('monitor')?.since ?? nowIso, last_ok_at: nowIso, checked_at: nowIso, meta: { recovery } })

  await db.from('crm_health').upsert([...next.values()], { onConflict: 'component' })
  for (const a of announce) await notify(a.title, a.body)

  return json({ ok: true, evolution: evoRow.status, vm: vm ?? null, hostingerNotice: notice === undefined ? 'sem leitura' : (notice?.name ?? null), instances: [...next.values()].filter((r) => r.component.startsWith('instance:')).map((r) => `${r.label}: ${r.status}`), recovery, announced: announce.length })
})
