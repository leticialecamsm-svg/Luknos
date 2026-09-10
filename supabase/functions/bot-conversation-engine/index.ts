// bot-conversation-engine — máquina de estados do robô.
//
// Auth: interna (service role) — chamada pela whatsapp-webhook a cada inbound.
// Modos:
//   - _menu        : "oi" -> menu (orçamento / agenda dia / agenda semana)
//   - agenda       : resposta única, volta ao menu
//   - _await_files : "manda os arquivos" antes do cadastro guiado
//   - cadastro     : client -> origin -> category -> priority -> _optmenu -> resumo -> confirmação
//
// Se a 1ª mensagem já vem com arquivo, pula o menu e entra direto no cadastro.

import { handleOptions, json } from '../_shared/cors.ts'
import { isInternalCall, invokeFunction } from '../_shared/internal.ts'
import { createServiceClient } from '../_shared/supabase.ts'
import { sendWhatsappMessage } from '../_shared/wa-send.ts'
import { toE164 } from '../_shared/phone.ts'
import type { SupabaseClient } from '@supabase/supabase-js'

Deno.serve(async (req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)
  if (!isInternalCall(req)) return json({ ok: false, error: 'unauthorized' }, 401)

  let payload: { conversation_id?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }
  if (!payload.conversation_id) return json({ ok: false, error: 'missing_conversation_id' }, 400)

  try {
    const result = await runEngine(payload.conversation_id)
    return json({ ok: true, ...result })
  } catch (err) {
    console.error('bot-conversation-engine erro:', err)
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500)
  }
})

// ── constantes ────────────────────────────────────────────────────────────

type Data = Record<string, unknown>

const REQUIRED = ['client', 'origin', 'category', 'priority'] as const
const ALL_OPTIONAL = [
  'partner', 'size', 'stage', 'deadline', 'quote_date', 'quote_value', 'notes', 'drive_link', 'seller',
]
// grupos oferecidos no menu de opcionais (o resto é auto: quote_date=hoje, stage/drive_link pulados)
const OPT_GROUPS = [
  { key: 'partner', label: 'Parceiro', fields: ['partner'] },
  { key: 'size', label: 'Porte do orçamento', fields: ['size'] },
  { key: 'prazovalor', label: 'Prazo, valor', fields: ['deadline', 'quote_value'] },
  { key: 'notes', label: 'Observações', fields: ['notes'] },
  { key: 'seller', label: 'Consultor responsável', fields: ['seller'] },
]

const PRIORITIES = ['Baixa', 'Média', 'Alta', 'Urgente']
const SKIP = new Set(['pular', 'pula', 'skip', '-', 'nao', 'n', 'na', 'nenhum', 'sem', 'nada'])
const YES = new Set(['sim', 's', 'confirmar', 'confirmo', 'ok', 'isso', 'pode', 'claro', 'certo', 'blz'])
const NO = new Set(['nao', 'n', 'cancelar', 'cancela', 'negativo'])
const SKIP_SENTINEL = '__skip__'

const EMOJI_NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟']
const FIELD_EMOJI: Record<string, string> = {
  client: '👤', client_phone: '📞', origin: '📍', category: '💡', priority: '⚡',
  partner: '🤝', size: '📐', deadline: '📅', quote_value: '💰', notes: '📝', seller: '🧑‍💼',
}

// ── utils ─────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}
function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}
function hourSP(): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' })
      .format(new Date()),
  )
}
function greetingWord(): string {
  const h = hourSP()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}
