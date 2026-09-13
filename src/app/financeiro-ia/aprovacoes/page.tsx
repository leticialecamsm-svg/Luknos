import { requireFinanceiroProfile } from '@/lib/financeiro-ia/auth'
import { listPendingApprovals } from '@/lib/financeiro-ia/approval-actions'
import { AprovacoesClient } from '@/components/financeiro-ia/AprovacoesClient'

export default async function Page() {
  await requireFinanceiroProfile()
  const items = await listPendingApprovals()
  return <AprovacoesClient initialItems={items} />
}
