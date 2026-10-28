import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { loadTeamActivity } from '@/lib/team-activity'
import { TeamActivity } from '@/components/admin/TeamActivity'

export const dynamic = 'force-dynamic'

function todayBR() {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
}

export default async function TeamActivityPage({ searchParams }: { searchParams: { d?: string; u?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const day = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.d ?? '') ? searchParams.d! : todayBR()
  const data = await loadTeamActivity(day, searchParams.u ?? null)

  return <TeamActivity day={day} today={todayBR()} userId={data.userId} team={data.team} items={data.items} waits={data.waits} />
}
