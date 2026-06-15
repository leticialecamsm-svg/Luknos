import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getAllContacts, getActiveUsers } from '@/lib/actions'
import { PartnersPage } from '@/components/partners/PartnersPage'

export const dynamic = 'force-dynamic'

export default async function Partners() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'

  const [contacts, users] = await Promise.all([
    getAllContacts(),
    getActiveUsers(),
  ])

  return (
    <PartnersPage
      initialContacts={contacts}
      users={users}
      currentUserId={user.id}
      isAdmin={isAdmin}
    />
  )
}
