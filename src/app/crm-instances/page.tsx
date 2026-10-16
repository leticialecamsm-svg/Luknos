import { getCrmInstances, getSystemUsersForCrm } from '@/lib/crm-actions'
import { CrmInstancesPage } from '@/components/crm/CrmInstancesPage'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Números do CRM — Luknos' }

export default async function Page() {
  const [instances, users] = await Promise.all([getCrmInstances(), getSystemUsersForCrm()])
  return <CrmInstancesPage instances={instances as any} users={users as any} />
}
