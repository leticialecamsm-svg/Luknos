import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, FileCheck2, Users, Layers } from 'lucide-react'
import { listAdminPolicies } from '@/lib/policies/actions'
import { NewPolicyButton } from '@/components/policies/NewPolicyButton'

export const dynamic = 'force-dynamic'

export default async function PoliciesGestaoPage() {
  const policies = await listAdminPolicies()
  if (!policies) redirect('/politicas')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link href="/politicas" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-2"><ArrowLeft className="w-4 h-4" /> Políticas</Link>
          <h1 className="text-xl font-semibold text-gray-900">Gestão de políticas internas</h1>
        </div>
        <NewPolicyButton />
      </div>

      {!policies.length ? (
        <div className="card p-8 text-center text-sm text-gray-500">Nenhuma política criada ainda.</div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {policies.map(p => (
            <Link key={p.id} href={`/politicas/gestao/${p.id}`} className="card p-5 hover:border-brand-300 transition-colors block">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="font-semibold text-gray-900 flex items-center gap-2"><FileCheck2 className="w-4 h-4 text-brand-600" /> {p.title}</p>
                <span className={`badge ${p.is_published ? 'bg-green-50 text-green-700' : 'bg-surface-secondary text-gray-500'}`}>{p.is_published ? 'Publicada' : 'Rascunho'}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1"><Layers className="w-3.5 h-3.5" /> {p.topics} tópicos</span>
                <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {p.fullySigned}/{p.assigned} assinaram</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
