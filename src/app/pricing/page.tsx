import { getSuppliersOverview, getPricingAccess } from '@/lib/pricing/actions'
import { PrecosClient } from '@/components/pricing/PrecosClient'
import { PricingNav } from '@/components/pricing/PricingNav'

export const dynamic = 'force-dynamic'
// "Atualizar catálogo" (server action) relê o site do fornecedor: pode levar 1–2 min.
export const maxDuration = 300
export const metadata = { title: 'Cotação e Preços — Luknos' }

export default async function Page() {
  const [data, access] = await Promise.all([getSuppliersOverview(), getPricingAccess()])
  if ('error' in data) return <p className="text-sm text-red-600">{data.error}</p>
  if ('error' in access) return <p className="text-sm text-red-600">{access.error}</p>
  return (
    <PrecosClient suppliers={data.suppliers} restricted={access.restricted} nav={<PricingNav restricted={access.restricted} />} />
  )
}
