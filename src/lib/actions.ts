'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { QuoteStatus, NegTemperature } from '@/types'

// Injeta avatar_url nos owners e payment_splits (a view quotes_full não traz esses campos)
async function enrichOwnersAvatars(quotes: any[]) {
  if (!quotes.length) return quotes
  const admin = createAdminClient()
  const ids = Array.from(new Set(
    quotes.flatMap(q => (q.owners ?? []).map((o: any) => o.user_id)).filter(Boolean)
  ))
  const quoteIds = quotes.map(q => q.id).filter(Boolean)

  const architectIds = Array.from(new Set(quotes.map(q => q.architect_id).filter(Boolean)))

  const [usersRes, negRes, proposalsRes, architectsRes] = await Promise.all([
    ids.length ? admin.from('users').select('id, avatar_url').in('id', ids) : Promise.resolve({ data: [] }),
    quoteIds.length ? admin.from('negotiations').select('quote_id, payment_splits, temperature_updated_at, last_auto_demoted_at, last_promoted_at, is_flagged_alert, flagged_alert_at').in('quote_id', quoteIds) : Promise.resolve({ data: [] }),
    quoteIds.length ? admin.from('quote_proposals').select('quote_id').in('quote_id', quoteIds) : Promise.resolve({ data: [] }),
    architectIds.length ? admin.from('contacts').select('id, type').in('id', architectIds) : Promise.resolve({ data: [] }),
  ])
  const avatarMap = new Map((usersRes.data ?? []).map((u: any) => [u.id, u.avatar_url]))
  const splitsMap = new Map((negRes.data ?? []).map((n: any) => [n.quote_id, n.payment_splits ?? []]))
  const tempUpdatedMap = new Map((negRes.data ?? []).map((n: any) => [n.quote_id, n.temperature_updated_at]))
  const lastAutoDemotedMap = new Map((negRes.data ?? []).map((n: any) => [n.quote_id, n.last_auto_demoted_at]))
  const lastPromotedMap = new Map((negRes.data ?? []).map((n: any) => [n.quote_id, n.last_promoted_at]))
  const isFlaggedAlertMap = new Map((negRes.data ?? []).map((n: any) => [n.quote_id, n.is_flagged_alert ?? false]))
  const flaggedAlertAtMap = new Map((negRes.data ?? []).map((n: any) => [n.quote_id, n.flagged_alert_at]))
  const proposalCountMap = new Map<string, number>()
  for (const p of (proposalsRes.data ?? [])) {
    proposalCountMap.set(p.quote_id, (proposalCountMap.get(p.quote_id) ?? 0) + 1)
  }
  const architectTypeMap = new Map((architectsRes.data ?? []).map((a: any) => [a.id, a.type]))

  return quotes.map(q => ({
    ...q,
    owners: (q.owners ?? []).map((o: any) => ({ ...o, avatar_url: avatarMap.get(o.user_id) ?? null })),
    payment_splits: splitsMap.get(q.id) ?? [],
    proposal_count: proposalCountMap.get(q.id) ?? 0,
    temperature_updated_at: tempUpdatedMap.get(q.id) ?? null,
    last_auto_demoted_at: lastAutoDemotedMap.get(q.id) ?? null,
    last_promoted_at: lastPromotedMap.get(q.id) ?? null,
    is_flagged_alert: isFlaggedAlertMap.get(q.id) ?? false,
    flagged_alert_at: flaggedAlertAtMap.get(q.id) ?? null,
    architect_type: architectTypeMap.get(q.architect_id) ?? null,
  }))
}

export async function getMyQuotes() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from('quotes_full')
    .select('*')
    .filter('owners', 'cs', JSON.stringify([{ user_id: user.id }]))
    .order('created_at', { ascending: false })
  return enrichOwnersAvatars(data ?? [])
}

export async function getAllQuotes() {
  const { data } = await createAdminClient()
    .from('quotes_full')
    .select('*')
    .order('created_at', { ascending: false })
  return enrichOwnersAvatars(data ?? [])
}

export async function getQuoteById(id: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('quotes_full')
    .select('*')
    .eq('id', id)
    .single()
  if (!data) return data
  const [enriched] = await enrichOwnersAvatars([data])
  return enriched
}

export async function getQuoteActivities(quoteId: string) {
  const supabase = createClient()
  const admin = createAdminClient()

  const [{ data: activities }, { data: tempHistory }] = await Promise.all([
    supabase
      .from('activities')
      .select('*, user:users(name, avatar_color, avatar_url)')
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: false }),
    admin
      .from('neg_temperature_history')
      .select('created_at, auto_demoted')
      .eq('quote_id', quoteId),
  ])

  // Monta set de timestamps que foram auto-demotions
  const autoDemotedTimes = new Set(
    (tempHistory ?? [])
      .filter((h: any) => h.auto_demoted)
      .map((h: any) => new Date(h.created_at).toISOString().substring(0, 16)) // minuto
  )

  return (activities ?? []).map((a: any) => ({
    ...a,
    // Marca como sistema se: type=system, user_id null, ou timestamp coincide com auto_demotion
    is_system: a.type === 'system' || !a.user_id ||
      (a.description?.includes('Negociação') && a.description?.includes('→') &&
       autoDemotedTimes.has(new Date(a.created_at).toISOString().substring(0, 16))),
  }))
}

