import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getAllContacts } from '@/lib/actions'
import { PartnersPage } from '@/components/partners/PartnersPage'

export default async function Partners() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const contacts = await getAllContacts()
  return <PartnersPage initialContacts={contacts} />
}
