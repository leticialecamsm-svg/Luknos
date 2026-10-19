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
import { updateShipment, updateTemperature } from '@/lib/actions'
import { updateDesignProjectStatus } from '@/lib/design-projects-actions'
import {
  findOrCreateFolder, uploadFile, createResumableUploadSession, trashFile,
  isDriveConnected, driveRootFolderId, folderIdFromLink,
  listFolderFiles, type DriveFileItem,
} from '@/lib/google-drive'

type R = { error?: string; ok?: boolean; id?: string }

export type SolicitationEvent = {
  id: string
  stage: string | null
  kind: 'note' | 'system'
  description: string
  created_at: string
  created_by: string | null
  authorName: string | null
  authorAvatarColor: string | null
  authorAvatarUrl: string | null
}

export type CrmConversationOption = {
  id: string
  instanceLabel: string
  phone: string | null
  contactName: string | null
  assignedName: string | null
  lastAt: string | null
  lastBody: string | null
  lastDirection: 'inbound' | 'outbound' | null
  lastType: string | null
}

export type StageLink = {
  id: string
  kind: 'contact' | 'conversation'
  refId: string
  label: string
  sublabel: string | null
  phone: string | null
  href: string | null
}

export type StageFileStage = 'visita' | 'projeto' | 'orcamento' | 'compra' | 'expedicao' | 'instalacao' | 'posVenda'

async function requireUser() {
  const { data: { user } } = await createClient().auth.getUser()
  return user
}

function refresh(id?: string) {
  revalidatePath('/solicitacoes')
  if (id) revalidatePath(`/solicitacoes/${id}`)
}

// Registro de histórico best-effort: NUNCA derruba nem atrasa a action
// principal. Se a tabela ainda não existir (migration não aplicada) ou o
// insert falhar, só loga no servidor e segue.
async function logSolicitationEvent(
  solicitationId: string,
  stage: string | null,
  description: string,
  userId: string | null,
  kind: 'note' | 'system' = 'system'
): Promise<void> {
  try {
    const { error } = await createAdminClient().from('solicitation_events').insert({
      solicitation_id: solicitationId,
      stage,
      kind,
      description,
      created_by: userId,
    })
    if (error) console.error('[logSolicitationEvent]', error.message)
  } catch (e) {
    console.error('[logSolicitationEvent]', e)
  }
}

// Nota manual de qualquer colaborador no Histórico da Solicitação.
export async function addSolicitationNote(solicitationId: string, text: string): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const clean = text.trim()
  if (!clean) return { error: 'Escreva a nota' }
  const { error } = await createAdminClient().from('solicitation_events').insert({
    solicitation_id: solicitationId,
    stage: null,
    kind: 'note',
    description: clean.slice(0, 2000),
    created_by: user.id,
  })
  if (error) return { error: error.message }
  refresh(solicitationId)
  return { ok: true }
}

// ── Leitura consolidada ───────────────────────────────────────────────────

export type SolicitationView = {
  id: string
  number: number
  title: string | null
  clientId: string
  clientName: string | null
  clientPhone: string | null
  clientEmail: string | null
  architectId: string | null
  architectName: string | null
  // Campos de caracterização (agora na tabela solicitations)
  category: string | null
  size: string | null
  origin: string | null
  workStage: string | null
  priority: string
  createdAt: string
  quotes: any[]
  negotiations: any[]
  shipments: any[]
  visits: any[]
  designProjects: any[]
  purchaseChecklistItems: any[]
  installationTrackings: any[]
  postSaleFollowups: any[]
  suppliers: { id: string; name: string }[]
  // Histórico manual/automático (solicitation_events), mais novo primeiro.
  events: SolicitationEvent[]
  // Usuários distintos que criaram registros desta Solicitação (created_by).
  team: { id: string; name: string; avatar_color: string | null; avatar_url: string | null }[]
  // Contatos e conversas do CRM ligados a cada etapa (chave = stage id).
  stageLinks: Record<string, StageLink[]>
  // Responsáveis designados por etapa (chave = stage id).
  stageResponsibles: Record<string, { id: string; name: string; avatar_url: string | null; avatar_color: string | null }[]>
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
    .select('id, number, title, client_id, architect_id, created_by, created_at, category, size, origin, work_stage, priority, client:client_id(id, name, phone, email), architect:architect_id(id, name)')
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
    { data: suppliers },
  ] = await Promise.all([
    db.from('quotes').select('*').eq('solicitation_id', id).order('created_at', { ascending: false }),
    db.from('negotiations').select('*').eq('solicitation_id', id),
    db.from('shipments').select('*').eq('solicitation_id', id).order('created_at', { ascending: false }),
    db.from('visits').select('*').eq('solicitation_id', id).order('created_at', { ascending: false }),
    db.from('design_projects').select('*').eq('solicitation_id', id).order('created_at', { ascending: false }),
    db.from('purchase_checklist_items').select('*').eq('solicitation_id', id).order('created_at', { ascending: true }),
    db.from('installation_trackings').select('*').eq('solicitation_id', id).order('created_at', { ascending: false }),
    db.from('post_sale_followups').select('*').eq('solicitation_id', id).order('created_at', { ascending: false }),
    // Fornecedores (tabela já usada no módulo de precificação/orçamento —
    // src/lib/pricing/actions.ts — reaproveitada aqui pro dropdown de
    // "Compra de material" em vez de texto livre).
    db.from('pricing_suppliers').select('id, name').eq('is_active', true).order('name'),
  ])

  // Responsáveis por etapa (tabela nova 20261012). Best-effort: se a migração
  // ainda não foi aplicada, só devolve mapa vazio.
  let stageRespMap: Record<string, { id: string; name: string; avatar_url: string | null; avatar_color: string | null }[]> = {}
  try {
    const { data } = await db
      .from('solicitation_stage_responsibles')
      .select('stage, user:user_id(id, name, avatar_url, avatar_color)')
      .eq('solicitation_id', id)
    for (const row of (data ?? []) as any[]) {
      const u = row.user
      if (!u) continue
      ;(stageRespMap[row.stage] ??= []).push({
        id: u.id, name: u.name, avatar_url: u.avatar_url ?? null, avatar_color: u.avatar_color ?? null,
      })
    }
  } catch {}

  // Contatos/conversas ligados às etapas. Conversas são lidas com a sessão do
  // próprio usuário: o RLS do CRM esconde as privadas/restritas.
  const stageLinks: Record<string, StageLink[]> = {}
  try {
    const { data: links } = await db
      .from('solicitation_stage_links')
      .select('id, stage, kind, ref_id')
      .eq('solicitation_id', id)
      .order('created_at', { ascending: true })
    const rows = (links ?? []) as any[]
    const contactIds = rows.filter(l => l.kind === 'contact').map(l => l.ref_id)
    const convIds = rows.filter(l => l.kind === 'conversation').map(l => l.ref_id)
    const [{ data: cs }, convInfo] = await Promise.all([
      contactIds.length ? db.from('contacts').select('id, name, phone').in('id', contactIds) : Promise.resolve({ data: [] as any[] }),
      convIds.length ? resolveConversationLabels(convIds) : Promise.resolve(new Map<string, { label: string; sublabel: string | null; phone: string | null }>()),
    ])
    const contactById = new Map<string, any>((cs ?? []).map((c: any) => [c.id, c]))
    for (const l of rows) {
      let item: StageLink | null = null
      if (l.kind === 'contact') {
        const c = contactById.get(l.ref_id)
        if (c) item = { id: l.id, kind: 'contact', refId: l.ref_id, label: c.name, sublabel: c.phone ?? null, phone: c.phone ?? null, href: null }
      } else {
        const c = convInfo.get(l.ref_id)
        if (c) item = { id: l.id, kind: 'conversation', refId: l.ref_id, label: c.label, sublabel: c.sublabel, phone: c.phone, href: `/crm/conversas?c=${l.ref_id}` }
      }
      if (item) (stageLinks[l.stage] ??= []).push(item)
    }
  } catch {}

  // Histórico: se a tabela ainda não existe (migration pendente), vira vazio.
  let eventRows: any[] = []
  try {
    const { data, error } = await db
      .from('solicitation_events')
      .select('id, stage, kind, description, created_by, created_at')
      .eq('solicitation_id', id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (!error) eventRows = data ?? []
  } catch {
    eventRows = []
  }

  // Equipe envolvida: created_by distintos da Solicitação e dos registros.
  const creatorIds = Array.from(new Set(
    [
      (solicitation as any).created_by,
      ...(visits ?? []).map((r: any) => r.created_by),
      ...(designProjects ?? []).map((r: any) => r.created_by),
      ...(purchaseChecklistItems ?? []).map((r: any) => r.created_by),
      ...(installationTrackings ?? []).map((r: any) => r.created_by),
      ...(postSaleFollowups ?? []).map((r: any) => r.created_by),
      ...eventRows.map((r: any) => r.created_by),
    ].filter(Boolean) as string[]
  ))
  const { data: teamUsers } = creatorIds.length
    ? await db.from('users').select('id, name, avatar_color, avatar_url').in('id', creatorIds)
    : { data: [] as any[] }

  const userById = new Map<string, any>((teamUsers ?? []).map((u: any) => [u.id, u]))
  const events: SolicitationEvent[] = eventRows.map((e: any) => {
    const u = e.created_by ? userById.get(e.created_by) : null
    return {
      id: e.id,
      stage: e.stage ?? null,
      kind: e.kind === 'note' ? 'note' : 'system',
      description: e.description,
      created_at: e.created_at,
      created_by: e.created_by ?? null,
      authorName: u?.name ?? null,
      authorAvatarColor: u?.avatar_color ?? null,
      authorAvatarUrl: u?.avatar_url ?? null,
    }
  })

  return {
    id: solicitation.id,
    number: solicitation.number,
    title: (solicitation as any).title ?? null,
    clientId: solicitation.client_id,
    clientName: (solicitation as any).client?.name ?? null,
    clientPhone: (solicitation as any).client?.phone ?? null,
    clientEmail: (solicitation as any).client?.email ?? null,
    architectId: solicitation.architect_id,
    architectName: (solicitation as any).architect?.name ?? null,
    category: (solicitation as any).category ?? null,
    size: (solicitation as any).size ?? null,
    origin: (solicitation as any).origin ?? null,
    workStage: (solicitation as any).work_stage ?? null,
    priority: (solicitation as any).priority ?? 'normal',
    createdAt: solicitation.created_at,
    quotes: quotes ?? [],
    negotiations: negotiations ?? [],
    shipments: shipments ?? [],
    visits: visits ?? [],
    designProjects: designProjects ?? [],
    purchaseChecklistItems: purchaseChecklistItems ?? [],
    installationTrackings: installationTrackings ?? [],
    postSaleFollowups: postSaleFollowups ?? [],
    suppliers: suppliers ?? [],
    events,
    team: (teamUsers ?? []).map((u: any) => ({ id: u.id, name: u.name, avatar_color: u.avatar_color ?? null, avatar_url: u.avatar_url ?? null })),
    stageResponsibles: stageRespMap,
    stageLinks,
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
  expectedDeliveryDate?: string | null
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
      expected_delivery_date: input.expectedDeliveryDate || null,
    }).eq('id', input.id)
    if (error) return { error: error.message }
    await logSolicitationEvent(input.solicitationId, 'compra', `Compra editada: ${input.description.trim()}`, user.id)
    refresh(input.solicitationId)
    return { ok: true, id: input.id }
  }
  const { data, error } = await db.from('purchase_checklist_items').insert({
    solicitation_id: input.solicitationId,
    description: input.description.trim(),
    supplier: input.supplier || null,
    status: input.status ?? 'a_pedir',
    expected_delivery_date: input.expectedDeliveryDate || null,
    created_by: user.id,
  }).select('id').single()
  if (error) return { error: error.message }
  await logSolicitationEvent(input.solicitationId, 'compra', `Item de compra criado: ${input.description.trim()}`, user.id)
  refresh(input.solicitationId)
  return { ok: true, id: data?.id }
}

