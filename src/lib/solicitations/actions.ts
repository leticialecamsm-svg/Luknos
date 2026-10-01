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
import { updateShipment } from '@/lib/actions'
import { updateDesignProjectStatus } from '@/lib/design-projects-actions'
import {
  findOrCreateFolder, uploadFile, isDriveConnected, driveRootFolderId, folderIdFromLink,
} from '@/lib/google-drive'

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
  suppliers: { id: string; name: string }[]
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
    suppliers: suppliers ?? [],
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
  refresh(input.solicitationId)
  return { ok: true, id: data?.id }
}

export async function updatePurchaseChecklistItemStatus(
  id: string,
  solicitationId: string,
  status: 'a_pedir' | 'pedido' | 'recebido'
): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const { error } = await createAdminClient().from('purchase_checklist_items').update({ status }).eq('id', id)
  if (error) return { error: error.message }
  refresh(solicitationId)
  return { ok: true }
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

// ── Editar expedição a partir da Solicitação (Bug #2) ─────────────────────
// Reaproveita a mesma updateShipment de src/lib/actions.ts (usada por
// /shipping) em vez de inventar uma escrita paralela na tabela shipments —
// só adiciona o revalidatePath da Solicitação, que aquela action não
// conhece, pra tela de detalhe refletir a edição na hora.

export async function updateShipmentForSolicitation(
  id: string,
  solicitationId: string,
  updates: {
    delivery_type?: 'delivery' | 'pickup'
    delivery_date?: string
  }
): Promise<R> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  try {
    await updateShipment(id, updates)
  } catch (e: any) {
    return { error: e?.message ?? 'Erro ao atualizar expedição' }
  }
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
  refresh(input.solicitationId)
  return { ok: true, id: data?.id }
}

// ── Editar visita a partir da Solicitação (pedido Letícia, rodada 2) ─────
// Mesmo padrão de updateShipmentForSolicitation: admin client + guard de
// login + revalidatePath, só que escrevendo direto em `visits` (não existe
// uma updateVisit genérica em design-projects-actions.ts pra reaproveitar —
// só updateVisitStatus, que troca status isolado).

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
  expedicao: 'Separação e entrega',
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

// Wrapper client-callable pra isDriveConnected (google-drive.ts é server-only
// e usa o admin client) — mesma checagem que QuoteAttachments faz pra
// esconder/trocar o botão de upload quando o Drive não está conectado.
export async function checkDriveConnected(): Promise<boolean> {
  return isDriveConnected()
}

export async function uploadStageFileForSolicitation(
  solicitationId: string,
  stage: 'visita' | 'projeto' | 'expedicao',
  formData: FormData
): Promise<R & { webViewLink?: string }> {
  const user = await requireUser()
  if (!user) return { error: 'Não autenticado' }
  const file = formData.get('file')
  if (!(file instanceof File)) return { error: 'Nenhum arquivo enviado' }
  if (!(await isDriveConnected())) return { error: 'Google Drive não conectado' }

  try {
    const db = createAdminClient()
    const rootFolderId = await resolveSolicitationDriveFolderId(db, solicitationId)
    const stageFolder = await findOrCreateFolder(STAGE_FOLDER_NAME[stage] ?? stage, rootFolderId)
    const up = await uploadFile({
      folderId: stageFolder.id,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      data: new Uint8Array(await file.arrayBuffer()),
    })
    refresh(solicitationId)
    return { ok: true, id: up.id, webViewLink: up.webViewLink }
  } catch (e: any) {
    return { error: e?.message ?? 'Falha ao enviar arquivo pro Drive' }
  }
}
