'use server'

// Server actions do módulo de Treinamento. Todas as tabelas têm RLS sem
// policies, então TUDO passa por aqui com o admin client — e cada action
// confere quem está chamando (login, papel admin, atribuição da trilha).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildUserState, todayKey, type Raw, type UserState, type TrackState } from './state'
import { driveEmbedUrl, youtubeId } from './embed'

const BUCKET = 'training'
const MAX_FILE_BYTES = 50 * 1024 * 1024

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

async function loadRaw(): Promise<Raw> {
  const db = createAdminClient()
  const [tracks, modules, lessons, assignments, progress] = await Promise.all([
    db.from('training_tracks').select('*'),
    db.from('training_modules').select('*'),
    db.from('training_lessons').select('*'),
    db.from('training_assignments').select('*'),
    db.from('training_progress').select('*'),
  ])
  return {
    tracks: tracks.data ?? [], modules: modules.data ?? [], lessons: lessons.data ?? [],
    assignments: assignments.data ?? [], progress: progress.data ?? [],
  }
}

function refresh() {
  revalidatePath('/treinamento')
  revalidatePath('/treinamento/gestao')
}

// ─── Colaborador ─────────────────────────────────────────────────────────

export type LeaderRow = { userId: string; name: string; avatar_color: string | null; avatar_url: string | null; xp: number; level: string; isMe: boolean }

export async function getTrainingHome(): Promise<{ me: Me; state: UserState; leaderboard: LeaderRow[]; isAdmin: boolean } | null> {
  const me = await currentUser()
  if (!me) return null
  const raw = await loadRaw()
  const state = buildUserState(raw, me.id)

  const userIds = Array.from(new Set(raw.assignments.map(a => a.user_id)))
  const { data: users } = userIds.length
    ? await createAdminClient().from('users').select('id, name, avatar_color, avatar_url, active').in('id', userIds)
    : { data: [] as any[] }
  const leaderboard = (users ?? []).filter(u => u.active !== false).map(u => {
    const s = buildUserState(raw, u.id)
    return { userId: u.id, name: u.name, avatar_color: u.avatar_color, avatar_url: u.avatar_url, xp: s.xp, level: s.level.name, isMe: u.id === me.id }
  }).filter(r => r.xp > 0 || r.isMe).sort((a, b) => b.xp - a.xp).slice(0, 8)

  return { me, state, leaderboard, isAdmin: me.role === 'admin' }
}

export async function getTrackView(trackId: string): Promise<TrackState | null> {
  const me = await currentUser()
  if (!me) return null
  const state = buildUserState(await loadRaw(), me.id)
  return state.tracks.find(t => t.track.id === trackId) ?? null
}

export type LessonView = {
  trackId: string; trackTitle: string; moduleTitle: string
  lesson: { id: string; title: string; kind: string; body: string | null; url: string | null; file_name: string | null; duration_min: number; xp: number }
  done: boolean
  embedUrl: string | null
  fileUrl: string | null
  prevId: string | null
  nextId: string | null
  position: number; total: number
}

export async function getLessonView(trackId: string, lessonId: string): Promise<LessonView | null> {
  const me = await currentUser()
  if (!me) return null
  const state = buildUserState(await loadRaw(), me.id)
  const t = state.tracks.find(x => x.track.id === trackId)
  if (!t) return null
  const flat = t.modules.flatMap(m => m.lessons.map(l => ({ ...l, moduleTitle: m.module.title })))
  const idx = flat.findIndex(l => l.lesson.id === lessonId)
  if (idx < 0) return null
  const cur = flat[idx]
  const l = cur.lesson

  let embedUrl: string | null = null
  if (l.kind === 'youtube' && l.url) { const id = youtubeId(l.url); if (id) embedUrl = `https://www.youtube-nocookie.com/embed/${id}?rel=0` }
  if (l.url && (l.kind === 'drive' || l.kind === 'pdf' || l.kind === 'image')) embedUrl = driveEmbedUrl(l.url)

  let fileUrl: string | null = null
  if (l.file_path) {
    const { data } = await createAdminClient().storage.from(BUCKET).createSignedUrl(l.file_path, 3600)
    fileUrl = data?.signedUrl ?? null
  }

  return {
    trackId, trackTitle: t.track.title, moduleTitle: cur.moduleTitle,
    lesson: { id: l.id, title: l.title, kind: l.kind, body: l.body, url: l.url, file_name: l.file_name, duration_min: l.duration_min, xp: l.xp },
    done: cur.done, embedUrl, fileUrl,
    prevId: flat[idx - 1]?.lesson.id ?? null, nextId: flat[idx + 1]?.lesson.id ?? null,
    position: idx + 1, total: flat.length,
  }
}

