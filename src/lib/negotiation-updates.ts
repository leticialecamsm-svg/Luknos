'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateTemperature, markAsLost } from '@/lib/actions'
import {
  cadenceFor, DAILY_UPDATE_CAP, daysBetween, isOverdue, priorityScore, todayBR,
  type Temp, type QueueCandidate,
} from '@/lib/negotiation-rules'

export type QueueItem = QueueCandidate & {
  number: number
  client: string
  partner: string | null
  daysSilent: number
  cadence: number
  done: boolean
}

const OPEN_TEMPS: Temp[] = ['hot', 'warm', 'cold', 'no_forecast']

/**
 * Negociações em aberto de cada vendedor, com o "último sinal de vida" de
 * cada uma: nota/mudança feita por uma pessoa, troca de temperatura manual ou
 * criação do orçamento. Rebaixamento automático NÃO conta — não é notícia.
 */
async function loadOpenByOwner(onlyUserId?: string) {
  const admin = createAdminClient()

  let ownersQ = admin.from('quote_owners').select('quote_id, user_id')
  if (onlyUserId) ownersQ = ownersQ.eq('user_id', onlyUserId)
  const { data: owners } = await ownersQ.limit(20000)
  const quoteIds = Array.from(new Set((owners ?? []).map(o => o.quote_id)))
  if (quoteIds.length === 0) return new Map<string, QueueItem[]>()

  const [qRes, nRes, aRes, hRes] = await Promise.all([
    admin.from('quotes_full')
      .select('id, number, client_name, architect_id, architect_name, quoted_value, temperature, created_at')
      .in('id', quoteIds),
    admin.from('negotiations').select('quote_id, updated_at, temperature_updated_at').in('quote_id', quoteIds),
    admin.from('activities').select('quote_id, created_at').in('quote_id', quoteIds).not('user_id', 'is', null)
      .order('created_at', { ascending: false }).limit(20000),
    admin.from('neg_temperature_history').select('quote_id, created_at').in('quote_id', quoteIds)
      .eq('auto_demoted', false).order('created_at', { ascending: false }).limit(20000),
  ])

  const latest = new Map<string, string>()
  const bump = (id: string, iso?: string | null) => {
    if (!iso) return
    const cur = latest.get(id)
    if (!cur || iso > cur) latest.set(id, iso)
  }
  ;(aRes.data ?? []).forEach(a => bump(a.quote_id, a.created_at))
  ;(hRes.data ?? []).forEach(h => bump(h.quote_id, h.created_at))
  ;(nRes.data ?? []).forEach(n => { bump(n.quote_id, n.temperature_updated_at) })

  const now = new Date()
  const byQuote = new Map<string, QueueItem>()
  ;(qRes.data ?? []).forEach((q: any) => {
    const temp = (q.temperature ?? 'no_forecast') as string
    if (!OPEN_TEMPS.includes(temp as Temp)) return
    bump(q.id, q.created_at)
    const lastTouch = latest.get(q.id) ?? q.created_at
    byQuote.set(q.id, {
      quoteId: q.id,
      number: q.number,
      client: q.client_name ?? '—',
      partner: q.architect_name ?? null,
      temperature: temp as Temp,
      value: Number(q.quoted_value ?? 0),
      lastTouch,
      daysSilent: daysBetween(lastTouch, now),
      hasPartner: !!q.architect_id,
      cadence: cadenceFor(temp as Temp, !!q.architect_id),
      done: false,
    })
  })

  const map = new Map<string, QueueItem[]>()
  ;(owners ?? []).forEach(o => {
    const item = byQuote.get(o.quote_id)
    if (!item) return
    const list = map.get(o.user_id) ?? []
    list.push(item)
    map.set(o.user_id, list)
  })
  return map
}

function rankOverdue(items: QueueItem[]) {
  const now = new Date()
  return items.filter(i => isOverdue(i, now)).sort((a, b) => priorityScore(b, now) - priorityScore(a, now))
}

