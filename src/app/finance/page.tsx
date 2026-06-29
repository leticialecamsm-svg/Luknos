import { getFinanceEntries, getFinanceSuppliers, getFinanceCategories, getFinanceAccounts } from '@/lib/actions'
import { FinancePage } from '@/components/finance/FinancePage'

export const dynamic = 'force-dynamic'

export default async function Finance() {
  const [entries, suppliers, categories, accounts] = await Promise.all([
    getFinanceEntries(),
    getFinanceSuppliers(),
    getFinanceCategories(),
    getFinanceAccounts(),
  ])
  return <FinancePage initialEntries={entries} suppliers={suppliers} categories={categories} accounts={accounts} />
}
