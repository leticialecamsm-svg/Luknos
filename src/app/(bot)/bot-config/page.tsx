import { requireBotAccess } from '@/lib/bot-access'
import { getBotConfig, getDriveConnection } from '@/lib/bot-actions'
import { BotConfigPage } from '@/components/bot/BotConfigPage'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Configuração do Robô — Luknos' }

export default async function Page({ searchParams }: { searchParams: { drive?: string } }) {
  await requireBotAccess({ requireAdmin: true })
  const [config, drive] = await Promise.all([getBotConfig(), getDriveConnection()])
  return <BotConfigPage initialConfig={config} drive={drive} driveResult={searchParams.drive ?? null} />
}