/**
 * Garante a lista do dia do vendedor. Na primeira vez que o dia é aberto
 * (pela tela ou pelo lembrete das 17h), separa as N negociações mais
 * importantes que estão atrasadas e grava. Depois disso a lista do dia fica
 * fixa — atualizar uma não puxa outra sozinha (tem o botão "pegar mais").
 */
async function ensureDaily(userId: string, items: QueueItem[]) {
  const admin = createAdminClient()
  const day = todayBR()
  const { data: row } = await admin.from('negotiation_update_daily')
    .select('due_quote_ids, done_quote_ids').eq('user_id', userId).eq('day', day).maybeSingle()
  if (row) return { day, due: row.due_quote_ids as string[], done: row.done_quote_ids as string[] }

  const due = rankOverdue(items).slice(0, DAILY_UPDATE_CAP).map(i => i.quoteId)
  await admin.from('negotiation_update_daily').upsert({ user_id: userId, day, due_quote_ids: due, done_quote_ids: [] })
  return { day, due, done: [] as string[] }
}

export async function getMyUpdateQueue() {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return null

  const items = (await loadOpenByOwner(user.id)).get(user.id) ?? []
  const { due, done } = await ensureDaily(user.id, items)
  const byId = new Map(items.map(i => [i.quoteId, i]))

  const today = due
    .map(id => byId.get(id))
    .filter((i): i is QueueItem => !!i)
    .map(i => ({ ...i, done: done.includes(i.quoteId) }))

  const inToday = new Set(due)
  const backlog = rankOverdue(items).filter(i => !inToday.has(i.quoteId)).length

  return { today, doneCount: today.filter(i => i.done).length, backlog, openTotal: items.length }
}

/** "Pegar mais": puxa as próximas atrasadas pra lista de hoje (conta pra gamificação). */
export async function pullMoreUpdates(count = DAILY_UPDATE_CAP) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const items = (await loadOpenByOwner(user.id)).get(user.id) ?? []
  const { day, due, done } = await ensureDaily(user.id, items)
  const extra = rankOverdue(items).filter(i => !due.includes(i.quoteId)).slice(0, count).map(i => i.quoteId)
  if (extra.length === 0) return { ok: true, added: 0 }
  await createAdminClient().from('negotiation_update_daily')
    .update({ due_quote_ids: [...due, ...extra], done_quote_ids: done, updated_at: new Date().toISOString() })
    .eq('user_id', user.id).eq('day', day)
  return { ok: true, added: extra.length }
}

export type UpdateInput = {
  temperature: Temp | 'lost'
  note: string
  lossReason?: string
}

/**
 * Registro rápido "o que aconteceu com essa negociação". Sempre grava uma
 * nota (é ela que prova que houve contato); troca a temperatura só se mudou.
 * Fechar venda continua no fluxo próprio (precisa de valor e pagamento).
 */
export async function submitNegotiationUpdate(quoteId: string, input: UpdateInput) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const note = input.note.trim()
  if (note.length < 5) return { error: 'Conte em poucas palavras o que aconteceu (mínimo 5 letras).' }
  if (input.temperature === 'lost' && !input.lossReason) return { error: 'Escolha o motivo da perda.' }

  const admin = createAdminClient()
  const { data: neg } = await admin.from('negotiations').select('temperature').eq('quote_id', quoteId).maybeSingle()
  const current = neg?.temperature ?? 'no_forecast'

  if (input.temperature === 'lost') {
    const r = await markAsLost(quoteId, input.lossReason!)
    if (r?.error) return { error: r.error }
  } else if (input.temperature !== current) {
    const r = await updateTemperature(quoteId, input.temperature)
    if (r?.error) return { error: r.error }
  }

  const { error } = await admin.from('activities').insert({
    quote_id: quoteId,
    user_id: user.id,
    type: 'note',
    description: note,
    metadata: { source: 'update_queue', temperature: input.temperature, loss_reason: input.lossReason ?? null },
  })
  if (error) return { error: error.message }

  // Marca como feita na lista de hoje (se estiver lá, ou mesmo fora dela — conta como atualização extra)
  const day = todayBR()
  const { data: row } = await admin.from('negotiation_update_daily')
    .select('due_quote_ids, done_quote_ids').eq('user_id', user.id).eq('day', day).maybeSingle()
  if (row) {
    const done = Array.from(new Set([...(row.done_quote_ids as string[]), quoteId]))
    await admin.from('negotiation_update_daily')
      .update({ done_quote_ids: done, updated_at: new Date().toISOString() })
      .eq('user_id', user.id).eq('day', day)
  }

  revalidatePath(`/quotes/${quoteId}`)
  revalidatePath('/dashboard/tasks')
  return { ok: true }
}

