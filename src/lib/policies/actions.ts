'use server'

// Server actions do módulo de Políticas Internas. Todas as tabelas têm RLS
// sem policies, então TUDO passa por aqui com o admin client — cada action
// confere quem está chamando (login, papel admin, atribuição do documento).
//
// A assinatura (policy_acknowledgments) é um registro legal: fica com
// timestamp e não existe ação para o colaborador desfazer.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Me = { id: string; name: string; role: string }

async function currentUser(): Promise<Me | null> {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return null
  const { data } = await createAdminClient().from('users').select('id, name, role, active').eq('id', user.id).maybeSingle()
  if (!data || data.active === false) return null
  return { id: data.id, name: data.name, role: data.role }
}

async function requireAdmin(): Promise<Me | null> {
  const me = await currentUser()
  return me && me.role === 'admin' ? me : null
}

function refresh() {
  revalidatePath('/politicas')
  revalidatePath('/politicas/gestao')
}

// ─── Colaborador ─────────────────────────────────────────────────────────

export type MyPolicyRow = {
  id: string; title: string; description: string | null
  topicsTotal: number; topicsSigned: number; fullySigned: boolean
  assignedAt: string; lastSignedAt: string | null
}

export async function getMyPolicies(): Promise<MyPolicyRow[] | null> {
  const me = await currentUser()
  if (!me) return null
  const db = createAdminClient()

  const { data: assignments } = await db.from('policy_assignments').select('document_id, assigned_at').eq('user_id', me.id)
  if (!assignments?.length) return []
  const docIds = assignments.map(a => a.document_id)

  const [{ data: docs }, { data: topics }, { data: acks }] = await Promise.all([
    db.from('policy_documents').select('*').in('id', docIds).eq('is_published', true),
    db.from('policy_topics').select('id, document_id').in('document_id', docIds),
    db.from('policy_acknowledgments').select('topic_id, document_id, acknowledged_at').eq('user_id', me.id).in('document_id', docIds),
  ])

  return (docs ?? []).map(d => {
    const docTopics = (topics ?? []).filter(t => t.document_id === d.id)
    const docAcks = (acks ?? []).filter(a => a.document_id === d.id)
    const signedTimes = docAcks.map(a => a.acknowledged_at).sort()
    return {
      id: d.id, title: d.title, description: d.description,
      topicsTotal: docTopics.length, topicsSigned: docAcks.length,
      fullySigned: docTopics.length > 0 && docAcks.length >= docTopics.length,
      assignedAt: assignments.find(a => a.document_id === d.id)!.assigned_at,
      lastSignedAt: signedTimes.length ? signedTimes[signedTimes.length - 1] : null,
    }
  }).sort((a, b) => Number(a.fullySigned) - Number(b.fullySigned) || a.title.localeCompare(b.title))
}

export type PolicyTopicView = { id: string; title: string; body: string; position: number; signed: boolean; signedAt: string | null }
export type PolicyView = {
  id: string; title: string; description: string | null
  topics: PolicyTopicView[]
  fullySigned: boolean
}

export async function getPolicyView(documentId: string): Promise<PolicyView | null> {
  const me = await currentUser()
  if (!me) return null
  const db = createAdminClient()

  const { data: assigned } = await db.from('policy_assignments').select('id').eq('document_id', documentId).eq('user_id', me.id).maybeSingle()
  if (!assigned) return null

  const { data: doc } = await db.from('policy_documents').select('*').eq('id', documentId).eq('is_published', true).maybeSingle()
  if (!doc) return null

  const [{ data: topics }, { data: acks }] = await Promise.all([
    db.from('policy_topics').select('*').eq('document_id', documentId).order('position'),
    db.from('policy_acknowledgments').select('topic_id, acknowledged_at').eq('user_id', me.id).eq('document_id', documentId),
  ])

  const ackMap = new Map((acks ?? []).map(a => [a.topic_id, a.acknowledged_at]))
  const topicViews: PolicyTopicView[] = (topics ?? []).map(t => ({
    id: t.id, title: t.title, body: t.body, position: t.position,
    signed: ackMap.has(t.id), signedAt: ackMap.get(t.id) ?? null,
  }))

  return {
    id: doc.id, title: doc.title, description: doc.description,
    topics: topicViews,
    fullySigned: topicViews.length > 0 && topicViews.every(t => t.signed),
  }
}

