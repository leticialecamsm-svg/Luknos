import { requireBotAccess } from '@/lib/bot-access'
import { getBotCollaborators, getSystemUsersForBot } from '@/lib/bot-actions'
import { BotCollaboratorsPage } from '@/components/bot/BotCollaboratorsPage'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Colaboradores do Robô — Luknos' }

export default async function Page() {
  await requireBotAccess({ requireAdmin: true })
  const [collaborators, users] = await Promise.all([
    getBotCollaborators(),
    getSystemUsersForBot(),
  ])
  return <BotCollaboratorsPage initialCollaborators={collaborators} systemUsers={users} />
}
