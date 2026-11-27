'use server'

// Desenhos salvos do laboratório CAD: o arquivo original fica no Storage
// (bucket privado) e as alterações num JSON na tabela. Cada pessoa vê só os seus.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SavedState } from './cad-state'

const BUCKET = 'cad-drawings'
const MAX_BYTES = 50 * 1024 * 1024

async function requireUserId(): Promise<string | null> {
  const { data: { user } } = await createClient().auth.getUser()
  return user?.id ?? null
}

export interface CadDrawingRow { id: string; name: string; file_name: string; size_bytes: number; updated_at: string }

export async function listCadDrawings(): Promise<{ rows?: CadDrawingRow[]; error?: string }> {
  const userId = await requireUserId()
  if (!userId) return { error: 'Não autenticado' }
  const { data, error } = await createAdminClient().from('cad_drawings')
    .select('id, name, file_name, size_bytes, updated_at').eq('owner', userId).order('updated_at', { ascending: false })
  return error ? { error: error.message } : { rows: data as CadDrawingRow[] }
}

export async function createCadUpload(fileName: string, sizeBytes: number): Promise<{ path?: string; token?: string; error?: string }> {
  const userId = await requireUserId()
  if (!userId) return { error: 'Não autenticado' }
  if (sizeBytes > MAX_BYTES) return { error: 'Arquivo acima de 50 MB' }
  const path = `${userId}/${Date.now()}_${fileName.replace(/[^\w.\-]/g, '_')}`
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) return { error: error?.message ?? 'Não foi possível preparar o envio' }
  return { path: data.path, token: data.token }
}

export async function finalizeCadDrawing(input: { path: string; fileName: string; sizeBytes: number }): Promise<{ id?: string; error?: string }> {
  const userId = await requireUserId()
  if (!userId) return { error: 'Não autenticado' }
  if (!input.path.startsWith(`${userId}/`)) return { error: 'Caminho de arquivo inválido' }
  const { data, error } = await createAdminClient().from('cad_drawings').insert({
    owner: userId, name: input.fileName.replace(/\.(dwg|dxf)$/i, ''), file_name: input.fileName,
    storage_path: input.path, size_bytes: input.sizeBytes,
  }).select('id').single()
  return error ? { error: error.message } : { id: data.id }
}

export async function openCadDrawing(id: string): Promise<{ name?: string; fileName?: string; url?: string; state?: SavedState | null; error?: string }> {
  const userId = await requireUserId()
  if (!userId) return { error: 'Não autenticado' }
  const admin = createAdminClient()
  const { data, error } = await admin.from('cad_drawings').select('*').eq('id', id).eq('owner', userId).single()
  if (error || !data) return { error: 'Desenho não encontrado' }
  const signed = await admin.storage.from(BUCKET).createSignedUrl(data.storage_path, 600)
  if (signed.error || !signed.data) return { error: signed.error?.message ?? 'Arquivo não encontrado' }
  return { name: data.name, fileName: data.file_name, url: signed.data.signedUrl, state: data.state }
}

export async function saveCadDrawingState(id: string, state: SavedState): Promise<{ error?: string }> {
  const userId = await requireUserId()
  if (!userId) return { error: 'Não autenticado' }
  const { data, error } = await createAdminClient().from('cad_drawings')
    .update({ state, updated_at: new Date().toISOString() }).eq('id', id).eq('owner', userId).select('id')
  if (error) return { error: error.message }
  return data?.length ? {} : { error: 'Desenho não encontrado' }
}

/** Cópia independente (arquivo e alterações), pra versões ou pra separar plantas. */
export async function duplicateCadDrawing(id: string, name: string): Promise<{ id?: string; error?: string }> {
  const userId = await requireUserId()
  if (!userId) return { error: 'Não autenticado' }
  if (!name.trim()) return { error: 'Nome vazio' }
  const admin = createAdminClient()
  const { data } = await admin.from('cad_drawings').select('file_name, storage_path, size_bytes, state').eq('id', id).eq('owner', userId).single()
  if (!data) return { error: 'Desenho não encontrado' }
  const path = `${userId}/${Date.now()}_${data.file_name.replace(/[^\w.\-]/g, '_')}`
  const copia = await admin.storage.from(BUCKET).copy(data.storage_path, path)
  if (copia.error) return { error: copia.error.message }
  const novo = await admin.from('cad_drawings')
    .insert({ owner: userId, name: name.trim(), file_name: data.file_name, storage_path: path, size_bytes: data.size_bytes, state: data.state })
    .select('id').single()
  if (novo.error) { await admin.storage.from(BUCKET).remove([path]); return { error: novo.error.message } }
  return { id: novo.data.id }
}

export async function renameCadDrawing(id: string, name: string): Promise<{ error?: string }> {
  const userId = await requireUserId()
  if (!userId) return { error: 'Não autenticado' }
  if (!name.trim()) return { error: 'Nome vazio' }
  const { error } = await createAdminClient().from('cad_drawings').update({ name: name.trim() }).eq('id', id).eq('owner', userId)
  return error ? { error: error.message } : {}
}

export async function deleteCadDrawing(id: string): Promise<{ error?: string }> {
  const userId = await requireUserId()
  if (!userId) return { error: 'Não autenticado' }
  const admin = createAdminClient()
  const { data } = await admin.from('cad_drawings').select('storage_path').eq('id', id).eq('owner', userId).single()
  if (!data) return { error: 'Desenho não encontrado' }
  const { error } = await admin.from('cad_drawings').delete().eq('id', id).eq('owner', userId)
  if (error) return { error: error.message }
  await admin.storage.from(BUCKET).remove([data.storage_path])
  return {}
}
