import { getSuppliersOverview } from '@/lib/pricing/actions'
import { TesteEmissaoClient } from '@/components/fiscal/TesteEmissaoClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Teste de Emissão — Luknos' }

export default async function Page() {
  const data = await getSuppliersOverview()
  if ('error' in data) return <p className="text-sm text-red-600">{data.error}</p>
  return <TesteEmissaoClient suppliers={data.suppliers} />
}
