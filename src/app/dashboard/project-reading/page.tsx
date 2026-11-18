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
  // Protótipo de leitura de DWG/DXF: link só pra quem pode ver (sem menu).
  const cadLab = ['leticialecamsm@gmail.com'].includes((user.email ?? '').toLowerCase())
  return <ProjectReadingListPage plans={plans as any[]} cadLab={cadLab} />
}
