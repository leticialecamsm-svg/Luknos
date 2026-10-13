import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { SolicitationsIndex, type IndexRow } from '@/components/solicitations/SolicitationsIndex'

export const dynamic = 'force-dynamic'

export default async function SolicitacoesListaPage() {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const { data: solicitations } = await db
    .from('solicitations')
    .select('id, number, title, created_at, priority, category, size, client:client_id(name)')
    .order('created_at', { ascending: false })
    .limit(200)

  const ids = (solicitations ?? []).map((s: any) => s.id)
  const [quotesRes, negsRes] = ids.length
    ? await Promise.all([
        db.from('quotes').select('id, solicitation_id, quoted_value, created_at').in('solicitation_id', ids),
        db.from('negotiations').select('solicitation_id, temperature, created_at').in('solicitation_id', ids),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }]

  const latestQuote = new Map<string, any>()
  for (const q of (quotesRes.data ?? []) as any[]) {
    const prev = latestQuote.get(q.solicitation_id)
    if (!prev || new Date(q.created_at) > new Date(prev.created_at)) latestQuote.set(q.solicitation_id, q)
  }
  const latestNeg = new Map<string, any>()
  for (const n of (negsRes.data ?? []) as any[]) {
    const prev = latestNeg.get(n.solicitation_id)
    if (!prev || new Date(n.created_at) > new Date(prev.created_at)) latestNeg.set(n.solicitation_id, n)
  }

  const rows: IndexRow[] = (solicitations ?? []).map((s: any) => {
    const q = latestQuote.get(s.id)
    const n = latestNeg.get(s.id)
    const temp = n?.temperature ?? null
    const status: IndexRow['status'] = temp === 'closed' ? 'closed' : temp === 'lost' ? 'lost' : 'in_progress'
    return {
      id: s.id,
      number: s.number,
      title: s.title,
      clientName: s.client?.name ?? null,
      createdAt: s.created_at,
      priority: s.priority ?? 'normal',
      category: s.category ?? null,
      size: s.size ?? null,
      quotedValue: q?.quoted_value != null ? Number(q.quoted_value) : null,
      status,
    }
  })

  return (
    <div className="space-y-4">
      <Link href="/solicitacoes" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ChevronLeft className="w-4 h-4" /> Voltar para o módulo
      </Link>
      <SolicitationsIndex rows={rows} />
    </div>
  )
}
