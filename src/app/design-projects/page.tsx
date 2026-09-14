import { listVisits, listDesignProjects } from '@/lib/design-projects-actions'
import { DesignProjectsWorkspace } from '@/components/design-projects/DesignProjectsWorkspace'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Projetos — Luknos' }

export default async function DesignProjectsPage() {
  const [visits, projects] = await Promise.all([listVisits(), listDesignProjects()])
  return <DesignProjectsWorkspace initialVisits={visits} initialProjects={projects} />
}
