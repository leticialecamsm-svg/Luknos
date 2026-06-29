import { getFinanceEntries, getFinanceSuppliers, getFinanceCategories } from '@/lib/actions'
import { FinancePage } from '@/components/finance/FinancePage'

export const dynamic = 'force-dynamic'

export default async function Finance() {
  const [entries, suppliers, categories] = await Promise.all([
    getFinanceEntries(),
    getFinanceSuppliers(),
    getFinanceCategories(),
  ])
  return <FinancePage initialEntries={entries} suppliers={suppliers} categories={categories} />
}
