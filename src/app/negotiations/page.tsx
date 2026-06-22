import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getAllQuotes, getMyQuotes } from '@/lib/actions'
import { NegotiationsBoard } from '@/components/negotiations/NegotiationsBoard'

export default async function NegotiationsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'
  const all = isAdmin ? await getAllQuotes() : await getMyQuotes()
  // Só orçamentos concluídos entram na negociação
  const quotes = all.filter((q: any) => q.status === 'done')
  return <NegotiationsBoard quotes={quotes} isAdmin={isAdmin} />
}
