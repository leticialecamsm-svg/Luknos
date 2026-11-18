'use server'

// Server actions da Leitura de Projeto — segue o mesmo padrão de
// src/lib/actions.ts (createClient/createAdminClient do Supabase, RLS pra
// leitura/escrita normal, revalidatePath depois de mutação), só que num
// arquivo separado porque o módulo é isolado do resto do sistema.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { pointInPolygon } from './geometry'

const BASE_PATH = '/dashboard/project-reading'

async function requireUserId(): Promise<string | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

async function logEdit(planId: string, entityType: string, entityId: string, field: string, oldValue: unknown, newValue: unknown, changedBy: string) {
  if (oldValue === newValue) return
  await createAdminClient().from('plan_edit_log').insert({
    plan_id: planId, entity_type: entityType, entity_id: entityId, field,
    old_value: oldValue == null ? null : String(oldValue),
    new_value: newValue == null ? null : String(newValue),
    changed_by: changedBy,
  })
}

const RESTORABLE_TABLES = [
  'plan_environments', 'plan_legend_items', 'plan_symbol_occurrences', 'plan_measurements', 'plan_annotations', 'plan_power_supplies',
] as const
type RestorableTable = typeof RESTORABLE_TABLES[number]

// Reinsere uma linha exatamente como ela era (mesmo id) — usado pelo undo/redo
// do editor: desfazer uma exclusão, ou refazer uma criação que foi desfeita.
export async function restoreRow(table: RestorableTable, row: Record<string, unknown>) {
  if (!RESTORABLE_TABLES.includes(table)) return { error: 'Tabela inválida' }
  const admin = createAdminClient()
  const { error } = await admin.from(table).upsert(row)
  if (error) return { error: error.message }
  revalidatePath(BASE_PATH)
  return { ok: true }
}

// ── Plantas ───────────────────────────────────────────────────────────────

export async function listPlans() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('project_plans')
    .select('id, name, original_filename, num_pages, status, created_at, created_by, users:created_by(name)')
    .order('created_at', { ascending: false })
  return data ?? []
}

// O PDF NÃO passa pelo servidor: server action/função da Vercel recusa corpo
// acima de ~4,5 MB (plantas costumam ter 5–30 MB) e a tela ficava presa em
// "Processando PDF...". O servidor só assina a URL de upload; o navegador
// manda o arquivo direto pro Storage e depois chama finalizePlan.
const MAX_PLAN_BYTES = 100 * 1024 * 1024

export async function createPlanUpload(input: { fileName: string; sizeBytes: number }) {
  const userId = await requireUserId()
  if (!userId) return { error: 'Não autenticado' }
  if (!input.sizeBytes) return { error: 'Arquivo vazio' }
  if (input.sizeBytes > MAX_PLAN_BYTES) return { error: 'Arquivo acima de 100 MB' }
  const safe = input.fileName.replace(/[^\w.\-]/g, '_')
  const path = `${userId}/${Date.now()}_${safe}`
  const { data, error } = await createAdminClient().storage.from('project-plans').createSignedUploadUrl(path)
  if (error || !data) return { error: error?.message ?? 'Não foi possível preparar o envio' }
  return { path: data.path, token: data.token }
}

export async function finalizePlan(input: { storagePath: string; fileName: string; name: string; numPages: number; sourceType?: 'pdf' | 'cad'; cadMeta?: unknown }) {
  const userId = await requireUserId()
  if (!userId) return { error: 'Não autenticado' }
  // o caminho precisa ser do próprio usuário (gerado por createPlanUpload)
  if (!input.storagePath.startsWith(`${userId}/`)) return { error: 'Caminho de arquivo inválido' }
  const admin = createAdminClient()
  const { data, error } = await admin.from('project_plans').insert({
    name: input.name.trim() || input.fileName.replace(/\.(pdf|dwg|dxf)$/i, ''),
    original_filename: input.fileName,
    storage_path: input.storagePath,
    num_pages: input.numPages || 1,
    status: 'ready',
    created_by: userId,
    ...(input.sourceType === 'cad' ? { source_type: 'cad', cad_meta: input.cadMeta ?? null } : {}),
  }).select().single()
  if (error) return { error: error.message }
  revalidatePath(BASE_PATH)
  return { ok: true, plan: data }
}

