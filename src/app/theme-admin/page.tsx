import Link from 'next/link'
import { getActiveTheme, getFeatureFlag } from '@/lib/theme-admin/actions'
import { PublishThemePanel } from '@/components/theme-admin/PublishThemePanel'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Painel do Tema — Luknos' }

export default async function ThemeAdminPage() {
  const theme = await getActiveTheme()

  if (!theme) {
    return (
      <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center text-gray-500">
        Nenhum tema ativo. Importe os tokens do tema Viver de IA para começar.
      </div>
    )
  }

  const flag = await getFeatureFlag(`theme.${theme.slug}.enabled`)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Painel do tema</h1>
        <p className="text-gray-500 mt-1">Redesign visual "Viver de IA" — gerencie tokens, componentes e a publicação para os 7 usuários.</p>
      </div>

      <PublishThemePanel theme={theme} flag={flag} />

      <div className="grid sm:grid-cols-3 gap-4">
        <Link href="/theme-admin/tokens" className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-colors">
          <p className="font-medium text-gray-900">Editar tokens</p>
          <p className="text-sm text-gray-500 mt-1">Cores, tipografia, espaçamento, raio e sombra.</p>
        </Link>
        <Link href="/theme-admin/components" className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-colors">
          <p className="font-medium text-gray-900">Ver componentes</p>
          <p className="text-sm text-gray-500 mt-1">Catálogo de botões, cards, inputs, gráficos e o loader.</p>
        </Link>
        <Link href="/theme-admin/progress" className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-colors">
          <p className="font-medium text-gray-900">Ver progresso</p>
          <p className="text-sm text-gray-500 mt-1">Status da repaginação das 17 telas do Luknos.</p>
        </Link>
      </div>
    </div>
  )
}
