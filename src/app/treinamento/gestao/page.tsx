import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Flame, Layers, Users, GraduationCap, Eye } from 'lucide-react'
import { listAdminTracks, getTeamOverview } from '@/lib/training/actions'
import { NewTrackButton } from '@/components/training/NewTrackButton'
import { ProgressBar, DeadlineChip, fmtDate } from '@/components/training/ui'
import { cn } from '@/lib/utils'
import type { Pace } from '@/lib/training/state'

export const dynamic = 'force-dynamic'

export default async function GestaoPage() {
  const [tracks, team] = await Promise.all([listAdminTracks(), getTeamOverview()])
  if (!tracks || !team) redirect('/treinamento')

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/treinamento" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-2"><ArrowLeft className="w-4 h-4" /> Treinamento</Link>
          <h1 className="text-xl font-semibold text-gray-900">Gestão de treinamentos</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/treinamento/preview/iluminacao" className="btn-secondary"><Eye className="w-4 h-4" /> Ver prévia do curso</Link>
          <NewTrackButton />
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Trilhas</h2>
        {tracks.length === 0 && (
          <div className="card p-10 text-center">
            <div className="w-12 h-12 rounded-full bg-surface-secondary flex items-center justify-center mx-auto mb-3"><GraduationCap className="w-5 h-5 text-gray-400" /></div>
            <p className="text-sm font-medium text-navy">Nenhuma trilha criada</p>
            <p className="text-xs text-gray-400 mt-1">Crie a primeira (ex: "Estagiário projetista" ou "Consultor de vendas").</p>
          </div>
        )}
        <div className="grid md:grid-cols-2 gap-3">
          {tracks.map(t => (
            <Link key={t.id} href={`/treinamento/gestao/${t.id}`} className="card p-5 hover:border-gray-300 transition-colors block">
              <div className="flex items-start gap-3">
                <div className="text-3xl leading-none">{t.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{t.title}</p>
                    <span className={cn('badge', t.is_published ? 'bg-green-50 text-green-700' : 'bg-surface-secondary text-gray-500')}>{t.is_published ? 'Publicada' : 'Rascunho'}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 flex flex-wrap gap-x-4">
                    <span className="inline-flex items-center gap-1"><Layers className="w-3 h-3" /> {t.modules} módulos · {t.lessons} aulas</span>
                    <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" /> {t.assigned} colaborador{t.assigned === 1 ? '' : 'es'}</span>
                    {t.target_days && <span>prazo padrão {t.target_days} dias</span>}
                  </p>
                  {t.assigned > 0 && (
                    <div className="flex items-center gap-2 mt-3">
                      <ProgressBar pct={t.avgPct} className="flex-1" />
                      <span className="text-xs text-gray-500">{t.avgPct}% médio</span>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Acompanhamento da equipe</h2>
        {team.length === 0 ? (
          <p className="text-sm text-gray-400">Ninguém recebeu trilhas ainda. Abra uma trilha e libere para os colaboradores.</p>
        ) : (
          <div className="card overflow-hidden">
            {team.map(u => (
              <div key={u.userId} className="px-5 py-4 border-b border-surface-border last:border-0">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2">
                  <p className="font-medium text-gray-900">{u.name}</p>
                  <p className="text-xs text-gray-400">{u.level} · {u.xp} XP</p>
                  <p className="text-xs text-gray-400 inline-flex items-center gap-1"><Flame className={cn('w-3 h-3', u.streak ? 'text-orange-500' : 'text-gray-300')} /> {u.streak} dia{u.streak === 1 ? '' : 's'} seguidos</p>
                </div>
                <div className="space-y-2">
                  {u.tracks.map(t => (
                    <div key={t.id} className="flex flex-wrap items-center gap-3">
                      <span className="text-sm w-56 truncate">{t.emoji} {t.title}</span>
                      <ProgressBar pct={t.pct} className="flex-1 min-w-[120px]" />
                      <span className="text-xs font-semibold text-gray-600 w-10 text-right">{t.pct}%</span>
                      <DeadlineChip pace={{ status: t.status as Pace['status'], daysLeft: t.daysLeft, perDay: null, message: t.message }} due={t.due} />
                      {t.due && <span className="text-xs text-gray-400">até {fmtDate(t.due)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
