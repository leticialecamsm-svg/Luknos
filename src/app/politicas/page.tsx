import Link from 'next/link'
import { getMyPolicies, amIAdmin } from '@/lib/policies/actions'
import { FileCheck2, CheckCircle2, Clock, ChevronRight, Settings } from 'lucide-react'
import { ProgressBar } from '@/components/training/ui'

export default async function PoliticasPage() {
  const [policies, isAdmin] = await Promise.all([getMyPolicies(), amIAdmin()])

  return (
    <div className="space-y-6">
      <div className="rounded-card bg-gradient-navy shadow-hero px-6 py-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow text-white/50 mb-1">Políticas internas</p>
          <h1 className="text-2xl font-bold text-white">Leitura e ciência</h1>
          <p className="text-white/60 mt-1 text-sm">Leia cada tópico até o final e confirme que está de acordo.</p>
        </div>
        {isAdmin && (
          <Link href="/politicas/gestao" className="btn-secondary shrink-0"><Settings className="w-4 h-4" /> Gerir políticas</Link>
        )}
      </div>

      {!policies?.length ? (
        <div className="card p-8 text-center">
          <FileCheck2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Nenhuma política liberada para você no momento.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {policies.map(p => {
            const pct = p.topicsTotal ? (p.topicsSigned / p.topicsTotal) * 100 : 0
            return (
              <Link key={p.id} href={`/politicas/${p.id}`}
                className="card p-5 flex items-center gap-4 hover:border-brand-300 transition-colors block">
                <span className={p.fullySigned ? 'w-11 h-11 rounded-xl bg-green-50 text-green-600 flex items-center justify-center shrink-0' : 'w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0'}>
                  {p.fullySigned ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{p.title}</p>
                  {p.description && <p className="text-xs text-gray-400 truncate mt-0.5">{p.description}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    <ProgressBar pct={pct} className="h-1.5 flex-1 max-w-[180px]" tone={p.fullySigned ? 'green' : 'gold'} />
                    <span className="text-xs text-gray-500 shrink-0">{p.topicsSigned}/{p.topicsTotal} tópicos</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
