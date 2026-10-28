import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function QuoteDetailPage({ params }: { params: { id: string } }) {
  const db = createAdminClient()
  const { data: q } = await db
    .from('quotes')
    .select('id, solicitation_id')
    .eq('id', params.id)
    .maybeSingle()

  if (!q) notFound()

  if (q.solicitation_id) {
    redirect(`/solicitacoes/${q.solicitation_id}?tab=orcamento`)
  }

  // fallback: sem solicitation_id ainda (não deveria acontecer após o backfill)
  notFound()
}