function pickNumber(n: string, count: number): number | null {
  const m = n.match(/^(\d{1,2})$/)
  if (!m) return null
  const i = parseInt(m[1], 10)
  return i >= 1 && i <= count ? i : null
}
function keycaps(items: string[]): string {
  return items.map((it, i) => `${EMOJI_NUM[i] ?? `${i + 1}.`} ${it}`).join('\n')
}
function firstNameOf(name: string | null | undefined): string {
  return (name ?? '').split(/[\s(]/)[0].trim()
}

// ── engine ────────────────────────────────────────────────────────────────

async function runEngine(conversationId: string) {
  const db = createServiceClient()

  const { data: conv } = await db
    .from('wa_conversations')
    .select('*')
    .eq('id', conversationId)
    .single()
  if (!conv) throw new Error('conversa nao encontrada')
  if (['submitted', 'cancelled', 'expired', 'failed'].includes(conv.status)) {
    return { status: conv.status, skipped: 'terminal_state' }
  }

  const { data: cfg } = await db
    .from('wa_bot_config').select('*').order('created_at', { ascending: true }).limit(1).maybeSingle()
  const { data: collab } = await db
    .from('wa_collaborators').select('*').eq('id', conv.collaborator_id).single()

  let userName: string | null = collab?.display_name ?? null
  if (collab?.system_user_id) {
    const { data: u } = await db.from('users').select('name').eq('id', collab.system_user_id).maybeSingle()
    if (u?.name) userName = u.name
  }
  const firstName = firstNameOf(userName)

  const { data: lastMsg } = await db
    .from('wa_messages').select('body, message_type')
    .eq('conversation_id', conversationId).eq('direction', 'inbound')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  const text = (lastMsg?.body ?? '').trim()
  const n = norm(text)
  const isFileMsg = lastMsg?.message_type === 'document' || lastMsg?.message_type === 'image'
  const toPhone = String(conv.remote_jid ?? '').split('@')[0]
  const data: Data = { ...(conv.collected_data ?? {}) }

  const allowedOrigins: string[] = cfg?.allowed_origins ?? ['Visita', 'WhatsApp', 'Loja', 'Indicação', 'Outro']
  const allowedCategories: string[] = cfg?.allowed_categories ?? ['Iluminação', 'Automação', 'Iluminação + Automação']
  const defaultPriority: string = cfg?.default_priority ?? 'Média'
  const cfgOpts: CfgOpts = { allowedOrigins, allowedCategories, defaultPriority }

  const say = (t: string) =>
    sendWhatsappMessage({ conversationId, toPhoneE164: toPhone, text: t, instanceName: cfg?.evolution_instance_name ?? null })
  const save = (patch: Record<string, unknown>) =>
    db.from('wa_conversations').update(patch).eq('id', conversationId)

  const currentField = (conv.current_field as string | null) ?? null

  // ── comandos globais ────────────────────────────────────────────────────
  if (text && (n === 'cancelar' || n === 'cancela' || n.startsWith('cancelar '))) {
    await save({ status: 'cancelled', current_field: null })
    await say('Beleza, cancelei. Quando quiser é só mandar *oi* ou encaminhar um projeto. 👋')
    return { status: 'cancelled' }
  }
  if (text && ['reiniciar', 'recomecar', 'comecar de novo', 'de novo', 'zerar'].includes(n)) {
    await save({ collected_data: {}, status: 'collecting', current_field: '_menu' })
    await say(menuPrompt(firstName))
    return { status: 'collecting', next_field: '_menu' }
  }

  // ── awaiting_confirmation ───────────────────────────────────────────────
  if (conv.status === 'awaiting_confirmation') {
    if (YES.has(n)) {
      const r = await invokeFunction('submit-quote', { conversation_id: conversationId })
      const body = r.body as { success?: boolean; system_quote_id?: string } | null
      if (r.ok && body?.success) return { status: 'submitted', system_quote_id: body.system_quote_id }
      await save({ status: 'failed' })
      await say('Recebi sua confirmação ✅ mas tive um problema ao gravar no sistema agora. Os dados e os arquivos estão salvos — a equipe vai concluir o cadastro. Você será avisado.')
      return { status: 'failed', submit_error: r.status }
    }
    if (NO.has(n)) {
      await save({ status: 'cancelled' })
      await say('Cadastro cancelado, nada foi registrado. 👋')
      return { status: 'cancelled' }
    }
    const editField = detectEditField(n)
    if (editField) {
      await save({ status: 'collecting', current_field: editField })
      await say(`Vamos corrigir *${label(editField)}*.\n\n` + promptFor(editField, cfgOpts, data))
      return { status: 'collecting', next_field: editField }
    }
    await say('Não entendi. Responda *sim* pra cadastrar, *não* pra cancelar, ou diga o campo que quer corrigir (ex: "corrigir origem").')
    return { status: 'awaiting_confirmation' }
  }

  // ── primeira interação ──────────────────────────────────────────────────
  if (!currentField && !hasAnyAnswer(data)) {
    if (isFileMsg) {
      // já mandou arquivo -> entra direto no cadastro
      data._flow = 'quote'
      await save({ collected_data: data, current_field: 'client' })
      await say('Recebi o(s) arquivo(s) 📎 Vou cadastrar esse orçamento — respondo o resto rapidinho.')
      await say(promptFor('client', cfgOpts, data))
      return { status: 'collecting', next_field: 'client' }
    }
    await save({ current_field: '_menu' })
    await say(menuPrompt(firstName))
    return { status: 'collecting', next_field: '_menu' }
  }

  // ── MENU ────────────────────────────────────────────────────────────────
  if (currentField === '_menu') {
    if (isFileMsg) {
      // mandou um projeto enquanto estava no menu -> entra no cadastro
      data._flow = 'quote'
      await save({ collected_data: data, current_field: 'client' })
      await say('Recebi o(s) arquivo(s) 📎 Vou cadastrar esse orçamento.')
      await say(promptFor('client', cfgOpts, data))
      return { status: 'collecting', next_field: 'client' }
    }
    if (!text) return { status: 'collecting', next_field: '_menu', silent: true }
    const pick = pickNumber(n, 3)
    if (pick === 1 || /orcament|cadastr/.test(n)) {
      data._flow = 'quote'
      await save({ collected_data: data, current_field: '_await_files' })
      await say('📎 Manda o(s) arquivo(s) do projeto (PDF da planta, imagem 3D, DWG, SketchUp).\nQuando terminar, responde *pronto*. Se não tiver arquivo, responde *pular*.')
      return { status: 'collecting', next_field: '_await_files' }
    }
    if (pick === 2 || /(agenda|compromiss).*(dia|hoje)|^dia$|^hoje$/.test(n)) {
      await say(await buildAgenda(db, collab?.system_user_id ?? null, 'day', firstName))
      await save({ current_field: '_menu' })
      await say('Precisa de mais alguma coisa? Manda *oi* que eu mostro as opções.')
      return { status: 'collecting', next_field: '_menu', done: 'agenda_day' }
    }
    if (pick === 3 || /(agenda|compromiss).*semana|^semana$/.test(n)) {
      await say(await buildAgenda(db, collab?.system_user_id ?? null, 'week', firstName))
      await save({ current_field: '_menu' })
      await say('Precisa de mais alguma coisa? Manda *oi* que eu mostro as opções.')
      return { status: 'collecting', next_field: '_menu', done: 'agenda_week' }
    }
    await say(menuPrompt(firstName))
    return { status: 'collecting', next_field: '_menu' }
  }

  // ── AGUARDANDO ARQUIVOS ─────────────────────────────────────────────────
  if (currentField === '_await_files') {
    if (isFileMsg) {
      await say('Recebi ✅ Mais algum arquivo? Quando terminar, responde *pronto*.')
      return { status: 'collecting', next_field: '_await_files', silent: false }
    }
    if (!text) return { status: 'collecting', next_field: '_await_files', silent: true }
    if (['pronto', 'ok', 'sim', 'segue', 'seguir', 'continuar', 'proximo', 'pode'].includes(n) || SKIP.has(n)) {
      await save({ current_field: 'client' })
      await say(promptFor('client', cfgOpts, data))
      return { status: 'collecting', next_field: 'client' }
    }
    await say('Manda os arquivos, ou responde *pronto* pra seguir (ou *pular* se não tiver).')
    return { status: 'collecting', next_field: '_await_files' }
  }

  // ── CADASTRO GUIADO ─────────────────────────────────────────────────────
  let processedAnswer = false

  if (currentField && text) {
    if (currentField === '_optmenu') {
      const res = handleOptMenu(n, data)
      if (res.reask) {
        await say(res.reask)
        return { status: 'collecting', next_field: '_optmenu' }
      }
      if (res.finalize) {
        markOptionalsDone(data)
      } else if (res.field) {
        Object.assign(data, res.patch ?? {})
        await save({ collected_data: data, current_field: res.field })
        await say(promptFor(res.field, cfgOpts, data))
        return { status: 'collecting', next_field: res.field }
      }
    } else {
      const outcome = await applyAnswer(currentField, text, n, data, cfgOpts, { db, collab })
      processedAnswer = true
      if ('reask' in outcome) {
        await say(outcome.reask)
        return { status: 'collecting', next_field: currentField }
      }
      Object.assign(data, outcome.patch ?? {})
      if (outcome.next) {
        await save({ collected_data: data, current_field: outcome.next })
        await say(promptFor(outcome.next, cfgOpts, data))
        return { status: 'collecting', next_field: outcome.next }
      }
      // terminou um campo de um grupo do menu de opcionais?
      const grp = OPT_GROUPS.find((g) => g.key === data._optgroup)
      if (grp) {
        const missing = grp.fields.find((f) => !(f in data))
        if (missing) {
          await save({ collected_data: data, current_field: missing })
          await say(promptFor(missing, cfgOpts, data))
          return { status: 'collecting', next_field: missing }
        }
        data._optgroups_done = [...((data._optgroups_done as string[]) ?? []), grp.key]
        delete data._optgroup
      }
    }
  }

  // próximo passo
  const req = REQUIRED.find((f) => !isPresent(data, f))
  if (req) {
    if (!processedAnswer && data._last_prompt === req) {
      return { status: 'collecting', next_field: req, silent: true }
    }
    data._last_prompt = req
    await save({ collected_data: data, current_field: req })
    await say(promptFor(req, cfgOpts, data))
    return { status: 'collecting', next_field: req }
  }

  // obrigatórios ok -> menu de opcionais (a não ser que já tenha finalizado)
  const groupsLeft = OPT_GROUPS.filter((g) => !((data._optgroups_done as string[]) ?? []).includes(g.key))
  if (data._optmenu_final !== true && groupsLeft.length > 0) {
    ensureAutoOptionals(data)
    if (!processedAnswer && data._last_prompt === '_optmenu' && currentField === '_optmenu') {
      return { status: 'collecting', next_field: '_optmenu', silent: true }
    }
    data._last_prompt = '_optmenu'
    await save({ collected_data: data, current_field: '_optmenu' })
    await say(optMenuPrompt(groupsLeft, ((data._optgroups_done as string[]) ?? []).length > 0))
    return { status: 'collecting', next_field: '_optmenu' }
  }

  // ── resumo ──────────────────────────────────────────────────────────────
  markOptionalsDone(data)
  if (!isPresent(data, 'priority')) data.priority = defaultPriority
  if (!isRealValue(data.quote_date)) data.quote_date = todayISO()
  for (const k of [
    '_last_prompt', '_flow', '_optgroup', '_optgroups_done', '_optmenu_final',
    '_client_candidates', '_client_name', '_partner_candidates', '_partner_name',
  ]) delete data[k]

  await save({ collected_data: data, status: 'awaiting_confirmation', current_field: null })
  await say(buildSummary(data, userName))
  return { status: 'awaiting_confirmation' }
}

// ── prompts de menu ───────────────────────────────────────────────────────

function menuPrompt(firstName: string): string {
  return (
    `Olá${firstName ? `, ${firstName}` : ''}! Como posso te ajudar?\n\n` +
    `${EMOJI_NUM[0]} Cadastrar novo orçamento\n` +
    `${EMOJI_NUM[1]} Consultar agenda do dia\n` +
    `${EMOJI_NUM[2]} Consultar agenda da semana`
  )
}

function optMenuPrompt(groupsLeft: typeof OPT_GROUPS, afterPick: boolean): string {
  const head = afterPick
    ? 'Anotado! Quer acrescentar mais alguma informação?'
    : '✅ Já tenho os dados básicos para cadastrar o orçamento!\nDeseja acrescentar mais alguma informação?'
  const items = groupsLeft.map((g) => g.label)
  items.push('Finalizar')
  return `${head}\n\n${keycaps(items)}`
}

function handleOptMenu(
  n: string,
  data: Data,
): { reask?: string; finalize?: boolean; field?: string; patch?: Record<string, unknown> } {
  const done = (data._optgroups_done as string[]) ?? []
  const groupsLeft = OPT_GROUPS.filter((g) => !done.includes(g.key))
  const options = [...groupsLeft.map((g) => g.label), 'Finalizar']
  const pick = pickNumber(n, options.length)
  if (pick === null) {
    return { reask: `Responde o número:\n${keycaps(options)}` }
  }
  if (pick === options.length) return { finalize: true }
  const g = groupsLeft[pick - 1]
  return { field: g.fields[0], patch: { _optgroup: g.key } }
}

function markOptionalsDone(data: Data) {
  ensureAutoOptionals(data)
  for (const f of ['partner', 'size', 'deadline', 'quote_value', 'notes', 'seller']) {
    if (!(f in data)) data[f] = SKIP_SENTINEL
  }
  data._optmenu_final = true
}
function ensureAutoOptionals(data: Data) {
  if (!('quote_date' in data)) data.quote_date = todayISO()
  if (!('stage' in data)) data.stage = SKIP_SENTINEL
  if (!('drive_link' in data)) data.drive_link = SKIP_SENTINEL
}

// ── agenda ────────────────────────────────────────────────────────────────

async function buildAgenda(
  db: SupabaseClient,
  sellerId: string | null,
  range: 'day' | 'week',
  firstName: string,
): Promise<string> {
  const today = todayISO()
  let start = today
  let end = today
  if (range === 'week') {
    const d = new Date(today + 'T12:00:00')
    const dow = (d.getDay() + 6) % 7 // 0 = segunda
    const mon = new Date(d)
    mon.setDate(d.getDate() - dow)
    const sun = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    start = mon.toISOString().slice(0, 10)
    end = sun.toISOString().slice(0, 10)
  }

  const { data: rows } = await db
    .from('schedules')
    .select('title, location, scheduled_date, scheduled_time, team_members')
    .gte('scheduled_date', start)
    .lte('scheduled_date', end)
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true, nullsFirst: false })

  const list = (rows ?? []) as {
    title: string
    location: string | null
    scheduled_date: string
    scheduled_time: string | null
    team_members: string[] | null
  }[]

  const hi = `Olá${firstName ? `, ${firstName}` : ''}! ${greetingWord()}`
  if (list.length === 0) {
    return `${hi}\n\n${range === 'day' ? 'Não há eventos na agenda de hoje.' : 'Não há eventos na agenda desta semana.'}`
  }

  const hhmm = (t: string | null) => (t ? t.slice(0, 5).replace(':', 'h') : 'Sem horário')
  const lines = list.map((e) => {
    const day = range === 'week' ? `${fmtDate(e.scheduled_date)} · ` : ''
    const loc = e.location ? ` | Local: ${e.location}` : ''
    return `• ${day}${hhmm(e.scheduled_time)} - ${e.title}${loc}`
  })

  const mine = list.filter((e) => sellerId && (e.team_members ?? []).includes(sellerId))
  let tail: string
  if (mine.length > 0) {
    const when = mine.map((e) => hhmm(e.scheduled_time)).join(', ')
    tail =
      `\n\nVocê está ligado diretamente ${mine.length === 1 ? 'ao evento' : 'aos eventos'} das ${when} — ` +
      `vamos trabalhar junto à equipe para garantir o cumprimento da agenda!`
  } else {
    tail =
      '\n\nVocê não está ligado diretamente a esses eventos, mas vamos trabalhar junto à equipe ' +
      'para garantir o cumprimento da agenda!'
  }

  const header = range === 'day' ? 'Hoje nossa agenda será:' : 'Nossa agenda da semana:'
  return `${hi}\n${header}\n\n${lines.join('\n')}${tail}`
}

