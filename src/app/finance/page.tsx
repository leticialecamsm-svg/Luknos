import { getFinanceEntries } from '@/lib/actions'
import { FinancePage } from '@/components/finance/FinancePage'

export const dynamic = 'force-dynamic'

export default async function Finance() {
  const entries = await getFinanceEntries()
  return <FinancePage initialEntries={entries} />
}
