import { getCrmInstances, getSystemUsersForCrm } from '@/lib/crm-actions'
import { CrmInstancesPage } from '@/components/crm/CrmInstancesPage'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Números do CRM — Luknos' }

export default async function Page() {
  // o layout (src/app/crm-instances/layout.tsx) já garante admin via requirePageAccess.
  const [items, users] = await Promise.all([getCrmInstances(), getSystemUsersForCrm()])
  return <CrmInstancesPage initial={items as any} users={users as any} />
}
