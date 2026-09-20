import { getSuppliersOverview } from '@/lib/pricing/actions'
import { PrecosClient } from '@/components/pricing/PrecosClient'
import { PricingNav } from '@/components/pricing/PricingNav'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Cotação e Preços — Luknos' }

export default async function Page() {
  const data = await getSuppliersOverview()
  if ('error' in data) return <p className="text-sm text-red-600">{data.error}</p>
  return (
    <PrecosClient suppliers={data.suppliers} nav={<PricingNav />} />
  )
}
