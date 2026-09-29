'use server'

// Server actions da Solicitação (Lote 1). Mesmo padrão de
// src/lib/policies/actions.ts: sem RLS nas tabelas novas, então toda leitura
// e escrita passa por aqui com o admin client, e cada action confere login
// antes de fazer qualquer coisa.
//
// getSolicitation junta tudo que está linkado por solicitation_id nas
// tabelas de sempre (quotes, negotiations, shipments, visits,
// design_projects) mais as tabelas novas desta Solicitação
// (purchase_checklist_items, installation_trackings, post_sale_followups) —
// registros separados, como documentado em design-projects-actions.ts e na
// migration 20260929_solicitations_core.sql, não um card único.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type R = { error?: string; ok?: boolean; id?: string }

async function requireUser() {
  const { data: { user } } = await createClient().auth.getUser()
  return user
}

function refresh(id?: string) {
  revalidatePath('/solicitacoes')
  if (id) revalidatePath(`/solicitacoes/${id}`)
}

// ── Leitura consolidada ───────────────────────────────────────────────────

export type SolicitationView = {
  id: string
  number: number
  clientId: string
  clientName: string | null
  architectId: string | null
  architectName: string | null
  createdAt: string
  quotes: any[]
  negotiations: any[]
  shipments: any[]
  visits: any[]
  designProjects: any[]
  purchaseChecklistItems: any[]
  installationTrackings: any[]
  postSaleFollowups: any[]
  tabs: {
    visita: boolean
    projeto: boolean
    orcamento: boolean
    negociacao: boolean
    compra: boolean
    expedicao: boolean
    instalacao: boolean
    posVenda: boolean
  }
}

export async function getSolicitation(id: string): Promise<SolicitationView | null> {
  const user = await requireUser()
  if (!user) return null
  const db = createAdminClient()

  const { data: solicitation } = await db
    .from('solicitations')
    .select('id, number, client_id, architect_id, created_at, client:client_id(id, name), architect:architect_id(id, name)')
    .eq('id', id)
    .maybeSingle()
  if (!solicitation) return null

  const [
    { data: quotes },
    { data: negotiations },
    { data: shipments },
    { data: visits },
    { data: designProjects },
    { data: purchaseChecklistItems },
    { data: installationTrackings },
    { data: postSaleFollowups },
  ] = await Promise.all([
    db.from('quotes').select('*').eq('solicitation_id', id).order('created_at', { ascending: false }),
    db.from('negotiations').select('*').eq('solicitation_id', id),
    db.from('shipments').select('*').eq('solicitation_id', id).order('created_at', { ascending: false }),
    db.from('visits').select('*').eq('solicitation_id', id).order('created_at', { ascending: false }),
    db.from('design_projects').select('*').eq('solicitation_id', id).order('created_at', { ascending: false }),
    db.from('purchase_checklist_items').select('*').eq('solicitation_id', id).order('created_at', { ascending: true }),
    db.from('installation_trackings').select('*').eq('solicitation_id', id).order('created_at', { ascending: false }),
    db.from('post_sale_followups').select('*').eq('solicitation_id', id).order('created_at', { ascending: false }),
  ])

  return {
    id: solicitation.id,
    number: solicitation.number,
    clientId: solicitation.client_id,
    clientName: (solicitation as any).client?.name ?? null,
    architectId: solicitation.architect_id,
    architectName: (solicitation as any).architect?.name ?? null,
    createdAt: solicitation.created_at,
    quotes: quotes ?? [],
    negotiations: negotiations ?? [],
    shipments: shipments ?? [],
    visits: visits ?? [],
    designProjects: designProjects ?? [],
    purchaseChecklistItems: purchaseChecklistItems ?? [],
    installationTrackings: installationTrackings ?? [],
    postSaleFollowups: postSaleFollowups ?? [],
    tabs: {
      visita: (visits ?? []).length > 0,
      projeto: (designProjects ?? []).length > 0,
      orcamento: (quotes ?? []).length > 0,
      negociacao: (negotiations ?? []).length > 0,
      compra: (purchaseChecklistItems ?? []).length > 0,
      expedicao: (shipments ?? []).length > 0,
      instalacao: (installationTrackings ?? []).length > 0,
      posVenda: (postSaleFollowups ?? []).length > 0,
    },
  }
}