const PURCHASE_LOG_LABEL: Record<string, string> = { a_pedir: 'A pedir', pedido: 'Pedido', recebido: 'Recebido' }

export async function updatePurchaseChecklistItemStatus(
  id: string,
  solicitationId: string,
  status: 'a_pedir' | 'pedido' | 'recebido',
  label?: string
): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const { error } = await createAdminClient().from('purchase_checklist_items').update({ status }).eq('id', id)
  if (error) return { error: error.message }
  await logSolicitationEvent(solicitationId, 'compra', `Compra: ${label || 'item'} → ${PURCHASE_LOG_LABEL[status] ?? status}`, user.id)
  refresh(solicitationId)
  return { ok: true }
}

export async function deletePurchaseChecklistItem(id: string, solicitationId: string, label?: string): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const { error } = await createAdminClient().from('purchase_checklist_items').delete().eq('id', id)
  if (error) return { error: error.message }
  await logSolicitationEvent(solicitationId, 'compra', 'Item de compra excluído' + (label ? `: ${label}` : ''), user.id)
  refresh(solicitationId)
  return { ok: true }
}

// ── Acompanhamento de instalação (installation_trackings) ────────────────

const INSTALLATION_LOG_LABEL: Record<string, string> = {
  agendada: 'Agendada', em_andamento: 'Em andamento', concluida: 'Concluída', com_pendencia: 'Com pendência',
}

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
    await logSolicitationEvent(input.solicitationId, 'instalacao', `Instalação atualizada (${INSTALLATION_LOG_LABEL[payload.status] ?? payload.status})`, user.id)
    refresh(input.solicitationId)
    return { ok: true, id: input.id }
  }
  const { data, error } = await db.from('installation_trackings').insert({
    solicitation_id: input.solicitationId,
    ...payload,
    created_by: user.id,
  }).select('id').single()
  if (error) return { error: error.message }
  await logSolicitationEvent(input.solicitationId, 'instalacao', `Instalação agendada${payload.team ? `: ${payload.team}` : ''}`, user.id)
  refresh(input.solicitationId)
  return { ok: true, id: data?.id }
}

export async function deleteInstallationTracking(id: string, solicitationId: string, label?: string): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const { error } = await createAdminClient().from('installation_trackings').delete().eq('id', id)
  if (error) return { error: error.message }
  await logSolicitationEvent(solicitationId, 'instalacao', 'Instalação excluída' + (label ? `: ${label}` : ''), user.id)
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
    await logSolicitationEvent(input.solicitationId, 'posVenda', 'Contato de pós-venda atualizado', user.id)
    refresh(input.solicitationId)
    return { ok: true, id: input.id }
  }
  const { data, error } = await db.from('post_sale_followups').insert({
    solicitation_id: input.solicitationId,
    ...payload,
    created_by: user.id,
  }).select('id').single()
  if (error) return { error: error.message }
  await logSolicitationEvent(input.solicitationId, 'posVenda', 'Contato de pós-venda registrado', user.id)
  refresh(input.solicitationId)
  return { ok: true, id: data?.id }
}