export type CompleteResult = { error?: string; xpGained?: number; moduleCompleted?: boolean; trackCompleted?: boolean; onTime?: boolean; newBadges?: { emoji: string; label: string }[]; level?: string; levelUp?: boolean }

export async function setLessonDone(lessonId: string, done: boolean): Promise<CompleteResult> {
  const me = await currentUser()
  if (!me) return { error: 'Não autenticado' }
  const db = createAdminClient()
  const raw = await loadRaw()
  const before = buildUserState(raw, me.id)
  const allowed = before.tracks.some(t => t.modules.some(m => m.lessons.some(l => l.lesson.id === lessonId)))
  if (!allowed) return { error: 'Você não tem acesso a essa aula' }

  if (done) {
    const { error } = await db.from('training_progress').upsert({ user_id: me.id, lesson_id: lessonId }, { onConflict: 'user_id,lesson_id', ignoreDuplicates: true })
    if (error) return { error: error.message }
  } else {
    const { error } = await db.from('training_progress').delete().eq('user_id', me.id).eq('lesson_id', lessonId)
    if (error) return { error: error.message }
  }

  const after = buildUserState(await loadRaw(), me.id)
  revalidatePath('/treinamento')
  revalidatePath('/treinamento/gestao')
  if (!done) return { xpGained: after.xp - before.xp }

  const modDone = (s: UserState) => new Set(s.tracks.flatMap(t => t.modules.filter(m => m.complete).map(m => m.module.id)))
  const trkDone = (s: UserState) => s.tracks.filter(t => t.finishedAt)
  const bm = modDone(before), bt = new Set(trkDone(before).map(t => t.track.id))
  const finishedNow = trkDone(after).find(t => !bt.has(t.track.id))
  const bBadges = new Set(before.badges.filter(b => b.earned).map(b => b.id))
  return {
    xpGained: after.xp - before.xp,
    moduleCompleted: Array.from(modDone(after)).some(id => !bm.has(id)),
    trackCompleted: !!finishedNow,
    onTime: finishedNow?.onTime,
    newBadges: after.badges.filter(b => b.earned && !bBadges.has(b.id)).map(b => ({ emoji: b.emoji, label: b.label })),
    level: after.level.name,
    levelUp: after.level.level > before.level.level,
  }
}

// ─── Gestão (admin) ──────────────────────────────────────────────────────

export type AdminTrackRow = { id: string; title: string; emoji: string; is_published: boolean; target_days: number | null; modules: number; lessons: number; assigned: number; avgPct: number }

export async function listAdminTracks(): Promise<AdminTrackRow[] | null> {
  if (!(await requireAdmin())) return null
  const raw = await loadRaw()
  return raw.tracks.sort((a, b) => a.position - b.position).map(t => {
    const mods = raw.modules.filter(m => m.track_id === t.id)
    const lessons = raw.lessons.filter(l => mods.some(m => m.id === l.module_id))
    const asg = raw.assignments.filter(a => a.track_id === t.id)
    const pcts = asg.map(a => buildUserState(raw, a.user_id).tracks.find(x => x.track.id === t.id)?.pct ?? 0)
    return {
      id: t.id, title: t.title, emoji: t.emoji, is_published: t.is_published, target_days: t.target_days,
      modules: mods.length, lessons: lessons.length, assigned: asg.length,
      avgPct: pcts.length ? Math.round(pcts.reduce((s, n) => s + n, 0) / pcts.length) : 0,
    }
  })
}

export type AdminAssignment = { id: string; user_id: string; name: string; due_date: string | null; allowed_module_ids: string[] | null; pct: number; doneLessons: number; totalLessons: number; status: string; message: string; lastActivity: string | null }
export type AdminTrackDetail = {
  track: { id: string; title: string; description: string | null; emoji: string; target_days: number | null; is_published: boolean }
  modules: { id: string; title: string; description: string | null; position: number; lessons: { id: string; title: string; kind: string; body: string | null; url: string | null; file_path: string | null; file_name: string | null; duration_min: number; xp: number; position: number }[] }[]
  assignments: AdminAssignment[]
}