export async function getPlan(planId: string) {
  const admin = createAdminClient()
  const [plan, environments, legendItems, symbols, measurements, annotations, powerSupplies] = await Promise.all([
    admin.from('project_plans').select('*').eq('id', planId).single(),
    admin.from('plan_environments').select('*').eq('plan_id', planId).order('created_at'),
    admin.from('plan_legend_items').select('*').eq('plan_id', planId).order('code'),
    admin.from('plan_symbol_occurrences').select('*').eq('plan_id', planId).order('created_at'),
    admin.from('plan_measurements').select('*').eq('plan_id', planId).order('created_at'),
    admin.from('plan_annotations').select('*').eq('plan_id', planId).order('created_at'),
    admin.from('plan_power_supplies').select('*').eq('plan_id', planId).order('created_at'),
  ])
  if (plan.error || !plan.data) return null
  const { data: pub } = admin.storage.from('project-plans').getPublicUrl(plan.data.storage_path)
  return {
    plan: { ...plan.data, pdfUrl: pub.publicUrl },
    environments: environments.data ?? [],
    legendItems: legendItems.data ?? [],
    symbols: symbols.data ?? [],
    measurements: measurements.data ?? [],
    annotations: annotations.data ?? [],
    powerSupplies: powerSupplies.data ?? [],
  }
}

export async function deletePlan(planId: string) {
  const admin = createAdminClient()
  const { data: plan } = await admin.from('project_plans').select('storage_path').eq('id', planId).single()
  if (plan?.storage_path) await admin.storage.from('project-plans').remove([plan.storage_path])
  const { error } = await admin.from('project_plans').delete().eq('id', planId)
  if (error) return { error: error.message }
  revalidatePath(BASE_PATH)
  return { ok: true }
}

export async function updatePlanScale(planId: string, page: number, metersPerPixel: number) {
  const admin = createAdminClient()
  const { data: plan } = await admin.from('project_plans').select('scale_m_per_px').eq('id', planId).single()
  const scale = { ...(plan?.scale_m_per_px ?? {}), [String(page)]: metersPerPixel }
  const { error } = await admin.from('project_plans').update({ scale_m_per_px: scale, updated_at: new Date().toISOString() }).eq('id', planId)
  if (error) return { error: error.message }
  revalidatePath(`${BASE_PATH}/${planId}`)
  return { ok: true }
}

// Rotação extra que o consultor aplicou (soma à rotação já embutida no PDF)
// — pra plantas que vieram digitalizadas em pé quando deveriam ser deitadas.
export async function updatePlanRotation(planId: string, page: number, rotationDeg: number) {
  const admin = createAdminClient()
  const { data: plan } = await admin.from('project_plans').select('page_rotation').eq('id', planId).single()
  const rotation = { ...(plan?.page_rotation ?? {}), [String(page)]: ((rotationDeg % 360) + 360) % 360 }
  const { error } = await admin.from('project_plans').update({ page_rotation: rotation, updated_at: new Date().toISOString() }).eq('id', planId)
  if (error) return { error: error.message }
  revalidatePath(`${BASE_PATH}/${planId}`)
  return { ok: true }
}

// Qual página o consultor deixou aberta por último — pra PDFs de várias
// páginas onde só uma é a planta luminotécnica, o sistema volta direto nela.
export async function updateWorkingPage(planId: string, page: number) {
  const admin = createAdminClient()
  const { error } = await admin.from('project_plans').update({ working_page: page, updated_at: new Date().toISOString() }).eq('id', planId)
  if (error) return { error: error.message }
  return { ok: true }
}

// ── Ambientes ─────────────────────────────────────────────────────────────

export async function createEnvironment(planId: string, data: { page: number; name: string; polygon: [number, number][] }) {
  const userId = await requireUserId()
  if (!userId) return { error: 'Não autenticado' }
  const admin = createAdminClient()
  const { data: row, error } = await admin.from('plan_environments').insert({
    plan_id: planId, page: data.page, name: data.name, polygon: data.polygon,
    origin: 'manual', status: 'confirmado', created_by: userId,
  }).select().single()
  if (error) return { error: error.message }
  revalidatePath(`${BASE_PATH}/${planId}`)
  return { ok: true, data: row }
}

