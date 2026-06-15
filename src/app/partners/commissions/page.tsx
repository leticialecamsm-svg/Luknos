import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCommissions } from '@/lib/actions'
import { CommissionsPage } from '@/components/partners/CommissionsPage'

export const dynamic = 'force-dynamic'

export default async function CommissionsRoute() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/partners')

  const now = new Date()
  const commissions = await getCommissions(now.getFullYear(), now.getMonth() + 1)

  return <CommissionsPage initialCommissions={commissions} initialYear={now.getFullYear()} initialMonth={now.getMonth() + 1} />
}
