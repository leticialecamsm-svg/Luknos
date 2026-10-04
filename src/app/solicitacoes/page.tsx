import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function SolicitacoesIndexPage() {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const { data: rows } = await db
    .from('solicitations')
    .select('id, number, created_at, client:client_id(name)')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-xl font-semibold mb-6">Solicitações</h1>
      <div className="space-y-2">
        {(rows ?? []).map((s: any) => (
          <Link
            key={s.id}
            href={`/solicitacoes/${s.id}`}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 bg-white hover:shadow-sm hover:border-brand-300 transition-all"
          >
            <span className="text-xs font-mono text-gray-400 shrink-0 w-12">#{s.number}</span>
            <span className="font-medium text-gray-800 flex-1 truncate">{s.client?.name ?? '—'}</span>
            <span className="text-xs text-gray-400 shrink-0">{formatDate(s.created_at)}</span>
          </Link>
        ))}
        {(rows ?? []).length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">Nenhuma solicitação encontrada.</p>
        )}
      </div>
    </div>
  )
}
