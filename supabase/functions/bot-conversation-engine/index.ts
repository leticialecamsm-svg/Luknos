// bot-conversation-engine — máquina de estados do cadastro guiado.
//
// Auth: interna (service role) — chamada pela whatsapp-webhook a cada inbound.
// Regras (docs/PROCESSO.md §3-4, docs/FUNCTIONS.md):
//   - pergunta 1 campo por vez: obrigatórios (Cliente, Origem, Categoria,
//     Prioridade) e depois opcionais
//   - Origem validada contra wa_bot_config.allowed_origins; Categoria contra
//     allowed_categories
//   - defaults: Prioridade = wa_bot_config.default_priority ('Média'),
//     Data do orçamento = hoje
//   - Valor orçado -> "Proposta 1"
//   - só monta o resumo com os 4 obrigatórios preenchidos
//   - status awaiting_confirmation; só chama submit-quote após "sim"
//   - comandos: cancelar (-> cancelled), reiniciar (limpa collected_data)

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

// ───────────────────────────────────────────────────────────────────────────

type Data = Record<string, unknown>

const REQUIRED = ['client', 'origin', 'category', 'priority'] as const
const OPTIONAL = [
  'partner',
  'size',
  'stage',
  'deadline',
  'quote_date',
  'quote_value',
  'notes',
  'drive_link',
  'seller',
] as const
const PRIORITIES = ['Baixa', 'Média', 'Alta', 'Urgente']
const SKIP = new Set(['pular', 'pula', 'skip', '-', 'nao', 'n', 'na', 'nenhum', 'sem', 'nada'])
const DONE = new Set([
  'pronto',
  'finalizar',
  'terminar',
  'resumo',
  'so isso',
  'chega',
  'pode cadastrar',
  'cadastrar',
])
const YES = new Set(['sim', 's', 'confirmar', 'confirmo', 'ok', 'isso', 'pode', 'claro', 'certo', 'blz'])
const NO = new Set(['nao', 'n', 'cancelar', 'cancela', 'negativo'])
const SKIP_SENTINEL = '__skip__'

