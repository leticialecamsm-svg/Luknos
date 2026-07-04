import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { GoalsPage } from '@/components/admin/GoalsPage'

export const dynamic = 'force-dynamic'

export default async function AdminGoalsPage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const now = new Date()
  const year = searchParams.year ? parseInt(searchParams.year) : now.getFullYear()
  const month = searchParams.month ? parseInt(searchParams.month) : now.getMonth() + 1
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  const admin = createAdminClient()

  const [{ data: users }, { data: selectedGoals }, { data: allGoals }] = await Promise.all([
    supabase.from('users').select('*').eq('active', true).order('name'),
    admin.from('monthly_goals').select('*').eq('year', year).eq('month', month),
    admin.from('monthly_goals').select('*').order('year', { ascending: false }).order('month', { ascending: false }),
  ])

  // Build history: unique year/month combos with their goals
  const monthsMap = new Map<string, { year: number; month: number; goals: any[] }>()
  for (const g of allGoals ?? []) {
    const key = `${g.year}-${g.month}`
    if (!monthsMap.has(key)) monthsMap.set(key, { year: g.year, month: g.month, goals: [] })
    monthsMap.get(key)!.goals.push(g)
  }
  const history = Array.from(monthsMap.values()).sort(
    (a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month
  )

  // Does current month have goals set?
  const currentMonthHasGoals = (allGoals ?? []).some(
    (g: any) => g.year === now.getFullYear() && g.month === now.getMonth() + 1 && g.user_id
  )

  return (
    <GoalsPage
      users={users ?? []}
      selectedGoals={selectedGoals ?? []}
      history={history}
      year={year}
      month={month}
      isCurrentMonth={isCurrentMonth}
      currentMonthHasGoals={currentMonthHasGoals}
      currentYear={now.getFullYear()}
      currentMonth={now.getMonth() + 1}
    />
  )
}
