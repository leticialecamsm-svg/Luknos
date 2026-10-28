import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export default async function EditQuotePage({ params }: { params: { id: string } }) {
  const { data: q } = await createAdminClient()
    .from('quotes')
    .select('id, solicitation_id')
    .eq('id', params.id)
    .maybeSingle()

  if (!q) notFound()

  if (q.solicitation_id) {
    redirect(`/solicitacoes/${q.solicitation_id}?tab=orcamento`)
  }

  notFound()
}
