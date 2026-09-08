import { requireBotAccess } from '@/lib/bot-access'
import { getBotStats } from '@/lib/bot-actions'
import { BotDashboardPage } from '@/components/bot/BotDashboardPage'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Painel do Robô — Luknos' }

const RANGES = new Set(['today', '7d', '30d'])

export default async function Page({
  searchParams,
}: {
  searchParams: { range?: string }
}) {
  await requireBotAccess()
  const range = RANGES.has(searchParams.range ?? '') ? searchParams.range! : '30d'
  const stats = await getBotStats(range)
  return <BotDashboardPage stats={stats as any} range={range} />
}
