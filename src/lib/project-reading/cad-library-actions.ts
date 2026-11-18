'use server'

// Biblioteca de blocos CAD da Luknos: blocos padrão (luminárias, símbolos...)
// guardados uma vez e reutilizados em qualquer DXF/DWG aberto no laboratório.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { LibBlock } from './cad'

async function requireUserId(): Promise<string | null> {
  const { data: { user } } = await createClient().auth.getUser()
  return user?.id ?? null
}

export interface CadLibRow { id: string; name: string; data: LibBlock; family: string | null }

export async function listCadLibrary(): Promise<{ rows?: CadLibRow[]; error?: string }> {
  if (!(await requireUserId())) return { error: 'Não autenticado' }
  const { data, error } = await createAdminClient().from('cad_block_library').select('id, name, data, family').order('name')
  if (error) return { error: error.message }
  return { rows: (data ?? []) as any }
}

// Salva (ou substitui, pelo nome) um bloco da biblioteca.
export async function saveCadLibraryBlock(block: LibBlock): Promise<{ error?: string }> {
  const userId = await requireUserId()
  if (!userId) return { error: 'Não autenticado' }
  const name = block.name.trim()
  if (!name) return { error: 'Bloco sem nome' }
  const { error } = await createAdminClient().from('cad_block_library').upsert(
    { name, data: block, seg_count: block.segs.length / 4, created_by: userId, updated_at: new Date().toISOString() },
    { onConflict: 'name' },
  )
  return error ? { error: error.message } : {}
}

export async function deleteCadLibraryBlock(id: string): Promise<{ error?: string }> {
  if (!(await requireUserId())) return { error: 'Não autenticado' }
  const { error } = await createAdminClient().from('cad_block_library').delete().eq('id', id)
  return error ? { error: error.message } : {}
}

// Define (ou limpa, com vazio) a família de um bloco: blocos da mesma família viram "estados" um do outro.
export async function setCadLibraryFamily(id: string, family: string): Promise<{ error?: string }> {
  if (!(await requireUserId())) return { error: 'Não autenticado' }
  const { error } = await createAdminClient().from('cad_block_library').update({ family: family.trim() || null }).eq('id', id)
  return error ? { error: error.message } : {}
}
