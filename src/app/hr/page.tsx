import { createAdminClient } from '@/lib/supabase/admin'
import { getCommissionEarnings, getPayrollData, getPayrollMonthUpload } from '@/lib/actions'
import { HRPage } from '@/components/hr/HRPage'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'RH — Luknos' }

export default async function HumanResourcesPage({ searchParams }: { searchParams: { year?: string; month?: string; tab?: string } }) {
  const now = new Date()
  const year  = searchParams.year  ? parseInt(searchParams.year)  : now.getFullYear()
  const month = searchParams.month ? parseInt(searchParams.month) : now.getMonth() + 1

  const admin = createAdminClient()
  const [earnings, payroll, monthUpload, { data: allUsers }] = await Promise.all([
    getCommissionEarnings(year, month),
    getPayrollData(year, month),
    getPayrollMonthUpload(year, month),
    admin.from('users').select('id, name, avatar_color, avatar_url, role').eq('active', true).order('name'),
  ])

  return (
    <HRPage
      earnings={earnings.byUser}
      payroll={payroll}
      monthUpload={monthUpload}
      allUsers={allUsers ?? []}
      year={year}
      month={month}
      initialTab={(searchParams.tab as 'comissao' | 'remuneracao') ?? 'comissao'}
    />
  )
}
