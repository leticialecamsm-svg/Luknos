// Cálculo puro de progresso, XP, sequência, selos e ritmo. Roda no servidor
// sobre os dados brutos — sem estado gravado, então nunca fica defasado.

export type RawTrack = { id: string; title: string; description: string | null; emoji: string; target_days: number | null; is_published: boolean; position: number }
export type RawModule = { id: string; track_id: string; title: string; description: string | null; position: number }
export type RawLesson = { id: string; module_id: string; title: string; kind: string; body: string | null; url: string | null; file_path: string | null; file_name: string | null; duration_min: number; xp: number; position: number }
export type RawAssignment = { id: string; track_id: string; user_id: string; assigned_at: string; due_date: string | null; allowed_module_ids: string[] | null }
export type RawProgress = { user_id: string; lesson_id: string; completed_at: string }
export type Raw = { tracks: RawTrack[]; modules: RawModule[]; lessons: RawLesson[]; assignments: RawAssignment[]; progress: RawProgress[] }

export const MODULE_BONUS = 25
export const TRACK_BONUS = 100
export const ON_TIME_BONUS = 50

export const LEVELS = [
  { min: 0, name: 'Novato' },
  { min: 100, name: 'Aprendiz' },
  { min: 300, name: 'Praticante' },
  { min: 600, name: 'Especialista' },
  { min: 1000, name: 'Mestre Luknos' },
]

export function levelFor(xp: number) {
  let idx = 0
  LEVELS.forEach((l, i) => { if (xp >= l.min) idx = i })
  const cur = LEVELS[idx]
  const next = LEVELS[idx + 1] ?? null
  const pct = next ? Math.round(((xp - cur.min) / (next.min - cur.min)) * 100) : 100
  return { level: idx + 1, name: cur.name, next: next?.name ?? null, nextAt: next?.min ?? null, pct }
}

export const dayKey = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

export function todayKey() { return dayKey(new Date()) }