export async function createQuote(formData: {
  client_id: string
  architect_id?: string
  origin: string
  paid_traffic_type?: string | null
  category: string
  size?: string
  work_stage?: string
  priority: string
  deadline?: string
  quote_date?: string
  quoted_value?: number
  notes?: string
  drive_link?: string
  primary_owner_id?: string | null
  collaborator_ids?: string[]
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const quoteId = crypto.randomUUID()
  const { error: quoteError } = await supabase
    .from('quotes')
    .insert({
      id: quoteId,
      client_id: formData.client_id,
      architect_id: formData.architect_id || null,
      origin: formData.origin,
      paid_traffic_type: formData.paid_traffic_type || null,
      category: formData.category,
      size: formData.size || null,
      work_stage: formData.work_stage || null,
      priority: formData.priority || 'normal',
      deadline: formData.deadline || null,
      quote_date: formData.quote_date || new Date().toISOString().split('T')[0],
      quoted_value: formData.quoted_value || null,
      notes: formData.notes || null,
      drive_link: formData.drive_link || null,
      status: 'queue',
    })

  if (quoteError) return { error: quoteError.message }

  const owners: { quote_id: string; user_id: string; role: string }[] = []
  if (formData.primary_owner_id) {
    owners.push({ quote_id: quoteId, user_id: formData.primary_owner_id, role: 'primary' })
  }
  if (formData.collaborator_ids?.length) {
    formData.collaborator_ids.forEach(uid => {
      if (uid !== formData.primary_owner_id) owners.push({ quote_id: quoteId, user_id: uid, role: 'collaborator' })
    })
  }
  if (owners.length > 0) await supabase.from('quote_owners').insert(owners)

  await supabase.from('activities').insert({
    quote_id: quoteId, user_id: user.id,
    type: 'status_change', description: 'Orçamento criado', metadata: { to: 'queue' },
  })

  revalidatePath('/dashboard')
  revalidatePath('/quotes')
  return { data: { id: quoteId } }
}

export async function deleteQuote(quoteId: string) {
  const supabase = createClient()
  const { error } = await supabase.from('quotes').delete().eq('id', quoteId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  revalidatePath('/quotes')
  return { ok: true }
}

export async function deleteQuotes(quoteIds: string[]) {
  if (!quoteIds || quoteIds.length === 0) return { error: 'Nenhum orçamento selecionado' }

  const supabase = createClient()
  const { error } = await supabase.from('quotes').delete().in('id', quoteIds)
  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  revalidatePath('/quotes')
  return { ok: true }
}

export async function updateQuoteStatus(quoteId: string, status: QuoteStatus) {
  // Cliente autenticado: o trigger de atividades precisa de auth.uid().
  // A liberação p/ todos os colaboradores é feita via política de RLS (ver migração quotes_collab_rls).
  const supabase = createClient()
  const { error } = await supabase.from('quotes').update({ status }).eq('id', quoteId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  revalidatePath('/quotes')
  return { ok: true }
}

// Ordem de temperatura para determinar direção da mudança
const TEMP_ORDER: Record<string, number> = { no_forecast: 0, cold: 1, warm: 2, hot: 3 }

export async function updateTemperature(quoteId: string, temperature: NegTemperature) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()
  const { data: currentNeg } = await admin
    .from('negotiations')
    .select('temperature')
    .eq('quote_id', quoteId)
    .maybeSingle()
  const fromTemp = currentNeg?.temperature ?? null

  // Determina direção: promoveu (subiu) ou rebaixou (desceu)
  const fromOrder = fromTemp ? (TEMP_ORDER[fromTemp] ?? -1) : -1
  const toOrder = TEMP_ORDER[temperature] ?? -1
  const now = new Date().toISOString()
  const promoted = toOrder > fromOrder
  const demoted = toOrder < fromOrder

  const negUpdate: Record<string, any> = {
    quote_id: quoteId,
    temperature,
    temperature_updated_at: now,
    // Limpa o badge oposto ao movimento
    ...(promoted ? { last_promoted_at: now, last_auto_demoted_at: null } : {}),
    ...(demoted  ? { last_auto_demoted_at: now, last_promoted_at: null } : {}),
  }

  const { error } = await supabase
    .from('negotiations')
    .upsert(negUpdate, { onConflict: 'quote_id' })
  if (error) return { error: error.message }

  await admin.from('neg_temperature_history').insert({
    quote_id: quoteId,
    from_temp: fromTemp,
    to_temp: temperature,
    auto_demoted: false,
    created_by: user?.id ?? null,
  })

  revalidatePath('/dashboard')
  revalidatePath('/quotes')
  revalidatePath('/negotiations')
  return { ok: true }
}

export async function toggleAlertFlag(quoteId: string) {
  const supabase = createClient()
  const admin = createAdminClient()

  const { data: current } = await admin
    .from('negotiations')
    .select('is_flagged_alert')
    .eq('quote_id', quoteId)
    .maybeSingle()

  const newFlagState = !current?.is_flagged_alert
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('negotiations')
    .upsert({
      quote_id: quoteId,
      is_flagged_alert: newFlagState,
      flagged_alert_at: newFlagState ? now : null,
    }, { onConflict: 'quote_id' })

  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  revalidatePath('/quotes')
  revalidatePath('/negotiations')
  return { ok: true, flagged: newFlagState }
}

export async function getNegotiationHistory(quoteId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('neg_temperature_history')
    .select('*')
    .eq('quote_id', quoteId)
    .order('created_at', { ascending: false })
    .limit(20)
  return data ?? []
}

export async function getNegotiationTemperatureInfo(quoteId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('negotiations')
    .select('temperature, temperature_updated_at')
    .eq('quote_id', quoteId)
    .maybeSingle()
  return data ?? null
}

export async function recordTemperatureDemotion(
  quoteId: string,
  fromTemp: string,
  toTemp: string,
  reason?: string,
  reasonText?: string
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('negotiations')
    .update({ temperature: toTemp, temperature_updated_at: new Date().toISOString() })
    .eq('quote_id', quoteId)
  if (error) return { error: error.message }
  const admin = createAdminClient()
  await admin.from('neg_temperature_history').insert({
    quote_id: quoteId, from_temp: fromTemp, to_temp: toTemp,
    auto_demoted: false, reason: reason ?? null, reason_text: reasonText ?? null,
    created_by: user?.id ?? null,
  })
  revalidatePath(`/quotes/${quoteId}`)
  revalidatePath('/negotiations')
  return {}
}

export async function backfillNegotiationTemperatures() {
  // Corrige temperature_updated_at de todas as negociações usando o histórico de activities
  // Busca em lote (2 queries totais) para não sobrecarregar
  const admin = createAdminClient()

  const [{ data: negs }, { data: allActs }] = await Promise.all([
    admin.from('negotiations').select('quote_id, temperature, created_at').not('temperature', 'in', '(closed,lost)'),
    admin.from('activities').select('quote_id, created_at, user_id, description').like('description', 'Negociação %→%').order('created_at', { ascending: true }),
  ])

  if (!negs?.length) return { updated: 0 }

  // Indexa atividades por quote_id
  const actsByQuote = new Map<string, typeof allActs>()
  for (const act of allActs ?? []) {
    if (!actsByQuote.has(act.quote_id)) actsByQuote.set(act.quote_id, [])
    actsByQuote.get(act.quote_id)!.push(act)
  }

  const updates: { quote_id: string; temperature_updated_at: string }[] = []
  const historyInserts: object[] = []

  for (const neg of negs) {
    const acts = actsByQuote.get(neg.quote_id) ?? []

    // Última atividade que mudou para o status atual
    const lastChange = [...acts].reverse().find(a => a.description.endsWith(`→ ${neg.temperature}`))
    const newUpdatedAt = lastChange?.created_at ?? neg.created_at ?? new Date().toISOString()
    updates.push({ quote_id: neg.quote_id, temperature_updated_at: newUpdatedAt })

    // Prepara inserções no histórico
    for (const act of acts) {
      const parts = act.description.replace('Negociação ', '').split('→')
      if (parts.length < 2) continue
      historyInserts.push({
        quote_id: act.quote_id,
        from_temp: parts[0].trim(),
        to_temp: parts[1].trim(),
        auto_demoted: false,
        created_at: act.created_at,
        created_by: act.user_id ?? null,
      })
    }
  }

  // Atualiza temperature_updated_at em lote (um por um pois não tem upsert multi-pk aqui)
  for (const u of updates) {
    await admin.from('negotiations').update({ temperature_updated_at: u.temperature_updated_at }).eq('quote_id', u.quote_id)
  }

  // Insere histórico ignorando conflitos (se já existir a coluna de unicidade)
  if (historyInserts.length) {
    await admin.from('neg_temperature_history').upsert(historyInserts as any, { ignoreDuplicates: true, onConflict: 'quote_id,created_at' })
  }

  return { updated: updates.length }
}

export async function checkAndDemoteNegotiations() {
  // Usa cliente autenticado para o UPDATE em negotiations (trigger de activities requer auth.uid())
  const supabase = createClient()
  const admin = createAdminClient()
  const now = new Date()

  const { data: negs } = await admin
    .from('negotiations')
    .select('quote_id, temperature, temperature_updated_at')
    .not('temperature', 'in', '(closed,lost)')

  if (!negs?.length) return { demoted: 0 }

  const LIMITS: Record<string, number> = { hot: 2, warm: 10, cold: 20 }
  const NEXT: Record<string, string> = { hot: 'warm', warm: 'cold', cold: 'no_forecast' }

  const demotions: { quote_id: string; from_temp: string; to_temp: string }[] = []

  for (const neg of negs) {
    const limit = LIMITS[neg.temperature]
    if (!limit) continue
    const updatedAt = neg.temperature_updated_at ? new Date(neg.temperature_updated_at) : null
    if (!updatedAt) continue
    const daysDiff = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24)
    if (daysDiff >= limit) {
      const nextTemp = NEXT[neg.temperature]
      if (nextTemp) {
        demotions.push({ quote_id: neg.quote_id, from_temp: neg.temperature, to_temp: nextTemp })
      }
    }
  }

  if (!demotions.length) return { demoted: 0 }

  const TEMP_PT: Record<string, string> = { cold: 'Frio', warm: 'Morno', hot: 'Quente', no_forecast: 'Sem previsão', closed: 'Fechada', lost: 'Perdida' }

  for (const d of demotions) {
    // Admin client: sem auth.uid(), trigger não cria activity (trigger tem IF auth.uid() IS NOT NULL)
    await admin.from('negotiations')
      .update({ temperature: d.to_temp, temperature_updated_at: now.toISOString(), last_auto_demoted_at: now.toISOString() })
      .eq('quote_id', d.quote_id)
    // Histórico sem trigger, pode usar admin
    await admin.from('neg_temperature_history').insert({
      quote_id: d.quote_id, from_temp: d.from_temp, to_temp: d.to_temp,
      auto_demoted: true, reason: 'auto',
      created_at: now.toISOString(),
    })
    // Activity com user_id null para indicar ação do sistema
    await admin.from('activities').insert({
      quote_id: d.quote_id,
      user_id: null,
      type: 'system',
      description: `🤖 Rebaixado automaticamente — Negociação ${TEMP_PT[d.from_temp] ?? d.from_temp} → ${TEMP_PT[d.to_temp] ?? d.to_temp} (tempo limite atingido)`,
      created_at: now.toISOString(),
    })
  }

  revalidatePath('/negotiations')
  revalidatePath('/dashboard')

  return { demoted: demotions.length, demotions }
}

export async function getCriticalNegotiations() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('quotes_full')
    .select('id, number, client_name, work_stage, priority, temperature')
    .in('work_stage', ['finishing', 'delivered'])
    .not('temperature', 'in', '(closed,lost)')
    .in('temperature', ['no_forecast', 'cold', 'warm'])
  return data ?? []
}

export async function getFlaggedAlerts() {
  const admin = createAdminClient()
  // Busca negociações flagadas
  const { data: flagged } = await admin
    .from('negotiations')
    .select('quote_id, is_flagged_alert, flagged_alert_at, temperature')
    .eq('is_flagged_alert', true)
    .not('temperature', 'in', '(closed,lost)')
    .order('flagged_alert_at', { ascending: true })

  if (!flagged?.length) return []

  // Busca dados dos quotes
  const quoteIds = flagged.map(f => f.quote_id)
  const { data: quotes } = await admin
    .from('quotes_full')
    .select('id, number, client_name, temperature, priority, owners:quote_owners(user_id, name, avatar_color)')
    .in('id', quoteIds)

  // Mescla dados
  const quoteMap = new Map(quotes?.map((q: any) => [q.id, q]) ?? [])
  return flagged.map(f => ({ ...quoteMap.get(f.quote_id), flagged_alert_at: f.flagged_alert_at }))
}

export async function getPaymentRates() {
  const { data } = await createAdminClient()
    .from('payment_method_rates')
    .select('*')
    .order('sort_order')
  return data ?? []
}

export async function updatePaymentRate(id: string, updates: { machine_fee_pct?: number; max_discount_pct?: number; label?: string }) {
  const { error } = await createAdminClient()
    .from('payment_method_rates')
    .update(updates)
    .eq('id', id)
  if (error) throw new Error(error.message)
}

function methodKeyToEnum(key: string): string {
  if (key === 'pix') return 'pix'
  if (key === 'cash') return 'cash'
  if (key === 'debit') return 'card'
  if (key.startsWith('credit')) return 'card'
  return 'other'
}

export async function updateSalePayment(quoteId: string, data: {
  final_value: number
  payment_splits: { method_key: string; amount: number; status?: string; date?: string }[]
}) {
  const supabase = createClient()
  const primaryMethod = methodKeyToEnum(data.payment_splits[0]?.method_key ?? 'pix')
  const { error } = await supabase
    .from('negotiations')
    .update({
      final_value: data.final_value,
      payment_method: primaryMethod,
      payment_splits: data.payment_splits,
    })
    .eq('quote_id', quoteId)
  if (error) throw new Error(error.message)
  revalidatePath('/quotes')
}

