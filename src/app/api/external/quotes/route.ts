import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/external/quotes — gravação de orçamento pelo Robô de Orçamentos
// WhatsApp (Edge Function submit-quote). Única via de escrita no banco de
// negócio a partir do robô; reusa as regras do sistema (status inicial 'queue',
// proposta 1, atividade, e o que os triggers dispararem depois).
//
// Auth: EXTERNAL_API_KEY (header x-api-key ou Bearer).

export const dynamic = 'force-dynamic'

const ORIGIN: Record<string, string> = {
  visita: 'visit', whatsapp: 'whatsapp', loja: 'store', 'indicacao': 'referral', outro: 'other',
  visit: 'visit', store: 'store', referral: 'referral', other: 'other',
}
const CATEGORY: Record<string, string> = {
  'iluminacao': 'lighting', 'automacao': 'automation', 'iluminacao + automacao': 'both',
  lighting: 'lighting', automation: 'automation', both: 'both',
}
const PRIORITY: Record<string, string> = {
  baixa: 'low', 'media': 'normal', alta: 'high', urgente: 'urgent',
  low: 'low', normal: 'normal', high: 'high', urgent: 'urgent',
}
const SIZE: Record<string, string> = {
  pequeno: 'small', pequena: 'small', 'medio': 'medium', 'media': 'medium',
  grande: 'large', small: 'small', medium: 'medium', large: 'large',
}
const STAGE: Record<string, string> = {
  projeto: 'project', 'execucao': 'execution', obra: 'execution',
  acabamento: 'finishing', entregue: 'delivered', entrega: 'delivered',
  project: 'project', execution: 'execution', finishing: 'finishing', delivered: 'delivered',
}
const CONTACT_TYPES = new Set([
  'client', 'architect', 'designer', 'engineer', 'other', 'plasterer', 'electrician', 'carpenter',
])

function norm(s: unknown): string {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}
function mapEnum(table: Record<string, string>, v: unknown): string | null {
  return table[norm(v)] ?? null
}

function authorized(req: NextRequest): boolean {
  const key =
    req.headers.get('x-api-key') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    ''
  const expected = process.env.EXTERNAL_API_KEY
  return !!expected && key === expected
}

interface ContactInput {
  system_contact_id?: string | null
  name?: string | null
  phone?: string | null
  create?: boolean
  type?: string | null
}
interface QuoteBody {
  conversation_id?: string
  client?: ContactInput
  partner?: ContactInput | null
  origin?: string
  category?: string
  priority?: string
  size?: string | null
  work_stage?: string | null
  deadline?: string | null
  quote_date?: string | null
  quoted_value?: number | null
  notes?: string | null
  drive_link?: string | null
  primary_owner_id?: string | null
  collaborator_ids?: string[]
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: QuoteBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const db = createAdminClient()

  // ── contato: cliente (obrigatório) ─────────────────────────────────────
  let clientId = body.client?.system_contact_id ?? null
  if (!clientId) {
    const name = body.client?.name?.trim()
    if (!name) return NextResponse.json({ error: 'client_required' }, { status: 422 })
    const { data: created, error } = await db
      .from('contacts')
      .insert({
        name,
        phone: body.client?.phone?.trim() || null,
        type: 'client',
        created_by: body.primary_owner_id || null,
      })
      .select('id')
      .single()
    if (error) return NextResponse.json({ error: `client_create_failed: ${error.message}` }, { status: 500 })
    clientId = created.id
  }

  // ── contato: parceiro/especificador (opcional) ─────────────────────────
  let architectId: string | null = body.partner?.system_contact_id ?? null
  if (!architectId && body.partner?.name?.trim()) {
    const ptype = body.partner.type && CONTACT_TYPES.has(body.partner.type) ? body.partner.type : 'architect'
    const { data: created, error } = await db
      .from('contacts')
      .insert({
        name: body.partner.name.trim(),
        phone: body.partner.phone?.trim() || null,
        type: ptype,
        created_by: body.primary_owner_id || null,
      })
      .select('id')
      .single()
    if (!error) architectId = created.id
    else console.error('partner_create_failed', error.message)
  }

  // ── orçamento ─────────────────────────────────────────────────────────
  const origin = mapEnum(ORIGIN, body.origin) ?? 'whatsapp'
  const category = mapEnum(CATEGORY, body.category)
  const priority = mapEnum(PRIORITY, body.priority) ?? 'normal'
  if (!category) return NextResponse.json({ error: 'category_invalid' }, { status: 422 })

  const quoteId = crypto.randomUUID()
  const { error: quoteError } = await db.from('quotes').insert({
    id: quoteId,
    client_id: clientId,
    architect_id: architectId,
    origin,
    category,
    priority,
    size: mapEnum(SIZE, body.size),
    work_stage: mapEnum(STAGE, body.work_stage),
    deadline: body.deadline || null,
    quote_date: body.quote_date || new Date().toISOString().split('T')[0],
    quoted_value: typeof body.quoted_value === 'number' ? body.quoted_value : null,
    notes: body.notes?.trim() || null,
    drive_link: body.drive_link?.trim() || null,
    status: 'queue',
  })
  if (quoteError) {
    return NextResponse.json({ error: `quote_create_failed: ${quoteError.message}` }, { status: 500 })
  }

  // ── donos ────────────────────────────────────────────────────────────
  const owners: { quote_id: string; user_id: string; role: string }[] = []
  if (body.primary_owner_id) {
    owners.push({ quote_id: quoteId, user_id: body.primary_owner_id, role: 'primary' })
  }
  for (const uid of body.collaborator_ids ?? []) {
    if (uid && uid !== body.primary_owner_id) {
      owners.push({ quote_id: quoteId, user_id: uid, role: 'collaborator' })
    }
  }
  if (owners.length) {
    const { error } = await db.from('quote_owners').insert(owners)
    if (error) console.error('quote_owners_failed', error.message)
  }

  // ── Proposta 1 ───────────────────────────────────────────────────────
  if (typeof body.quoted_value === 'number' && body.quoted_value > 0) {
    const { error } = await db.from('quote_proposals').insert({
      quote_id: quoteId,
      value: body.quoted_value,
      date: body.quote_date || new Date().toISOString().split('T')[0],
      info: 'Proposta 1',
    })
    if (error) console.error('proposal_failed', error.message)
  }

  // ── atividade (best-effort) ──────────────────────────────────────────
  if (body.primary_owner_id) {
    await db
      .from('activities')
      .insert({
        quote_id: quoteId,
        user_id: body.primary_owner_id,
        type: 'status_change',
        description: 'Orçamento criado pelo Robô de Orçamentos WhatsApp',
        metadata: { to: 'queue', source: 'wa_robot', conversation_id: body.conversation_id ?? null },
      })
      .then(({ error }) => error && console.error('activity_failed', error.message))
  }

  const { data: saved } = await db
    .from('quotes')
    .select('id, number')
    .eq('id', quoteId)
    .single()

  return NextResponse.json({
    id: quoteId,
    number: saved?.number ?? null,
    system_quote_id: saved?.number ? String(saved.number) : quoteId,
    client_id: clientId,
    architect_id: architectId,
  })
}
