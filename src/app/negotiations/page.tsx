import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getAllQuotes, getMyQuotes, checkAndDemoteNegotiations } from '@/lib/actions'
import { NegotiationsBoard } from '@/components/negotiations/NegotiationsBoard'

export default async function NegotiationsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'
  // Checa e rebaixa negociações automaticamente antes de carregar
  await checkAndDemoteNegotiations()
  const all = isAdmin ? await getAllQuotes() : await getMyQuotes()
  // Concluídos + Elaborando nova versão entram na negociação
  const quotes = all.filter((q: any) => q.status === 'done' || q.status === 'revision')
  return <NegotiationsBoard quotes={quotes} isAdmin={isAdmin} />
}