export async function closeSale(quoteId: string, data: {
  final_value: number
  payment_method: string
  payment_splits?: { method_key: string; amount: number; status?: string; date?: string }[]
  notes?: string
  update_quoted_value?: boolean
}) {
  const supabase = createClient()
  const { error: negError } = await supabase
    .from('negotiations')
    .upsert({
      quote_id: quoteId, temperature: 'closed',
      final_value: data.final_value,
      payment_method: methodKeyToEnum(data.payment_method),
      payment_splits: data.payment_splits ?? [],
      closed_at: new Date().toISOString().split('T')[0], notes: data.notes || null,
    }, { onConflict: 'quote_id' })
  if (negError) return { error: negError.message }
  const quoteUpdate: Record<string, any> = { status: 'done' }
  if (data.update_quoted_value) quoteUpdate.quoted_value = data.final_value
  const { error: updateError } = await supabase.from('quotes').update(quoteUpdate).eq('id', quoteId)
  if (updateError) return { error: updateError.message }

  // Create shipment automatically after closing sale (use admin to bypass RLS)
  // Insere só se ainda não existir (evita depender de unique constraint p/ upsert)
  {
    const adminShip = createAdminClient()
    const { data: existingShip } = await adminShip.from('shipments').select('id').eq('quote_id', quoteId).maybeSingle()
    if (!existingShip) {
      await adminShip.from('shipments').insert({ quote_id: quoteId })
    }
  }

  // Create commission if quote has a partner with commission_rate > 0
  const admin = createAdminClient()
  const { data: quote } = await admin.from('quotes').select('architect_id, quoted_value').eq('id', quoteId).single()
  if (quote?.architect_id) {
    const { data: contact } = await admin.from('contacts').select('commission_rate').eq('id', quote.architect_id).single()
    const rate = Number(contact?.commission_rate ?? 0)
    if (rate > 0) {
      const saleValue = data.final_value || Number(quote.quoted_value ?? 0)
      const amount = parseFloat(((saleValue * rate) / 100).toFixed(2))
      const closedAt = new Date()
      const dueDate = new Date(closedAt)
      dueDate.setDate(dueDate.getDate() + 30)
      await admin.from('commissions').upsert({
        contact_id: quote.architect_id,
        quote_id: quoteId,
        quote_value: saleValue,
        rate,
        amount,
        due_date: dueDate.toISOString().split('T')[0],
        status: 'scheduled',
      }, { onConflict: 'quote_id,contact_id' })
    }
  }

  revalidatePath('/dashboard')
  revalidatePath('/quotes')
  revalidatePath('/shipping')
  revalidatePath('/partners')
  return { ok: true }
}

export async function markAsLost(quoteId: string, loss_reason: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('negotiations')
    .upsert({ quote_id: quoteId, temperature: 'lost', loss_reason }, { onConflict: 'quote_id' })
  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function addActivity(quoteId: string, description: string, type = 'note') {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const { error } = await supabase.from('activities').insert({
    quote_id: quoteId, user_id: user.id, type, description,
  })
  if (error) return { error: error.message }
  revalidatePath(`/quotes/${quoteId}`)
  return { ok: true }
}

export async function searchContacts(query: string, type?: string, excludeType?: string) {
  const supabase = createClient()
  let q = supabase.from('contacts').select('id, name, phone, type, company').ilike('name', `%${query}%`)
  if (excludeType) q = q.neq('type', excludeType)
  else if (type) q = q.eq('type', type)
  const { data } = await q.limit(10)
  return data ?? []
}

export async function getAllContacts(type?: string) {
  const supabase = createClient()
  let q = supabase.from('contacts').select('*').order('name')
  if (type) q = q.eq('type', type)
  const { data: contacts, error } = await q
  if (!contacts || error) return []

  // Busca usuários separadamente para evitar dependência de nome de FK
  const userIds = Array.from(new Set([
    ...contacts.map((c: any) => c.assigned_to).filter(Boolean),
    ...contacts.map((c: any) => c.created_by).filter(Boolean),
  ]))

  let usersMap: Record<string, any> = {}
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, name, avatar_color, avatar_url')
      .in('id', userIds)
    if (users) usersMap = Object.fromEntries(users.map((u: any) => [u.id, u]))
  }

  return contacts.map((c: any) => ({
    ...c,
    assigned_user: c.assigned_to ? usersMap[c.assigned_to] ?? null : null,
    creator: c.created_by ? usersMap[c.created_by] ?? null : null,
  }))
}

// Gera comissões retroativas para as vendas JÁ fechadas de um parceiro (quando a taxa é definida depois).
async function backfillCommissionsForContact(contactId: string, rate: number) {
  if (!contactId || !(rate > 0)) return
  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const { data: closed } = await admin
    .from('quotes_full')
    .select('id, final_value, quoted_value, closed_at')
    .eq('architect_id', contactId)
    .eq('temperature', 'closed')
  if (!closed?.length) return
  const { data: existing } = await admin.from('commissions').select('quote_id').eq('contact_id', contactId)
  const has = new Set((existing ?? []).map((e: any) => e.quote_id))
  const rows = closed.filter((q: any) => !has.has(q.id)).map((q: any) => {
    const value = Number(q.final_value ?? q.quoted_value ?? 0)
    const amount = parseFloat((value * rate / 100).toFixed(2))
    const base = q.closed_at ? new Date(q.closed_at + 'T00:00:00') : new Date()
    base.setDate(base.getDate() + 30)
    const due = base.toISOString().split('T')[0]
    return { contact_id: contactId, quote_id: q.id, quote_value: value, rate, amount, due_date: due, status: due < today ? 'overdue' : 'scheduled' }
  })
  if (rows.length) {
    await admin.from('commissions').upsert(rows, { onConflict: 'quote_id,contact_id' })
  }
}

export async function createContact(data: {
  name: string; phone?: string; email?: string; type: string; company?: string; new_prospection?: boolean; assigned_to?: string; commission_rate?: number | null; linked_user_id?: string | null
}) {
  const supabase = createClient()
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const prospection_date = data.new_prospection ? new Date().toISOString() : null
  const assigned_to = data.assigned_to ?? user.id
  const { data: contact, error } = await admin
    .from('contacts')
    .insert({ ...data, created_by: user.id, prospection_date, assigned_to })
    .select('*')
    .single()
  if (error) return { error: error.message }
  return { data: contact }
}

export async function updateContact(id: string, data: {
  name?: string; phone?: string; email?: string; type?: string; company?: string; new_prospection?: boolean; assigned_to?: string; commission_rate?: number | null; linked_user_id?: string | null
}) {
  const admin = createAdminClient()
  const updates: Record<string, unknown> = { ...data }
  if ('new_prospection' in data) {
    updates.prospection_date = data.new_prospection ? new Date().toISOString() : null
  }
  const { data: contact, error } = await admin
    .from('contacts')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()
  if (error) return { error: error.message }
  // Se a taxa de comissão foi definida/alterada para > 0, gera comissões das vendas já fechadas
  if (data.commission_rate != null && Number(data.commission_rate) > 0) {
    await backfillCommissionsForContact(id, Number(data.commission_rate))
  }
  revalidatePath('/partners')
  return { data: contact }
}

export async function getProspectionsThisMonth(userId?: string, year?: number, month?: number) {
  const supabase = createClient()
  const now = new Date()
  const y = year ?? now.getFullYear()
  const m = month !== undefined ? month - 1 : now.getMonth()
  const start = new Date(y, m, 1).toISOString()
  const end = new Date(y, m + 1, 0, 23, 59, 59).toISOString()
  let query = supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('new_prospection', true)
    .gte('prospection_date', start)
    .lte('prospection_date', end)
  if (userId) query = query.eq('assigned_to', userId)
  const { count } = await query
  return count ?? 0
}

export async function deleteContact(id: string) {
  const { error } = await createAdminClient().from('contacts').delete().eq('id', id)
  if (error) return { error: error.message }
  return { ok: true }
}

export async function getDashboardStats(userId?: string, year?: number, month?: number) {
  const supabase = createClient()
  const funnelQuery = supabase.from('funnel_by_user').select('*')
  const { data: funnel } = userId ? await funnelQuery.eq('user_id', userId) : await funnelQuery
  const now = new Date()
  const y = year ?? now.getFullYear()
  const m = month ?? now.getMonth() + 1
  const { data: sales } = await supabase
    .from('sales_by_month').select('*')
    .eq('year', y).eq('month', m)
  const { data: goal } = await supabase
    .from('monthly_goals').select('target')
    .is('user_id', null)
    .eq('year', y).eq('month', m)
    .single()
  return { funnel: funnel ?? [], sales: sales ?? [], storeGoal: goal?.target ?? 0 }
}

export async function getActiveUsers() {
  const supabase = createClient()
  const { data } = await supabase.from('users').select('id, name, avatar_color, avatar_url, role').eq('active', true).order('name')
  return data ?? []
}

