'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type DocumentSummary = {
  id: string
  title: string
  solicitation_id: string | null
  solicitation_number: number | null
  solicitation_title: string | null
  created_by: string | null
  creator_name: string | null
  updated_by: string | null
  updater_name: string | null
  created_at: string
  updated_at: string
}

export type DocumentFull = DocumentSummary & {
  content: any
}

async function guard(): Promise<{ user: NonNullable<Awaited<ReturnType<ReturnType<typeof createClient>['auth']['getUser']>>['data']['user']> } | { error: string }> {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return { error: 'Não autenticado' }
  return { user }
}

export async function getDocuments(solicitationId?: string): Promise<DocumentSummary[]> {
  const auth = await guard()
  if ('error' in auth) return []
  const db = createAdminClient()

  let query = db
    .from('documents')
    .select('id, title, solicitation_id, created_by, updated_by, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(200)

  if (solicitationId) query = query.eq('solicitation_id', solicitationId)

  const { data } = await query
  if (!data || data.length === 0) return []

  const userIds = Array.from(new Set([
    ...data.map((d: any) => d.created_by),
    ...data.map((d: any) => d.updated_by),
  ].filter(Boolean)))

  const solIds = Array.from(new Set(data.map((d: any) => d.solicitation_id).filter(Boolean)))

  const [usersRes, solsRes] = await Promise.all([
    userIds.length ? db.from('users').select('id, name').in('id', userIds) : Promise.resolve({ data: [] }),
    solIds.length ? db.from('solicitations').select('id, number, title').in('id', solIds) : Promise.resolve({ data: [] }),
  ])

  const usersMap = Object.fromEntries((usersRes.data ?? []).map((u: any) => [u.id, u.name]))
  const solsMap = Object.fromEntries((solsRes.data ?? []).map((s: any) => [s.id, s]))

  return data.map((d: any) => ({
    id: d.id,
    title: d.title,
    solicitation_id: d.solicitation_id ?? null,
    solicitation_number: d.solicitation_id ? (solsMap[d.solicitation_id]?.number ?? null) : null,
    solicitation_title: d.solicitation_id ? (solsMap[d.solicitation_id]?.title ?? null) : null,
    created_by: d.created_by ?? null,
    creator_name: d.created_by ? (usersMap[d.created_by] ?? null) : null,
    updated_by: d.updated_by ?? null,
    updater_name: d.updated_by ? (usersMap[d.updated_by] ?? null) : null,
    created_at: d.created_at,
    updated_at: d.updated_at,
  }))
}

export async function getDocument(id: string): Promise<DocumentFull | null> {
  const auth = await guard()
  if ('error' in auth) return null
  const db = createAdminClient()

  const { data } = await db.from('documents').select('*').eq('id', id).maybeSingle()
  if (!data) return null

  const userIds = [data.created_by, data.updated_by].filter(Boolean)
  let usersMap: Record<string, string> = {}
  if (userIds.length) {
    const { data: users } = await db.from('users').select('id, name').in('id', userIds)
    for (const u of (users ?? []) as any[]) usersMap[u.id] = u.name
  }

  let solicitation_number: number | null = null
  let solicitation_title: string | null = null
  if (data.solicitation_id) {
    const { data: sol } = await db.from('solicitations').select('number, title').eq('id', data.solicitation_id).maybeSingle()
    solicitation_number = sol?.number ?? null
    solicitation_title = sol?.title ?? null
  }

  return {
    id: data.id,
    title: data.title,
    content: data.content,
    solicitation_id: data.solicitation_id ?? null,
    solicitation_number,
    solicitation_title,
    created_by: data.created_by ?? null,
    creator_name: data.created_by ? (usersMap[data.created_by] ?? null) : null,
    updated_by: data.updated_by ?? null,
    updater_name: data.updated_by ? (usersMap[data.updated_by] ?? null) : null,
    created_at: data.created_at,
    updated_at: data.updated_at,
  }
}

export async function createDocument(input: {
  title?: string
  content?: any
  solicitation_id?: string | null
}): Promise<{ ok: true; id: string } | { error: string }> {
  const auth = await guard()
  if ('error' in auth) return { error: auth.error }
  const db = createAdminClient()

  const { data, error } = await db.from('documents').insert({
    title: input.title || 'Sem título',
    content: input.content ?? null,
    solicitation_id: input.solicitation_id ?? null,
    created_by: auth.user.id,
    updated_by: auth.user.id,
  }).select('id').single()

  if (error || !data?.id) return { error: error?.message ?? 'Erro ao criar documento' }
  revalidatePath('/documentos')
  return { ok: true, id: data.id as string }
}

export async function updateDocument(id: string, input: {
  title?: string
  content?: any
}): Promise<{ ok: true } | { error: string }> {
  const auth = await guard()
  if ('error' in auth) return { error: auth.error }
  const db = createAdminClient()

  const updates: Record<string, any> = { updated_by: auth.user.id, updated_at: new Date().toISOString() }
  if (input.title !== undefined) updates.title = input.title
  if (input.content !== undefined) updates.content = input.content

  const { error } = await db.from('documents').update(updates).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/documentos')
  revalidatePath(`/documentos/${id}`)
  return { ok: true }
}

export async function deleteDocument(id: string): Promise<{ ok: true } | { error: string }> {
  const auth = await guard()
  if ('error' in auth) return { error: auth.error }
  const { error } = await createAdminClient().from('documents').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/documentos')
  return { ok: true }
}
