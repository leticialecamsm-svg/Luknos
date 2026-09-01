import { Sidebar } from '@/components/layout/Sidebar'
import { FloatingActionButton } from '@/components/ui/FloatingActionButton'
import { requireBotAccess } from '@/lib/bot-access'

// Layout base do módulo Robô de Orçamentos WhatsApp.
// Grupo de rota (bot) — não altera a URL: as páginas continuam em /bot-config,
// /bot-collaborators, /bot-conversations, /bot-dashboard, /bot-notifications.
//
// Toda rota /bot-* passa por requireBotAccess():
//   - não autenticado           -> redirect /auth/login
//   - não é usuário interno ativo -> redirect /auth/login
// Páginas de escrita (config, whitelist) exigem requireBotAccess({ requireAdmin: true })
// no próprio layout/página.

export default async function BotLayout({ children }: { children: React.ReactNode }) {
  const { profile, allowedPages, roleLabel } = await requireBotAccess()

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={profile} allowedPages={allowedPages} roleLabel={roleLabel} />
      <main className="flex-1 overflow-y-auto bg-surface">
        <div className="max-w-7xl mx-auto p-6">{children}</div>
      </main>
      <FloatingActionButton currentUserId={profile.id} />
    </div>
  )
}
