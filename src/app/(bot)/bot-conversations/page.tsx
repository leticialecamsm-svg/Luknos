import { requireBotAccess } from '@/lib/bot-access'
import { getBotConversations } from '@/lib/bot-actions'
import { BotConversationsPage } from '@/components/bot/BotConversationsPage'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Conversas do Robô — Luknos' }

export default async function Page({
  searchParams,
}: {
  searchParams: { status?: string }
}) {
  await requireBotAccess()
  const status = searchParams.status ?? 'all'
  const { rows, counts } = await getBotConversations(status)
  return <BotConversationsPage rows={rows as any[]} counts={counts} status={status} />
}
