import { requireFinanceiroProfile } from '@/lib/financeiro-ia/auth'
import { listCostCenters } from '@/lib/financeiro-ia/actions'
import { listCsvImports } from '@/lib/financeiro-ia/csv-import-actions'
import { ImportarCsvClient } from '@/components/financeiro-ia/ImportarCsvClient'

export default async function Page() {
  await requireFinanceiroProfile()
  const [costCenters, imports] = await Promise.all([
    listCostCenters(),
    listCsvImports(),
  ])
  return <ImportarCsvClient costCenters={costCenters} initialImports={imports} />
}
