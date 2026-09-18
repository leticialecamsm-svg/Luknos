import { Sidebar } from '@/components/layout/Sidebar'
import { AppHeader } from '@/components/layout/AppHeader'
import { FloatingActionButton } from '@/components/ui/FloatingActionButton'
import { requirePageAccess } from '@/lib/access'

export default async function NegotiationsLayout({ children }: { children: React.ReactNode }) {
  const { profile, allowedPages, roleLabel } = await requirePageAccess('/negotiations')
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={profile} allowedPages={allowedPages} roleLabel={roleLabel} />

      <div className="flex-1 flex flex-col min-h-0 min-w-0">

        <AppHeader user={profile} roleLabel={roleLabel} />
      <main className="flex-1 min-w-0 overflow-y-auto bg-surface">
        <div className="max-w-full mx-auto p-6">{children}</div>
      </main>

      </div>
      <FloatingActionButton currentUserId={profile.id} />
    </div>
  )
}
