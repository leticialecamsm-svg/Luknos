import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getDashboardStats, getMyQuotes, getActiveUsers, getAllQuotes } from '@/lib/actions'
import { AdminDashboard } from '@/components/dashboard/AdminDashboard'
import { VendorDashboard } from '@/components/dashboard/VendorDashboard'
import { formatCurrency } from '@/lib/utils'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'

  const now = new Date()
  const [stats, myQuotes, allUsers, goals, myGoalRes, allQuotes] = await Promise.all([
    getDashboardStats(isAdmin ? undefined : user.id),
    getMyQuotes(),
    isAdmin ? getActiveUsers() : Promise.resolve([]),
    isAdmin
      ? supabase.from('monthly_goals').select('*').eq('year', now.getFullYear()).eq('month', now.getMonth()+1).then(r => r.data ?? [])
      : Promise.resolve([]),
    !isAdmin
      ? supabase.from('monthly_goals').select('target').eq('user_id', user.id).eq('year', now.getFullYear()).eq('month', now.getMonth()+1).single()
      : Promise.resolve({ data: null }),
    isAdmin ? getAllQuotes() : Promise.resolve([]),
  ])

  const myGoal = myGoalRes.data?.target ?? 0

  const totalSold = stats.sales
    .filter((r: any) => isAdmin || r.user_id === user.id)
    .reduce((s: number, r: any) => s + Number(r.total_sold ?? 0), 0)

  return (
    <>
      {isAdmin ? (
        <AdminDashboard
          funnel={stats.funnel}
          quotes={allQuotes}
          users={allUsers}
          sales={stats.sales}
          goals={goals}
          storeGoal={stats.storeGoal}
        />
      ) : (
        <VendorDashboard
          myGoal={myGoal}
          myQuotes={myQuotes}
          funnel={stats.funnel}
          sales={totalSold}
          userName={profile?.name ?? 'Vendedor'}
        />
      )}
    </>
  )
}