export async function acknowledgeTopic(topicId: string): Promise<{ error?: string; ok?: boolean; documentFullySigned?: boolean }> {
  const me = await currentUser()
  if (!me) return { error: 'Não autenticado' }
  const db = createAdminClient()

  const { data: topic } = await db.from('policy_topics').select('id, document_id').eq('id', topicId).maybeSingle()
  if (!topic) return { error: 'Tópico não encontrado' }
  const { data: assigned } = await db.from('policy_assignments').select('id').eq('document_id', topic.document_id).eq('user_id', me.id).maybeSingle()
  if (!assigned) return { error: 'Você não tem acesso a esta política' }

  const { error } = await db.from('policy_acknowledgments').upsert(
    { user_id: me.id, topic_id: topicId, document_id: topic.document_id },
    { onConflict: 'user_id,topic_id', ignoreDuplicates: true }
  )
  if (error) return { error: error.message }

  const [{ count: total }, { count: signed }] = await Promise.all([
    db.from('policy_topics').select('id', { count: 'exact', head: true }).eq('document_id', topic.document_id),
    db.from('policy_acknowledgments').select('topic_id', { count: 'exact', head: true }).eq('document_id', topic.document_id).eq('user_id', me.id),
  ])

  refresh()
  return { ok: true, documentFullySigned: !!total && (signed ?? 0) >= total }
}

// ─── Gestão (admin) ──────────────────────────────────────────────────────

export type AdminPolicyRow = { id: string; title: string; is_published: boolean; topics: number; assigned: number; fullySigned: number }

export async function listAdminPolicies(): Promise<AdminPolicyRow[] | null> {
  if (!(await requireAdmin())) return null
  const db = createAdminClient()
  const [{ data: docs }, { data: topics }, { data: assignments }, { data: acks }] = await Promise.all([
    db.from('policy_documents').select('*').order('position'),
    db.from('policy_topics').select('id, document_id'),
    db.from('policy_assignments').select('document_id, user_id'),
    db.from('policy_acknowledgments').select('document_id, user_id'),
  ])
  return (docs ?? []).map(d => {
    const docTopics = (topics ?? []).filter(t => t.document_id === d.id)
    const docAssign = (assignments ?? []).filter(a => a.document_id === d.id)
    const fullySigned = docAssign.filter(a => {
      const signed = (acks ?? []).filter(k => k.document_id === d.id && k.user_id === a.user_id).length
      return docTopics.length > 0 && signed >= docTopics.length
    }).length
    return { id: d.id, title: d.title, is_published: d.is_published, topics: docTopics.length, assigned: docAssign.length, fullySigned }
  })
}

export type AdminTopic = { id: string; title: string; body: string; position: number }
export type AdminSignerRow = {
  userId: string; name: string; assignedAt: string
  topicsSigned: number; topicsTotal: number; fullySigned: boolean
  signatures: Record<string, string | null> // topicId -> acknowledged_at
}
export type AdminPolicyDetail = {
  document: { id: string; title: string; description: string | null; is_published: boolean }
  topics: AdminTopic[]
  signers: AdminSignerRow[]
}

export async function getAdminPolicy(id: string): Promise<AdminPolicyDetail | null> {
  if (!(await requireAdmin())) return null
  const db = createAdminClient()
  const { data: doc } = await db.from('policy_documents').select('*').eq('id', id).maybeSingle()
  if (!doc) return null

  const [{ data: topics }, { data: assignments }, { data: acks }] = await Promise.all([
    db.from('policy_topics').select('*').eq('document_id', id).order('position'),
    db.from('policy_assignments').select('*').eq('document_id', id),
    db.from('policy_acknowledgments').select('*').eq('document_id', id),
  ])
  const userIds = (assignments ?? []).map(a => a.user_id)
  const { data: users } = userIds.length
    ? await db.from('users').select('id, name').in('id', userIds)
    : { data: [] as any[] }

  const topicList: AdminTopic[] = (topics ?? []).map(t => ({ id: t.id, title: t.title, body: t.body, position: t.position }))
  const signers: AdminSignerRow[] = (assignments ?? []).map(a => {
    const userAcks = (acks ?? []).filter(k => k.user_id === a.user_id)
    const signatures: Record<string, string | null> = {}
    for (const t of topicList) signatures[t.id] = userAcks.find(k => k.topic_id === t.id)?.acknowledged_at ?? null
    return {
      userId: a.user_id, name: users?.find(u => u.id === a.user_id)?.name ?? '—', assignedAt: a.assigned_at,
      topicsSigned: userAcks.length, topicsTotal: topicList.length,
      fullySigned: topicList.length > 0 && userAcks.length >= topicList.length,
      signatures,
    }
  })

  return { document: { id: doc.id, title: doc.title, description: doc.description, is_published: doc.is_published }, topics: topicList, signers }
}

export async function listAssignableUsers() {
  if (!(await requireAdmin())) return []
  const { data } = await createAdminClient().from('users').select('id, name, role').eq('active', true).order('name')
  return data ?? []
}

type R = { error?: string; ok?: boolean; id?: string }