function addDays(key: string, n: number) {
  const d = new Date(key + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function diffDays(fromKey: string, toKey: string) {
  return Math.round((new Date(toKey + 'T12:00:00Z').getTime() - new Date(fromKey + 'T12:00:00Z').getTime()) / 86400000)
}

// Sequência atual (hoje ou ontem ainda contam) e a melhor de todas.
export function streaks(completedAt: string[]) {
  const days = Array.from(new Set(completedAt.map(dayKey))).sort()
  let best = 0, run = 0, prev: string | null = null
  for (const d of days) {
    run = prev && diffDays(prev, d) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }
  const today = todayKey()
  let current = 0
  if (days.length) {
    const last = days[days.length - 1]
    if (diffDays(last, today) <= 1) {
      current = 1
      for (let i = days.length - 1; i > 0 && diffDays(days[i - 1], days[i]) === 1; i--) current++
    }
  }
  return { current, best, doneToday: days.includes(today) }
}

export type Pace = {
  status: 'sem_prazo' | 'concluida' | 'ok' | 'apertado' | 'atrasada'
  daysLeft: number | null
  perDay: number | null
  message: string
}

export function paceFor(remainingLessons: number, dueDate: string | null, finished: boolean): Pace {
  if (finished) return { status: 'concluida', daysLeft: null, perDay: null, message: 'Trilha concluída!' }
  if (!dueDate) return { status: 'sem_prazo', daysLeft: null, perDay: null, message: 'Sem prazo definido — mas quanto antes, melhor.' }
  const daysLeft = diffDays(todayKey(), dueDate)
  if (daysLeft < 0) return { status: 'atrasada', daysLeft, perDay: null, message: `Prazo venceu há ${Math.abs(daysLeft)} dia${Math.abs(daysLeft) === 1 ? '' : 's'}. Termine o quanto antes!` }
  const days = Math.max(daysLeft, 1)
  const perDay = Math.ceil((remainingLessons / days) * 10) / 10
  const status = perDay > 3 ? 'apertado' : 'ok'
  const when = daysLeft === 0 ? 'Prazo é hoje' : daysLeft === 1 ? 'Falta 1 dia' : `Faltam ${daysLeft} dias`
  const rhythm = perDay <= 1 ? 'menos de 1 aula por dia' : `${perDay.toString().replace('.', ',')} aulas por dia`
  return { status, daysLeft, perDay, message: `${when} — ritmo necessário: ${rhythm}.` }
}

export type LessonState = { lesson: RawLesson; done: boolean; completedAt: string | null }
export type ModuleState = { module: RawModule; lessons: LessonState[]; done: number; total: number; complete: boolean }
export type TrackState = {
  track: RawTrack
  assignment: RawAssignment
  modules: ModuleState[]
  totalLessons: number
  doneLessons: number
  pct: number
  remainingMin: number
  finishedAt: string | null
  onTime: boolean
  pace: Pace
  nextLesson: RawLesson | null
  xp: number
}

export type Badge = { id: string; label: string; emoji: string; desc: string; earned: boolean }

export type UserState = {
  tracks: TrackState[]
  xp: number
  level: ReturnType<typeof levelFor>
  streak: ReturnType<typeof streaks>
  badges: Badge[]
  lessonsDone: number
}

const byPos = <T extends { position: number }>(a: T, b: T) => a.position - b.position

export function buildUserState(raw: Raw, userId: string): UserState {
  const mine = new Map(raw.progress.filter(p => p.user_id === userId).map(p => [p.lesson_id, p.completed_at]))
  const tracks: TrackState[] = []
  let xp = 0

  for (const a of raw.assignments.filter(x => x.user_id === userId)) {
    const track = raw.tracks.find(t => t.id === a.track_id)
    if (!track || !track.is_published) continue

    const modules: ModuleState[] = raw.modules
      .filter(m => m.track_id === track.id && (!a.allowed_module_ids || a.allowed_module_ids.includes(m.id)))
      .sort(byPos)
      .map(m => {
        const lessons = raw.lessons.filter(l => l.module_id === m.id).sort(byPos)
          .map(l => ({ lesson: l, done: mine.has(l.id), completedAt: mine.get(l.id) ?? null }))
        const done = lessons.filter(l => l.done).length
        return { module: m, lessons, done, total: lessons.length, complete: lessons.length > 0 && done === lessons.length }
      })
      .filter(m => m.total > 0)

    const all = modules.flatMap(m => m.lessons)
    const totalLessons = all.length
    const doneLessons = all.filter(l => l.done).length
    const finished = totalLessons > 0 && doneLessons === totalLessons
    const finishedAt = finished ? all.map(l => l.completedAt!).sort().pop()! : null
    const onTime = !!(finishedAt && a.due_date && dayKey(finishedAt) <= a.due_date)

    let trackXp = all.filter(l => l.done).reduce((s, l) => s + l.lesson.xp, 0)
    trackXp += modules.filter(m => m.complete).length * MODULE_BONUS
    if (finished) trackXp += TRACK_BONUS + (onTime ? ON_TIME_BONUS : 0)
    xp += trackXp

    tracks.push({
      track, assignment: a, modules, totalLessons, doneLessons,
      pct: totalLessons ? Math.round((doneLessons / totalLessons) * 100) : 0,
      remainingMin: all.filter(l => !l.done).reduce((s, l) => s + l.lesson.duration_min, 0),
      finishedAt, onTime,
      pace: paceFor(totalLessons - doneLessons, a.due_date, finished),
      nextLesson: all.find(l => !l.done)?.lesson ?? null,
      xp: trackXp,
    })
  }
  tracks.sort((a, b) => Number(!!a.finishedAt) - Number(!!b.finishedAt) || a.track.position - b.track.position)

  const dates = tracks.flatMap(t => t.modules.flatMap(m => m.lessons.filter(l => l.done).map(l => l.completedAt!)))
  const streak = streaks(dates)
  const perDay = new Map<string, number>()
  dates.forEach(d => perDay.set(dayKey(d), (perDay.get(dayKey(d)) ?? 0) + 1))
  const anyModule = tracks.some(t => t.modules.some(m => m.complete))

  const badges: Badge[] = [
    { id: 'first', label: 'Primeiro passo', emoji: '👣', desc: 'Concluiu a primeira aula', earned: dates.length >= 1 },
    { id: 'streak3', label: 'Em chamas', emoji: '🔥', desc: '3 dias seguidos estudando', earned: streak.best >= 3 },
    { id: 'marathon', label: 'Maratonista', emoji: '⚡', desc: '5 aulas em um único dia', earned: Math.max(0, ...Array.from(perDay.values())) >= 5 },
    { id: 'module', label: 'Módulo dominado', emoji: '🧩', desc: 'Concluiu um módulo inteiro', earned: anyModule },
    { id: 'track', label: 'Trilha completa', emoji: '🏆', desc: 'Concluiu uma trilha inteira', earned: tracks.some(t => t.finishedAt) },
    { id: 'ontime', label: 'Pontual', emoji: '⏱️', desc: 'Terminou uma trilha dentro do prazo', earned: tracks.some(t => t.onTime) },
  ]

  return { tracks, xp, level: levelFor(xp), streak, badges, lessonsDone: dates.length }
}