function norm(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

// escolha por número numa lista de opções ("2" -> segunda opção)
function pickByNumber(n: string, list: string[]): string | null {
  const m = n.match(/^(\d{1,2})$/)
  if (!m) return null
  const i = parseInt(m[1], 10) - 1
  return i >= 0 && i < list.length ? list[i] : null
}
function numberedList(list: string[]): string {
  return list.map((o, i) => `${i + 1} ${o}`).join('  ·  ')
}

// ───────────────────────────────────────────────────────────────────────────

async function runEngine(conversationId: string) {
  const db = createServiceClient()

  const { data: conv } = await db
    .from('wa_conversations')
    .select('*')
    .eq('id', conversationId)
    .single()
  if (!conv) throw new Error('conversa não encontrada')

  if (['submitted', 'cancelled', 'expired', 'failed'].includes(conv.status)) {
    return { status: conv.status, skipped: 'terminal_state' }
  }

  const { data: cfg } = await db
    .from('wa_bot_config')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data: collab } = await db
    .from('wa_collaborators')
    .select('*')
    .eq('id', conv.collaborator_id)
    .single()

  const { data: lastMsg } = await db
    .from('wa_messages')
    .select('body, message_type')
    .eq('conversation_id', conversationId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const text = (lastMsg?.body ?? '').trim()
  const n = norm(text)
  const toPhone = String(conv.remote_jid ?? '').split('@')[0]
  const data: Data = { ...(conv.collected_data ?? {}) }

  const allowedOrigins: string[] = cfg?.allowed_origins ?? ['Visita', 'WhatsApp', 'Loja', 'Indicação', 'Outro']
  const allowedCategories: string[] = cfg?.allowed_categories ?? [
    'Iluminação',
    'Automação',
    'Iluminação + Automação',
  ]
  const defaultPriority: string = cfg?.default_priority ?? 'Média'

  const say = (t: string) =>
    sendWhatsappMessage({
      conversationId,
      toPhoneE164: toPhone,
      text: t,
      instanceName: cfg?.evolution_instance_name ?? null,
    })

  const save = (patch: Record<string, unknown>) =>
    db.from('wa_conversations').update(patch).eq('id', conversationId)

  // ── comandos de controle (qualquer estado) ─────────────────────────────
  if (text && (n === 'cancelar' || n === 'cancela' || n.startsWith('cancelar '))) {
    await save({ status: 'cancelled', current_field: null })
    await say('Cadastro cancelado. Quando quiser, é só me encaminhar o projeto de novo. 👋')
    return { status: 'cancelled' }
  }
  if (text && ['reiniciar', 'recomecar', 'comecar de novo', 'de novo', 'zerar'].includes(n)) {
    await save({ collected_data: {}, status: 'collecting', current_field: 'client' })
    await say('Ok, vamos recomeçar do zero.')
    await say(promptFor('client', { allowedOrigins, allowedCategories, defaultPriority }, {}))
    return { status: 'collecting', next_field: 'client' }
  }

  // ── awaiting_confirmation ──────────────────────────────────────────────
  if (conv.status === 'awaiting_confirmation') {
    if (YES.has(n)) {
      const r = await invokeFunction('submit-quote', { conversation_id: conversationId })
      const body = r.body as { success?: boolean; system_quote_id?: string } | null
      if (r.ok && body?.success) {
        return { status: 'submitted', system_quote_id: body.system_quote_id }
      }
      await save({ status: 'failed' })
      await say(
        'Recebi sua confirmação ✅ mas tive um problema ao gravar no sistema agora. ' +
          'Os dados e os arquivos estão salvos — a equipe vai concluir o cadastro. Você será avisado.',
      )
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
      await say(
        `Vamos corrigir *${label(editField)}*.\n` +
          promptFor(editField, { allowedOrigins, allowedCategories, defaultPriority }, data),
      )
      return { status: 'collecting', next_field: editField }
    }
    await say(
      'Não entendi. Responda *sim* pra cadastrar, *não* pra cancelar, ou diga o campo que quer ' +
        'corrigir (ex: "corrigir origem").',
    )
    return { status: 'awaiting_confirmation' }
  }

  // ── collecting ────────────────────────────────────────────────────────
  const cfgOpts = { allowedOrigins, allowedCategories, defaultPriority }
  let processedAnswer = false
  const currentField = conv.current_field as string | null

  if (currentField && text) {
    // "pronto/finalizar" durante os opcionais -> pula todos os restantes
    if (isOptionalStep(currentField) && DONE.has(n)) {
      for (const f of OPTIONAL) if (!(f in data)) data[f] = SKIP_SENTINEL
    } else {
      const outcome = await applyAnswer(currentField, text, n, data, cfgOpts, {
        db,
        collab,
      })
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
    }
  }

  const next = nextField(data)

  if (!next) {
    // defaults finais (docs/PROCESSO.md §4)
    if (!isPresent(data, 'priority')) data.priority = defaultPriority
    if (!isRealValue(data.quote_date)) data.quote_date = todayISO()
    for (const k of [
      '_last_prompt',
      '_bridge_sent',
      '_optionals_gate',
      '_client_candidates',
      '_client_name',
      '_partner_candidates',
      '_partner_name',
    ]) {
      delete data[k]
    }

    await save({ collected_data: data, status: 'awaiting_confirmation', current_field: null })
    await say(buildSummary(data, collab))
    return { status: 'awaiting_confirmation' }
  }

  // saudação na primeira pergunta
  const isFirst = !currentField && !hasAnyAnswer(data)
  if (isFirst) {
    await say(
      'Oi! Recebi seu projeto 📎 Vou te ajudar a cadastrar esse orçamento — ' +
        'vou perguntar um dado por vez.',
    )
  }

  // evita repetir a mesma pergunta quando chegam vários anexos seguidos sem resposta
  if (!processedAnswer && !isFirst && data._last_prompt === next) {
    return { status: 'collecting', next_field: next, silent: true }
  }

  data._last_prompt = next
  await save({ collected_data: data, current_field: next })
  await say(promptFor(next, cfgOpts, data))
  return { status: 'collecting', next_field: next }
}

// ── helpers de estado ─────────────────────────────────────────────────────

interface CfgOpts {
  allowedOrigins: string[]
  allowedCategories: string[]
  defaultPriority: string
}

function isOptionalStep(field: string): boolean {
  return (OPTIONAL as readonly string[]).includes(field)
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
  return REQUIRED.some((f) => isPresent(data, f)) || OPTIONAL.some((f) => f in data)
}

function nextField(data: Data): string | null {
  for (const f of REQUIRED) if (!isPresent(data, f)) return f
  const gate = data._optionals_gate
  if (gate !== 'yes' && gate !== 'skip') return '_gate' // pergunta se quer os opcionais
  if (gate === 'skip') return null
  for (const f of OPTIONAL) if (!(f in data)) return f
  return null
}

// ── interpretação de respostas ────────────────────────────────────────────

type Outcome =
  | { reask: string }
  | { patch?: Record<string, unknown>; next?: string }

async function applyAnswer(
  field: string,
  text: string,
  n: string,
  data: Data,
  cfg: CfgOpts,
  ctx: { db: SupabaseClient; collab: Record<string, unknown> | null },
): Promise<Outcome> {
  switch (field) {
    case '_gate': {
      if (YES.has(n)) return { patch: { _optionals_gate: 'yes' } }
      const patch: Record<string, unknown> = { _optionals_gate: 'skip' }
      for (const f of OPTIONAL) patch[f] = SKIP_SENTINEL
      return { patch }
    }

    case 'client':
      return await resolveContactStep('client', text, ctx.db)

    case 'client_pick': {
      const idx = parseInt(n.replace(/\D/g, ''), 10) - 1
      const cands = (data._client_candidates as { system_contact_id: string; name: string }[]) ?? []
      if (isNaN(idx) || idx < 0 || idx >= cands.length) {
        return { reask: `Responda o número da opção (1 a ${cands.length}).` }
      }
      return { patch: { client: cands[idx], _client_candidates: undefined } }
    }

    case 'client_phone': {
      if (SKIP.has(n)) {
        return { patch: { client: { name: data._client_name, needs_creation: true } } }
      }
      const phone = toE164(text) ?? text.trim()
      return {
        patch: { client: { name: data._client_name, phone, needs_creation: true } },
      }
    }

    case 'origin': {
      const match = pickByNumber(n, cfg.allowedOrigins) ?? cfg.allowedOrigins.find((o) => norm(o) === n)
      if (!match) return { reask: `Não entendi. Responde o número ou o nome:\n${numberedList(cfg.allowedOrigins)}` }
      return { patch: { origin: match } }
    }

    case 'category': {
      const match =
        pickByNumber(n, cfg.allowedCategories) ?? cfg.allowedCategories.find((c) => norm(c) === n)
      if (!match) {
        return { reask: `Não entendi. Responde o número ou o nome:\n${numberedList(cfg.allowedCategories)}` }
      }
      return { patch: { category: match } }
    }

    case 'priority': {
      if (!text || SKIP.has(n)) return { patch: { priority: cfg.defaultPriority } }
      const match = pickByNumber(n, PRIORITIES) ?? PRIORITIES.find((p) => norm(p) === n)
      if (!match) return { reask: `Não entendi. Responde o número ou o nome:\n${numberedList(PRIORITIES)}` }
      return { patch: { priority: match } }
    }

    case 'partner': {
      if (SKIP.has(n)) return { patch: { partner: SKIP_SENTINEL } }
      const r = await resolveContactStep('partner', text, ctx.db)
      return r
    }
    case 'partner_pick': {
      const idx = parseInt(n.replace(/\D/g, ''), 10) - 1
      const cands = (data._partner_candidates as { system_contact_id: string; name: string }[]) ?? []
      if (isNaN(idx) || idx < 0 || idx >= cands.length) {
        return { reask: `Responda o número da opção (1 a ${cands.length}).` }
      }
      return { patch: { partner: cands[idx], _partner_candidates: undefined } }
    }

    case 'size':
    case 'stage':
    case 'notes':
      return { patch: { [field]: SKIP.has(n) ? SKIP_SENTINEL : text.trim() } }

    case 'deadline': {
      if (SKIP.has(n)) return { patch: { deadline: SKIP_SENTINEL } }
      const parsed = parseDate(n)
      return { patch: { deadline: parsed ?? text.trim() } } // o endpoint normaliza/anula
    }

    case 'drive_link': {
      if (SKIP.has(n)) return { patch: { drive_link: SKIP_SENTINEL } }
      if (!/^https?:\/\/\S+/i.test(text.trim())) {
        return { reask: 'Manda o link completo (começando com http). Ou responda *pular*.' }
      }
      return { patch: { drive_link: text.trim() } }
    }

    case 'quote_date': {
      if (SKIP.has(n)) return { patch: { quote_date: todayISO() } }
      const parsed = parseDate(n)
      if (!parsed) return { reask: 'Não entendi a data. Use dd/mm/aaaa, "hoje" ou *pular*.' }
      return { patch: { quote_date: parsed } }
    }

    case 'quote_value': {
      if (SKIP.has(n)) return { patch: { quote_value: SKIP_SENTINEL } }
      const value = parseMoney(text)
      if (value === null) return { reask: 'Valor inválido. Manda só o número (ex: 12500 ou 12.500,00) ou *pular*.' }
      return { patch: { quote_value: value } }
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
      return { reask: 'Não achei esse vendedor. Tenta o nome como está no sistema, ou *pular*.' }
    }

    default:
      return { patch: {} }
  }
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
    const list = cands.map((c, i) => `${i + 1}. ${c.name}${c.phone ? ` (${c.phone})` : ''}`).join('\n')
    return {
      patch: {
        [`_${role}_candidates`]: cands,
        [`_${role}_name`]: name,
      },
      next: `${role}_pick`,
      // prompt para o _pick é montado a partir de _candidates
    } as Outcome
  }

  // sem match / resolve-contact ainda não implementado
  if (role === 'partner') {
    return { patch: { partner: { name: name.trim(), needs_creation: true } } }
  }
  return { patch: { _client_name: name.trim() }, next: 'client_phone' }
}

