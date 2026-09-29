import { getFiscalConfig } from '@/lib/fiscal/actions'
import { FiscalConfigClient } from '@/components/fiscal/FiscalConfigClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Configurações Fiscais — Luknos' }

export default async function Page() {
  const data = await getFiscalConfig()
  if ('error' in data) return <p className="text-sm text-red-600">{data.error}</p>
  return <FiscalConfigClient initial={data.config} />
}
