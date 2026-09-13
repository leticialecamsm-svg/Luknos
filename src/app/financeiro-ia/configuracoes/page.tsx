import { requireFinanceiroProfile } from '@/lib/financeiro-ia/auth'
import { ConfiguracoesClient } from '@/components/financeiro-ia/ConfiguracoesClient'
import { listBankAccounts, listCategories, listSuppliers, listCostCenters } from '@/lib/financeiro-ia/actions'
import { getApprovalThreshold } from '@/lib/financeiro-ia/approval-actions'

export default async function Page() {
  await requireFinanceiroProfile()
  const [bankAccounts, categories, suppliers, costCenters, approvalThreshold] = await Promise.all([
    listBankAccounts(),
    listCategories(),
    listSuppliers(),
    listCostCenters(),
    getApprovalThreshold(),
  ])
  return (
    <ConfiguracoesClient
      initialBankAccounts={bankAccounts}
      initialCategories={categories}
      initialSuppliers={suppliers}
      initialCostCenters={costCenters}
      initialApprovalThreshold={approvalThreshold}
    />
  )
}
