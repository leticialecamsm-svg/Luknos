import { CompararClient } from '@/components/pricing/CompararClient'
import { PricingNav } from '@/components/pricing/PricingNav'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Comparar — Luknos' }

export default function Page() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Cotação e Preços</h1>
        <p className="text-sm text-gray-500">Compare o mesmo produto em todos os fornecedores pela última compra de cada um.</p>
      </div>
      <PricingNav />
      <CompararClient />
    </div>
  )
}
