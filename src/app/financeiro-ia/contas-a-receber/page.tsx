import { requireFinanceiroProfile } from '@/lib/financeiro-ia/auth'
import { LancamentosClient } from '@/components/financeiro-ia/LancamentosClient'
import { listBankAccounts, listCategories, listSuppliers, listCostCenters } from '@/lib/financeiro-ia/actions'
import { listTransactions } from '@/lib/financeiro-ia/transactions-actions'

export default async function Page() {
  await requireFinanceiroProfile()
  const [transactions, categories, suppliers, costCenters, bankAccounts] = await Promise.all([
    listTransactions('a_receber'),
    listCategories(),
    listSuppliers(),
    listCostCenters(),
    listBankAccounts(),
  ])
  return (
    <LancamentosClient
      direction="a_receber"
      initialTransactions={transactions}
      categories={categories}
      suppliers={suppliers}
      costCenters={costCenters}
      bankAccounts={bankAccounts}
    />
  )
}