export async function savePolicyDocument(input: { id?: string; title: string; description?: string }): Promise<R> {
  const me = await requireAdmin()
  if (!me) return { error: 'Apenas administradores' }
  if (!input.title.trim()) return { error: 'Dê um título ao documento' }
  const db = createAdminClient()
  if (input.id) {
    const { error } = await db.from('policy_documents').update({ title: input.title.trim(), description: input.description?.trim() || null, updated_at: new Date().toISOString() }).eq('id', input.id)
    if (error) return { error: error.message }
    refresh(); return { ok: true, id: input.id }
  }
  const { data: last } = await db.from('policy_documents').select('position').order('position', { ascending: false }).limit(1).maybeSingle()
  const { data: created, error } = await db.from('policy_documents').insert({
    title: input.title.trim(), description: input.description?.trim() || null, created_by: me.id, position: (last?.position ?? 0) + 1,
  }).select('id').single()
  if (error) return { error: error.message }
  refresh(); return { ok: true, id: created.id }
}

export async function setPolicyPublished(id: string, published: boolean): Promise<R> {
  if (!(await requireAdmin())) return { error: 'Apenas administradores' }
  const { error } = await createAdminClient().from('policy_documents').update({ is_published: published }).eq('id', id)
  if (error) return { error: error.message }
  refresh(); return { ok: true }
}

export async function deletePolicyDocument(id: string): Promise<R> {
  if (!(await requireAdmin())) return { error: 'Apenas administradores' }
  const { error } = await createAdminClient().from('policy_documents').delete().eq('id', id)
  if (error) return { error: error.message }
  refresh(); return { ok: true }
}

export async function saveTopic(input: { id?: string; documentId: string; title: string; body: string }): Promise<R> {
  if (!(await requireAdmin())) return { error: 'Apenas administradores' }
  if (!input.title.trim()) return { error: 'Dê um título ao tópico' }
  if (!input.body.trim()) return { error: 'Escreva o texto do tópico' }
  const db = createAdminClient()
  if (input.id) {
    const { error } = await db.from('policy_topics').update({ title: input.title.trim(), body: input.body.trim() }).eq('id', input.id)
    if (error) return { error: error.message }
  } else {
    const { data: last } = await db.from('policy_topics').select('position').eq('document_id', input.documentId).order('position', { ascending: false }).limit(1).maybeSingle()
    const { error } = await db.from('policy_topics').insert({ document_id: input.documentId, title: input.title.trim(), body: input.body.trim(), position: (last?.position ?? 0) + 1 })
    if (error) return { error: error.message }
  }
  refresh(); return { ok: true }
}

export async function deleteTopic(id: string): Promise<R> {
  if (!(await requireAdmin())) return { error: 'Apenas administradores' }
  const { error } = await createAdminClient().from('policy_topics').delete().eq('id', id)
  if (error) return { error: error.message }
  refresh(); return { ok: true }
}

export async function moveTopic(id: string, documentId: string, dir: -1 | 1): Promise<R> {
  if (!(await requireAdmin())) return { error: 'Apenas administradores' }
  const db = createAdminClient()
  const { data: rows } = await db.from('policy_topics').select('id, position').eq('document_id', documentId).order('position')
  if (!rows) return { error: 'Tópico não encontrado' }
  const idx = rows.findIndex(r => r.id === id)
  const swapIdx = idx + dir
  if (idx < 0 || swapIdx < 0 || swapIdx >= rows.length) return { ok: true }
  const a = rows[idx], b = rows[swapIdx]
  const [e1, e2] = await Promise.all([
    db.from('policy_topics').update({ position: b.position }).eq('id', a.id),
    db.from('policy_topics').update({ position: a.position }).eq('id', b.id),
  ])
  if (e1.error || e2.error) return { error: (e1.error ?? e2.error)!.message }
  refresh(); return { ok: true }
}

export async function assignUsers(input: { documentId: string; userIds: string[] }): Promise<R> {
  const me = await requireAdmin()
  if (!me) return { error: 'Apenas administradores' }
  if (!input.userIds.length) return { error: 'Selecione ao menos um colaborador' }
  const db = createAdminClient()
  const { error } = await db.from('policy_assignments').upsert(
    input.userIds.map(userId => ({ document_id: input.documentId, user_id: userId, assigned_by: me.id })),
    { onConflict: 'document_id,user_id', ignoreDuplicates: true }
  )
  if (error) return { error: error.message }
  refresh(); return { ok: true }
}

export async function removeAssignment(documentId: string, userId: string): Promise<R> {
  if (!(await requireAdmin())) return { error: 'Apenas administradores' }
  const db = createAdminClient()
  const { error } = await db.from('policy_assignments').delete().eq('document_id', documentId).eq('user_id', userId)
  if (error) return { error: error.message }
  // Remove também as assinaturas: se a pessoa for reatribuída depois, lê e assina de novo.
  await db.from('policy_acknowledgments').delete().eq('document_id', documentId).eq('user_id', userId)
  refresh(); return { ok: true }
}
