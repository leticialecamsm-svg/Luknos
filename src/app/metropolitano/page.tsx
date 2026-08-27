import { getMetropolitanoLancamentos } from '@/lib/actions'
import { MetropolitanoPage } from '@/components/metropolitano/MetropolitanoPage'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const rows = await getMetropolitanoLancamentos()
  return <MetropolitanoPage initialRows={rows} />
}