export async function getAdminTrack(id: string): Promise<AdminTrackDetail | null> {
  if (!(await requireAdmin())) return null
  const raw = await loadRaw()
  const t = raw.tracks.find(x => x.id === id)
  if (!t) return null
  const modules = raw.modules.filter(m => m.track_id === id).sort((a, b) => a.position - b.position).map(m => ({
    id: m.id, title: m.title, description: m.description, position: m.position,
    lessons: raw.lessons.filter(l => l.module_id === m.id).sort((a, b) => a.position - b.position),
  }))
  const asg = raw.assignments.filter(a => a.track_id === id)
  const { data: users } = asg.length
    ? await createAdminClient().from('users').select('id, name').in('id', asg.map(a => a.user_id))
    : { data: [] as any[] }

  // Estado calculado como se a trilha estivesse publicada, mesmo em rascunho.
  const rawPub: Raw = { ...raw, tracks: raw.tracks.map(x => x.id === id ? { ...x, is_published: true } : x) }
  const assignments: AdminAssignment[] = asg.map(a => {
    const ts = buildUserState(rawPub, a.user_id).tracks.find(x => x.track.id === id)
    const dates = ts?.modules.flatMap(m => m.lessons.filter(l => l.done).map(l => l.completedAt!)).sort() ?? []
    return {
      id: a.id, user_id: a.user_id, name: users?.find(u => u.id === a.user_id)?.name ?? '—',
      due_date: a.due_date, allowed_module_ids: a.allowed_module_ids,
      pct: ts?.pct ?? 0, doneLessons: ts?.doneLessons ?? 0, totalLessons: ts?.totalLessons ?? 0,
      status: ts?.pace.status ?? 'sem_prazo', message: ts?.pace.message ?? '',
      lastActivity: dates.length ? dates[dates.length - 1] : null,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))

  return {
    track: { id: t.id, title: t.title, description: t.description, emoji: t.emoji, target_days: t.target_days, is_published: t.is_published },
    modules, assignments,
  }
}

export async function listAssignableUsers() {
  if (!(await requireAdmin())) return []
  const { data } = await createAdminClient().from('users').select('id, name, role, active').eq('active', true).order('name')
  return data ?? []
}

type R = { error?: string; ok?: boolean; id?: string }

export async function saveTrack(input: { id?: string; title: string; description?: string; emoji?: string; target_days?: number | null }): Promise<R> {
  const me = await requireAdmin()
  if (!me) return { error: 'Apenas administradores' }
  if (!input.title.trim()) return { error: 'Dê um nome à trilha' }
  const db = createAdminClient()
  const row = { title: input.title.trim(), description: input.description?.trim() || null, emoji: input.emoji?.trim() || '🎓', target_days: input.target_days || null, updated_at: new Date().toISOString() }
  if (input.id) {
    const { error } = await db.from('training_tracks').update(row).eq('id', input.id)
    if (error) return { error: error.message }
    refresh(); return { ok: true, id: input.id }
  }
  const { data: last } = await db.from('training_tracks').select('position').order('position', { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await db.from('training_tracks').insert({ ...row, position: (last?.position ?? 0) + 1, created_by: me.id }).select('id').single()
  if (error) return { error: error.message }
  refresh(); return { ok: true, id: data.id }
}

export async function setTrackPublished(id: string, published: boolean): Promise<R> {
  if (!(await requireAdmin())) return { error: 'Apenas administradores' }
  const { error } = await createAdminClient().from('training_tracks').update({ is_published: published }).eq('id', id)
  if (error) return { error: error.message }
  refresh(); return { ok: true }
}

export async function deleteTrack(id: string): Promise<R> {
  if (!(await requireAdmin())) return { error: 'Apenas administradores' }
  const { error } = await createAdminClient().from('training_tracks').delete().eq('id', id)
  if (error) return { error: error.message }
  refresh(); return { ok: true }
}

export async function saveModule(input: { id?: string; trackId: string; title: string; description?: string }): Promise<R> {
  if (!(await requireAdmin())) return { error: 'Apenas administradores' }
  if (!input.title.trim()) return { error: 'Dê um nome ao módulo' }
  const db = createAdminClient()
  const row = { title: input.title.trim(), description: input.description?.trim() || null }
  if (input.id) {
    const { error } = await db.from('training_modules').update(row).eq('id', input.id)
    if (error) return { error: error.message }
  } else {
    const { data: last } = await db.from('training_modules').select('position').eq('track_id', input.trackId).order('position', { ascending: false }).limit(1).maybeSingle()
    const { error } = await db.from('training_modules').insert({ ...row, track_id: input.trackId, position: (last?.position ?? 0) + 1 })
    if (error) return { error: error.message }
  }
  refresh(); return { ok: true }
}

export async function deleteModule(id: string): Promise<R> {
  if (!(await requireAdmin())) return { error: 'Apenas administradores' }
  const { error } = await createAdminClient().from('training_modules').delete().eq('id', id)
  if (error) return { error: error.message }
  refresh(); return { ok: true }
}

async function swapPosition(table: 'training_modules' | 'training_lessons', id: string, dir: -1 | 1, scope: { col: string; val: string }): Promise<R> {
  const db = createAdminClient()
  const { data: rows } = await db.from(table).select('id, position').eq(scope.col, scope.val).order('position').order('created_at')
  const list = rows ?? []
  const i = list.findIndex(r => r.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return { ok: true }
  const next = list.map(r => r.id)
  ;[next[i], next[j]] = [next[j], next[i]]
  await Promise.all(next.map((rid, pos) => db.from(table).update({ position: pos + 1 }).eq('id', rid)))
  refresh(); return { ok: true }
}

export async function moveModule(id: string, trackId: string, dir: -1 | 1): Promise<R> {
  if (!(await requireAdmin())) return { error: 'Apenas administradores' }
  return swapPosition('training_modules', id, dir, { col: 'track_id', val: trackId })
}

export async function moveLesson(id: string, moduleId: string, dir: -1 | 1): Promise<R> {
  if (!(await requireAdmin())) return { error: 'Apenas administradores' }
  return swapPosition('training_lessons', id, dir, { col: 'module_id', val: moduleId })
}

export async function saveLesson(input: {
  id?: string; moduleId: string; title: string; kind: string; body?: string; url?: string
  file_path?: string | null; file_name?: string | null; duration_min?: number; xp?: number
}): Promise<R> {
  if (!(await requireAdmin())) return { error: 'Apenas administradores' }
  if (!input.title.trim()) return { error: 'Dê um título à aula' }
  const url = input.url?.trim() || null
  if (input.kind === 'youtube' && !(url && youtubeId(url))) return { error: 'Link do YouTube inválido' }
  if (input.kind === 'drive' && !(url && driveEmbedUrl(url))) return { error: 'Link do Google Drive inválido (use o link de compartilhamento do arquivo)' }
  if (input.kind === 'link' && !(url && /^https?:\/\//i.test(url))) return { error: 'Informe um link começando com http(s)://' }
  if ((input.kind === 'pdf' || input.kind === 'image') && !input.file_path && !url) return { error: 'Envie o arquivo (ou cole um link do Drive)' }
  if (input.kind === 'text' && !input.body?.trim()) return { error: 'Escreva o texto da aula' }

  const db = createAdminClient()
  const row = {
    title: input.title.trim(), kind: input.kind, body: input.body?.trim() || null, url,
    file_path: input.file_path ?? null, file_name: input.file_name ?? null,
    duration_min: Math.max(1, input.duration_min ?? 5), xp: Math.max(0, input.xp ?? 10),
  }
  if (input.id) {
    const { error } = await db.from('training_lessons').update(row).eq('id', input.id)
    if (error) return { error: error.message }
  } else {
    const { data: last } = await db.from('training_lessons').select('position').eq('module_id', input.moduleId).order('position', { ascending: false }).limit(1).maybeSingle()
    const { error } = await db.from('training_lessons').insert({ ...row, module_id: input.moduleId, position: (last?.position ?? 0) + 1 })
    if (error) return { error: error.message }
  }
  refresh(); return { ok: true }
}

export async function deleteLesson(id: string): Promise<R> {
  if (!(await requireAdmin())) return { error: 'Apenas administradores' }
  const db = createAdminClient()
  const { data: l } = await db.from('training_lessons').select('file_path').eq('id', id).maybeSingle()
  const { error } = await db.from('training_lessons').delete().eq('id', id)
  if (error) return { error: error.message }
  if (l?.file_path) await db.storage.from(BUCKET).remove([l.file_path])
  refresh(); return { ok: true }
}

// Assina a URL de upload: o arquivo vai direto do navegador pro Storage
// (server actions morrem em 1 MB — mesmo cuidado dos anexos de orçamento).
export async function createTrainingUpload(input: { trackId: string; fileName: string; sizeBytes: number }): Promise<{ error?: string; path?: string; token?: string }> {
  if (!(await requireAdmin())) return { error: 'Apenas administradores' }
  if (!input.sizeBytes) return { error: 'Arquivo vazio' }
  if (input.sizeBytes > MAX_FILE_BYTES) return { error: 'Arquivo acima de 50 MB' }
  const safe = input.fileName.replace(/[^\w.\- ]+/g, '_').trim().slice(-100) || `arquivo-${Date.now()}`
  const path = `${input.trackId}/${Date.now()}_${safe}`
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) return { error: error?.message ?? 'Não foi possível preparar o envio' }
  return { path: data.path, token: data.token }
}

export async function assignUsers(input: { trackId: string; userIds: string[]; dueDate?: string | null; allowedModuleIds?: string[] | null }): Promise<R> {
  const me = await requireAdmin()
  if (!me) return { error: 'Apenas administradores' }
  if (!input.userIds.length) return { error: 'Escolha pelo menos um colaborador' }
  const db = createAdminClient()
  let due = input.dueDate || null
  if (!due) {
    const { data: t } = await db.from('training_tracks').select('target_days').eq('id', input.trackId).maybeSingle()
    if (t?.target_days) { const d = new Date(todayKey() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + t.target_days); due = d.toISOString().slice(0, 10) }
  }
  const rows = input.userIds.map(uid => ({
    track_id: input.trackId, user_id: uid, assigned_by: me.id, due_date: due,
    allowed_module_ids: input.allowedModuleIds?.length ? input.allowedModuleIds : null,
  }))
  const { error } = await db.from('training_assignments').upsert(rows, { onConflict: 'track_id,user_id' })
  if (error) return { error: error.message }
  refresh(); return { ok: true }
}

export async function updateAssignment(id: string, input: { dueDate: string | null; allowedModuleIds: string[] | null }): Promise<R> {
  if (!(await requireAdmin())) return { error: 'Apenas administradores' }
  const { error } = await createAdminClient().from('training_assignments')
    .update({ due_date: input.dueDate || null, allowed_module_ids: input.allowedModuleIds?.length ? input.allowedModuleIds : null }).eq('id', id)
  if (error) return { error: error.message }
  refresh(); return { ok: true }
}

export async function removeAssignment(id: string): Promise<R> {
  if (!(await requireAdmin())) return { error: 'Apenas administradores' }
  const { error } = await createAdminClient().from('training_assignments').delete().eq('id', id)
  if (error) return { error: error.message }
  refresh(); return { ok: true }
}

export type TeamRow = { userId: string; name: string; xp: number; level: string; streak: number; tracks: { id: string; title: string; emoji: string; pct: number; due: string | null; status: string; daysLeft: number | null; message: string }[] }

export async function getTeamOverview(): Promise<TeamRow[] | null> {
  if (!(await requireAdmin())) return null
  const raw = await loadRaw()
  const ids = Array.from(new Set(raw.assignments.map(a => a.user_id)))
  if (!ids.length) return []
  const { data: users } = await createAdminClient().from('users').select('id, name, active').in('id', ids)
  return (users ?? []).filter(u => u.active !== false).map(u => {
    const s = buildUserState(raw, u.id)
    return {
      userId: u.id, name: u.name, xp: s.xp, level: s.level.name, streak: s.streak.current,
      tracks: s.tracks.map(t => ({ id: t.track.id, title: t.track.title, emoji: t.track.emoji, pct: t.pct, due: t.assignment.due_date, status: t.pace.status, daysLeft: t.pace.daysLeft, message: t.pace.message })),
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
}
