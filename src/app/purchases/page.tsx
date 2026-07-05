import { getPurchaseInvoices } from '@/lib/actions'
import { PurchasesPage } from '@/components/purchases/PurchasesPage'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Notas de Entrada — Luknos' }

export default async function Page() {
  const invoices = await getPurchaseInvoices()
  return <PurchasesPage invoices={invoices} />
}
