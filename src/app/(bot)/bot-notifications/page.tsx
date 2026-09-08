import { requireBotAccess } from '@/lib/bot-access'
import { getBotNotifications } from '@/lib/bot-actions'
import { BotNotificationsPage } from '@/components/bot/BotNotificationsPage'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Notificações do Robô — Luknos' }

export default async function Page({
  searchParams,
}: {
  searchParams: { status?: string }
}) {
  await requireBotAccess()
  const status = searchParams.status ?? 'all'
  const { rows, counts, isAdmin } = await getBotNotifications(status)
  return (
    <BotNotificationsPage rows={rows as any[]} counts={counts} status={status} isAdmin={isAdmin} />
  )
}
