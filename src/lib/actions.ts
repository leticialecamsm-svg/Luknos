'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { QuoteStatus, NegTemperature } from '@/types'

// Injeta avatar_url nos owners dos orçamentos (a view quotes_full só traz avatar_color)
async function enrichOwnersAvatars(quotes: any[]) {
  if (!quotes.length) return quotes
  const ids = Array.from(new Set(
    quotes.flatMap(q => (q.owners ?? []).map((o: any) => o.user_id)).filter(Boolean)
  ))
  if (!ids.length) return quotes
  const { data: users } = await createAdminClient()
    .from('users')
    .select('id, avatar_url')
    .in('id', ids)
  const map = new Map((users ?? []).map(u => [u.id, u.avatar_url]))
  return quotes.map(q => ({
    ...q,
    owners: (q.owners ?? []).map((o: any) => ({ ...o, avatar_url: map.get(o.user_id) ?? null })),
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
  const { data } = await supabase
    .from('activities')
    .select('*, user:users(name, avatar_color, avatar_url)')
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
  payment_splits: { method_key: string; amount: number }[]
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
  payment_splits?: { method_key: string; amount: number }[]
  notes?: string
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
  const { error: updateError } = await supabase.from('quotes').update({ status: 'done' }).eq('id', quoteId)
  if (updateError) return { error: updateError.message }

  // Create shipment automatically after closing sale (use admin to bypass RLS)
  await createAdminClient()
    .from('shipments')
    .upsert({ quote_id: quoteId }, { onConflict: 'quote_id' })

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

export async function createContact(data: {
  name: string; phone?: string; email?: string; type: string; company?: string; new_prospection?: boolean; assigned_to?: string; commission_rate?: number | null
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
  name?: string; phone?: string; email?: string; type?: string; company?: string; new_prospection?: boolean; assigned_to?: string; commission_rate?: number | null
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
  return { data: contact }
}

export async function getProspectionsThisMonth(userId?: string) {
  const supabase = createClient()
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()
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
  const { data } = await supabase.from('users').select('id, name, avatar_color, avatar_url, role').eq('active', true).order('name')
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

  const { data: result, error } = await supabase.from('schedules').insert({
    title: data.title,
    type: data.type,
    quote_id: data.quote_id || null,
    scheduled_date: data.scheduled_date,
    scheduled_time: data.scheduled_time,
    location: data.location,
    created_by: user.id,
    team_members: data.team_members,
  }).select()

  if (error) return { error: error.message }
  revalidatePath('/schedules')
  revalidatePath('/dashboard')
  return { ok: true, id: result?.[0]?.id }
}

export async function getSchedules(startDate?: string, endDate?: string) {
  const supabase = createClient()
  let query = supabase.from('schedules').select('*, quote:quotes(number, client_name), creator:users(name, avatar_color, avatar_url)').order('scheduled_date', { ascending: true }).order('scheduled_time', { ascending: true })

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
    .select('*, quote:quotes(number, client_name), creator:users(name, avatar_color, avatar_url)')
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

  // Enriquecer com dados do orçamento (quotes_full tem client_name)
  const quoteIds = shipments.map((s: any) => s.quote_id).filter(Boolean)
  const { data: quotes } = await admin
    .from('quotes_full')
    .select('id, number, quoted_value, final_value, client_name, architect_name')
    .in('id', quoteIds)
  const quotesMap = Object.fromEntries((quotes ?? []).map((q: any) => [q.id, q]))

  return shipments.map((s: any) => {
    const q = quotesMap[s.quote_id] ?? {}
    return {
      ...s,
      quote_number: q.number,
      quoted_value: q.final_value ?? q.quoted_value,
      client_name: q.client_name ?? '—',
      architect_name: q.architect_name ?? null,
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
    .select('*, contact:contacts(id, name, commission_rate), quote:quotes(number, quoted_value)')
    .gte('due_date', start)
    .lte('due_date', end)
    .order('due_date')
  if (error) return []
  return data ?? []
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