// ── estado do cadastro ────────────────────────────────────────────────────

interface CfgOpts {
  allowedOrigins: string[]
  allowedCategories: string[]
  defaultPriority: string
}

function isRealValue(v: unknown): boolean {
  return v !== undefined && v !== null && v !== '' && v !== SKIP_SENTINEL
}
function isPresent(data: Data, field: string): boolean {
  if (field === 'client') {
    const c = data.client as { system_contact_id?: string; name?: string } | undefined
    return !!c && (!!c.system_contact_id || !!c.name)
  }
  return typeof data[field] === 'string' && (data[field] as string).length > 0
}
function hasAnyAnswer(data: Data): boolean {
  return REQUIRED.some((f) => isPresent(data, f)) || ALL_OPTIONAL.some((f) => f in data) || !!data._flow
}

type Outcome = { reask: string } | { patch?: Record<string, unknown>; next?: string }

async function applyAnswer(
  field: string,
  text: string,
  n: string,
  data: Data,
  cfg: CfgOpts,
  ctx: { db: SupabaseClient; collab: Record<string, unknown> | null },
): Promise<Outcome> {
  switch (field) {
    case 'client':
      return await resolveContactStep('client', text, ctx.db)
    case 'client_pick': {
      const idx = parseInt(n.replace(/\D/g, ''), 10) - 1
      const cands = (data._client_candidates as { system_contact_id: string; name: string }[]) ?? []
      if (isNaN(idx) || idx < 0 || idx >= cands.length) {
        return { reask: `Responde o número da opção (1 a ${cands.length}).` }
      }
      return { patch: { client: cands[idx], _client_candidates: undefined } }
    }
    case 'client_phone': {
      if (SKIP.has(n)) return { patch: { client: { name: data._client_name, needs_creation: true } } }
      const phone = toE164(text) ?? text.trim()
      return { patch: { client: { name: data._client_name, phone, needs_creation: true } } }
    }
    case 'origin': {
      const match = byNumberOrName(n, cfg.allowedOrigins)
      if (!match) return { reask: `Não entendi. Responde o número:\n${keycaps(cfg.allowedOrigins)}` }
      return { patch: { origin: match } }
    }
    case 'category': {
      const match = byNumberOrName(n, cfg.allowedCategories)
      if (!match) return { reask: `Não entendi. Responde o número:\n${keycaps(cfg.allowedCategories)}` }
      return { patch: { category: match } }
    }
    case 'priority': {
      if (!text || SKIP.has(n)) return { patch: { priority: cfg.defaultPriority } }
      const match = byNumberOrName(n, PRIORITIES)
      if (!match) return { reask: `Não entendi. Responde o número:\n${keycaps(PRIORITIES)}` }
      return { patch: { priority: match } }
    }
    case 'partner': {
      if (SKIP.has(n)) return { patch: { partner: SKIP_SENTINEL } }
      return await resolveContactStep('partner', text, ctx.db)
    }
    case 'partner_pick': {
      const idx = parseInt(n.replace(/\D/g, ''), 10) - 1
      const cands = (data._partner_candidates as { system_contact_id: string; name: string }[]) ?? []
      if (isNaN(idx) || idx < 0 || idx >= cands.length) {
        return { reask: `Responde o número da opção (1 a ${cands.length}).` }
      }
      return { patch: { partner: cands[idx], _partner_candidates: undefined } }
    }
    case 'size':
    case 'notes':
      return { patch: { [field]: SKIP.has(n) ? SKIP_SENTINEL : text.trim() } }
    case 'deadline': {
      if (SKIP.has(n)) return { patch: { deadline: SKIP_SENTINEL } }
      return { patch: { deadline: parseDate(n) ?? text.trim() } }
    }
    case 'quote_value': {
      if (SKIP.has(n)) return { patch: { quote_value: SKIP_SENTINEL } }
      const v = parseMoney(text)
      if (v === null) return { reask: 'Valor inválido. Manda só o número (ex: 12500 ou 12.500,00) ou *pular*.' }
      return { patch: { quote_value: v } }
    }
    case 'seller': {
      if (SKIP.has(n)) {
        const su = ctx.collab?.system_user_id as string | undefined
        return {
          patch: {
            seller: su
              ? { system_user_id: su, display_name: ctx.collab?.display_name, defaulted: true }
              : SKIP_SENTINEL,
          },
        }
      }
      const { data: users } = await ctx.db.from('users').select('id, name').eq('active', true)
      const matches = (users ?? []).filter((u: { name: string }) => {
        const un = norm(u.name)
        return un === n || un.includes(n) || n.includes(un.split(' ')[0])
      })
      if (matches.length === 1) {
        return { patch: { seller: { system_user_id: matches[0].id, display_name: matches[0].name } } }
      }
      if (matches.length > 1) {
        return { reask: `Achei mais de um: ${matches.map((m: { name: string }) => m.name).join(', ')}. Manda o nome completo.` }
      }
      return { reask: 'Não achei esse consultor. Tenta o nome como está no sistema, ou *pular*.' }
    }
    default:
      return { patch: {} }
  }
}

