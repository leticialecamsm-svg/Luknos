import { notFound } from 'next/navigation'
import { requireBotAccess } from '@/lib/bot-access'
import { getBotConversationDetail } from '@/lib/bot-actions'
import { BotConversationDetail } from '@/components/bot/BotConversationDetail'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Conversa do Robô — Luknos' }

export default async function Page({ params }: { params: { id: string } }) {
  await requireBotAccess()
  const data = await getBotConversationDetail(params.id)
  if (!data) notFound()
  return <BotConversationDetail data={data as any} />
}
