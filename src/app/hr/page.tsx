import { createAdminClient } from '@/lib/supabase/admin'
import { getCommissionEarnings, getPayrollData, getPayrollMonthUpload } from '@/lib/actions'

function prevMonthYear(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}
import { HRPage } from '@/components/hr/HRPage'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'RH — Luknos' }

export default async function HumanResourcesPage({ searchParams }: { searchParams: { year?: string; month?: string; tab?: string } }) {
  const now = new Date()
  const year  = searchParams.year  ? parseInt(searchParams.year)  : now.getFullYear()
  const month = searchParams.month ? parseInt(searchParams.month) : now.getMonth() + 1

  const admin = createAdminClient()
  const prev = prevMonthYear(year, month)
  const [earnings, prevEarnings, payroll, monthUpload, { data: allUsers }] = await Promise.all([
    getCommissionEarnings(year, month),
    getCommissionEarnings(prev.year, prev.month),
    getPayrollData(year, month),
    getPayrollMonthUpload(year, month),
    admin.from('users').select('id, name, avatar_color, avatar_url, role').eq('active', true).order('name'),
  ])

  return (
    <HRPage
      earnings={earnings.byUser}
      prevEarnings={prevEarnings.byUser}
      payroll={payroll}
      monthUpload={monthUpload}
      allUsers={allUsers ?? []}
      year={year}
      month={month}
      initialTab={(searchParams.tab as 'comissao' | 'remuneracao') ?? 'comissao'}
    />
  )
}
