import { requireFinanceiroProfile } from '@/lib/financeiro-ia/auth'
import { ConfiguracoesClient } from '@/components/financeiro-ia/ConfiguracoesClient'
import { listBankAccounts, listCategories, listSuppliers, listCostCenters } from '@/lib/financeiro-ia/actions'

export default async function Page() {
  await requireFinanceiroProfile()
  const [bankAccounts, categories, suppliers, costCenters] = await Promise.all([
    listBankAccounts(),
    listCategories(),
    listSuppliers(),
    listCostCenters(),
  ])
  return (
    <ConfiguracoesClient
      initialBankAccounts={bankAccounts}
      initialCategories={categories}
      initialSuppliers={suppliers}
      initialCostCenters={costCenters}
    />
  )
}
