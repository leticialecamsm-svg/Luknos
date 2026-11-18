import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CadLab } from '@/components/project-reading/CadLab'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Laboratório CAD — Luknos' }

// Protótipo: só aparece pra quem está nessa lista (sem link no menu). Pra
// liberar pra mais gente, é só incluir o e-mail aqui.
const PERMITIDOS = ['leticialecamsm@gmail.com']

export default async function CadLabPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  if (!PERMITIDOS.includes((user.email ?? '').toLowerCase())) notFound()
  return <CadLab />
}