function byNumberOrName(n: string, list: string[]): string | null {
  const num = pickNumber(n, list.length)
  if (num !== null) return list[num - 1]
  return list.find((o) => norm(o) === n) ?? null
}

async function resolveContactStep(
  role: 'client' | 'partner',
  name: string,
  db: SupabaseClient,
): Promise<Outcome> {
  const r = await invokeFunction('resolve-contact', { role, name })
  const body = r.body as
    | { found?: boolean; matches?: { system_contact_id: string; name: string; phone?: string }[] }
    | null
  if (r.ok && body?.found && (body.matches?.length ?? 0) === 1) {
    return { patch: { [role]: body.matches![0] } }
  }
  if (r.ok && (body?.matches?.length ?? 0) > 1) {
    const cands = body!.matches!.slice(0, 5)
    return {
      patch: { [`_${role}_candidates`]: cands, [`_${role}_name`]: name },
      next: `${role}_pick`,
    } as Outcome
  }
  if (role === 'partner') return { patch: { partner: { name: name.trim(), needs_creation: true } } }
  return { patch: { _client_name: name.trim() }, next: 'client_phone' }
}

// ── prompts de campo ──────────────────────────────────────────────────────

function promptFor(field: string, cfg: CfgOpts, data: Data): string {
  const e = FIELD_EMOJI[field] ? `${FIELD_EMOJI[field]} ` : ''
  switch (field) {
    case 'client':
      return `${e}Quem é o *cliente*? (nome)`
    case 'client_pick':
    case 'partner_pick': {
      const key = field === 'client_pick' ? '_client_candidates' : '_partner_candidates'
      const cands = (data[key] as { name: string; phone?: string }[]) ?? []
      const lines = cands.map((c, i) => `${EMOJI_NUM[i] ?? `${i + 1}`} ${c.name}${c.phone ? ` (${c.phone})` : ''}`)
      return `Achei mais de um contato:\n${lines.join('\n')}\n\nQual? (responde o número)`
    }
    case 'client_phone':
      return `${e}Não achei esse cliente nos contatos. Qual o *telefone* dele? (ou *pular* pra cadastrar sem)`
    case 'origin':
      return `${e}*Origem?*\n${keycaps(cfg.allowedOrigins)}`
    case 'category':
      return `${e}*Categoria?*\n${keycaps(cfg.allowedCategories)}`
    case 'priority':
      return `${e}*Prioridade?*\n${keycaps(PRIORITIES)}\n(ou *pular* pra ${cfg.defaultPriority})`
    case 'partner':
      return `${e}*Parceiro / especificador?* (nome do arquiteto, engenheiro, designer — ou *pular*)`
    case 'size':
      return `${e}*Porte do orçamento?* (ou *pular*)`
    case 'deadline':
      return `${e}*Prazo?* (dd/mm/aaaa — ou *pular*)`
    case 'quote_value':
      return `${e}*Valor orçado?* Entra como Proposta 1. (ou *pular*)`
    case 'notes':
      return `${e}*Observações?* (ou *pular*)`
    case 'seller':
      return `${e}*Consultor responsável?* (nome — ou *pular* pra usar você mesmo)`
    default:
      return 'Pode mandar.'
  }
}

