import { Sidebar } from '@/components/layout/Sidebar'
import { AppHeader } from '@/components/layout/AppHeader'
import { FloatingActionButton } from '@/components/ui/FloatingActionButton'
import { requireLogin } from '@/lib/access'
import { CollapseSidebarOnPhone } from '@/components/training/CollapseSidebarOnPhone'

export default async function TreinamentoLayout({ children }: { children: React.ReactNode }) {
  const { profile, allowedPages, roleLabel } = await requireLogin()

  return (
    <div className="flex h-screen overflow-hidden">
      <CollapseSidebarOnPhone />
      <Sidebar user={profile} allowedPages={allowedPages} roleLabel={roleLabel} />

      <div className="flex-1 flex flex-col min-h-0 min-w-0">

        <AppHeader user={profile} roleLabel={roleLabel} />
      <main className="flex-1 min-w-0 overflow-y-auto bg-surface">
        <div className="max-w-7xl mx-auto p-3 sm:p-6">
          {children}
        </div>
      </main>

      </div>
      <FloatingActionButton currentUserId={profile.id} />
    </div>
  )
}