// ── prompts ───────────────────────────────────────────────────────────────

function promptFor(field: string, cfg: CfgOpts, data: Data): string {
  switch (field) {
    case 'client':
      return 'Quem é o *cliente*? (nome)'
    case 'client_pick':
    case 'partner_pick': {
      const key = field === 'client_pick' ? '_client_candidates' : '_partner_candidates'
      const cands = (data[key] as { name: string; phone?: string }[]) ?? []
      const list = cands
        .map((c, i) => `${i + 1}. ${c.name}${c.phone ? ` (${c.phone})` : ''}`)
        .join('\n')
      return `Achei mais de um contato:\n${list}\nQual? (responda o número)`
    }
    case 'client_phone':
      return 'Não achei esse cliente nos contatos. Qual o *telefone* dele? (ou *pular* pra cadastrar sem telefone)'
    case '_gate':
      return (
        'Só o essencial já dá pra cadastrar. Quer adicionar mais detalhes? ' +
        '(parceiro, porte, prazo, valor, observações, link, vendedor)\n' +
        'Responde *não* pra cadastrar já, ou *sim* pra completar.'
      )
    case 'origin':
      return `*Origem?*\n${numberedList(cfg.allowedOrigins)}`
    case 'category':
      return `*Categoria?*\n${numberedList(cfg.allowedCategories)}`
    case 'priority':
      return `*Prioridade?*\n${numberedList(PRIORITIES)}\n(ou *pular* pra ${cfg.defaultPriority})`
    case 'partner':
      return 'Tem *parceiro/especificador*? (nome do arquiteto/engenheiro/designer — ou *pular*)'
    case 'size':
      return '*Porte* da obra? (ou *pular*)'
    case 'stage':
      return '*Etapa* da obra? (ex: projeto, execução, acabamento — ou *pular*)'
    case 'deadline':
      return '*Prazo*? (dd/mm/aaaa — ou *pular*)'
    case 'quote_date':
      return '*Data do orçamento*? (dd/mm/aaaa — ou *pular* pra usar hoje)'
    case 'quote_value':
      return '*Valor orçado*? Entra como Proposta 1. (ou *pular*)'
    case 'notes':
      return '*Observações*? (ou *pular*)'
    case 'drive_link':
      return '*Link do Google Drive* do projeto? (ou *pular*)'
    case 'seller':
      return '*Vendedor responsável*? (nome — ou *pular* pra usar você mesmo)'
    default:
      return 'Pode mandar.'
  }
}

