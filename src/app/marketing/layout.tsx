import { Sidebar } from '@/components/layout/Sidebar'
import { FloatingActionButton } from '@/components/ui/FloatingActionButton'
import { requirePageAccess } from '@/lib/access'

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const { profile, allowedPages, roleLabel } = await requirePageAccess('/marketing')

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={profile} allowedPages={allowedPages} roleLabel={roleLabel} />
      <main className="flex-1 overflow-y-auto bg-surface">
        <div className="max-w-full mx-auto p-6">{children}</div>
      </main>
      <FloatingActionButton currentUserId={profile.id} />
    </div>
  )
}
