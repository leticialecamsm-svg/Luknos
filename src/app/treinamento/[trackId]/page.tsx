import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, Clock, Zap, Layers, CalendarClock } from 'lucide-react'
import { getTrackView } from '@/lib/training/actions'
import { ProgressBar, DeadlineChip, KIND_ICON, fmtDate, fmtMin } from '@/components/training/ui'
import { LESSON_KIND_LABEL } from '@/lib/training/embed'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function TrackPage({ params }: { params: { trackId: string } }) {
  const t = await getTrackView(params.trackId)
  if (!t) notFound()

  return (
    <div className="space-y-6">
      <Link href="/treinamento" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="w-4 h-4" /> Treinamento
      </Link>

      <div className="card p-6">
        <div className="flex items-start gap-4">
          <div className="text-4xl leading-none">{t.track.emoji}</div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-gray-900">{t.track.title}</h1>
              <DeadlineChip pace={t.pace} due={t.assignment.due_date} />
            </div>
            {t.track.description && <p className="text-sm text-gray-500 mt-1">{t.track.description}</p>}
            <div className="flex items-center gap-3 mt-4">
              <ProgressBar pct={t.pct} className="flex-1 h-3" />
              <span className="text-lg font-bold text-gray-800">{t.pct}%</span>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1"><Layers className="w-3.5 h-3.5" /> {t.doneLessons}/{t.totalLessons} aulas</span>
              {t.remainingMin > 0 && <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> ~{fmtMin(t.remainingMin)} restantes</span>}
              <span className="inline-flex items-center gap-1"><Zap className="w-3.5 h-3.5" /> {t.xp} XP nesta trilha</span>
              {t.assignment.due_date && <span className="inline-flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> prazo {fmtDate(t.assignment.due_date)}</span>}
            </div>
            {!t.finishedAt && t.pace.message && (
              <p className={cn('text-sm mt-3 rounded-lg px-3 py-2', t.pace.status === 'atrasada' ? 'bg-red-50 text-red-700' : t.pace.status === 'apertado' ? 'bg-amber-50 text-amber-700' : 'bg-surface-secondary text-gray-600')}>
                {t.pace.message}
              </p>
            )}
            {t.finishedAt && (
              <p className="text-sm mt-3 rounded-lg px-3 py-2 bg-green-50 text-green-700">
                🏆 Trilha concluída{t.onTime ? ' dentro do prazo — bônus de pontualidade conquistado!' : '!'}
              </p>
            )}
            {t.nextLesson && (
              <Link href={`/treinamento/${t.track.id}/aula/${t.nextLesson.id}`} className="btn-primary mt-4">
                {t.doneLessons ? 'Continuar' : 'Começar'}: {t.nextLesson.title} <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {t.modules.map((m, mi) => (
          <div key={m.module.id} className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-surface-border bg-surface-secondary flex items-center gap-3">
              <span className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold', m.complete ? 'bg-green-500 text-white' : 'bg-white border border-surface-border text-gray-500')}>
                {m.complete ? <Check className="w-4 h-4" /> : mi + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{m.module.title}</p>
                {m.module.description && <p className="text-xs text-gray-500 truncate">{m.module.description}</p>}
              </div>
              <span className="text-xs text-gray-400">{m.done}/{m.total}</span>
            </div>
            <ul>
              {m.lessons.map(l => {
                const Icon = KIND_ICON[l.lesson.kind] ?? KIND_ICON.text
                return (
                  <li key={l.lesson.id} className="border-b border-surface-border last:border-0">
                    <Link href={`/treinamento/${t.track.id}/aula/${l.lesson.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-secondary transition-colors">
                      <span className={cn('w-5 h-5 rounded-full border flex items-center justify-center shrink-0', l.done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300')}>
                        {l.done && <Check className="w-3 h-3" />}
                      </span>
                      <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className={cn('flex-1 text-sm min-w-0 truncate', l.done ? 'text-gray-400' : 'text-gray-800')}>{l.lesson.title}</span>
                      <span className="hidden sm:inline text-xs text-gray-400">{LESSON_KIND_LABEL[l.lesson.kind]}</span>
                      <span className="text-xs text-gray-400 w-14 text-right">{fmtMin(l.lesson.duration_min)}</span>
                      <span className="text-xs font-semibold text-brand-600 w-12 text-right">+{l.lesson.xp} XP</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