function label(field: string): string {
  const m: Record<string, string> = {
    client: 'Cliente',
    origin: 'Origem',
    category: 'Categoria',
    priority: 'Prioridade',
    partner: 'Parceiro',
    size: 'Porte',
    stage: 'Etapa',
    deadline: 'Prazo',
    quote_date: 'Data do orçamento',
    quote_value: 'Valor orçado',
    notes: 'Observações',
    drive_link: 'Link do Drive',
    seller: 'Vendedor responsável',
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
  if (/etapa/.test(n)) return 'stage'
  if (/prazo/.test(n)) return 'deadline'
  if (/data/.test(n)) return 'quote_date'
  if (/valor|proposta/.test(n)) return 'quote_value'
  if (/observ|obs/.test(n)) return 'notes'
  if (/drive|link/.test(n)) return 'drive_link'
  if (/vendedor|respons/.test(n)) return 'seller'
  return null
}

// ── resumo ────────────────────────────────────────────────────────────────

function buildSummary(data: Data, collab: Record<string, unknown> | null): string {
  const client = data.client as { name?: string; phone?: string; needs_creation?: boolean } | undefined
  const partner = data.partner as { name?: string } | string | undefined
  const seller = data.seller as { display_name?: string; defaulted?: boolean } | string | undefined

  const clientLine = client
    ? client.needs_creation
      ? `${client.name}${client.phone ? ` — ${client.phone}` : ''} (novo contato)`
      : client.name ?? '—'
    : '—'
  const partnerLine =
    partner && partner !== SKIP_SENTINEL
      ? typeof partner === 'string'
        ? partner
        : partner.name ?? '—'
      : '—'
  const sellerLine =
    seller && seller !== SKIP_SENTINEL
      ? typeof seller === 'string'
        ? seller
        : `${seller.display_name ?? '—'}${seller.defaulted ? ' (você)' : ''}`
      : `${collab?.display_name ?? 'você'} (você)`

  const opt = (k: string) => (isRealValue(data[k]) ? String(data[k]) : '—')
  const money = isRealValue(data.quote_value)
    ? `R$ ${Number(data.quote_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    : '—'
  const date = isRealValue(data.quote_date)
    ? fmtDate(String(data.quote_date))
    : fmtDate(todayISO())

  return [
    '📋 *Resumo do orçamento*',
    '',
    `*Cliente:* ${clientLine}`,
    `*Parceiro:* ${partnerLine}`,
    `*Origem:* ${data.origin ?? '—'}`,
    `*Categoria:* ${data.category ?? '—'}`,
    `*Prioridade:* ${data.priority ?? '—'}`,
    `*Porte:* ${opt('size')}`,
    `*Etapa:* ${opt('stage')}`,
    `*Prazo:* ${opt('deadline')}`,
    `*Data do orçamento:* ${date}`,
    `*Valor (Proposta 1):* ${money}`,
    `*Observações:* ${opt('notes')}`,
    `*Link do Drive:* ${opt('drive_link')}`,
    `*Vendedor responsável:* ${sellerLine}`,
    '',
    'Confirma? Responda *sim* pra cadastrar, *não* pra cancelar, ou diga o que corrigir (ex: "corrigir origem").',
  ].join('\n')
}

// ── parsing utilitário ────────────────────────────────────────────────────

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
  if (isNaN(d.getTime())) return null
  return iso
}

function fmtDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

function parseMoney(text: string): number | null {
  let s = text.replace(/[^\d.,]/g, '')
  if (!s) return null
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (s.includes(',')) {
    s = s.replace(',', '.')
  }
  const v = parseFloat(s)
  return isNaN(v) || v < 0 ? null : Math.round(v * 100) / 100
}
