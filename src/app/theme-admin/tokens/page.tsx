import { getActiveTheme, listDesignTokens } from '@/lib/theme-admin/actions'
import { TokensClient } from '@/components/theme-admin/TokensClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Design Tokens — Luknos' }

export default async function ThemeAdminTokensPage() {
  const theme = await getActiveTheme()
  const tokens = theme ? await listDesignTokens(theme.id) : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Design tokens</h1>
        <p className="text-gray-500 mt-1">Cores, tipografia, espaçamento, raio e sombra do tema {theme?.display_name ?? 'ativo'}.</p>
      </div>
      <TokensClient tokens={tokens} />
    </div>
  )
}