export async function updateEnvironment(planId: string, id: string, updates: Partial<{ name: string; polygon: [number, number][]; status: string }>) {
  const userId = await requireUserId()
  if (!userId) return { error: 'Não autenticado' }
  const admin = createAdminClient()
  const { data: prev } = await admin.from('plan_environments').select('name').eq('id', id).single()
  const { error } = await admin.from('plan_environments')
    .update({ ...updates, status: updates.name ? 'editado' : undefined, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  if (updates.name && prev) await logEdit(planId, 'environment', id, 'name', prev.name, updates.name, userId)
  revalidatePath(`${BASE_PATH}/${planId}`)
  return { ok: true }
}

export async function deleteEnvironment(planId: string, id: string) {
  const admin = createAdminClient()
  const { error } = await admin.from('plan_environments').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`${BASE_PATH}/${planId}`)
  return { ok: true }
}

// ── Legenda ───────────────────────────────────────────────────────────────

export async function createLegendItem(planId: string, data: {
  code: string; description?: string; power_w?: number; color_temp_k?: number
  lumen_flux?: number; finish?: string; notes?: string; mount_type?: string
  has_lamp?: boolean; lamp_name?: string; lamp_color_temp_k?: number; lamp_angle_deg?: number; lamp_qty?: number
}) {
  const admin = createAdminClient()
  const { data: row, error } = await admin.from('plan_legend_items').insert({ plan_id: planId, ...data }).select().single()
  if (error) return { error: error.message }
  revalidatePath(`${BASE_PATH}/${planId}`)
  return { ok: true, data: row }
}

export async function updateLegendItem(planId: string, id: string, updates: Record<string, unknown>) {
  const admin = createAdminClient()
  const { error } = await admin.from('plan_legend_items').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`${BASE_PATH}/${planId}`)
  return { ok: true }
}

export async function deleteLegendItem(planId: string, id: string) {
  const admin = createAdminClient()
  const { error } = await admin.from('plan_legend_items').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`${BASE_PATH}/${planId}`)
  return { ok: true }
}

// ── Símbolos (ocorrências) ───────────────────────────────────────────────

export async function createSymbolOccurrence(planId: string, data: {
  page: number; x: number; y: number; legend_item_id?: string | null; environment_id?: string | null
}) {
  const userId = await requireUserId()
  if (!userId) return { error: 'Não autenticado' }
  const admin = createAdminClient()
  const { data: row, error } = await admin.from('plan_symbol_occurrences').insert({
    plan_id: planId, ...data, detection_source: 'manual', status: 'confirmado', created_by: userId,
  }).select().single()
  if (error) return { error: error.message }
  revalidatePath(`${BASE_PATH}/${planId}`)
  return { ok: true, data: row }
}

export async function updateSymbolOccurrence(planId: string, id: string, updates: Partial<{
  legend_item_id: string | null; environment_id: string | null; x: number; y: number; status: string
}>) {
  const admin = createAdminClient()
  const { error } = await admin.from('plan_symbol_occurrences').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`${BASE_PATH}/${planId}`)
  return { ok: true }
}

export async function deleteSymbolOccurrence(planId: string, id: string) {
  const admin = createAdminClient()
  const { error } = await admin.from('plan_symbol_occurrences').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`${BASE_PATH}/${planId}`)
  return { ok: true }
}

// ── Medições (perfil / fita) ─────────────────────────────────────────────

export async function createMeasurement(planId: string, data: {
  page: number; kind: 'perfil' | 'fita' | 'medida'; label?: string; points: [number, number][]
  length_m: number; environment_id?: string | null; power_w_per_m?: number; linked_measurement_id?: string | null
  bar_size?: number; packaging?: string; strand_count?: number; installation_location?: string; color_temp_k?: number
  product_model?: string; mount_type?: string; voltage?: string
}) {
  const userId = await requireUserId()
  if (!userId) return { error: 'Não autenticado' }
  const admin = createAdminClient()
  const { data: row, error } = await admin.from('plan_measurements').insert({
    plan_id: planId, ...data, created_by: userId,
  }).select().single()
  if (error) return { error: error.message }
  revalidatePath(`${BASE_PATH}/${planId}`)
  return { ok: true, data: row }
}

export async function updateMeasurement(planId: string, id: string, updates: Partial<{
  label: string; power_w_per_m: number; environment_id: string | null; notes: string
  points: [number, number][]; length_m: number; cota_offset: number
  product_model: string | null; mount_type: string | null; bar_size: number | null
  voltage: string | null; packaging: string | null; strand_count: number; installation_location: string | null
  color_temp_k: number | null
}>) {
  const admin = createAdminClient()
  const { error } = await admin.from('plan_measurements').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`${BASE_PATH}/${planId}`)
  return { ok: true }
}

// ── Fontes (alimentação das fitas de LED) ────────────────────────────────

export async function createPowerSupply(planId: string, data: { measurementId: string; page: number; x: number; y: number; watts: number }) {
  const userId = await requireUserId()
  if (!userId) return { error: 'Não autenticado' }
  const admin = createAdminClient()
  const { data: row, error } = await admin.from('plan_power_supplies').insert({
    plan_id: planId, measurement_id: data.measurementId, page: data.page, x: data.x, y: data.y, watts: data.watts, created_by: userId,
  }).select().single()
  if (error) return { error: error.message }
  revalidatePath(`${BASE_PATH}/${planId}`)
  return { ok: true, data: row }
}

