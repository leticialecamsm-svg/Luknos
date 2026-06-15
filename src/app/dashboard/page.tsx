import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getDashboardStats, getMyQuotes, getActiveUsers, getAllQuotes, getProspectionsThisMonth, getShipments, getTasks } from '@/lib/actions'
import { AdminDashboardV2 } from '@/components/dashboard/AdminDashboardV2'
import { VendorDashboard } from '@/components/dashboard/VendorDashboard'
import { LogisticsDashboard } from '@/components/dashboard/LogisticsDashboard'
import { formatCurrency } from '@/lib/utils'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'
  const isLogistics = profile?.role === 'logistics'

  if (isLogistics) {
    const [shipments, tasks] = await Promise.all([getShipments(), getTasks()])
    return (
      <LogisticsDashboard
        shipments={shipments}
        tasks={tasks}
        userName={profile?.name ?? 'Logística'}
      />
    )
  }

  const now = new Date()
  const [stats, myQuotes, allUsers, goals, myGoalRes, allQuotes, prospectionsCount] = await Promise.all([
    getDashboardStats(isAdmin ? undefined : user.id),
    getMyQuotes(),
    getActiveUsers(),
    isAdmin
      ? supabase.from('monthly_goals').select('*').eq('year', now.getFullYear()).eq('month', now.getMonth()+1).then(r => r.data ?? [])
      : Promise.resolve([]),
    !isAdmin
      ? supabase.from('monthly_goals').select('target').eq('user_id', user.id).eq('year', now.getFullYear()).eq('month', now.getMonth()+1).single()
      : Promise.resolve({ data: null }),
    getAllQuotes(),
    isAdmin ? getProspectionsThisMonth() : getProspectionsThisMonth(user.id),
  ])

  const myGoal = myGoalRes.data?.target ?? 0

  const totalSold = stats.sales
    .filter((r: any) => isAdmin || r.user_id === user.id)
    .reduce((s: number, r: any) => s + Number(r.total_sold ?? 0), 0)

  return (
    <>
      {isAdmin ? (
        <AdminDashboardV2
          quotes={allQuotes}
          users={allUsers}
          sales={stats.sales}
          funnel={stats.funnel}
          prospectionsThisMonth={prospectionsCount as number}
        />
      ) : (
        <VendorDashboard
          myGoal={myGoal}
          myQuotes={myQuotes}
          allQuotes={allQuotes}
          users={allUsers}
          funnel={stats.funnel}
          sales={totalSold}
          userName={profile?.name ?? 'Vendedor'}
          currentUserId={user.id}
          prospectionsThisMonth={prospectionsCount as number}
        />
      )}
    </>
  )
}
