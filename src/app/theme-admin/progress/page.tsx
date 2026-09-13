import { getActiveTheme, listScreensWithProgress } from '@/lib/theme-admin/actions'
import { ProgressClient } from '@/components/theme-admin/ProgressClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Progresso do Redesign — Luknos' }

export default async function ThemeAdminProgressPage() {
  const theme = await getActiveTheme()
  const screens = theme ? await listScreensWithProgress(theme.id) : []

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Progresso da repaginação</h1>
      <p className="text-gray-500 mb-6">Status de cada tela do Luknos no redesign {theme?.display_name ?? ''}.</p>
      <ProgressClient screens={screens} />
    </div>
  )
}
