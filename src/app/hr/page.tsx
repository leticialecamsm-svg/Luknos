import { getCommissionEarnings, getPayrollData } from '@/lib/actions'
import { HRPage } from '@/components/hr/HRPage'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'RH — Luknos' }

export default async function HumanResourcesPage({ searchParams }: { searchParams: { year?: string; month?: string; tab?: string } }) {
  const now = new Date()
  const year  = searchParams.year  ? parseInt(searchParams.year)  : now.getFullYear()
  const month = searchParams.month ? parseInt(searchParams.month) : now.getMonth() + 1

  const [earnings, payroll] = await Promise.all([
    getCommissionEarnings(year, month),
    getPayrollData(year, month),
  ])

  return (
    <HRPage
      earnings={earnings.byUser}
      payroll={payroll}
      year={year}
      month={month}
      initialTab={(searchParams.tab as 'comissao' | 'remuneracao') ?? 'comissao'}
    />
  )
}
