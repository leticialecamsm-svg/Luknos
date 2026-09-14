'use server'

// Ações da nova página /design-projects (Visitas + Projetos): a "Solicitação"
// pedida pela gestora, mas como registros SEPARADOS e linkados por FK — não
// um card único atravessando os setores — porque uma venda fechada pode
// precisar estar em Projetos (planta de alocação) e em Expedição (separação)
// ao mesmo tempo.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createQuote } from '@/lib/actions'

const BASE_PATH = '/design-projects'

async function requireUser() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// ── Visitas ───────────────────────────────────────────────────────────────

export async function listVisits() {
  const supabase = createClient()
  const { data } = await supabase
    .from('visits')
    .select('id, title, status, scheduled_at, scheduled_time, address, notes, quote_id, design_project_id, created_at, client:client_id(id, name, phone), architect:architect_id(id, name)')
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
  return (data ?? []) as any[]
}

export async function createVisit(input: {
  client_id: string
  architect_id?: string | null
  title: string
  scheduled_at?: string | null
  scheduled_time?: string | null
  address?: string | null
  notes?: string | null
}) {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const supabase = createClient()
  const { data, error } = await supabase.from('visits').insert({
    client_id: input.client_id,
    architect_id: input.architect_id || null,
    title: input.title,
    scheduled_at: input.scheduled_at || null,
    scheduled_time: input.scheduled_time || null,
    address: input.address || null,
    notes: input.notes || null,
    status: input.scheduled_at ? 'scheduled' : 'to_schedule',
    created_by: user.id,
  }).select('id').single()
  if (error) return { error: error.message }
  revalidatePath(BASE_PATH)
  return { data }
}

export async function updateVisitStatus(id: string, status: 'to_schedule' | 'scheduled' | 'done' | 'not_needed') {
  const supabase = createClient()
  const { error } = await supabase.from('visits').update({ status }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(BASE_PATH)
  return { ok: true }
}

// Visita -> Projeto (visita virou uma solicitação de projeto luminotécnico)
export async function evolveVisitToProject(visitId: string, input: { title: string; description?: string | null }) {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const supabase = createClient()
  const { data: visit, error: visitError } = await supabase.from('visits').select('client_id, architect_id').eq('id', visitId).single()
  if (visitError || !visit) return { error: visitError?.message ?? 'Visita não encontrada' }
  if (!visit.client_id) return { error: 'Visita sem cliente vinculado' }

  const { data: project, error } = await supabase.from('design_projects').insert({
    client_id: visit.client_id,
    architect_id: visit.architect_id,
    title: input.title,
    description: input.description || null,
    visit_id: visitId,
    created_by: user.id,
  }).select('id').single()
  if (error) return { error: error.message }

  await supabase.from('visits').update({ design_project_id: project.id }).eq('id', visitId)
  revalidatePath(BASE_PATH)
  return { data: project }
}

// Visita -> Orçamento direto (pula o setor de projetos)
export async function evolveVisitToQuote(visitId: string, input: {
  category: string
  origin?: string
  priority?: string
  quoted_value?: number
  notes?: string
}) {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const supabase = createClient()
  const { data: visit, error: visitError } = await supabase.from('visits').select('client_id, architect_id').eq('id', visitId).single()
  if (visitError || !visit) return { error: visitError?.message ?? 'Visita não encontrada' }
  if (!visit.client_id) return { error: 'Visita sem cliente vinculado' }

  const res = await createQuote({
    client_id: visit.client_id,
    architect_id: visit.architect_id ?? undefined,
    origin: input.origin ?? 'visit',
    category: input.category,
    priority: input.priority ?? 'normal',
    quoted_value: input.quoted_value,
    notes: input.notes,
    primary_owner_id: user.id,
  })
  if ('error' in res) return res

  await supabase.from('visits').update({ quote_id: res.data!.id }).eq('id', visitId)
  revalidatePath(BASE_PATH)
  revalidatePath('/quotes')
  return res
}

// ── Projetos ──────────────────────────────────────────────────────────────

export async function listDesignProjects() {
  const supabase = createClient()
  const { data } = await supabase
    .from('design_projects')
    .select('id, number, title, description, status, quote_id, visit_id, created_at, client:client_id(id, name, phone), architect:architect_id(id, name)')
    .order('created_at', { ascending: false })
  return (data ?? []) as any[]
}

export async function createDesignProject(input: {
  client_id: string
  architect_id?: string | null
  title: string
  description?: string | null
}) {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const supabase = createClient()
  const { data, error } = await supabase.from('design_projects').insert({
    client_id: input.client_id,
    architect_id: input.architect_id || null,
    title: input.title,
    description: input.description || null,
    created_by: user.id,
  }).select('id').single()
  if (error) return { error: error.message }
  revalidatePath(BASE_PATH)
  return { data }
}

export async function updateDesignProjectStatus(id: string, status: 'fila' | 'em_andamento' | 'concluido') {
  const supabase = createClient()
  const { error } = await supabase.from('design_projects').update({ status }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(BASE_PATH)
  return { ok: true }
}

// Projeto -> Orçamento (projeto concluído já vira um orçamento formal)
export async function evolveProjectToQuote(projectId: string, input: {
  category: string
  origin?: string
  priority?: string
  quoted_value?: number
  notes?: string
}) {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const supabase = createClient()
  const { data: project, error: projError } = await supabase.from('design_projects').select('client_id, architect_id').eq('id', projectId).single()
  if (projError || !project) return { error: projError?.message ?? 'Projeto não encontrado' }

  const res = await createQuote({
    client_id: project.client_id,
    architect_id: project.architect_id ?? undefined,
    origin: input.origin ?? 'other',
    category: input.category,
    priority: input.priority ?? 'normal',
    quoted_value: input.quoted_value,
    notes: input.notes,
    primary_owner_id: user.id,
  })
  if ('error' in res) return res

  await supabase.from('design_projects').update({ quote_id: res.data!.id }).eq('id', projectId)
  revalidatePath(BASE_PATH)
  revalidatePath('/quotes')
  return res
}

// Venda já fechada (negociação) precisa voltar pro setor de projetos pra
// fazer a planta de alocação de pontos — nasce um projeto novo já linkado
// ao orçamento/negociação, simultâneo à expedição em curso.
export async function createProjectFromQuote(quoteId: string, input: { title: string; description?: string | null }) {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const supabase = createClient()
  const { data: quote, error: quoteError } = await supabase.from('quotes').select('client_id, architect_id').eq('id', quoteId).single()
  if (quoteError || !quote) return { error: quoteError?.message ?? 'Orçamento não encontrado' }

  const { data, error } = await supabase.from('design_projects').insert({
    client_id: quote.client_id,
    architect_id: quote.architect_id,
    title: input.title,
    description: input.description || null,
    quote_id: quoteId,
    created_by: user.id,
  }).select('id').single()
  if (error) return { error: error.message }
  revalidatePath(BASE_PATH)
  return { data }
}