export async function deletePostSaleFollowup(id: string, solicitationId: string, label?: string): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const { error } = await createAdminClient().from('post_sale_followups').delete().eq('id', id)
  if (error) return { error: error.message }
  await logSolicitationEvent(solicitationId, 'posVenda', 'Pós-venda excluído' + (label ? `: ${label}` : ''), user.id)
  refresh(solicitationId)
  return { ok: true }
}

// ── Editar expedição a partir da Solicitação (Bug #2) ─────────────────────
// Reaproveita a mesma updateShipment de src/lib/actions.ts (usada por
// /shipping) em vez de inventar uma escrita paralela na tabela shipments —
// só adiciona o revalidatePath da Solicitação, que aquela action não
// conhece, pra tela de detalhe refletir a edição na hora.

const SHIPMENT_LOG_LABEL: Record<string, string> = {
  queued: 'Na fila', in_progress: 'Em separação', completed: 'Separado', awaiting_material: 'Aguardando material', delivered: 'Entregue',
}

export async function updateShipmentForSolicitation(
  id: string,
  solicitationId: string,
  updates: {
    delivery_type?: 'delivery' | 'pickup'
    delivery_date?: string
    separation_status?: 'queued' | 'in_progress' | 'completed' | 'awaiting_material' | 'delivered'
    priority?: 'low' | 'mid' | 'high'
  }
): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  try {
    await updateShipment(id, updates)
  } catch (e: any) {
    return { error: e?.message ?? 'Erro ao atualizar expedição' }
  }
  await logSolicitationEvent(solicitationId, 'expedicao', 'Separação e entrega atualizada' + (updates.separation_status ? ` (${SHIPMENT_LOG_LABEL[updates.separation_status] ?? updates.separation_status})` : ''), user.id)
  refresh(solicitationId)
  return { ok: true }
}

// ── Entrar na etapa Visita/Projeto a partir da Solicitação (Bug #8) ──────
// Mesma lógica de createVisit/createDesignProject de
// design-projects-actions.ts, mas já nascendo linkada a esta solicitation
// (e usando o admin client / client_id-architect_id já conhecidos da
// Solicitação, sem duplicar aquele arquivo nem mexer em /design-projects).

export async function createVisitForSolicitation(input: {
  solicitationId: string
  clientId: string
  architectId?: string | null
  title: string
  scheduledAt?: string | null
  address?: string | null
  notes?: string | null
}): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  if (!input.title.trim()) return { error: 'Descreva a visita' }
  const db = createAdminClient()
  const { data, error } = await db.from('visits').insert({
    solicitation_id: input.solicitationId,
    client_id: input.clientId,
    architect_id: input.architectId || null,
    title: input.title.trim(),
    scheduled_at: input.scheduledAt || null,
    address: input.address || null,
    notes: input.notes || null,
    status: input.scheduledAt ? 'scheduled' : 'to_schedule',
    created_by: user.id,
  }).select('id').single()
  if (error) return { error: error.message }
  await logSolicitationEvent(input.solicitationId, 'visita', `Visita criada: ${input.title.trim()}`, user.id)
  refresh(input.solicitationId)
  return { ok: true, id: data?.id }
}

export async function createDesignProjectForSolicitation(input: {
  solicitationId: string
  clientId: string
  architectId?: string | null
  title: string
  description?: string | null
  kind?: 'elaboracao' | 'alocacao_pontos'
}): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  if (!input.title.trim()) return { error: 'Dê um título ao projeto' }
  const db = createAdminClient()
  const { data, error } = await db.from('design_projects').insert({
    solicitation_id: input.solicitationId,
    client_id: input.clientId,
    architect_id: input.architectId || null,
    title: input.title.trim(),
    description: input.description || null,
    kind: input.kind ?? 'elaboracao',
    created_by: user.id,
  }).select('id').single()
  if (error) return { error: error.message }
  await logSolicitationEvent(input.solicitationId, 'projeto', `Projeto criado: ${input.title.trim()}`, user.id)
  refresh(input.solicitationId)
  return { ok: true, id: data?.id }
}

// ── Editar visita a partir da Solicitação (pedido Letícia, rodada 2) ─────
// Mesmo padrão de updateShipmentForSolicitation: admin client + guard de
// login + revalidatePath, só que escrevendo direto em `visits` (não existe
// uma updateVisit genérica em design-projects-actions.ts pra reaproveitar —
// só updateVisitStatus, que troca status isolado).

const VISIT_LOG_LABEL: Record<string, string> = {
  to_schedule: 'A agendar', scheduled: 'Agendada', done: 'Realizada', not_needed: 'Não necessária',
}

export async function updateVisitForSolicitation(
  id: string,
  solicitationId: string,
  updates: {
    title?: string
    scheduledAt?: string | null
    address?: string | null
    status?: 'to_schedule' | 'scheduled' | 'done' | 'not_needed'
  }
): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const db = createAdminClient()
  const payload: Record<string, any> = {}
  if (updates.title !== undefined) payload.title = updates.title.trim() || null
  if (updates.scheduledAt !== undefined) payload.scheduled_at = updates.scheduledAt || null
  if (updates.address !== undefined) payload.address = updates.address || null
  if (updates.status !== undefined) payload.status = updates.status
  const { error } = await db.from('visits').update(payload).eq('id', id)
  if (error) return { error: error.message }
  const vLabel = updates.title?.trim()
  await logSolicitationEvent(
    solicitationId, 'visita',
    updates.status ? `Visita${vLabel ? ` "${vLabel}"` : ''} → ${VISIT_LOG_LABEL[updates.status] ?? updates.status}` : `Visita editada${vLabel ? `: ${vLabel}` : ''}`,
    user.id
  )
  refresh(solicitationId)
  return { ok: true }
}

// ── Editar categoria (kind) de um projeto a partir da Solicitação ────────

export async function updateDesignProjectKindForSolicitation(
  id: string,
  solicitationId: string,
  kind: 'elaboracao' | 'alocacao_pontos'
): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const { error } = await createAdminClient().from('design_projects').update({ kind }).eq('id', id)
  if (error) return { error: error.message }
  await logSolicitationEvent(solicitationId, 'projeto', `Projeto: categoria → ${kind === 'alocacao_pontos' ? 'Alocação de pontos' : 'Elaboração para orçamento'}`, user.id)
  refresh(solicitationId)
  return { ok: true }
}

// ── Editar o conteúdo rico (HTML) do Projeto a partir da Solicitação ─────
// Reaproveita a coluna design_projects.description (já existe desde
// 20260913_design_projects_and_standalone_visits.sql, usada antes como texto
// livre) pra guardar o HTML do editor rico — sem coluna nova.

export async function updateDesignProjectDescriptionForSolicitation(
  id: string,
  solicitationId: string,
  descriptionHtml: string
): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const { error } = await createAdminClient().from('design_projects').update({ description: descriptionHtml }).eq('id', id)
  if (error) return { error: error.message }
  await logSolicitationEvent(solicitationId, 'projeto', 'Notas do projeto atualizadas', user.id)
  refresh(solicitationId)
  return { ok: true }
}

// ── Status (workflow) do Projeto a partir da Solicitação ─────────────────
// Fino wrapper sobre a updateDesignProjectStatus já exportada de
// design-projects-actions.ts (não duplica a escrita) — só adiciona o
// revalidatePath da Solicitação, que aquela action não conhece.

