import { getFinanceSuppliers } from '@/lib/actions'
import { FinanceSuppliersPage } from '@/components/finance/FinanceSuppliersPage'

export default async function SuppliersPage() {
  const suppliers = await getFinanceSuppliers()
  return <FinanceSuppliersPage initialSuppliers={suppliers} />
}
