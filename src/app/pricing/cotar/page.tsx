import { getPricingBootstrap } from '@/lib/pricing/actions'
import { CotarClient } from '@/components/pricing/CotarClient'
import { PricingNav } from '@/components/pricing/PricingNav'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Cotação e Preços — Luknos' }

export default async function Page() {
  const data = await getPricingBootstrap()
  if ('error' in data) return <p className="text-sm text-red-600">{data.error}</p>
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Cotação e Preços</h1>
        <p className="text-sm text-gray-500">Escolha o fornecedor e o produto, informe o valor de compra e veja o preço de venda com todas as margens.</p>
      </div>
      <PricingNav />
      <CotarClient suppliers={data.suppliers} metrics={data.metrics} productTypes={data.productTypes} />
    </div>
  )
}