export async function updateDesignProjectStatusForSolicitation(
  id: string,
  solicitationId: string,
  status: 'fila' | 'em_andamento' | 'concluido'
): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const res = await updateDesignProjectStatus(id, status)
  if ((res as any)?.error) return { error: (res as any).error }
  await logSolicitationEvent(solicitationId, 'projeto', `Projeto → ${status === 'fila' ? 'Na fila' : status === 'em_andamento' ? 'Em andamento' : 'Concluído'}`, user.id)
  refresh(solicitationId)
  return { ok: true }
}

// ── Upload de arquivo pro Drive por etapa (Visita/Projeto/Expedição) ─────
// Mesmo padrão de pasta usado por syncQuoteFilesToDrive em google-drive.ts:
// resolve/cria a pasta raiz da Solicitação (reaproveitando o drive_link do
// orçamento vinculado quando existe, pra cair na MESMA pasta que o usuário
// já conhece pela aba Orçamento) e, dentro dela, acha/cria uma subpasta com
// o nome da etapa, aí sobe o arquivo com uploadFile.

const STAGE_FOLDER_NAME: Record<string, string> = {
  visita: 'Visita',
  projeto: 'Projeto',
  orcamento: 'Orçamento',
  compra: 'Compra de material',
  expedicao: 'Separação e entrega',
  instalacao: 'Instalação',
  posVenda: 'Pós-venda',
}

const FOLDER_ILLEGAL = /[\\/:*?"<>|]+/g

async function resolveSolicitationDriveFolderId(db: ReturnType<typeof createAdminClient>, solicitationId: string): Promise<string> {
  // 1) Já existe algum orçamento vinculado a esta Solicitação com
  // drive_link preenchido? usa a mesma pasta (nome cliente/orçamento) que o
  // usuário já vê na aba Orçamento.
  const { data: quotes } = await db
    .from('quotes')
    .select('id, drive_link, client_id')
    .eq('solicitation_id', solicitationId)
    .order('created_at', { ascending: false })
  const withLink = (quotes ?? []).find((q: any) => folderIdFromLink(q.drive_link))
  if (withLink) {
    const folderId = folderIdFromLink(withLink.drive_link)
    if (folderId) return folderId
  }

  // 2) Sem orçamento com pasta ainda: cria/acha uma pasta com o nome do
  // cliente da Solicitação, direto na raiz do Drive (mesmo padrão de nome
  // usado por syncQuoteFilesToDrive quando não há cliente linkável).
  const { data: solicitation } = await db
    .from('solicitations')
    .select('id, number, client_id, client:client_id(name)')
    .eq('id', solicitationId)
    .maybeSingle()
  const clientName = String((solicitation as any)?.client?.name ?? '').replace(FOLDER_ILLEGAL, ' ').trim()
  const folder = await findOrCreateFolder(clientName || `Solicitação ${solicitation?.number ?? solicitationId}`, driveRootFolderId())
  return folder.id
}

// Resolução da subpasta de uma etapa (Visita/Projeto/Separação) — fatorada
// aqui pra ser reaproveitada tanto pelo upload quanto pela listagem, em vez
// de duplicar a lógica de "acha a pasta raiz da Solicitação, depois acha/cria
// a subpasta da etapa dentro dela" (pedido explícito: não duplicar).
async function resolveStageFolderId(
  db: ReturnType<typeof createAdminClient>,
  solicitationId: string,
  stage: StageFileStage
): Promise<string> {
  const rootFolderId = await resolveSolicitationDriveFolderId(db, solicitationId)
  const stageFolder = await findOrCreateFolder(STAGE_FOLDER_NAME[stage] ?? stage, rootFolderId)
  return stageFolder.id
}

// Wrapper client-callable pra isDriveConnected (google-drive.ts é server-only
// e usa o admin client) — mesma checagem que QuoteAttachments faz pra
// esconder/trocar o botão de upload quando o Drive não está conectado.
export async function checkDriveConnected(): Promise<boolean> {
  return isDriveConnected()
}

// Prepara sessão de upload resumable: cliente faz PUT direto na URL
// retornada, contornando o limite de 4,5 MB das Vercel Functions.
// IMPORTANTE: não loga nem revalida aqui — só prepara a sessão. O arquivo
// ainda nem começou a subir. O log/refresh acontece em
// confirmStageFileUploaded, chamado quando o PUT termina.
export async function createStageFileUploadSession(
  solicitationId: string,
  stage: StageFileStage,
  fileName: string,
  mimeType: string
): Promise<{ uploadUrl?: string; error?: string }> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  if (!(await isDriveConnected())) return { error: 'Google Drive não conectado' }
  try {
    const db = createAdminClient()
    const folderId = await resolveStageFolderId(db, solicitationId, stage)
    const session = await createResumableUploadSession({
      folderId,
      name: fileName,
      mimeType: mimeType || 'application/octet-stream',
    })
    return { uploadUrl: session.uploadUrl }
  } catch (e: any) {
    console.error('[createStageFileUploadSession]', e)
    return { error: 'Não foi possível iniciar o upload.' }
  }
}

// Chamado pelo cliente quando o PUT direto no Drive termina com sucesso —
// registra o evento no histórico e revalida a tela para listar o arquivo.
// Exclui um arquivo do Drive da pasta de uma etapa (lixeira do Drive).
export async function deleteStageFileForSolicitation(
  solicitationId: string,
  stage: StageFileStage,
  fileId: string,
  fileName?: string
): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  try {
    await trashFile(fileId)
    await logSolicitationEvent(
      solicitationId, stage,
      `Arquivo removido${fileName ? `: ${fileName}` : ''}`,
      user.id,
    )
    refresh(solicitationId)
    return { ok: true }
  } catch (e: any) {
    console.error('[deleteStageFileForSolicitation]', e)
    return { error: 'Não foi possível remover o arquivo.' }
  }
}

export async function confirmStageFileUploaded(
  solicitationId: string,
  stage: StageFileStage,
  fileName: string
): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  await logSolicitationEvent(
    solicitationId, stage,
    `Arquivo ${fileName} enviado (${STAGE_FOLDER_NAME[stage] ?? stage})`,
    user.id,
  )
  refresh(solicitationId)
  return { ok: true }
}

export async function uploadStageFileForSolicitation(
  solicitationId: string,
  stage: StageFileStage,
  formData: FormData
): Promise<R & { webViewLink?: string }> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const file = formData.get('file')
  if (!(file instanceof File)) return { error: 'Nenhum arquivo enviado' }
  if (!(await isDriveConnected())) return { error: 'Google Drive não conectado' }

  try {
    const db = createAdminClient()
    const stageFolderId = await resolveStageFolderId(db, solicitationId, stage)
    const up = await uploadFile({
      folderId: stageFolderId,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      data: new Uint8Array(await file.arrayBuffer()),
    })
    await logSolicitationEvent(solicitationId, stage, `Arquivo ${file.name} enviado (${STAGE_FOLDER_NAME[stage] ?? stage})`, user.id)
    refresh(solicitationId)
    return { ok: true, id: up.id, webViewLink: up.webViewLink }
  } catch (e: any) {
    // Não vaza detalhe interno (nome de env var, stack, etc.) pro cliente —
    // loga o erro real no servidor e devolve uma mensagem genérica.
    console.error('[uploadStageFileForSolicitation] falha ao enviar pro Drive:', e)
    return { error: 'Não foi possível enviar o arquivo. Tente novamente ou avise o suporte.' }
  }
}