// ── Compra de material (purchase_checklist_items) ────────────────────────

export async function savePurchaseChecklistItem(input: {
  id?: string
  solicitationId: string
  description: string
  supplier?: string | null
  status?: 'a_pedir' | 'pedido' | 'recebido'
}): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  if (!input.description.trim()) return { error: 'Descreva o item' }
  const db = createAdminClient()
  if (input.id) {
    const { error } = await db.from('purchase_checklist_items').update({
      description: input.description.trim(),
      supplier: input.supplier || null,
      status: input.status ?? 'a_pedir',
    }).eq('id', input.id)
    if (error) return { error: error.message }
    refresh(input.solicitationId)
    return { ok: true, id: input.id }
  }
  const { data, error } = await db.from('purchase_checklist_items').insert({
    solicitation_id: input.solicitationId,
    description: input.description.trim(),
    supplier: input.supplier || null,
    status: input.status ?? 'a_pedir',
    created_by: user.id,
  }).select('id').single()
  if (error) return { error: error.message }
  refresh(input.solicitationId)
  return { ok: true, id: data?.id }
}

export async function deletePurchaseChecklistItem(id: string, solicitationId: string): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const { error } = await createAdminClient().from('purchase_checklist_items').delete().eq('id', id)
  if (error) return { error: error.message }
  refresh(solicitationId)
  return { ok: true }
}

// ── Acompanhamento de instalação (installation_trackings) ────────────────

export async function saveInstallationTracking(input: {
  id?: string
  solicitationId: string
  scheduledDate?: string | null
  team?: string | null
  status?: 'agendada' | 'em_andamento' | 'concluida' | 'com_pendencia'
  photos?: string[]
  notes?: string | null
}): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const db = createAdminClient()
  const payload = {
    scheduled_date: input.scheduledDate || null,
    team: input.team || null,
    status: input.status ?? 'agendada',
    photos: input.photos ?? [],
    notes: input.notes || null,
  }
  if (input.id) {
    const { error } = await db.from('installation_trackings').update(payload).eq('id', input.id)
    if (error) return { error: error.message }
    refresh(input.solicitationId)
    return { ok: true, id: input.id }
  }
  const { data, error } = await db.from('installation_trackings').insert({
    solicitation_id: input.solicitationId,
    ...payload,
    created_by: user.id,
  }).select('id').single()
  if (error) return { error: error.message }
  refresh(input.solicitationId)
  return { ok: true, id: data?.id }
}

export async function deleteInstallationTracking(id: string, solicitationId: string): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const { error } = await createAdminClient().from('installation_trackings').delete().eq('id', id)
  if (error) return { error: error.message }
  refresh(solicitationId)
  return { ok: true }
}

// ── Pós-venda (post_sale_followups) ───────────────────────────────────────

export async function savePostSaleFollowup(input: {
  id?: string
  solicitationId: string
  contactedAt?: string | null
  satisfaction?: string | null
  issueReported?: string | null
  resolution?: string | null
}): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const db = createAdminClient()
  const payload = {
    contacted_at: input.contactedAt || null,
    satisfaction: input.satisfaction || null,
    issue_reported: input.issueReported || null,
    resolution: input.resolution || null,
  }
  if (input.id) {
    const { error } = await db.from('post_sale_followups').update(payload).eq('id', input.id)
    if (error) return { error: error.message }
    refresh(input.solicitationId)
    return { ok: true, id: input.id }
  }
  const { data, error } = await db.from('post_sale_followups').insert({
    solicitation_id: input.solicitationId,
    ...payload,
    created_by: user.id,
  }).select('id').single()
  if (error) return { error: error.message }
  refresh(input.solicitationId)
  return { ok: true, id: data?.id }
}

export async function deletePostSaleFollowup(id: string, solicitationId: string): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const { error } = await createAdminClient().from('post_sale_followups').delete().eq('id', id)
  if (error) return { error: error.message }
  refresh(solicitationId)
  return { ok: true }
}
