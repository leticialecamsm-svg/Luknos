import { getPricingBootstrap, getPricingAccess, getQuoteById } from '@/lib/pricing/actions'
import { CotarClient } from '@/components/pricing/CotarClient'
import { PricingNav } from '@/components/pricing/PricingNav'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Cotação e Preços — Luknos' }

export default async function Page({ searchParams }: { searchParams: { edit?: string } }) {
  const [data, access] = await Promise.all([getPricingBootstrap(), getPricingAccess()])
  if ('error' in data) return <p className="text-sm text-red-600">{data.error}</p>
  if ('error' in access) return <p className="text-sm text-red-600">{access.error}</p>
  const edit = searchParams.edit ? await getQuoteById(searchParams.edit) : null
  const editQuote = edit && 'quote' in edit ? edit.quote : undefined
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Cotação e Preços</h1>
        <p className="text-sm text-gray-500">{access.restricted ? 'Escolha o fornecedor e o produto, informe o valor de compra e veja o preço de venda.' : 'Escolha o fornecedor e o produto, informe o valor de compra e veja o preço de venda com todas as margens.'}</p>
      </div>
      <PricingNav restricted={access.restricted} />
      <CotarClient suppliers={data.suppliers} metrics={data.metrics} productTypes={data.productTypes} restricted={access.restricted} currentUserId={access.userId} editQuote={editQuote} />
    </div>
  )
}