export async function updateQuote(quoteId: string, data: {
  client_id?: string
  architect_id?: string | null
  origin?: string
  paid_traffic_type?: string | null
  category?: string
  size?: string | null
  work_stage?: string | null
  priority?: string
  deadline?: string | null
  quote_date?: string | null
  quoted_value?: number | null
  notes?: string | null
  drive_link?: string | null
  primary_owner_id?: string | null
  collaborator_ids?: string[]
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  // Busca valores atuais para comparar
  const { data: current } = await supabase.from('quotes').select('*').eq('id', quoteId).single()
  if (!current) return { error: 'Orçamento não encontrado' }

  // Separa owner data dos dados da quote
  const { primary_owner_id, collaborator_ids, ...quoteData } = data

  const { error } = await supabase.from('quotes').update(quoteData).eq('id', quoteId)
  if (error) return { error: error.message }

  // Monta descrição do diff
  const LABEL: Record<string, string> = {
    deadline: 'Prazo', quoted_value: 'Valor orçado', priority: 'Prioridade',
    category: 'Categoria', size: 'Tamanho', work_stage: 'Etapa', origin: 'Origem',
    quote_date: 'Data do orçamento', notes: 'Observações', drive_link: 'Pasta Google Drive',
  }
  const PRIORITY_PT: Record<string, string> = { low: 'Baixa', normal: 'Média', high: 'Alta', urgent: 'Urgente' }
  const ORIGIN_PT: Record<string, string> = { store: 'Frente de Loja', whatsapp: 'Arquiteto ou parceiro', visit: 'Tráfego Pago', referral: 'Indicação', other: 'Orgânico' }
  const CATEGORY_PT: Record<string, string> = { lighting: 'Iluminação', automation: 'Automação', both: 'Ilum. + Auto.' }
  const SIZE_PT: Record<string, string> = { small: 'Pequeno', medium: 'Médio', large: 'Grande' }
  const STAGE_PT: Record<string, string> = { project: 'Projeto', execution: 'Em execução', finishing: 'Acabamento', delivered: 'Entregue' }

  function fmt(key: string, val: any): string {
    if (val == null || val === '') return '—'
    if (key === 'deadline' || key === 'quote_date') {
      const d = new Date(val + 'T00:00:00')
      return isNaN(d.getTime()) ? val : d.toLocaleDateString('pt-BR')
    }
    if (key === 'quoted_value') return `R$ ${Number(val).toLocaleString('pt-BR')}`
    if (key === 'priority') return PRIORITY_PT[val] ?? val
    if (key === 'origin') return ORIGIN_PT[val] ?? val
    if (key === 'category') return CATEGORY_PT[val] ?? val
    if (key === 'size') return SIZE_PT[val] ?? val
    if (key === 'work_stage') return STAGE_PT[val] ?? val
    return String(val)
  }

  const changes: string[] = []
  for (const key of Object.keys(quoteData) as (keyof typeof quoteData)[]) {
    const oldVal = (current as any)[key]
    const newVal = quoteData[key]
    const oldStr = fmt(key as string, oldVal)
    const newStr = fmt(key as string, newVal)
    if (oldStr !== newStr && key !== 'notes') {
      changes.push(`${LABEL[key as string] ?? key}: ${oldStr} → ${newStr}`)
    }
    if (key === 'notes' && oldVal !== newVal) {
      changes.push('Observações atualizadas')
    }
  }

  if (changes.length > 0) {
    await supabase.from('activities').insert({
      quote_id: quoteId, user_id: user.id,
      type: 'edit', description: `✏️ Editado — ${changes.join(' · ')}`,
    })
  }

  // Atualiza responsáveis (usa admin client para bypassar RLS)
  if (primary_owner_id !== undefined || collaborator_ids !== undefined) {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    await admin.from('quote_owners').delete().eq('quote_id', quoteId)
    const owners: any[] = []
    if (primary_owner_id) {
      owners.push({ quote_id: quoteId, user_id: primary_owner_id, role: 'primary' })
    }
    const collabs = (collaborator_ids ?? []).filter(id => id !== primary_owner_id)
    for (const uid of collabs) {
      owners.push({ quote_id: quoteId, user_id: uid, role: 'collaborator' })
    }
    if (owners.length > 0) await admin.from('quote_owners').insert(owners)
  }

  revalidatePath(`/quotes/${quoteId}`)
  revalidatePath('/quotes')
  return { ok: true }
}

export async function updateUser(userId: string, data: { name?: string; role?: string; active?: boolean }) {
  const supabase = createClient()
  const { error } = await supabase.from('users').update(data).eq('id', userId)
  if (error) return { error: error.message }
  revalidatePath('/admin')
  revalidatePath('/admin/goals')
  return { ok: true }
}

export async function updateUserPassword(userId: string, newPassword: string) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const { data: profile } = await createClient().from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Sem permissão' }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword })
  if (error) return { error: error.message }
  return { ok: true }
}

