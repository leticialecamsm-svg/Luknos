import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getDashboardStats, getMyQuotes, getActiveUsers, getAllQuotes, getProspectionsThisMonth, getShipments, getTasks, getCommissionEarnings, getCriticalNegotiations, getFlaggedAlerts } from '@/lib/actions'
import { AdminDashboardV2 } from '@/components/dashboard/AdminDashboardV2'
import { VendorDashboard } from '@/components/dashboard/VendorDashboard'
import { LogisticsDashboard } from '@/components/dashboard/LogisticsDashboard'

export const dynamic = 'force-dynamic'

// Busca metas para o mês; se vazio, faz fallback para o mês mais recente com metas cadastradas
async function getGoalsWithFallback(year: number, month: number) {
  const admin = createAdminClient()

  // Tenta o mês exato
  const { data: exact } = await admin.from('monthly_goals').select('*').eq('year', year).eq('month', month)
  const perUser = (exact ?? []).filter((g: any) => g.user_id)
  if (perUser.length > 0) return { goals: exact ?? [], isFallback: false, fallbackLabel: '' }

  // Nenhuma meta para esse mês — busca o mês mais recente com metas cadastradas (até 12 meses atrás)
  const { data: recent } = await admin
    .from('monthly_goals')
    .select('*')
    .not('user_id', 'is', null)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(50)

  if (!recent || recent.length === 0) return { goals: [], isFallback: false, fallbackLabel: '' }

  // Pega o mês mais recente encontrado
  const latestYear  = recent[0].year  as number
  const latestMonth = recent[0].month as number
  const fallbackGoals = recent.filter((g: any) => g.year === latestYear && g.month === latestMonth)

  const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  const fallbackLabel = `${MONTH_NAMES[latestMonth - 1]}/${latestYear}`

  return { goals: fallbackGoals, isFallback: true, fallbackLabel }
}

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

  const [stats, myQuotes, allUsers, goalsResult, allQuotes, prospectionsCount] = await Promise.all([
    getDashboardStats(isAdmin ? undefined : user.id, year, month),
    getMyQuotes(),
    getActiveUsers(),
    getGoalsWithFallback(year, month),
    getAllQuotes(),
    isAdmin ? getProspectionsThisMonth(undefined, year, month) : getProspectionsThisMonth(user.id, year, month),
  ])

  const { goals, isFallback, fallbackLabel } = goalsResult

  // Meta do vendedor logado — também com fallback
  const myGoalEntry = goals.find((g: any) => g.user_id === user.id)
  const myGoal = myGoalEntry?.target ?? 0

  const criticalNegotiations = isAdmin ? await getCriticalNegotiations() : []
  const flaggedAlerts = isAdmin ? await getFlaggedAlerts() : []
  const earnings = await getCommissionEarnings(year, month)
  const myEarnings = earnings.byUser[user.id] ?? null

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
          goalsFallbackLabel={isFallback ? fallbackLabel : undefined}
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
          goalsFallbackLabel={isFallback ? fallbackLabel : undefined}
        />
      )}
    </>
  )
}
