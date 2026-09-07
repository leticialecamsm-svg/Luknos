'use server'

// Server actions da Leitura de Projeto — segue o mesmo padrão de
// src/lib/actions.ts (createClient/createAdminClient do Supabase, RLS pra
// leitura/escrita normal, revalidatePath depois de mutação), só que num
// arquivo separado porque o módulo é isolado do resto do sistema.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

export async function uploadPlan(formData: FormData) {
  const userId = await requireUserId()
  if (!userId) return { error: 'Não autenticado' }

  const file = formData.get('file') as File | null
  const name = String(formData.get('name') ?? '').trim()
  const numPages = Number(formData.get('numPages') ?? 1) || 1
  if (!file) return { error: 'Nenhum arquivo enviado' }
  if (file.type !== 'application/pdf') return { error: 'O arquivo precisa ser um PDF' }

  const admin = createAdminClient()
  const storagePath = `${userId}/${Date.now()}_${file.name.replace(/[^\w.\-]/g, '_')}`
  const { error: uploadError } = await admin.storage.from('project-plans').upload(storagePath, file)
  if (uploadError) return { error: uploadError.message }

  const { data, error } = await admin.from('project_plans').insert({
    name: name || file.name.replace(/\.pdf$/i, ''),
    original_filename: file.name,
    storage_path: storagePath,
    num_pages: numPages,
    status: 'ready',
    created_by: userId,
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
  lumen_flux?: number; finish?: string; notes?: string
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
