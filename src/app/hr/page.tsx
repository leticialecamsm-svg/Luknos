import { getCommissionEarnings } from '@/lib/actions'
import { HRPage } from '@/components/hr/HRPage'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'RH — Luknos' }

export default async function HumanResourcesPage({ searchParams }: { searchParams: { year?: string; month?: string } }) {
  const now = new Date()
  const year  = searchParams.year  ? parseInt(searchParams.year)  : now.getFullYear()
  const month = searchParams.month ? parseInt(searchParams.month) : now.getMonth() + 1

  const earnings = await getCommissionEarnings(year, month)

  return (
    <HRPage
      earnings={earnings.byUser}
      year={year}
      month={month}
    />
  )
}