// ── Listagem de arquivos já enviados por etapa (Bug #1) ──────────────────
// Mesma resolução de pasta do upload (resolveStageFolderId, fatorada acima)
// + listFolderFiles (já usado pela aba Anexos do Orçamento) — assim cada
// card de Visita/Projeto/Separação consegue mostrar os arquivos já enviados
// sem reimplementar a chamada à API do Drive.
export async function listStageFilesForSolicitation(
  solicitationId: string,
  stage: StageFileStage
): Promise<{ files: DriveFileItem[]; error?: string }> {
  const user = await requireUser()
  if (!user) return { files: [], error: 'Não autenticado' }
  if (!(await isDriveConnected())) return { files: [] }
  try {
    const db = createAdminClient()
    const stageFolderId = await resolveStageFolderId(db, solicitationId, stage)
    const files = await listFolderFiles(stageFolderId)
    return { files }
  } catch (e: any) {
    console.error('[listStageFilesForSolicitation] falha ao listar arquivos do Drive:', e)
    return { files: [], error: 'Não foi possível carregar os arquivos.' }
  }
}

// ── Excluir Visita / Projeto a partir da Solicitação ──────────────────────
// Mesmo padrão de deletePurchaseChecklistItem/deleteInstallationTracking/
// deletePostSaleFollowup acima: admin client, guard de login, revalidatePath.
// Nenhuma das duas tinha delete ainda neste arquivo (só update/create).

export async function deleteVisitForSolicitation(id: string, solicitationId: string, label?: string): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const { error } = await createAdminClient().from('visits').delete().eq('id', id)
  if (error) return { error: error.message }
  await logSolicitationEvent(solicitationId, 'visita', 'Visita excluída' + (label ? `: ${label}` : ''), user.id)
  refresh(solicitationId)
  return { ok: true }
}

export async function deleteDesignProjectForSolicitation(id: string, solicitationId: string, label?: string): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const { error } = await createAdminClient().from('design_projects').delete().eq('id', id)
  if (error) return { error: error.message }
  await logSolicitationEvent(solicitationId, 'projeto', 'Projeto excluído' + (label ? `: ${label}` : ''), user.id)
  refresh(solicitationId)
  return { ok: true }
}

// Separa expedição da solicitação: exclui o registro de shipments vinculado.
// Atenção: o registro também some de /shipping. Confirmação obrigatória na tela.
export async function deleteShipmentForSolicitation(id: string, solicitationId: string): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const { error } = await createAdminClient().from('shipments').delete().eq('id', id)
  if (error) return { error: error.message }
  await logSolicitationEvent(solicitationId, 'expedicao', 'Separação/entrega excluída', user.id)
  refresh(solicitationId)
  return { ok: true }
}

// ── Detalhes da Solicitação (categoria, tamanho, origem, etapa, prioridade) ──

export async function updateSolicitationDetails(
  id: string,
  data: {
    title?: string | null
    category?: string | null
    size?: string | null
    origin?: string | null
    workStage?: string | null
    priority?: string
    architectId?: string | null
  }
): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const patch: Record<string, any> = {}
  if ('title' in data)      patch.title       = data.title?.toString().trim() || null
  if ('category' in data)   patch.category   = data.category   ?? null
  if ('size' in data)       patch.size        = data.size       ?? null
  if ('origin' in data)     patch.origin      = data.origin     ?? null
  if ('workStage' in data)  patch.work_stage  = data.workStage  ?? null
  if ('priority' in data)   patch.priority    = data.priority   ?? 'normal'
  if ('architectId' in data) patch.architect_id = data.architectId ?? null
  const { error } = await createAdminClient().from('solicitations').update(patch).eq('id', id)
  if (error) return { error: error.message }
  await logSolicitationEvent(id, null, 'Detalhes da solicitação atualizados', user.id)
  refresh(id)
  return { ok: true }
}

// ── Criar orçamento dentro da Solicitação ────────────────────────────────────

export async function createQuoteForSolicitation(
  solicitationId: string,
  data: { clientId: string; priority?: string; status?: string }
): Promise<R & { quoteId?: string }> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const db = createAdminClient()
  // Número do orçamento: reutiliza a sequence existente
  let seq: any = null
  try { const r = await db.rpc('next_quote_number').maybeSingle(); seq = r?.data ?? null } catch { seq = null }
  const { data: inserted, error } = await db.from('quotes').insert({
    client_id: data.clientId,
    solicitation_id: solicitationId,
    status: data.status ?? 'queue',
    priority: data.priority ?? 'normal',
  }).select('id').maybeSingle()
  if (error) return { error: error.message }
  await logSolicitationEvent(solicitationId, 'orcamento', 'Orçamento criado', user.id)
  refresh(solicitationId)
  return { ok: true, id: inserted?.id, quoteId: inserted?.id }
}

// ── Excluir orçamento da Solicitação ─────────────────────────────────────────

export async function deleteQuoteFromSolicitation(quoteId: string, solicitationId: string): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const { error } = await createAdminClient().from('quotes').delete().eq('id', quoteId)
  if (error) return { error: error.message }
  await logSolicitationEvent(solicitationId, 'orcamento', 'Orçamento excluído', user.id)
  refresh(solicitationId)
  return { ok: true }
}

// ── Deadline + conclusão do orçamento ────────────────────────────────────────

export async function updateQuoteDeadline(
  quoteId: string,
  solicitationId: string,
  deadline: string | null
): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const { error } = await createAdminClient().from('quotes').update({ deadline: deadline || null }).eq('id', quoteId)
  if (error) return { error: error.message }
  await logSolicitationEvent(solicitationId, 'orcamento',
    deadline ? `Prazo do orçamento definido: ${deadline}` : 'Prazo do orçamento removido',
    user.id)
  refresh(solicitationId)
  return { ok: true }
}

// Troca o status E registra/limpa completed_at atomicamente — para o cálculo
// de "vencido" não acusar prazo passado quando o orçamento já foi concluído.
// Usa o cliente AUTENTICADO (como updateQuoteStatus): o gatilho de atividades
// do orçamento precisa de auth.uid() para registrar quem mudou o status.
export async function updateQuoteStatusWithCompletion(
  quoteId: string,
  solicitationId: string,
  status: string
): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const patch: Record<string, any> = { status }
  if (status === 'done') patch.completed_at = new Date().toISOString()
  else patch.completed_at = null
  const { error } = await createClient().from('quotes').update(patch).eq('id', quoteId)
  if (error) return { error: error.message }
  await logSolicitationEvent(solicitationId, 'orcamento', `Orçamento → ${status}`, user.id)
  revalidatePath('/quotes')
  revalidatePath('/dashboard')
  refresh(solicitationId)
  return { ok: true }
}

// ── CRM: conversas do cliente e vínculos das etapas ──────────────────────────
// Tudo aqui lê o CRM com a sessão do usuário (createClient): as políticas
// (crm_can_see_conversation) já escondem conversas privadas e restritas.

function jidPhone(jid: string | null): string | null {
  const d = (jid ?? '').split('@')[0].replace(/\D/g, '')
  return d ? `+${d}` : null
}

async function resolveConversationLabels(ids: string[]) {
  const sb = createClient()
  const { data: convs } = await sb
    .from('crm_conversations')
    .select('id, instance_id, remote_jid, contact_name_cache')
    .in('id', ids)
  const instIds = Array.from(new Set((convs ?? []).map((c: any) => c.instance_id)))
  const { data: insts } = instIds.length
    ? await sb.from('crm_instances').select('id, label').in('id', instIds)
    : { data: [] as any[] }
  const instLabel = new Map<string, string>((insts ?? []).map((i: any) => [i.id, i.label]))
  const out = new Map<string, { label: string; sublabel: string | null; phone: string | null }>()
  for (const c of (convs ?? []) as any[]) {
    const phone = jidPhone(c.remote_jid)
    out.set(c.id, { label: c.contact_name_cache || phone || 'Conversa', sublabel: instLabel.get(c.instance_id) ?? null, phone })
  }
  return out
}

