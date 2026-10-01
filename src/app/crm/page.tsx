import { requirePageAccess } from '@/lib/access'
import { getSystemUsersForCrm } from '@/lib/crm-actions'
import { CrmInboxPage } from '@/components/crm/CrmInboxPage'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'CRM — Luknos' }

export default async function Page() {
  const { profile } = await requirePageAccess('/crm')
  const users = await getSystemUsersForCrm()
  return <CrmInboxPage currentUserId={profile.id} users={users as any} />
}
