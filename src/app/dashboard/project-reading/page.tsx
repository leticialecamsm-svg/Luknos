import { listPlans } from '@/lib/project-reading/actions'
import { ProjectReadingListPage } from '@/components/project-reading/ProjectReadingListPage'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Leitura de Projeto — Luknos' }

export default async function ProjectReadingPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const plans = await listPlans()
  return <ProjectReadingListPage plans={plans as any[]} />
}