async function conversationOptions(convs: any[]): Promise<CrmConversationOption[]> {
  if (convs.length === 0) return []
  const sb = createClient()
  const instIds = Array.from(new Set(convs.map(c => c.instance_id)))
  const userIds = Array.from(new Set(convs.map(c => c.assigned_user_id).filter(Boolean)))
  const [{ data: insts }, { data: users }, last] = await Promise.all([
    sb.from('crm_instances').select('id, label').in('id', instIds),
    userIds.length ? createAdminClient().from('users').select('id, name').in('id', userIds) : Promise.resolve({ data: [] as any[] }),
    Promise.all(convs.map(c =>
      sb.from('crm_messages')
        .select('body, direction, message_type, created_at')
        .eq('conversation_id', c.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(r => r.data as any),
    )),
  ])
  const instLabel = new Map<string, string>((insts ?? []).map((i: any) => [i.id, i.label]))
  const userName = new Map<string, string>((users ?? []).map((u: any) => [u.id, u.name]))
  return convs.map((c, i) => {
    const m = last[i]
    return {
      id: c.id,
      instanceLabel: instLabel.get(c.instance_id) ?? 'WhatsApp',
      phone: jidPhone(c.remote_jid),
      contactName: c.contact_name_cache ?? null,
      assignedName: c.assigned_user_id ? (userName.get(c.assigned_user_id) ?? null) : null,
      lastAt: m?.created_at ?? c.last_message_at ?? null,
      lastBody: m?.body ?? null,
      lastDirection: m?.direction === 'outbound' ? 'outbound' : m?.direction === 'inbound' ? 'inbound' : null,
      lastType: m?.message_type ?? null,
    } satisfies CrmConversationOption
  }).sort((a, b) => String(b.lastAt ?? '').localeCompare(String(a.lastAt ?? '')))
}

// Conversas do cliente em todos os WhatsApps da empresa que o usuário enxerga.
// Casa pelo contato vinculado e, quando não há vínculo, pelo final do telefone.
export async function getCrmConversationsForClient(clientId: string): Promise<CrmConversationOption[]> {
  const user = await requireUser()
  if (!user) return []
  try {
    const { data: client } = await createAdminClient().from('contacts').select('phone').eq('id', clientId).maybeSingle()
    const digits = String(client?.phone ?? '').replace(/\D/g, '')
    const tail = digits.length >= 8 ? digits.slice(-8) : null
    let q = createClient()
      .from('crm_conversations')
      .select('id, instance_id, remote_jid, contact_name_cache, assigned_user_id, last_message_at')
    q = tail ? q.or(`contact_id.eq.${clientId},remote_jid.ilike.%${tail}@%`) : q.eq('contact_id', clientId)
    const { data } = await q.order('last_message_at', { ascending: false }).limit(10)
    return await conversationOptions((data ?? []) as any[])
  } catch (e) {
    console.error('[getCrmConversationsForClient]', e)
    return []
  }
}

// Busca para o seletor de vínculos: contatos (cadastro) e conversas do CRM.
export async function searchStageLinkTargets(query: string): Promise<{
  contacts: { id: string; name: string; phone: string | null }[]
  conversations: { id: string; label: string; sublabel: string | null; phone: string | null }[]
}> {
  const user = await requireUser()
  const q = query.trim()
  if (!user || q.length < 2) return { contacts: [], conversations: [] }
  const safe = q.replace(/[%,()]/g, ' ')
  const digits = q.replace(/\D/g, '')
  const [{ data: contacts }, { data: convs }] = await Promise.all([
    createAdminClient().from('contacts').select('id, name, phone').ilike('name', `%${safe}%`).order('name').limit(6),
    createClient()
      .from('crm_conversations')
      .select('id')
      .or(digits.length >= 4 ? `contact_name_cache.ilike.%${safe}%,remote_jid.ilike.%${digits}%` : `contact_name_cache.ilike.%${safe}%`)
      .order('last_message_at', { ascending: false })
      .limit(6),
  ])
  const labels = await resolveConversationLabels((convs ?? []).map((c: any) => c.id))
  return {
    contacts: (contacts ?? []).map((c: any) => ({ id: c.id, name: c.name, phone: c.phone ?? null })),
    conversations: Array.from(labels.entries()).map(([id, v]) => ({ id, ...v })),
  }
}

export async function addStageLink(solicitationId: string, stage: string, kind: 'contact' | 'conversation', refId: string): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  if (!PREF_SCOPES.includes(stage) || stage === 'all') return { error: 'Etapa inválida' }
  const { error } = await createAdminClient().from('solicitation_stage_links').upsert(
    { solicitation_id: solicitationId, stage, kind, ref_id: refId, created_by: user.id },
    { onConflict: 'solicitation_id,stage,kind,ref_id', ignoreDuplicates: true },
  )
  if (error) return { error: error.message }
  await logSolicitationEvent(solicitationId, stage, kind === 'contact' ? 'Contato vinculado à etapa' : 'Conversa do CRM vinculada à etapa', user.id)
  refresh(solicitationId)
  return { ok: true }
}

export async function removeStageLink(linkId: string, solicitationId: string): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const { error } = await createAdminClient().from('solicitation_stage_links').delete().eq('id', linkId)
  if (error) return { error: error.message }
  refresh(solicitationId)
  return { ok: true }
}

// ── Excluir a Solicitação ─────────────────────────────────────────────────────
// O banco bloqueia (NO ACTION) excluir solicitação que ainda tem registros, e
// excluir um orçamento cascateia para comissões e lançamentos financeiros. Por
// isso a exclusão é feita aqui, em ordem, e RECUSADA quando há venda fechada,
// comissão, lançamento financeiro, nota fiscal ou lançamento do Metropolitano.

export type SolicitationDeleteImpact = {
  canDelete: boolean
  // por que não pode (venda fechada, financeiro...) ou por que a pessoa não tem permissão
  blockers: string[]
  counts: { orcamentos: number; negociacoes: number; visitas: number; projetos: number; compras: number; expedicoes: number; instalacoes: number; posVenda: number }
}

