import { getFinanceCategories } from '@/lib/actions'
import { FinanceCategoriesPage } from '@/components/finance/FinanceCategoriesPage'

export default async function CategoriesPage() {
  const categories = await getFinanceCategories()
  return <FinanceCategoriesPage initialCategories={categories} />
}
