import { ImportarPlanilhaClient } from '@/components/pricing/ImportarPlanilhaClient'
import { PricingNav } from '@/components/pricing/PricingNav'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Importar planilha — Luknos' }

export default function Page() {
  return (
    <div>
      <div className="mb-4"><h1 className="text-xl font-semibold text-gray-900">Cotação e Preços</h1></div>
      <PricingNav />
      <ImportarPlanilhaClient />
    </div>
  )
}