async function computeDeleteImpact(solicitationId: string, userId: string): Promise<SolicitationDeleteImpact & { number?: number }> {
  const db = createAdminClient()
  const [sol, quotes, negs, visits, projects, purchases, ships, installs, posts, me] = await Promise.all([
    db.from('solicitations').select('id, number, created_by').eq('id', solicitationId).maybeSingle(),
    db.from('quotes').select('id').eq('solicitation_id', solicitationId),
    db.from('negotiations').select('quote_id, temperature').eq('solicitation_id', solicitationId),
    db.from('visits').select('id').eq('solicitation_id', solicitationId),
    db.from('design_projects').select('id').eq('solicitation_id', solicitationId),
    db.from('purchase_checklist_items').select('id').eq('solicitation_id', solicitationId),
    db.from('shipments').select('id').eq('solicitation_id', solicitationId),
    db.from('installation_trackings').select('id').eq('solicitation_id', solicitationId),
    db.from('post_sale_followups').select('id').eq('solicitation_id', solicitationId),
    db.from('users').select('role').eq('id', userId).maybeSingle(),
  ])
  const counts = {
    orcamentos: (quotes.data ?? []).length,
    negociacoes: (negs.data ?? []).length,
    visitas: (visits.data ?? []).length,
    projetos: (projects.data ?? []).length,
    compras: (purchases.data ?? []).length,
    expedicoes: (ships.data ?? []).length,
    instalacoes: (installs.data ?? []).length,
    posVenda: (posts.data ?? []).length,
  }
  const blockers: string[] = []
  if (!sol.data) return { canDelete: false, blockers: ['Solicitação não encontrada.'], counts }

  const isAdmin = me.data?.role === 'admin'
  if (!isAdmin && sol.data.created_by !== userId) {
    blockers.push('Só quem criou a solicitação ou um administrador pode excluí-la.')
  }
  if ((negs.data ?? []).some((n: any) => n.temperature === 'closed')) {
    blockers.push('Há uma venda fechada. Cancele a venda na aba Negociação antes de excluir.')
  }
  const quoteIds = (quotes.data ?? []).map((q: any) => q.id)
  if (quoteIds.length) {
    const head = (table: string) => db.from(table).select('id', { count: 'exact', head: true }).in('quote_id', quoteIds)
    const [fin, com, fis, met] = await Promise.all([head('finance_entries'), head('commissions'), head('fiscal_documents'), head('metropolitano_launches')])
    if ((fin.count ?? 0) > 0) blockers.push('Há lançamentos financeiros ligados ao orçamento.')
    if ((com.count ?? 0) > 0) blockers.push('Há comissões geradas para o orçamento.')
    if ((fis.count ?? 0) > 0) blockers.push('Há nota fiscal emitida para o orçamento.')
    if ((met.count ?? 0) > 0) blockers.push('Há lançamento do Metropolitano ligado ao orçamento.')
  }
  return { canDelete: blockers.length === 0, blockers, counts, number: sol.data.number }
}

export async function getSolicitationDeleteImpact(solicitationId: string): Promise<SolicitationDeleteImpact> {
  const user = await requireUser()
  if (!user) return { canDelete: false, blockers: ['Não autenticado'], counts: { orcamentos: 0, negociacoes: 0, visitas: 0, projetos: 0, compras: 0, expedicoes: 0, instalacoes: 0, posVenda: 0 } }
  const { number: _n, ...impact } = await computeDeleteImpact(solicitationId, user.id)
  return impact
}

export async function deleteSolicitation(solicitationId: string): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  // Recalcula no servidor: não confia no que a tela mostrou.
  const impact = await computeDeleteImpact(solicitationId, user.id)
  if (!impact.canDelete) return { error: impact.blockers[0] ?? 'Não é possível excluir esta solicitação.' }

  const db = createAdminClient()
  // Ordem importa: design_projects.quote_id é NO ACTION, então projetos e
  // demais registros saem antes dos orçamentos; o orçamento leva negociação,
  // propostas, anexos e expedição por cascata.
  for (const table of ['visits', 'design_projects', 'purchase_checklist_items', 'installation_trackings', 'post_sale_followups', 'shipments', 'negotiations', 'quotes']) {
    const { error } = await db.from(table).delete().eq('solicitation_id', solicitationId)
    if (error) return { error: `Não foi possível excluir (${table}): ${error.message}` }
  }
  const { error } = await db.from('solicitations').delete().eq('id', solicitationId)
  if (error) return { error: error.message }

  revalidatePath('/solicitacoes')
  revalidatePath('/quotes')
  revalidatePath('/negotiations')
  revalidatePath('/shipping')
  revalidatePath('/dashboard')
  return { ok: true }
}

// ── Preferências de propriedades do quadro (por usuário e escopo) ───────────

const PREF_SCOPES = ['all', 'visita', 'projeto', 'orcamento', 'negociacao', 'compra', 'expedicao', 'instalacao', 'posVenda']

export async function saveCardProps(scope: string, config: { order: string[]; hidden: string[] }): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  if (!PREF_SCOPES.includes(scope)) return { error: 'Escopo inválido' }
  const clean = (a: unknown) =>
    Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string').slice(0, 20) : []
  const { error } = await createAdminClient().from('solicitation_view_prefs').upsert(
    { user_id: user.id, scope, config: { order: clean(config.order), hidden: clean(config.hidden) }, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,scope' },
  )
  if (error) return { error: error.message }
  return { ok: true }
}

// ── Mover o cartão de uma etapa para outro status (arrastar no kanban) ───────
// Despacha para a mesma ação que a tela de cada etapa já usa, para manter
// os efeitos colaterais (atividades, datas, histórico) idênticos.
export async function moveStageCardStatus(input: {
  solicitationId: string
  stage: string
  recordId: string
  status: string
}): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const { solicitationId: sid, stage, recordId: id, status } = input
  switch (stage) {
    case 'visita':
      return updateVisitForSolicitation(id, sid, { status: status as any })
    case 'projeto':
      return updateDesignProjectStatusForSolicitation(id, sid, status as any)
    case 'orcamento':
      return updateQuoteStatusWithCompletion(id, sid, status)
    case 'negociacao': {
      // id = quote_id da negociação (mesma regra do quadro de Negociações)
      const res: any = await updateTemperature(id, status as any)
      if (res?.error) return { error: res.error }
      await logSolicitationEvent(sid, 'negociacao', `Negociação → ${status}`, user.id)
      refresh(sid)
      return { ok: true }
    }
    case 'compra':
      return updatePurchaseChecklistItemStatus(id, sid, status as any)
    case 'expedicao':
      return updateShipmentForSolicitation(id, sid, { separation_status: status as any })
    case 'instalacao': {
      const { error } = await createAdminClient().from('installation_trackings').update({ status }).eq('id', id)
      if (error) return { error: error.message }
      await logSolicitationEvent(sid, 'instalacao', `Instalação → ${INSTALLATION_LOG_LABEL[status] ?? status}`, user.id)
      refresh(sid)
      return { ok: true }
    }
    default:
      return { error: 'Esta etapa não muda de status pelo quadro.' }
  }
}

// ── Criar Separação e entrega a partir da Solicitação ────────────────────────

export async function createShipmentForSolicitation(input: {
  solicitationId: string
  deliveryType: 'delivery' | 'pickup'
  deliveryDate?: string | null
  address?: string | null
  priority?: 'low' | 'mid' | 'high'
  status?: 'queued' | 'in_progress' | 'completed' | 'awaiting_material' | 'delivered'
}): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const db = createAdminClient()
  // Shipment hoje exige quote_id — pega o orçamento mais recente da solicitação.
  const { data: quote } = await db.from('quotes')
    .select('id').eq('solicitation_id', input.solicitationId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!quote?.id) return { error: 'Crie um orçamento antes de abrir a separação.' }
  const { error } = await db.from('shipments').insert({
    solicitation_id: input.solicitationId,
    quote_id: quote.id,
    delivery_type: input.deliveryType,
    delivery_date: input.deliveryDate || null,
    address: input.address || null,
    priority: input.priority ?? 'mid',
    separation_status: input.status ?? 'queued',
  })
  if (error) return { error: error.message }
  await logSolicitationEvent(input.solicitationId, 'expedicao', 'Separação/entrega criada', user.id)
  refresh(input.solicitationId)
  return { ok: true }
}

// ── Endereço + delivery_date em shipments existentes ─────────────────────────

export async function updateShipmentAddressDate(
  id: string,
  solicitationId: string,
  patch: { address?: string | null; deliveryDate?: string | null }
): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const upd: Record<string, any> = {}
  if ('address' in patch) upd.address = patch.address || null
  if ('deliveryDate' in patch) upd.delivery_date = patch.deliveryDate || null
  const { error } = await createAdminClient().from('shipments').update(upd).eq('id', id)
  if (error) return { error: error.message }
  await logSolicitationEvent(solicitationId, 'expedicao', 'Entrega atualizada', user.id)
  refresh(solicitationId)
  return { ok: true }
}