// ── Usado pelo lembrete das 17h e pelos relatórios ──────────────────────────

export async function buildTeamUpdateSnapshot() {
  const byOwner = await loadOpenByOwner()
  const out: { userId: string; today: QueueItem[]; done: string[]; backlog: number; open: number }[] = []
  for (const [userId, items] of Array.from(byOwner.entries())) {
    const { due, done } = await ensureDaily(userId, items)
    const byId = new Map(items.map(i => [i.quoteId, i]))
    const today = due.map(id => byId.get(id)).filter((i): i is QueueItem => !!i)
    const backlog = rankOverdue(items).filter(i => !due.includes(i.quoteId)).length
    out.push({ userId, today, done, backlog, open: items.length })
  }
  return out
}

/** Saúde das atualizações por vendedor: situação de hoje + constância dos últimos 30 dias. */
export async function getTeamUpdateHealth() {
  const admin = createAdminClient()
  const byOwner = await loadOpenByOwner()
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const day = todayBR()

  const [{ data: daily }, { data: users }] = await Promise.all([
    admin.from('negotiation_update_daily').select('user_id, day, due_quote_ids, done_quote_ids').gte('day', since),
    admin.from('users').select('id, name, avatar_color').eq('active', true),
  ])
  const userMap = new Map((users ?? []).map(u => [u.id, u]))

  // Totais da equipe sem contar duas vezes orçamento com mais de um responsável
  const unique = new Map<string, QueueItem>()
  Array.from(byOwner.values()).flat().forEach(i => unique.set(i.quoteId, i))
  const uniqueOverdue = rankOverdue(Array.from(unique.values()))
  const team = {
    open: unique.size,
    overdue: uniqueOverdue.length,
    overdueValue: uniqueOverdue.reduce((s, i) => s + i.value, 0),
  }

  const sellers = Array.from(byOwner.entries())
    .filter(([id]) => userMap.has(id))
    .map(([userId, items]) => {
      const rows = (daily ?? []).filter(d => d.user_id === userId)
      const todayRow = rows.find(r => r.day === day)
      const dueSum = rows.reduce((s, r) => s + (r.due_quote_ids?.length ?? 0), 0)
      const doneSum = rows.reduce((s, r) => s + (r.done_quote_ids ?? []).filter((q: string) => (r.due_quote_ids ?? []).includes(q)).length, 0)
      const overdue = rankOverdue(items)
      return {
        userId,
        name: userMap.get(userId)?.name ?? '—',
        color: userMap.get(userId)?.avatar_color ?? '#6B7280',
        open: items.length,
        overdue: overdue.length,
        overdueValue: overdue.reduce((s, i) => s + i.value, 0),
        todayDue: todayRow?.due_quote_ids?.length ?? 0,
        todayDone: (todayRow?.done_quote_ids ?? []).length,
        compliance30: dueSum ? doneSum / dueSum : null,
        daysTracked: rows.length,
      }
    })
    .sort((a, b) => b.overdue - a.overdue)

  return { sellers, team }
}