function label(field: string): string {
  const m: Record<string, string> = {
    client: 'Cliente', origin: 'Origem', category: 'Categoria', priority: 'Prioridade',
    partner: 'Parceiro', size: 'Porte', stage: 'Etapa', deadline: 'Prazo',
    quote_date: 'Data do orçamento', quote_value: 'Valor orçado', notes: 'Observações',
    drive_link: 'Link do Drive', seller: 'Consultor responsável',
  }
  return m[field] ?? field
}

function detectEditField(n: string): string | null {
  if (/client|cliente/.test(n)) return 'client'
  if (/origem/.test(n)) return 'origin'
  if (/categoria/.test(n)) return 'category'
  if (/prioridade/.test(n)) return 'priority'
  if (/parceiro|especificador/.test(n)) return 'partner'
  if (/porte/.test(n)) return 'size'
  if (/prazo/.test(n)) return 'deadline'
  if (/valor|proposta/.test(n)) return 'quote_value'
  if (/observ|obs/.test(n)) return 'notes'
  if (/vendedor|consultor|respons/.test(n)) return 'seller'
  return null
}

// ── resumo ────────────────────────────────────────────────────────────────

function buildSummary(data: Data, userName: string | null): string {
  const client = data.client as { name?: string; phone?: string; needs_creation?: boolean } | undefined
  const partner = data.partner as { name?: string } | string | undefined
  const seller = data.seller as { display_name?: string; defaulted?: boolean } | string | undefined

  const clientLine = client
    ? client.needs_creation
      ? `${client.name}${client.phone ? ` — ${client.phone}` : ''} (novo contato)`
      : client.name ?? '—'
    : '—'
  const partnerLine =
    partner && partner !== SKIP_SENTINEL ? (typeof partner === 'string' ? partner : partner.name ?? '—') : '—'
  const sellerLine =
    seller && seller !== SKIP_SENTINEL
      ? typeof seller === 'string'
        ? seller
        : `${seller.display_name ?? '—'}${seller.defaulted ? ' (você)' : ''}`
      : `${firstNameOf(userName) || 'você'} (você)`

  const opt = (k: string) => (isRealValue(data[k]) ? String(data[k]) : '—')
  const money = isRealValue(data.quote_value)
    ? `R$ ${Number(data.quote_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    : '—'
  const date = isRealValue(data.quote_date) ? fmtDate(String(data.quote_date)) : fmtDate(todayISO())

  return [
    '📋 *Resumo do orçamento*',
    '',
    `👤 *Cliente:* ${clientLine}`,
    `🤝 *Parceiro:* ${partnerLine}`,
    `📍 *Origem:* ${data.origin ?? '—'}`,
    `💡 *Categoria:* ${data.category ?? '—'}`,
    `⚡ *Prioridade:* ${data.priority ?? '—'}`,
    `📐 *Porte:* ${opt('size')}`,
    `📅 *Prazo:* ${opt('deadline')}`,
    `🗓️ *Data do orçamento:* ${date}`,
    `💰 *Valor (Proposta 1):* ${money}`,
    `📝 *Observações:* ${opt('notes')}`,
    `🧑‍💼 *Consultor responsável:* ${sellerLine}`,
    '',
    'Confirma? Responde *sim* pra cadastrar, *não* pra cancelar, ou diz o que corrigir (ex: "corrigir origem").',
  ].join('\n')
}

// ── parsing ───────────────────────────────────────────────────────────────

function parseDate(n: string): string | null {
  if (n === 'hoje') return todayISO()
  if (n === 'amanha') {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
  }
  const m = n.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (!m) return null
  const day = m[1].padStart(2, '0')
  const month = m[2].padStart(2, '0')
  let year = m[3] ?? String(new Date().getFullYear())
  if (year.length === 2) year = '20' + year
  const iso = `${year}-${month}-${day}`
  const d = new Date(iso + 'T12:00:00')
  return isNaN(d.getTime()) ? null : iso
}
function fmtDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}
function parseMoney(text: string): number | null {
  let s = text.replace(/[^\d.,]/g, '')
  if (!s) return null
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',')) s = s.replace(',', '.')
  const v = parseFloat(s)
  return isNaN(v) || v < 0 ? null : Math.round(v * 100) / 100
}