// ── Link para a conversa do CRM (via contact_id do cliente da solicitação) ───

export async function getCrmConversationIdForClient(clientId: string): Promise<{ conversationId: string | null }> {
  const user = await requireUser()
  if (!user) return { conversationId: null }
  try {
    const { data } = await createAdminClient()
      .from('crm_conversations')
      .select('id, last_message_at')
      .eq('contact_id', clientId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    return { conversationId: data?.id ?? null }
  } catch {
    return { conversationId: null }
  }
}

// ── Pasta da Solicitação no Drive ────────────────────────────────────────────

export async function getSolicitationDriveFolderUrl(solicitationId: string): Promise<{ url: string | null; error?: string }> {
  const user = await requireUser()
  if (!user) return { url: null, error: 'Não autenticado' }
  if (!(await isDriveConnected())) return { url: null, error: 'Google Drive não conectado' }
  try {
    const folderId = await resolveSolicitationDriveFolderId(createAdminClient(), solicitationId)
    return { url: `https://drive.google.com/drive/folders/${folderId}` }
  } catch (e: any) {
    console.error('[getSolicitationDriveFolderUrl]', e)
    return { url: null, error: 'Não foi possível abrir a pasta.' }
  }
}

// ── Responsáveis por etapa ───────────────────────────────────────────────────

export type StageResponsible = {
  stage: string
  userId: string
  name: string
  avatarUrl: string | null
  avatarColor: string | null
}

export async function setStageResponsibles(
  solicitationId: string,
  stage: string,
  userIds: string[]
): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const db = createAdminClient()
  // Troca atômica: apaga os atuais da etapa e insere os novos.
  const { error: delErr } = await db.from('solicitation_stage_responsibles')
    .delete()
    .eq('solicitation_id', solicitationId)
    .eq('stage', stage)
  if (delErr) return { error: delErr.message }
  if (userIds.length) {
    const rows = userIds.map(uid => ({
      solicitation_id: solicitationId,
      stage,
      user_id: uid,
      created_by: user.id,
    }))
    const { error: insErr } = await db.from('solicitation_stage_responsibles').insert(rows)
    if (insErr) return { error: insErr.message }
  }
  await logSolicitationEvent(solicitationId, stage, `Responsáveis da etapa atualizados`, user.id)
  refresh(solicitationId)
  return { ok: true }
}

export async function listActiveUsers(): Promise<{ id: string; name: string; avatar_url: string | null; avatar_color: string | null }[]> {
  const user = await requireUser()
  if (!user) return []
  const { data } = await createAdminClient()
    .from('users')
    .select('id, name, avatar_url, avatar_color')
    .order('name')
  return data ?? []
}

// ── Criar nova solicitação ───────────────────────────────────────────────────

export async function createSolicitation(data: {
  clientId: string
  architectId?: string | null
  title?: string | null
}): Promise<R & { solicitationId?: string }> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  if (!data.clientId) return { error: 'Selecione um cliente' }
  const db = createAdminClient()
  const { data: inserted, error } = await db.from('solicitations').insert({
    client_id: data.clientId,
    architect_id: data.architectId || null,
    title: data.title?.trim() || null,
    created_by: user.id,
  }).select('id').maybeSingle()
  if (error) return { error: error.message }
  if (inserted?.id) {
    await logSolicitationEvent(inserted.id, null, 'Solicitação criada', user.id)
  }
  revalidatePath('/solicitacoes')
  return { ok: true, solicitationId: inserted?.id, id: inserted?.id }
}

// ── Busca rápida de solicitações (modal de criação por etapa) ────────────────

export async function searchSolicitationsForStage(query: string): Promise<{ id: string; label: string; clientName: string | null; clientId: string | null }[]> {
  const user = await requireUser()
  if (!user) return []
  const db = createAdminClient()
  const q = db.from('solicitations')
    .select('id, number, title, client_id, client:client_id(name)')
    .order('created_at', { ascending: false })
    .limit(20)
  const num = query ? Number(query.replace(/^#/, '')) : NaN
  const filter = query
    ? `title.ilike.%${query}%${!Number.isNaN(num) ? `,number.eq.${num}` : ''}`
    : ''
  const { data } = filter ? await (q.or(filter) as any) : await q
  return ((data ?? []) as any[]).map((s: any) => ({
    id: s.id,
    label: s.title ? `#${s.number} — ${s.title}` : `#${s.number}`,
    clientName: s.client?.name ?? null,
    clientId: s.client_id ?? null,
  }))
}

// ── Criar registro de etapa direto (modal rápido do kanban) ──────────────────

export async function createStageRecordForSolicitation(input: {
  solicitationId: string
  clientId: string
  stage: string
  title?: string | null
  scheduledAt?: string | null
  deliveryType?: 'delivery' | 'pickup' | null
  deliveryDate?: string | null
  kind?: 'elaboracao' | 'alocacao_pontos' | null
}): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const { solicitationId, clientId, stage } = input
  switch (stage) {
    case 'visita':
      return createVisitForSolicitation({
        solicitationId, clientId,
        title: input.title?.trim() || 'Visita',
        scheduledAt: input.scheduledAt || null,
      })
    case 'projeto':
      return createDesignProjectForSolicitation({
        solicitationId, clientId,
        title: input.title?.trim() || 'Projeto',
        kind: input.kind ?? 'elaboracao',
      })
    case 'orcamento':
      return createQuoteForSolicitation(solicitationId, { clientId })
    case 'compra': {
      // checklist item placeholder — o usuário adiciona itens depois
      const db = createAdminClient()
      const { error } = await db.from('purchase_checklist_items').insert({
        solicitation_id: solicitationId,
        description: input.title?.trim() || 'Item a pedir',
        status: 'a_pedir',
        created_by: user.id,
      })
      if (error) return { error: error.message }
      await logSolicitationEvent(solicitationId, 'compra', 'Etapa de Compra iniciada', user.id)
      refresh(solicitationId)
      return { ok: true }
    }
    case 'expedicao':
      return createShipmentForSolicitation({
        solicitationId,
        deliveryType: input.deliveryType ?? 'delivery',
        deliveryDate: input.deliveryDate || null,
      })
    case 'instalacao':
      return saveInstallationTracking({
        solicitationId,
        scheduledDate: input.scheduledAt || null,
        team: null, status: 'agendada', notes: null,
      })
    case 'posVenda': {
      const db = createAdminClient()
      const { error } = await db.from('post_sale_followups').insert({
        solicitation_id: solicitationId,
        contacted_at: new Date().toISOString(),
        created_by: user.id,
      })
      if (error) return { error: error.message }
      await logSolicitationEvent(solicitationId, 'posVenda', 'Pós-venda iniciado', user.id)
      refresh(solicitationId)
      return { ok: true }
    }
    default:
      return { error: `Etapa '${stage}' não suportada` }
  }
}

// ── Atualizar visita com responsável ─────────────────────────────────────────

export async function updateVisitResponsible(
  visitId: string,
  solicitationId: string,
  responsibleId: string | null
): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const { error } = await createAdminClient().from('visits').update({ responsible_id: responsibleId }).eq('id', visitId)
  if (error) return { error: error.message }
  refresh(solicitationId)
  return { ok: true }
}

// ── Atualizar projeto com responsável ────────────────────────────────────────

export async function updateProjectResponsible(
  projectId: string,
  solicitationId: string,
  responsibleId: string | null
): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const { error } = await createAdminClient().from('design_projects').update({ responsible_id: responsibleId }).eq('id', projectId)
  if (error) return { error: error.message }
  refresh(solicitationId)
  return { ok: true }
}
