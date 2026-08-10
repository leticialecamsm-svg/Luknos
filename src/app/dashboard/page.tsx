import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getDashboardStats, getMyQuotes, getQuotesForUser, getActiveUsers, getAllQuotes, getProspectionsThisMonth, getShipments, getTasks, getTasksForUser, getCommissionEarnings, getCriticalNegotiations, getFlaggedAlerts, getCollaboratorRoleNames } from '@/lib/actions'
import { AdminDashboardV2 } from '@/components/dashboard/AdminDashboardV2'
import { VendorDashboard } from '@/components/dashboard/VendorDashboard'
import { LogisticsDashboard } from '@/components/dashboard/LogisticsDashboard'
import { ViewAsBanner } from '@/components/dashboard/ViewAsBanner'

export const dynamic = 'force-dynamic'

// Colaboradores que o admin pode visualizar como se fosse eles (modo "ver como").
// Por enquanto uma lista fixa, combinada no pedido — não é geral pra todo mundo ainda.
const VIEW_AS_ALLOWED_NAMES = ['Jennifer', 'Dalisson', 'Isabelle Medeiros', 'Gabriel']

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

export default async function DashboardPage({ searchParams }: { searchParams: { year?: string; month?: string; viewAs?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'

  // Perfil de marketing vê apenas o módulo de marketing
  if (profile?.role === 'marketing') redirect('/marketing')

  // Modo "visualizar como colaborador" — só admin consegue ativar, e só pra
  // quem está na allowlist acima. A sessão real continua sendo a do admin;
  // só os DADOS exibidos passam a ser os do colaborador escolhido.
  let viewAsTarget: any = null
  if (isAdmin && searchParams.viewAs) {
    const admin = createAdminClient()
    const { data: target } = await admin.from('users').select('*').eq('id', searchParams.viewAs).eq('active', true).maybeSingle()
    if (target && VIEW_AS_ALLOWED_NAMES.includes(target.name)) viewAsTarget = target
  }

  const effectiveUserId  = viewAsTarget?.id ?? user.id
  const effectiveIsAdmin = viewAsTarget ? false : isAdmin
  const effectiveIsLogistics = viewAsTarget ? viewAsTarget.role === 'logistics' : profile?.role === 'logistics'
  const effectiveName = viewAsTarget?.name ?? profile?.name

  const collaboratorsForBanner = isAdmin ? await getActiveUsers() : []
  const viewAsOptions = collaboratorsForBanner.filter((u: any) => VIEW_AS_ALLOWED_NAMES.includes(u.name))

  if (effectiveIsLogistics) {
    const [shipments, tasks] = await Promise.all([
      getShipments(),
      viewAsTarget ? getTasksForUser(effectiveUserId) : getTasks(),
    ])
    return (
      <>
        {isAdmin && <ViewAsBanner options={viewAsOptions} activeId={viewAsTarget?.id ?? null} />}
        <LogisticsDashboard
          shipments={shipments}
          tasks={tasks}
          userName={effectiveName ?? 'Logística'}
        />
      </>
    )
  }

  const now = new Date()
  const year  = searchParams.year  ? parseInt(searchParams.year)  : now.getFullYear()
  const month = searchParams.month ? parseInt(searchParams.month) : now.getMonth() + 1

  const [stats, myQuotes, allUsers, goalsResult, allQuotes, prospectionsCount, collaboratorRoles] = await Promise.all([
    getDashboardStats(effectiveIsAdmin ? undefined : effectiveUserId, year, month),
    viewAsTarget ? getQuotesForUser(effectiveUserId) : getMyQuotes(),
    getActiveUsers(),
    getGoalsWithFallback(year, month),
    getAllQuotes(),
    effectiveIsAdmin ? getProspectionsThisMonth(undefined, year, month) : getProspectionsThisMonth(effectiveUserId, year, month),
    getCollaboratorRoleNames(),
  ])

  const { goals, isFallback, fallbackLabel } = goalsResult

  // Meta do vendedor logado (ou do colaborador visualizado) — também com fallback
  const myGoalEntry = goals.find((g: any) => g.user_id === effectiveUserId)
  const myGoal = myGoalEntry?.target ?? 0

  const criticalNegotiations = effectiveIsAdmin ? await getCriticalNegotiations() : []
  const flaggedAlerts = effectiveIsAdmin ? await getFlaggedAlerts() : []
  const earnings = await getCommissionEarnings(year, month)
  const myEarnings = earnings.byUser[effectiveUserId] ?? null

  const totalSold = stats.sales
    .filter((r: any) => effectiveIsAdmin || r.user_id === effectiveUserId)
    .reduce((s: number, r: any) => s + Number(r.total_sold ?? 0), 0)

  const salesByUser: Record<string, number> = Object.fromEntries(
    (stats.sales as any[]).map((r: any) => [r.user_id, Number(r.total_sold ?? 0)])
  )

  const goalsByUser: Record<string, number> = Object.fromEntries(
    (goals as any[]).filter((g: any) => g.user_id).map((g: any) => [g.user_id, Number(g.target ?? 0)])
  )

  return (
    <>
      {isAdmin && <ViewAsBanner options={viewAsOptions} activeId={viewAsTarget?.id ?? null} />}
      {effectiveIsAdmin ? (
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
          collaboratorRoles={collaboratorRoles}
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
          userName={effectiveName ?? 'Vendedor'}
          currentUserId={effectiveUserId}
          prospectionsThisMonth={prospectionsCount as number}
          myEarnings={myEarnings}
          selectedYear={year}
          selectedMonth={month}
          goalsFallbackLabel={isFallback ? fallbackLabel : undefined}
          collaboratorRoles={collaboratorRoles}
        />
      )}
    </>
  )
}
