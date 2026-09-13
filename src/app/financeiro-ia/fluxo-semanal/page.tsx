import { requireFinanceiroProfile } from '@/lib/financeiro-ia/auth'
import { getCashflowProjection } from '@/lib/financeiro-ia/panels-actions'
import { FluxoSemanalClient } from '@/components/financeiro-ia/FluxoSemanalClient'

export default async function Page() {
  await requireFinanceiroProfile()
  const start = new Date()
  const end = new Date()
  end.setDate(end.getDate() + 6)
  const days = await getCashflowProjection(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10))
  return <FluxoSemanalClient days={days} />
}
