import { requireBotAccess } from '@/lib/bot-access'
import { getBotConfig } from '@/lib/bot-actions'
import { BotConfigPage } from '@/components/bot/BotConfigPage'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Configuração do Robô — Luknos' }

export default async function Page() {
  await requireBotAccess({ requireAdmin: true })
  const config = await getBotConfig()
  return <BotConfigPage initialConfig={config} />
}
