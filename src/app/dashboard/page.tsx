import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getDashboardStats, getMyQuotes, getActiveUsers, getAllQuotes, getProspectionsThisMonth, getShipments, getTasks, getCommissionEarnings, getCriticalNegotiations, getFlaggedAlerts } from '@/lib/actions'
import { AdminDashboardV2 } from '@/components/dashboard/AdminDashboardV2'
import { VendorDashboard } from '@/components/dashboard/VendorDashboard'
import { LogisticsDashboard } from '@/components/dashboard/LogisticsDashboard'

export const dynamic = 'force-dynamic'

export default async function DashboardPage({ searchParams }: { searchParams: { year?: string; month?: string } }) {
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
  const year  = searchParams.year  ? parseInt(searchParams.year)  : now.getFullYear()
  const month = searchParams.month ? parseInt(searchParams.month) : now.getMonth() + 1

  const [stats, myQuotes, allUsers, goals, myGoalRes, allQuotes, prospectionsCount] = await Promise.all([
    getDashboardStats(isAdmin ? undefined : user.id, year, month),
    getMyQuotes(),
    getActiveUsers(),
    createAdminClient().from('monthly_goals').select('*').eq('year', year).eq('month', month).then((r: any) => r.data ?? []),
    !isAdmin
      ? createAdminClient().from('monthly_goals').select('target').eq('user_id', user.id).eq('year', year).eq('month', month).maybeSingle()
      : Promise.resolve({ data: null }),
    getAllQuotes(),
    isAdmin ? getProspectionsThisMonth(undefined, year, month) : getProspectionsThisMonth(user.id, year, month),
  ])

  const criticalNegotiations = isAdmin ? await getCriticalNegotiations() : []
  const flaggedAlerts = isAdmin ? await getFlaggedAlerts() : []
  const earnings = await getCommissionEarnings()
  const myEarnings = earnings.byUser[user.id] ?? null
  const myGoal = myGoalRes.data?.target ?? 0

  const totalSold = stats.sales
    .filter((r: any) => isAdmin || r.user_id === user.id)
    .reduce((s: number, r: any) => s + Number(r.total_sold ?? 0), 0)

  const salesByUser: Record<string, number> = Object.fromEntries(
    (stats.sales as any[]).map((r: any) => [r.user_id, Number(r.total_sold ?? 0)])
  )

  const goalsByUser: Record<string, number> = Object.fromEntries(
    (goals as any[]).filter((g: any) => g.user_id).map((g: any) => [g.user_id, Number(g.target ?? 0)])
  )

  return (
    <>
      {isAdmin ? (
        <AdminDashboardV2
          quotes={allQuotes}
          users={allUsers}
          sales={stats.sales}
          salesByUser={salesByUser}
          goalsByUser={goalsByUser}
          funnel={stats.funnel}
          prospectionsThisMonth={prospectionsCount as number}
          earnings={earnings.byUser}
          criticalNegotiations={criticalNegotiations}
          flaggedAlerts={flaggedAlerts}
          selectedYear={year}
          selectedMonth={month}
        />
      ) : (
        <VendorDashboard
          myGoal={myGoal}
          myQuotes={myQuotes}
          allQuotes={allQuotes}
          users={allUsers}
          funnel={stats.funnel}
          sales={totalSold}
          salesByUser={salesByUser}
          goalsByUser={goalsByUser}
          userName={profile?.name ?? 'Vendedor'}
          currentUserId={user.id}
          prospectionsThisMonth={prospectionsCount as number}
          myEarnings={myEarnings}
          selectedYear={year}
          selectedMonth={month}
        />
      )}
    </>
  )
}
