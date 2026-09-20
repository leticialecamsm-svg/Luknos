import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Flame, Trophy, Star, ArrowRight, GraduationCap, Settings, Lock, Zap } from 'lucide-react'
import { getTrainingHome } from '@/lib/training/actions'
import { ProgressBar, DeadlineChip, fmtDate, fmtMin } from '@/components/training/ui'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import type { UserState } from '@/lib/training/state'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Treinamento — Luknos' }

function nudge(s: UserState): string {
  const active = s.tracks.filter(t => !t.finishedAt)
  const late = active.find(t => t.pace.status === 'atrasada')
  if (late) return `⏰ A trilha "${late.track.title}" passou do prazo — uma aula hoje já ajuda a recuperar.`
  const tight = active.find(t => t.pace.status === 'apertado')
  if (tight) return `⚠️ "${tight.track.title}": ${tight.pace.message}`
  if (!active.length) return s.tracks.length ? '🎉 Você concluiu tudo que foi liberado. Parabéns!' : ''
  if (s.streak.doneToday) return `✅ Meta de hoje cumprida! Sequência de ${s.streak.current} dia${s.streak.current === 1 ? '' : 's'} 🔥`
  if (s.streak.current > 0) return `🔥 Faça 1 aula hoje para manter sua sequência de ${s.streak.current} dia${s.streak.current === 1 ? '' : 's'}!`
  return '🚀 Comece hoje: cada aula concluída rende XP e sobe seu nível.'
}

export default async function TreinamentoPage() {
  const data = await getTrainingHome()
  if (!data) redirect('/auth/login')
  const { me, state, leaderboard, isAdmin } = data
  const next = state.tracks.find(t => !t.finishedAt && t.nextLesson)
  const message = nudge(state)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Treinamento</p>
          <h1 className="text-xl font-semibold text-gray-900">Olá, {me.name.split(' ')[0]}</h1>
        </div>
        {isAdmin && (
          <Link href="/treinamento/gestao" className="btn-secondary"><Settings className="w-4 h-4" /> Gerenciar trilhas</Link>
        )}
      </div>

      {/* Hero: nível, XP, sequência e próxima ação */}
      <div className="rounded-card bg-gradient-navy text-white p-6 shadow-card">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex-1 min-w-[240px]">
            <div className="flex items-center gap-2 text-brand-500 text-xs font-semibold uppercase tracking-wide">
              <Star className="w-4 h-4" /> Nível {state.level.level}
            </div>
            <p className="text-2xl font-bold mt-1">{state.level.name}</p>
            <div className="mt-3 h-2.5 rounded-full bg-white/15 overflow-hidden">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${state.level.pct}%` }} />
            </div>
            <p className="text-xs text-white/70 mt-1.5">
              {state.xp} XP{state.level.nextAt ? ` · faltam ${state.level.nextAt - state.xp} XP para ${state.level.next}` : ' · nível máximo!'}
            </p>
          </div>
          <div className="flex gap-3">
            <div className="rounded-xl bg-white/10 px-4 py-3 text-center min-w-[92px]">
              <Flame className={cn('w-5 h-5 mx-auto', state.streak.current ? 'text-orange-400' : 'text-white/40')} />
              <p className="text-xl font-bold mt-1">{state.streak.current}</p>
              <p className="text-[11px] text-white/70">dias seguidos</p>
            </div>
            <div className="rounded-xl bg-white/10 px-4 py-3 text-center min-w-[92px]">
              <Zap className="w-5 h-5 mx-auto text-brand-500" />
              <p className="text-xl font-bold mt-1">{state.lessonsDone}</p>
              <p className="text-[11px] text-white/70">aulas feitas</p>
            </div>
          </div>
        </div>
        {message && <p className="mt-4 text-sm bg-white/10 rounded-lg px-3 py-2">{message}</p>}
        {next && next.nextLesson && (
          <Link href={`/treinamento/${next.track.id}/aula/${next.nextLesson.id}`}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-pill bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 transition-colors">
            Continuar: {next.nextLesson.title} <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Minhas trilhas</h2>
          {state.tracks.length === 0 && (
            <div className="card p-10 text-center">
              <div className="w-12 h-12 rounded-full bg-surface-secondary flex items-center justify-center mx-auto mb-3">
                <GraduationCap className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-navy">Nenhuma trilha liberada para você ainda</p>
              <p className="text-xs text-gray-400 mt-1">Quando a gestora liberar uma trilha, ela aparece aqui.</p>
            </div>
          )}
          {state.tracks.map(t => (
            <Link key={t.track.id} href={`/treinamento/${t.track.id}`} className="card p-5 block hover:border-gray-300 transition-colors">
              <div className="flex items-start gap-3">
                <div className="text-3xl leading-none">{t.track.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gray-900">{t.track.title}</p>
                    <DeadlineChip pace={t.pace} due={t.assignment.due_date} />
                  </div>
                  {t.track.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.track.description}</p>}
                  <div className="flex items-center gap-3 mt-3">
                    <ProgressBar pct={t.pct} className="flex-1" />
                    <span className="text-sm font-bold text-gray-700 w-10 text-right">{t.pct}%</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    {t.doneLessons} de {t.totalLessons} aulas
                    {t.remainingMin > 0 && ` · ~${fmtMin(t.remainingMin)} restantes`}
                    {t.assignment.due_date && ` · prazo ${fmtDate(t.assignment.due_date)}`}
                  </p>
                  {(t.pace.status === 'apertado' || t.pace.status === 'atrasada') && (
                    <p className="text-xs text-amber-700 mt-1">{t.pace.message}</p>
                  )}
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 mt-1 shrink-0" />
              </div>
            </Link>
          ))}
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Conquistas</h2>
            <div className="grid grid-cols-3 gap-2">
              {state.badges.map(b => (
                <div key={b.id} title={`${b.label} — ${b.desc}`}
                  className={cn('rounded-xl border p-2 text-center', b.earned ? 'bg-brand-50 border-brand-200' : 'bg-surface-secondary border-surface-border')}>
                  <div className={cn('text-2xl', !b.earned && 'grayscale opacity-40')}>{b.earned ? b.emoji : <Lock className="w-5 h-5 mx-auto text-gray-400 mt-1 mb-0.5" />}</div>
                  <p className={cn('text-[10px] font-medium mt-1 leading-tight', b.earned ? 'text-gray-800' : 'text-gray-400')}>{b.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><Trophy className="w-4 h-4 text-brand-500" /> Ranking da equipe</h2>
            {leaderboard.length === 0 ? <p className="text-xs text-gray-400">Ninguém pontuou ainda — seja o primeiro!</p> : (
              <ol className="space-y-2">
                {leaderboard.map((r, i) => (
                  <li key={r.userId} className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5', r.isMe && 'bg-brand-50')}>
                    <span className="w-5 text-xs font-bold text-gray-400">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
                    <Avatar user={{ name: r.name, avatar_color: r.avatar_color ?? undefined, avatar_url: r.avatar_url }} size={24} />
                    <span className="flex-1 text-sm text-gray-800 truncate">{r.name.split(' ')[0]}{r.isMe && ' (você)'}</span>
                    <span className="text-xs font-semibold text-gray-600">{r.xp} XP</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
