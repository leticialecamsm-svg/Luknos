import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { loadSolicitationRows } from '@/lib/solicitations/index-data'
import { SolicitationsHome } from '@/components/solicitations/SolicitationsHome'

export const dynamic = 'force-dynamic'

export default async function SolicitacoesPage() {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) redirect('/login')

  const [rows, { data: profile }] = await Promise.all([
    loadSolicitationRows(user.id),
    createAdminClient().from('users').select('name').eq('id', user.id).maybeSingle(),
  ])

  return <SolicitationsHome rows={rows} userName={profile?.name ?? 'time'} />
}
