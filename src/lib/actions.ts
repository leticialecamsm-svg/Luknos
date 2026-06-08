'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { QuoteStatus, NegTemperature } from '@/types'

export async function getMyQuotes() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from('quotes_full')
    .select('*')
    .filter('owners', 'cs', JSON.stringify([{ user_id: user.id }]))
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function getAllQuotes() {
  const supabase = createClient()
  const { data } = await supabase
    .from('quotes_full')
    .select('*')
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function getQuoteById(id: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('quotes_full')
    .select('*')
    .eq('id', id)
    .single()
  return data
}

export async function getQuoteActivities(quoteId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('activities')
    .select('*, user:users(name, avatar_color)')
    .eq('quote_id', quoteId)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function createQuote(formData: {
  client_id: string
  architect_id?: string
  origin: string
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

export async function updateQuoteStatus(quoteId: string, status: QuoteStatus) {
  const supabase = createClient()
  const { error } = await supabase.from('quotes').update({ status }).eq('id', quoteId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  revalidatePath('/quotes')
  return { ok: true }
}

export async function updateTemperature(quoteId: string, temperature: NegTemperature) {
  const supabase = createClient()
  const { error } = await supabase
    .from('negotiations')
    .upsert({ quote_id: quoteId, temperature }, { onConflict: 'quote_id' })
  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  revalidatePath('/quotes')
  return { ok: true }
}

export async function closeSale(quoteId: string, data: {
  final_value: number
  payment_method: string
  notes?: string
}) {
  const supabase = createClient()
  const { error: negError } = await supabase
    .from('negotiations')
    .upsert({
      quote_id: quoteId, temperature: 'closed',
      final_value: data.final_value, payment_method: data.payment_method,
      closed_at: new Date().toISOString().split('T')[0], notes: data.notes || null,
    }, { onConflict: 'quote_id' })
  if (negError) return { error: negError.message }
  await supabase.from('quotes').update({ status: 'done' }).eq('id', quoteId)
  revalidatePath('/dashboard')
  revalidatePath('/quotes')
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

export async function searchContacts(query: string, type?: string) {
  const supabase = createClient()
  let q = supabase.from('contacts').select('id, name, phone, type, company').ilike('name', `%${query}%`)
  if (type) q = q.eq('type', type)
  const { data } = await q.limit(10)
  return data ?? []
}

export async function getAllContacts(type?: string) {
  const supabase = createClient()
  let q = supabase.from('contacts').select('*').order('name')
  if (type) q = q.eq('type', type)
  const { data } = await q
  return data ?? []
}

export async function createContact(data: {
  name: string; phone?: string; email?: string; type: string; company?: string
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  const { data: contact, error } = await supabase
    .from('contacts')
    .insert({ ...data, created_by: user.id })
    .select()
    .single()
  if (error) return { error: error.message }
  return { data: contact }
}

export async function deleteContact(id: string) {
  const supabase = createClient()
  const { error } = await supabase.from('contacts').delete().eq('id', id)
  if (error) return { error: error.message }
  return { ok: true }
}

export async function getDashboardStats(userId?: string) {
  const supabase = createClient()
  const funnelQuery = supabase.from('funnel_by_user').select('*')
  const { data: funnel } = userId ? await funnelQuery.eq('user_id', userId) : await funnelQuery
  const now = new Date()
  const { data: sales } = await supabase
    .from('sales_by_month').select('*')
    .eq('year', now.getFullYear()).eq('month', now.getMonth() + 1)
  const { data: goal } = await supabase
    .from('monthly_goals').select('target')
    .is('user_id', null)
    .eq('year', now.getFullYear()).eq('month', now.getMonth() + 1)
    .single()
  return { funnel: funnel ?? [], sales: sales ?? [], storeGoal: goal?.target ?? 0 }
}

export async function getActiveUsers() {
  const supabase = createClient()
  const { data } = await supabase.from('users').select('id, name, avatar_color, role').eq('active', true).order('name')
  return data ?? []
}

export async function updateQuote(quoteId: string, data: {
  client_id?: string
  architect_id?: string | null
  origin?: string
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
  const PRIORITY_PT: Record<string, string> = { normal: 'Normal', high: 'Alta', urgent: 'Urgente' }
  const ORIGIN_PT: Record<string, string> = { store: 'Loja', whatsapp: 'WhatsApp', visit: 'Visita', referral: 'Indicação', other: 'Outro' }
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
      type: 'note', description: `✏️ Editado — ${changes.join(' · ')}`,
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

// Schedules (Agendamentos)
export async function createSchedule(data: {
  title: string
  type: 'visita' | 'reuniao' | 'follow_up'
  quote_id?: string
  scheduled_date: string
  scheduled_time: string
  location: string
  team_members: string[]
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { v4: uuidv4 } = await import('uuid')
  const id = uuidv4()

  const { error } = await supabase.from('schedules').insert({
    id,
    title: data.title,
    type: data.type,
    quote_id: data.quote_id || null,
    scheduled_date: data.scheduled_date,
    scheduled_time: data.scheduled_time,
    location: data.location,
    created_by: user.id,
    team_members: data.team_members,
    created_at: new Date().toISOString(),
  })

  if (error) return { error: error.message }
  revalidatePath('/schedules')
  revalidatePath('/dashboard')
  return { ok: true, id }
}

export async function getSchedules(startDate?: string, endDate?: string) {
  const supabase = createClient()
  let query = supabase.from('schedules').select('*, quote:quotes(number, client_name), creator:users(name, avatar_color)').order('scheduled_date', { ascending: true }).order('scheduled_time', { ascending: true })

  if (startDate && endDate) {
    query = query.gte('scheduled_date', startDate).lte('scheduled_date', endDate)
  }

  const { data } = await query
  return data ?? []
}

export async function getSchedulesByDate(date: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('schedules')
    .select('*, quote:quotes(number, client_name), creator:users(name, avatar_color)')
    .eq('scheduled_date', date)
    .order('scheduled_time', { ascending: true })
  return data ?? []
}

export async function deleteSchedule(id: string) {
  const supabase = createClient()
  const { error } = await supabase.from('schedules').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/schedules')
  revalidatePath('/dashboard')
  return { ok: true }
}