export async function deleteUser(userId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Sem permissão' }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()

  // Delete from Supabase Auth
  const { error: authError } = await admin.auth.admin.deleteUser(userId)
  if (authError) return { error: authError.message }

  // Delete from users table (will cascade to related records if configured)
  const { error: dbError } = await supabase.from('users').delete().eq('id', userId)
  if (dbError) return { error: dbError.message }

  revalidatePath('/admin')
  revalidatePath('/admin/goals')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function uploadUserAvatar(userId: string, formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Sem permissão' }

  const file = formData.get('file') as File | null
  if (!file) return { error: 'Arquivo não enviado' }

  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${userId}/${Date.now()}.${ext}`

  const { error: uploadError } = await admin.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (uploadError) return { error: uploadError.message }

  const { data: pub } = admin.storage.from('avatars').getPublicUrl(path)
  const { error: updateError } = await admin.from('users').update({ avatar_url: pub.publicUrl }).eq('id', userId)
  if (updateError) return { error: updateError.message }

  revalidatePath('/admin')
  revalidatePath('/admin/goals')
  revalidatePath('/dashboard')
  return { ok: true, url: pub.publicUrl }
}

export async function removeUserAvatar(userId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Sem permissão' }

  const admin = createAdminClient()
  const { error } = await admin.from('users').update({ avatar_url: null }).eq('id', userId)
  if (error) return { error: error.message }

  revalidatePath('/admin')
  revalidatePath('/admin/goals')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function createUserAdmin(data: {
  name: string
  email: string
  password: string
  role: 'admin' | 'seller' | 'logistics'
  avatar_color: string
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Sem permissão' }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()

  // Create user in Supabase Auth without sending email
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true, // Mark email as confirmed so they can login immediately
    user_metadata: {
      name: data.name,
      role: data.role,
      avatar_color: data.avatar_color,
    },
  })

  if (authError) return { error: authError.message }
  if (!authData.user) return { error: 'Erro ao criar usuário' }

  // Create or update user record in users table using admin client (bypasses RLS)
  const { error: dbError } = await admin.from('users').upsert({
    id: authData.user.id,
    email: data.email,
    name: data.name,
    role: data.role,
    avatar_color: data.avatar_color,
    active: true,
  }, { onConflict: 'id' })

  if (dbError) {
    // Rollback: delete user from Auth if database operation fails
    await admin.auth.admin.deleteUser(authData.user.id)
    return { error: dbError.message }
  }

  revalidatePath('/admin')
  revalidatePath('/admin/goals')
  return { ok: true }
}

// Schedules (Agendamentos)
interface ScheduleInput {
  title: string
  type: 'visita' | 'reuniao' | 'follow_up'
  quote_id?: string | null
  partner_id?: string | null
  scheduled_date: string
  scheduled_time?: string | null
  location?: string | null
  team_members: string[]
}

// Enriquece agendamentos com participantes, criador, parceiro e orçamento.
// (Sem joins embutidos: `quotes` não tem client_name — só a view quotes_full.)
// Usa o cliente autenticado (não o admin) para ler `users`/`contacts`: em produção
// o admin pode não furar RLS, mas o usuário autenticado lê essas tabelas normalmente.
async function enrichSchedules(schedules: any[]) {
  if (!schedules.length) return schedules
  const db = createClient()

  const partnerIds = Array.from(new Set(schedules.map(s => s.partner_id).filter(Boolean)))
  const quoteIds = Array.from(new Set(schedules.map(s => s.quote_id).filter(Boolean)))

  // Busca todos os usuários: team_members pode conter UUIDs (novos) OU nomes (legado)
  const [usersRes, partnersRes, quotesRes] = await Promise.all([
    db.from('users').select('id, name, avatar_color, avatar_url'),
    partnerIds.length ? db.from('contacts').select('id, name').in('id', partnerIds) : Promise.resolve({ data: [] }),
    quoteIds.length ? db.from('quotes_full').select('id, number, client_name').in('id', quoteIds) : Promise.resolve({ data: [] }),
  ])

  const users = usersRes.data ?? []
  const byId = new Map(users.map((u: any) => [u.id, u]))
  const byName = new Map(users.map((u: any) => [String(u.name).trim().toLowerCase(), u]))
  const byFirstName = new Map(users.map((u: any) => [String(u.name).trim().split(' ')[0].toLowerCase(), u]))
  const partnerMap = new Map((partnersRes.data ?? []).map((p: any) => [p.id, p.name]))
  const quoteMap = new Map((quotesRes.data ?? []).map((q: any) => [q.id, q]))

  const resolveUser = (token: string) => {
    if (!token) return null
    const key = String(token).trim().toLowerCase()
    return byId.get(token) ?? byName.get(key) ?? byFirstName.get(key) ?? null
  }

  return schedules.map(s => ({
    ...s,
    participants: (s.team_members ?? []).map((t: string) => resolveUser(t)).filter(Boolean),
    partner_name: s.partner_id ? (partnerMap.get(s.partner_id) ?? null) : null,
    creator: s.created_by ? (byId.get(s.created_by) ?? null) : null,
    quote: s.quote_id ? (quoteMap.get(s.quote_id) ?? null) : null,
  }))
}

export async function createSchedule(data: ScheduleInput) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: result, error } = await createAdminClient().from('schedules').insert({
    title: data.title,
    type: data.type,
    quote_id: data.quote_id || null,
    partner_id: data.partner_id || null,
    scheduled_date: data.scheduled_date,
    scheduled_time: data.scheduled_time || null,
    location: data.location || null,
    created_by: user.id,
    team_members: data.team_members,
  }).select()

  if (error) return { error: error.message }
  revalidatePath('/schedules')
  revalidatePath('/dashboard')
  return { ok: true, id: result?.[0]?.id }
}

export async function updateSchedule(id: string, data: Partial<ScheduleInput>) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const updates: Record<string, any> = {}
  if (data.title !== undefined) updates.title = data.title
  if (data.type !== undefined) updates.type = data.type
  if (data.quote_id !== undefined) updates.quote_id = data.quote_id || null
  if (data.partner_id !== undefined) updates.partner_id = data.partner_id || null
  if (data.scheduled_date !== undefined) updates.scheduled_date = data.scheduled_date
  if (data.scheduled_time !== undefined) updates.scheduled_time = data.scheduled_time || null
  if (data.location !== undefined) updates.location = data.location || null
  if (data.team_members !== undefined) updates.team_members = data.team_members

  const { error } = await createAdminClient().from('schedules').update(updates).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/schedules')
  revalidatePath('/dashboard')
  return { ok: true }
}

// Reuniões e visitas são visíveis a todos; follow-ups só para quem criou ou participa.
function filterFollowups(schedules: any[], userId?: string) {
  if (!userId) return schedules
  return schedules.filter((s: any) =>
    s.type !== 'follow_up' ||
    s.created_by === userId ||
    (s.team_members ?? []).includes(userId)
  )
}

export async function getSchedules(startDate?: string, endDate?: string) {
  const { data: { user } } = await createClient().auth.getUser()
  let query = createAdminClient().from('schedules').select('*').order('scheduled_date', { ascending: true }).order('scheduled_time', { ascending: true })

  if (startDate && endDate) {
    query = query.gte('scheduled_date', startDate).lte('scheduled_date', endDate)
  }

  const { data } = await query
  return enrichSchedules(filterFollowups(data ?? [], user?.id))
}

export async function getSchedulesByDate(date: string) {
  const { data: { user } } = await createClient().auth.getUser()
  const { data } = await createAdminClient()
    .from('schedules')
    .select('*')
    .eq('scheduled_date', date)
    .order('scheduled_time', { ascending: true })
  return enrichSchedules(filterFollowups(data ?? [], user?.id))
}

export async function getSchedulesByQuote(quoteId: string) {
  const { data: { user } } = await createClient().auth.getUser()
  const { data } = await createAdminClient()
    .from('schedules')
    .select('*')
    .eq('quote_id', quoteId)
    .order('scheduled_date', { ascending: true })
    .order('scheduled_time', { ascending: true })
  return enrichSchedules(filterFollowups(data ?? [], user?.id))
}

export async function deleteSchedule(id: string) {
  const { error } = await createAdminClient().from('schedules').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/schedules')
  revalidatePath('/dashboard')
  return { ok: true }
}

// ═══════════════════════════════════════════════════════════════════════════
// TASKS
// ═══════════════════════════════════════════════════════════════════════════

export async function getTasks(filter?: { status?: string; priority?: string }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  let query = supabase
    .from('tasks')
    .select('*, subtasks(id, done)')
    .eq('user_id', user.id)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (filter?.status) query = query.eq('status', filter.status)
  if (filter?.priority) query = query.eq('priority', filter.priority)

  const { data: tasks } = await query
  if (!tasks) return []

  // Enriquecer com info do orçamento
  const quoteIds = Array.from(new Set(tasks.map((t: any) => t.quote_id).filter(Boolean)))
  let quotesMap: Record<string, any> = {}
  if (quoteIds.length > 0) {
    const { data: quotes } = await createAdminClient()
      .from('quotes_full')
      .select('id, number, client_name')
      .in('id', quoteIds)
    if (quotes) quotesMap = Object.fromEntries(quotes.map((q: any) => [q.id, q]))
  }
  return tasks.map((t: any) => ({ ...t, quote: t.quote_id ? (quotesMap[t.quote_id] ?? null) : null }))
}

export async function getQuotesList() {
  const { data } = await createAdminClient()
    .from('quotes_full')
    .select('id, number, client_name')
    .order('number', { ascending: false })
  return data ?? []
}

export async function getTasksByQuote(quoteId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tasks')
    .select('*, subtasks(id, done)')
    .eq('quote_id', quoteId)
    .order('created_at', { ascending: false })
  if (error) return []
  if (!data || data.length === 0) return []
  // Enriquecer com info do usuário
  const userIds = Array.from(new Set(data.map((t: any) => t.user_id).filter(Boolean)))
  let usersMap: Record<string, any> = {}
  if (userIds.length > 0) {
    const { data: users } = await supabase.from('users').select('id, name, avatar_color, avatar_url').in('id', userIds)
    if (users) usersMap = Object.fromEntries(users.map((u: any) => [u.id, u]))
  }
  return data.map((t: any) => ({ ...t, users: t.user_id ? (usersMap[t.user_id] ?? null) : null }))
}

export async function createTask(formData: {
  title: string
  description?: string
  priority: string
  status: string
  due_date?: string
  checklist?: { text: string; done: boolean }[]
  quote_id?: string | null
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { error } = await supabase.from('tasks').insert({
    user_id: user.id,
    title: formData.title,
    description: formData.description || null,
    priority: formData.priority,
    status: formData.status,
    due_date: formData.due_date,
    checklist: formData.checklist || [],
    quote_id: formData.quote_id || null,
  })

  if (error) return { error: error.message }
  revalidatePath('/dashboard/tasks')
  revalidatePath('/dashboard')
  return { ok: true }
}

async function getDbClient() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return supabase
  const { data: profile } = await createAdminClient().from('users').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? createAdminClient() : supabase
}

export async function updateTask(id: string, formData: {
  title?: string
  description?: string
  priority?: string
  status?: string
  due_date?: string
  checklist?: { text: string; done: boolean }[]
  quote_id?: string | null
}) {
  const db = await getDbClient()
  const extra: Record<string, unknown> = {}
  if (formData.status === 'done') extra.completed_at = new Date().toISOString()
  else if (formData.status) extra.completed_at = null
  const { error } = await db
    .from('tasks')
    .update({ ...formData, ...extra, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/tasks')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function updateTaskStatus(id: string, status: string) {
  const db = await getDbClient()
  const completed_at = status === 'done' ? new Date().toISOString() : null

  const { error } = await db
    .from('tasks')
    .update({ status, completed_at, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    // Fallback: se a coluna completed_at ainda não existe no banco (migration não aplicada),
    // atualiza apenas o status para o checkbox continuar funcionando.
    if (error.code === '42703' || /completed_at/.test(error.message)) {
      const { error: fallbackError } = await db
        .from('tasks')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (fallbackError) return { error: fallbackError.message }
      revalidatePath('/dashboard/tasks')
      revalidatePath('/dashboard')
      return { ok: true }
    }
    return { error: error.message }
  }

  if (status === 'done') {
    await db
      .from('subtasks')
      .update({ done: true, updated_at: new Date().toISOString() })
      .eq('task_id', id)
  }

  revalidatePath('/dashboard/tasks')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function deleteTask(id: string) {
  const db = await getDbClient()
  const { error } = await db.from('tasks').delete().eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard/tasks')
  revalidatePath('/dashboard')
  return { ok: true }
}

// ── Subtarefas ─────────────────────────────────────────────────────────────

export async function getSubtasks(taskId: string) {
  const db = await getDbClient()
  const { data, error } = await db
    .from('subtasks')
    .select('*')
    .eq('task_id', taskId)
    .order('position', { ascending: true })
  if (error) return { error: error.message, data: [] }
  return { data: data || [] }
}

export async function createSubtask(taskId: string, title: string) {
  const db = await getDbClient()
  const { data: existing } = await db
    .from('subtasks')
    .select('position')
    .eq('task_id', taskId)
    .order('position', { ascending: false })
    .limit(1)
  const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0

  const { data, error } = await db
    .from('subtasks')
    .insert({ task_id: taskId, title: title.trim(), position: nextPosition })
    .select()
    .single()
  if (error) return { error: error.message }
  revalidatePath('/dashboard/tasks')
  return { data }
}

export async function updateSubtask(id: string, updates: { title?: string; done?: boolean }) {
  const db = await getDbClient()
  const { data, error } = await db
    .from('subtasks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return { error: error.message }
  revalidatePath('/dashboard/tasks')
  return { data }
}

export async function reorderSubtasks(items: { id: string; position: number }[]) {
  const db = await getDbClient()
  await Promise.all(items.map(({ id, position }) =>
    db.from('subtasks').update({ position }).eq('id', id)
  ))
  return { ok: true }
}

export async function deleteSubtask(id: string) {
  const db = await getDbClient()
  const { error } = await db.from('subtasks').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/tasks')
  return { ok: true }
}

export async function completeAllSubtasks(taskId: string) {
  const db = await getDbClient()
  const { error } = await db
    .from('subtasks')
    .update({ done: true, updated_at: new Date().toISOString() })
    .eq('task_id', taskId)
  if (error) return { error: error.message }
  return { ok: true }
}

export async function getCurrentUser() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const adminSupabase = createAdminClient()
  const { data: userData } = await adminSupabase
    .from('users')
    .select('id, email, name, role')
    .eq('id', user.id)
    .single()

  return userData
}

export async function createTaskForUser(userId: string, formData: {
  title: string
  description?: string
  priority: string
  status: string
  due_date?: string
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return { error: 'Sem permissão' }

  const adminSupabase = createAdminClient()
  const { error } = await adminSupabase.from('tasks').insert({
    user_id: userId,
    title: formData.title,
    description: formData.description || null,
    priority: formData.priority,
    status: formData.status,
    due_date: formData.due_date || null,
    checklist: [],
  })

  if (error) return { error: error.message }
  return { ok: true }
}

export async function getAllTasks() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // Verificar se é admin (usando cliente normal com RLS)
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return []

  // Usar admin client para bypassar RLS e buscar tarefas de todos os usuários
  const adminSupabase = createAdminClient()

  const { data: tasks } = await adminSupabase
    .from('tasks')
    .select('*, subtasks(id, done)')
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (!tasks || tasks.length === 0) return []

  // Buscar dados dos usuários (public.users tem name e avatar_color)
  const userIds = Array.from(new Set(tasks.map((t: any) => t.user_id).filter(Boolean)))
  const { data: usersData } = await adminSupabase
    .from('users')
    .select('id, name, avatar_color, avatar_url')
    .in('id', userIds)

  const usersMap = Object.fromEntries((usersData ?? []).map((u: any) => [u.id, u]))

  // Enriquecer com info do orçamento
  const quoteIds = Array.from(new Set(tasks.map((t: any) => t.quote_id).filter(Boolean)))
  let quotesMap: Record<string, any> = {}
  if (quoteIds.length > 0) {
    const { data: quotes } = await adminSupabase.from('quotes_full').select('id, number, client_name').in('id', quoteIds)
    if (quotes) quotesMap = Object.fromEntries(quotes.map((q: any) => [q.id, q]))
  }

  return tasks.map((t: any) => ({
    ...t,
    users: usersMap[t.user_id] ?? null,
    quote: t.quote_id ? (quotesMap[t.quote_id] ?? null) : null,
  }))
}

// ── Shipments (Expedição) ────────────────────────────────────

export async function createShipment(quoteId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('shipments')
    .insert({ quote_id: quoteId })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function getShipments() {
  const admin = createAdminClient()
  const { data: shipments, error } = await admin
    .from('shipments')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  if (!shipments || shipments.length === 0) return []

  // Enriquecer com dados do orçamento (quotes_full tem client_name e owners)
  const quoteIds = shipments.map((s: any) => s.quote_id).filter(Boolean)
  const { data: quotes } = await admin
    .from('quotes_full')
    .select('id, number, quoted_value, final_value, client_name, architect_name, owners')
    .in('id', quoteIds)
  const quotesMap = Object.fromEntries((quotes ?? []).map((q: any) => [q.id, q]))

  // avatar_url dos responsáveis
  const ownerIds = Array.from(new Set(
    (quotes ?? []).flatMap((q: any) => (q.owners ?? []).map((o: any) => o.user_id)).filter(Boolean)
  ))
  const { data: ownerUsers } = ownerIds.length
    ? await admin.from('users').select('id, avatar_url').in('id', ownerIds)
    : { data: [] }
  const avatarMap = new Map((ownerUsers ?? []).map((u: any) => [u.id, u.avatar_url]))

  return shipments.map((s: any) => {
    const q = quotesMap[s.quote_id] ?? {}
    const owners = (q.owners ?? []).map((o: any) => ({ ...o, avatar_url: avatarMap.get(o.user_id) ?? null }))
    const primary = owners.find((o: any) => o.role === 'primary') ?? owners[0] ?? null
    return {
      ...s,
      quote_number: q.number,
      quoted_value: q.final_value ?? q.quoted_value,
      client_name: q.client_name ?? '—',
      architect_name: q.architect_name ?? null,
      owners,
      owner: primary,
    }
  })
}

export async function getShipmentQuoteData(quoteId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('quotes_full')
    .select('id, number, quoted_value, final_value, client_name')
    .eq('id', quoteId)
    .single()
  if (error) return null
  return data
}

export async function getShipmentById(id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('shipments')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function updateShipment(
  id: string,
  updates: {
    delivery_type?: 'delivery' | 'pickup'
    delivery_date?: string
    separation_status?: 'queued' | 'in_progress' | 'completed' | 'awaiting_material' | 'delivered'
    priority?: 'low' | 'mid' | 'high'
    drive_link?: string | null
  }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const { data, error } = await createAdminClient()
    .from('shipments')
    .update({ ...updates, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/shipping')
  return data
}

export async function completeShipment(id: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const { data, error } = await createAdminClient()
    .from('shipments')
    .update({
      is_completed: true,
      completed_at: new Date().toISOString(),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/shipping')
  return data
}

export async function uploadMaterialFile(shipmentId: string, file: File) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const fileName = `${shipmentId}/${Date.now()}_${file.name}`
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('shipments')
    .upload(fileName, file)
  if (uploadError) throw new Error(uploadError.message)

  const { data: publicUrl } = supabase.storage.from('shipments').getPublicUrl(fileName)

  // Atualizar array de arquivos no shipment
  const { data: shipment, error: fetchError } = await supabase
    .from('shipments')
    .select('material_files')
    .eq('id', shipmentId)
    .single()
  if (fetchError) throw new Error(fetchError.message)

  const newFiles = [
    ...(shipment?.material_files || []),
    { name: file.name, url: publicUrl.publicUrl }
  ]
  const { error: updateError } = await supabase
    .from('shipments')
    .update({ material_files: newFiles })
    .eq('id', shipmentId)
  if (updateError) throw new Error(updateError.message)

  revalidatePath('/shipping')
  return publicUrl.publicUrl
}

export async function deleteMaterialFile(shipmentId: string, fileUrl: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  // Extract file path from URL
  const fileName = fileUrl.split('/').slice(-2).join('/')

  // Delete from storage
  const { error: deleteError } = await supabase.storage
    .from('shipments')
    .remove([fileName])
  if (deleteError) throw new Error(deleteError.message)

  // Update shipment
  const { data: shipment, error: fetchError } = await supabase
    .from('shipments')
    .select('material_files')
    .eq('id', shipmentId)
    .single()
  if (fetchError) throw new Error(fetchError.message)

  const newFiles = (shipment?.material_files || []).filter(
    (f: any) => f.url !== fileUrl
  )
  const { error: updateError } = await supabase
    .from('shipments')
    .update({ material_files: newFiles })
    .eq('id', shipmentId)
  if (updateError) throw new Error(updateError.message)

  revalidatePath('/shipping')
  return { ok: true }
}
// ── Commissions ───────────────────────────────────────────────────────────────

export async function getCommissions(year: number, month: number) {
  const admin = createAdminClient()
  const start = `${year}-${String(month).padStart(2,'0')}-01`
  const end = new Date(year, month, 0).toISOString().split('T')[0]

  // Auto-mark overdue
  const today = new Date().toISOString().split('T')[0]
  await admin.from('commissions').update({ status: 'overdue' })
    .eq('status', 'scheduled').lt('due_date', today)

  const { data, error } = await admin
    .from('commissions')
    .select('*, contact:contacts(*), quote:quotes(number, quoted_value)')
    .gte('due_date', start)
    .lte('due_date', end)
    .order('due_date')
  if (error) return []
  // Exclui comissões de parceiros que são colaboradores vinculados (projetistas) —
  // essas aparecem no painel de comissões do colaborador, evitando duplicidade.
  return (data ?? []).filter((c: any) => !c.contact?.linked_user_id)
}

export async function updateCommissionStatus(id: string, status: 'scheduled' | 'paid' | 'overdue') {
  const admin = createAdminClient()
  const updates: Record<string, unknown> = { status }
  if (status === 'paid') updates.paid_at = new Date().toISOString()
  const { error } = await admin.from('commissions').update(updates).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/partners/commissions')
  return { ok: true }
}

export async function getContactSalesTotal(contactId: string, year?: number, month?: number) {
  const admin = createAdminClient()
  let q = admin
    .from('commissions')
    .select('quote_value, amount, due_date, status, quote:quotes(number)')
    .eq('contact_id', contactId)
  if (year && month) {
    const start = `${year}-${String(month).padStart(2,'0')}-01`
    const end = new Date(year, month, 0).toISOString().split('T')[0]
    q = q.gte('due_date', start).lte('due_date', end)
  }
  const { data } = await q.order('due_date', { ascending: false })
  return data ?? []
}

export async function getContactOpenQuotes(contactId: string, contactName?: string) {
  const admin = createAdminClient()
  // Busca pelo FK architect_id OU pelo nome (para orçamentos com nome textual)
  const filter = contactName
    ? `architect_id.eq.${contactId},architect_name.ilike.%${contactName}%`
    : `architect_id.eq.${contactId}`
  const { data } = await admin
    .from('quotes_full')
    .select('id, number, client_name, quoted_value, status, temperature, created_at, architect_id, architect_name')
    .or(filter)
    .neq('status', 'done')
    .order('created_at', { ascending: false })
  // Em aberto = ainda não concluído (status != done) e negociação não fechada/perdida
  const open = (data ?? []).filter(q => !['closed', 'lost'].includes(q.temperature ?? ''))
  return open.map(({ architect_id: _a, architect_name: _b, temperature: _t, ...rest }) => rest)
}

// Todos os orçamentos de um parceiro (para o modal de visualização)
export async function getContactAllQuotes(contactId: string, contactName?: string) {
  const admin = createAdminClient()
  const filter = contactName
    ? `architect_id.eq.${contactId},architect_name.ilike.%${contactName}%`
    : `architect_id.eq.${contactId}`
  const { data } = await admin
    .from('quotes_full')
    .select('id, number, client_name, quoted_value, final_value, status, temperature, created_at')
    .or(filter)
    .order('created_at', { ascending: false })
  return data ?? []
}

// Estatísticas agregadas por parceiro (valor em negociação e total)
export async function getPartnerQuoteStats() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('quotes_full')
    .select('architect_id, architect_name, quoted_value, final_value, status, temperature')
  const byId: Record<string, any> = {}
  const byName: Record<string, any> = {}

  for (const q of data ?? []) {
    const isOpen = q.status !== 'done' && !['closed', 'lost'].includes(q.temperature ?? '')
    const isClosed = q.temperature === 'closed'
    const openVal = Number(q.quoted_value ?? 0)
    const closedVal = Number(q.final_value ?? q.quoted_value ?? 0)

    const bump = (bucket: Record<string, any>, key: string) => {
      if (!key) return
      const e = bucket[key] ?? (bucket[key] = { openValue: 0, openCount: 0, closedValue: 0, closedCount: 0, totalCount: 0 })
      e.totalCount += 1
      if (isOpen) { e.openValue += openVal; e.openCount += 1 }
      if (isClosed) { e.closedValue += closedVal; e.closedCount += 1 }
    }
    if (q.architect_id) bump(byId, q.architect_id)
    if (q.architect_name) bump(byName, String(q.architect_name).trim().toLowerCase())
  }
  return { byId, byName }
}

export async function debugContactQuotes(contactId: string) {
  const admin = createAdminClient()
  // Busca todos os orçamentos desse contato sem filtros, para diagnóstico
  const { data: byId } = await admin.from('quotes_full')
    .select('id, number, status, architect_id, architect_name').eq('architect_id', contactId).limit(5)
  const { data: contact } = await admin.from('contacts').select('id, name').eq('id', contactId).single()
  const { data: byName } = contact ? await admin.from('quotes_full')
    .select('id, number, status, architect_id, architect_name')
    .ilike('architect_name', `%${contact.name}%`).limit(5) : { data: [] }
  return { contact, byId, byName }
}

export async function getContactTotalSales(contactId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('commissions')
    .select('quote_value, amount')
    .eq('contact_id', contactId)
  const totalSales = (data ?? []).reduce((s, r) => s + Number(r.quote_value ?? 0), 0)
  const totalCommissions = (data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0)
  return { totalSales, totalCommissions, count: (data ?? []).length }
}

// ═══════════════════════════════════════════════════════════════════════════
// FINANCEIRO (admin)
// ═══════════════════════════════════════════════════════════════════════════

async function ensureAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Sem permissão' as const }
  return { userId: user.id }
}

export async function getFinanceEntries() {
  const auth = await ensureAdmin()
  if ('error' in auth) return []
  try {
    const { data } = await createAdminClient()
      .from('finance_entries')
      .select('*')
      .order('due_date', { ascending: true })
    return data ?? []
  } catch {
    return []
  }
}

export async function createFinanceEntry(data: {
  description: string
  type: 'payable' | 'receivable'
  category?: string | null
  counterparty?: string | null
  amount: number
  due_date: string
  notes?: string | null
  // parcelamento
  installments?: number       // qtd de parcelas (>=1)
  interval_days?: number      // intervalo entre parcelas (ex: 30)
  split_amount?: boolean      // true = divide o valor entre as parcelas; false = valor por parcela
}) {
  const auth = await ensureAdmin()
  if ('error' in auth) return { error: auth.error }
  const admin = createAdminClient()

  const n = Math.max(1, Math.floor(data.installments ?? 1))
  const interval = Math.max(1, Math.floor(data.interval_days ?? 30))
  const groupId = n > 1 ? crypto.randomUUID() : null
  const perAmount = data.split_amount ? parseFloat((data.amount / n).toFixed(2)) : data.amount

  const base = new Date(data.due_date + 'T00:00:00')
  const rows = Array.from({ length: n }).map((_, i) => {
    const d = new Date(base)
    d.setDate(base.getDate() + i * interval)
    return {
      description: data.description,
      type: data.type,
      category: data.category || null,
      counterparty: data.counterparty || null,
      amount: perAmount,
      due_date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      status: 'pending',
      group_id: groupId,
      installment_number: n > 1 ? i + 1 : null,
      installments_total: n > 1 ? n : null,
      notes: data.notes || null,
      created_by: auth.userId,
    }
  })

  const { error } = await admin.from('finance_entries').insert(rows)
  if (error) return { error: error.message }
  revalidatePath('/finance')
  return { ok: true, count: rows.length }
}

export async function updateFinanceEntry(id: string, data: {
  description?: string
  type?: 'payable' | 'receivable'
  category?: string | null
  counterparty?: string | null
  amount?: number
  due_date?: string
  notes?: string | null
}) {
  const auth = await ensureAdmin()
  if ('error' in auth) return { error: auth.error }
  const { error } = await createAdminClient().from('finance_entries').update(data).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/finance')
  return { ok: true }
}

export async function setFinancePaid(id: string, paid: boolean, paidAt?: string) {
  const auth = await ensureAdmin()
  if ('error' in auth) return { error: auth.error }
  const updates = paid
    ? { status: 'paid', paid_at: paidAt || new Date().toISOString().split('T')[0] }
    : { status: 'pending', paid_at: null }
  const { error } = await createAdminClient().from('finance_entries').update(updates).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/finance')
  return { ok: true }
}

export async function deleteFinanceEntry(id: string, group?: string | null) {
  const auth = await ensureAdmin()
  if ('error' in auth) return { error: auth.error }
  const admin = createAdminClient()
  const { error } = group
    ? await admin.from('finance_entries').delete().eq('group_id', group)
    : await admin.from('finance_entries').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/finance')
  return { ok: true }
}

// ── Saldos de contas ──
export async function getFinanceAccounts() {
  const { data } = await createAdminClient().from('finance_accounts').select('*').order('name')
  return data ?? []
}
export async function createFinanceAccount(name: string, balance: number = 0) {
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Informe o nome da conta' }
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await createAdminClient()
    .from('finance_accounts')
    .insert({ name: trimmed, balance, updated_by: user?.id ?? null })
    .select()
    .single()
  if (error) return { error: error.message }
  revalidatePath('/finance')
  return { ok: true, data }
}
export async function updateFinanceAccount(id: string, balance: number) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await createAdminClient()
    .from('finance_accounts')
    .update({ balance, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/finance')
  return { ok: true }
}

// ── Fornecedores financeiros ──
export async function getFinanceSuppliers() {
  const { data } = await createAdminClient().from('finance_suppliers').select('*').order('name')
  return data ?? []
}
export async function createFinanceSupplier(name: string, supply_area?: string) {
  const { data, error } = await createAdminClient().from('finance_suppliers').insert({ name, supply_area: supply_area || null }).select().single()
  if (error) return { error: error.message }
  revalidatePath('/finance/suppliers')
  return { ok: true, data }
}
export async function updateFinanceSupplier(id: string, name: string, supply_area?: string) {
  const { error } = await createAdminClient().from('finance_suppliers').update({ name, supply_area: supply_area || null }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/finance/suppliers')
  return { ok: true }
}
export async function deleteFinanceSupplier(id: string) {
  const { error } = await createAdminClient().from('finance_suppliers').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/finance/suppliers')
  return { ok: true }
}

// ── Categorias financeiras ──
export async function getFinanceCategories() {
  const { data } = await createAdminClient().from('finance_categories').select('*').order('name')
  return data ?? []
}
export async function createFinanceCategory(name: string) {
  const { data, error } = await createAdminClient().from('finance_categories').insert({ name }).select().single()
  if (error) return { error: error.message }
  revalidatePath('/finance/categories')
  return { ok: true, data }
}
export async function updateFinanceCategory(id: string, name: string) {
  const { error } = await createAdminClient().from('finance_categories').update({ name }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/finance/categories')
  return { ok: true }
}
export async function deleteFinanceCategory(id: string) {
  const { error } = await createAdminClient().from('finance_categories').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/finance/categories')
  return { ok: true }
}

// ── Comissões dos colaboradores (1% das próprias vendas + 5% como projetista) ──
const SELLER_COMMISSION_PCT = 1 // % sobre as vendas que o próprio colaborador fechou

export async function getCommissionEarnings(year?: number, month?: number) {
  const admin = createAdminClient()
  const now = new Date()
  const y = year ?? now.getFullYear()
  const m = month ?? now.getMonth() + 1
  const mStart = `${y}-${String(m).padStart(2, '0')}-01`
  const mEnd = new Date(y, m, 0).toISOString().split('T')[0]

  const [salesRes, contactsRes, quotesRes, usersRes, closedQuotesRes] = await Promise.all([
    admin.from('sales_by_month').select('user_id, total_sold').eq('year', y).eq('month', m),
    admin.from('contacts').select('*').gt('commission_rate', 0),
    admin.from('quotes_full').select('number, architect_id, final_value, quoted_value, closed_at, temperature, client_name')
      .eq('temperature', 'closed').gte('closed_at', mStart).lte('closed_at', mEnd),
    admin.from('users').select('id, name, avatar_color, avatar_url, role').eq('active', true),
    admin.from('quotes_full')
      .select('id, number, client_name, final_value, quoted_value, closed_at, owners:quote_owners(user_id)')
      .eq('temperature', 'closed').gte('closed_at', mStart).lte('closed_at', mEnd),
  ])

  const linkedContacts = (contactsRes.data ?? []).filter((c: any) => c.linked_user_id)
  const contactToUser = new Map(linkedContacts.map((c: any) => [c.id, c.linked_user_id]))
  const contactRate = new Map(linkedContacts.map((c: any) => [c.id, Number(c.commission_rate)]))

  // Build seller details per user from closed quotes
  const sellerDetailsMap: Record<string, any[]> = {}
  for (const q of closedQuotesRes.data ?? []) {
    const owners: string[] = (q.owners ?? []).map((o: any) => o.user_id).filter(Boolean)
    const numOwners = owners.length || 1
    const totalValue = Number(q.final_value ?? q.quoted_value ?? 0)
    const valuePerOwner = totalValue / numOwners
    for (const uid of owners) {
      if (!sellerDetailsMap[uid]) sellerDetailsMap[uid] = []
      sellerDetailsMap[uid].push({
        number: q.number,
        client_name: q.client_name,
        value: valuePerOwner,
        num_owners: numOwners,
        comm: parseFloat((valuePerOwner * SELLER_COMMISSION_PCT / 100).toFixed(2)),
      })
    }
  }

  const result: Record<string, any> = {}
  for (const u of usersRes.data ?? []) {
    result[u.id] = { user: u, sellerSales: 0, sellerComm: 0, projetistaComm: 0, projetistaSales: [], sellerDetails: [], total: 0 }
  }

  // 1% das vendas próprias
  for (const s of salesRes.data ?? []) {
    if (!result[s.user_id]) continue
    const sales = Number(s.total_sold ?? 0)
    result[s.user_id].sellerSales = sales
    result[s.user_id].sellerComm = parseFloat((sales * SELLER_COMMISSION_PCT / 100).toFixed(2))
    result[s.user_id].sellerDetails = sellerDetailsMap[s.user_id] ?? []
  }

  // 5% (taxa do parceiro) das vendas em que o colaborador foi o projetista — mês do fechamento
  for (const q of quotesRes.data ?? []) {
    const uid = q.architect_id ? contactToUser.get(q.architect_id) : null
    if (!uid || !result[uid]) continue
    const rate = contactRate.get(q.architect_id) ?? 0
    const value = Number(q.final_value ?? q.quoted_value ?? 0)
    const comm = parseFloat((value * rate / 100).toFixed(2))
    result[uid].projetistaComm += comm
    result[uid].projetistaSales.push({ number: q.number, client_name: q.client_name, value, rate, comm })
  }

  for (const uid of Object.keys(result)) {
    const r = result[uid]
    r.projetistaComm = parseFloat(r.projetistaComm.toFixed(2))
    r.total = parseFloat((r.sellerComm + r.projetistaComm).toFixed(2))
  }

  // ids de usuários que são projetistas vinculados (p/ excluir da página de parceiros e evitar duplicidade)
  const projetistaUserIds = Array.from(new Set(linkedContacts.map((c: any) => c.linked_user_id)))
  const linkedContactIds = linkedContacts.map((c: any) => c.id)

  return { byUser: result, projetistaUserIds, linkedContactIds }
}

export async function setMonthlyGoal(userId: string | null, target: number, year?: number, month?: number) {
  const auth = await ensureAdmin()
  if ('error' in auth) return { error: auth.error }
  const now = new Date()
  const { error } = await createAdminClient().from('monthly_goals').upsert({
    user_id: userId,
    year: year ?? now.getFullYear(),
    month: month ?? now.getMonth() + 1,
    target,
  }, { onConflict: 'user_id,year,month' })
  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  revalidatePath('/admin')
  revalidatePath('/admin/goals')
  return { ok: true }
}

// ── Payroll (folha de pagamento) ─────────────────────────────────────────────

export async function getPayrollData(year: number, month: number) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('payroll_data')
    .select('*')
    .eq('year', year)
    .eq('month', month)
  if (error) return []
  return data ?? []
}

export async function upsertPayrollEntry(entry: {
  user_id: string | null
  employee_name: string
  year: number
  month: number
  salary_base?: number
  total_proventos?: number
  total_descontos?: number
  liquido?: number
  fgts?: number
  vt_next_month?: number
  receipt_url?: string
  line_items?: { type: string; description: string; value: number }[]
}) {
  const auth = await ensureAdmin()
  if ('error' in auth) return { error: auth.error }
  const { error } = await createAdminClient()
    .from('payroll_data')
    .upsert(entry, { onConflict: 'user_id,year,month' })
  if (error) return { error: error.message }
  revalidatePath('/hr')
  return { ok: true }
}

export async function getPayrollMonthUpload(year: number, month: number) {
  const { data } = await createAdminClient()
    .from('payroll_month_uploads')
    .select('*')
    .eq('year', year)
    .eq('month', month)
    .single()
  return data ?? null
}

export async function savePayrollMonthUpload(year: number, month: number, fileUrl: string, fileName: string) {
  const auth = await ensureAdmin()
  if ('error' in auth) return { error: auth.error }
  const { error } = await createAdminClient()
    .from('payroll_month_uploads')
    .upsert({ year, month, file_url: fileUrl, file_name: fileName }, { onConflict: 'year,month' })
  if (error) return { error: error.message }
  revalidatePath('/hr')
  return { ok: true }
}

export async function deletePayrollMonthUpload(year: number, month: number) {
  const auth = await ensureAdmin()
  if ('error' in auth) return { error: auth.error }
  const { error } = await createAdminClient()
    .from('payroll_month_uploads')
    .delete()
    .eq('year', year)
    .eq('month', month)
  if (error) return { error: error.message }
  revalidatePath('/hr')
  return { ok: true }
}

export async function deletePayrollEntry(year: number, month: number, userId: string) {
  const auth = await ensureAdmin()
  if ('error' in auth) return { error: auth.error }
  const { error } = await createAdminClient()
    .from('payroll_data')
    .delete()
    .eq('year', year)
    .eq('month', month)
    .eq('user_id', userId)
  if (error) return { error: error.message }
  revalidatePath('/hr')
  return { ok: true }
}

export async function getQuoteProposals(quoteId: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('quote_proposals')
    .select('*')
    .eq('quote_id', quoteId)
    .order('created_at', { ascending: true })
  return data ?? []
}

export async function createQuoteProposal(quoteId: string, proposal: { value: number; date?: string; info?: string }) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('quote_proposals')
    .insert({ quote_id: quoteId, ...proposal })
    .select()
    .single()
  if (error) return { error: error.message }
  revalidatePath(`/quotes/${quoteId}`)
  return { data }
}

export async function updateQuoteProposal(id: string, quoteId: string, proposal: { value: number; date?: string; info?: string }) {
  const supabase = createClient()
  const { error } = await supabase.from('quote_proposals').update(proposal).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/quotes/${quoteId}`)
  return {}
}