export async function updatePowerSupply(planId: string, id: string, updates: Partial<{ x: number; y: number; watts: number }>) {
  const admin = createAdminClient()
  const { error } = await admin.from('plan_power_supplies').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`${BASE_PATH}/${planId}`)
  return { ok: true }
}

export async function deletePowerSupply(planId: string, id: string) {
  const admin = createAdminClient()
  const { error } = await admin.from('plan_power_supplies').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`${BASE_PATH}/${planId}`)
  return { ok: true }
}

export async function deleteMeasurement(planId: string, id: string) {
  const admin = createAdminClient()
  const { error } = await admin.from('plan_measurements').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`${BASE_PATH}/${planId}`)
  return { ok: true }
}

// ── Anotações (editor de PDF — camada separada) ──────────────────────────

export async function createAnnotation(planId: string, data: { page: number; kind: 'freehand' | 'rect' | 'highlight' | 'text'; data: Record<string, unknown> }) {
  const userId = await requireUserId()
  if (!userId) return { error: 'Não autenticado' }
  const admin = createAdminClient()
  const { data: row, error } = await admin.from('plan_annotations').insert({
    plan_id: planId, page: data.page, kind: data.kind, data: data.data, created_by: userId,
  }).select().single()
  if (error) return { error: error.message }
  revalidatePath(`${BASE_PATH}/${planId}`)
  return { ok: true, data: row }
}

export async function updateAnnotation(planId: string, id: string, data: Record<string, unknown>) {
  const admin = createAdminClient()
  const { error } = await admin.from('plan_annotations').update({ data, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`${BASE_PATH}/${planId}`)
  return { ok: true }
}

export async function deleteAnnotation(planId: string, id: string) {
  const admin = createAdminClient()
  const { error } = await admin.from('plan_annotations').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`${BASE_PATH}/${planId}`)
  return { ok: true }
}

// Planta em CAD: transforma os blocos do desenho (luminárias etc.) em itens
// de legenda + símbolos já posicionados. Cada bloco vira UM item de legenda
// (reaproveita o que já existe com o mesmo nome) e cada inserção vira uma
// ocorrência, ligada ao ambiente cujo polígono a contém. Reimportar não
// duplica o que já está no mesmo lugar.
export async function importCadBlocks(planId: string, page: number, blocks: { name: string; points: [number, number][] }[]) {
  const userId = await requireUserId()
  if (!userId) return { error: 'Não autenticado' }
  const admin = createAdminClient()
  const [legend, envs, existing] = await Promise.all([
    admin.from('plan_legend_items').select('*').eq('plan_id', planId),
    admin.from('plan_environments').select('id, polygon').eq('plan_id', planId).eq('page', page),
    admin.from('plan_symbol_occurrences').select('legend_item_id, x, y').eq('plan_id', planId).eq('page', page),
  ])
  const items = legend.data ?? []
  let nextNum = items.reduce((max, i: any) => Math.max(max, parseInt(i.code, 10) || 0), 0) + 1
  const newItems: any[] = []
  const newSymbols: any[] = []
  for (const b of blocks) {
    if (b.points.length === 0) continue
    let item: any = items.find((i: any) => (i.description ?? '').trim().toLowerCase() === b.name.trim().toLowerCase())
    if (!item) {
      const { data, error } = await admin.from('plan_legend_items').insert({
        plan_id: planId, code: String(nextNum++).padStart(2, '0'), description: b.name,
      }).select().single()
      if (error) return { error: error.message }
      item = data; items.push(item); newItems.push(item)
    }
    const rows = b.points
      .filter(([x, y]) => !(existing.data ?? []).some((e: any) => e.legend_item_id === item.id && Math.hypot(Number(e.x) - x, Number(e.y) - y) < 0.5))
      .map(([x, y]) => ({
        plan_id: planId, page, x, y, legend_item_id: item.id,
        environment_id: (envs.data ?? []).find((env: any) => pointInPolygon([x, y], env.polygon))?.id ?? null,
        detection_source: 'automatica', status: 'confirmado', created_by: userId,
      }))
    if (rows.length) {
      const { data, error } = await admin.from('plan_symbol_occurrences').insert(rows).select()
      if (error) return { error: error.message }
      newSymbols.push(...(data ?? []))
    }
  }
  revalidatePath(`${BASE_PATH}/${planId}`)
  return { ok: true, legendItems: newItems, symbols: newSymbols }
}
