import { requireFinanceiroProfile } from '@/lib/financeiro-ia/auth'
import { getDailyCashPanel } from '@/lib/financeiro-ia/panels-actions'
import { CaixaDoDiaClient } from '@/components/financeiro-ia/CaixaDoDiaClient'

export default async function CaixaDoDiaPage() {
  const profile = await requireFinanceiroProfile()
  const panel = await getDailyCashPanel()
  return <CaixaDoDiaClient firstName={profile.full_name.split(' ')[0]} panel={panel} />
}