export async function deleteQuoteProposal(id: string, quoteId: string) {
  const supabase = createClient()
  const { error } = await supabase.from('quote_proposals').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/quotes/${quoteId}`)
  return {}
}

export async function cancelSale(quoteId: string) {
  const supabase = createClient()
  // Reverte temperature para 'hot' (estava em negociação quente antes de fechar)
  const { error: negErr } = await supabase
    .from('negotiations')
    .update({ temperature: 'hot', final_value: null, closed_at: null, payment_splits: [], payment_method: null })
    .eq('quote_id', quoteId)
  if (negErr) return { error: negErr.message }
  const { error: qErr } = await supabase
    .from('quotes')
    .update({ status: 'in_progress' })
    .eq('id', quoteId)
  if (qErr) return { error: qErr.message }
  revalidatePath(`/quotes/${quoteId}`)
  return {}
}

// ── Tasks: persistência de ordem e seção ────────────────────────────────────

export async function updateTasksOrder(updates: { id: string; sort_order: number }[]) {
  const admin = createAdminClient()
  await Promise.all(updates.map(u =>
    admin.from('tasks').update({ sort_order: u.sort_order }).eq('id', u.id)
  ))
  revalidatePath('/dashboard/tasks-v5')
}

export async function pinTaskToToday(id: string, pinned: boolean) {
  const admin = createAdminClient()
  await admin.from('tasks').update({ pinned_to_today: pinned }).eq('id', id)
  revalidatePath('/dashboard/tasks-v5')
}

// ── Notas de Entrada ───────────────────────────────────────────────────────────

export async function getPurchaseInvoices() {
  const { data } = await createAdminClient()
    .from('purchase_invoices')
    .select('*, purchase_invoice_items(count)')
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function getPurchaseInvoice(id: string) {
  const { data } = await createAdminClient()
    .from('purchase_invoices')
    .select('*, purchase_invoice_items(*)')
    .eq('id', id)
    .single()
  return data ?? null
}

export async function upsertPurchaseInvoice(invoice: {
  chave_nfe: string
  numero_nota?: string
  fornecedor_nome?: string
  fornecedor_cnpj?: string
  data_emissao?: string
  comissao?: number
  lucro?: number
  maquininha?: number
}) {
  const auth = await ensureAdmin()
  if ('error' in auth) return { error: auth.error }
  const { data, error } = await createAdminClient()
    .from('purchase_invoices')
    .upsert(invoice, { onConflict: 'chave_nfe' })
    .select()
    .single()
  if (error) return { error: error.message }
  revalidatePath('/purchases')
  return { data }
}

export async function savePurchaseInvoiceItems(invoiceId: string, items: {
  numero_item: number
  descricao: string
  ncm?: string
  codigo_produto?: string
  quantidade: number
  valor_total: number
  ipi_percent: number
  tipo_icms?: string
  valor_icms: number
  valor_fecoep: number
  aliquota_icms?: number
  aliquota_fecoep?: number
  mva_valor?: number
  custo_unitario?: number
  preco_credito?: number
  imposto_ant_percent?: number
}[]) {
  const auth = await ensureAdmin()
  if ('error' in auth) return { error: auth.error }
  const admin = createAdminClient()
  await admin.from('purchase_invoice_items').delete().eq('invoice_id', invoiceId)
  const { error } = await admin.from('purchase_invoice_items').insert(
    items.map(i => ({ ...i, invoice_id: invoiceId }))
  )
  if (error) return { error: error.message }
  revalidatePath('/purchases')
  return { ok: true }
}

export async function deletePurchaseInvoice(id: string) {
  const auth = await ensureAdmin()
  if ('error' in auth) return { error: auth.error }
  const { error } = await createAdminClient()
    .from('purchase_invoices')
    .delete()
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/purchases')
  return { ok: true }
}
