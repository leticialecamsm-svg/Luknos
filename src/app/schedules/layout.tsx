import { Sidebar } from '@/components/layout/Sidebar'
import { FloatingActionButton } from '@/components/ui/FloatingActionButton'
import { requirePageAccess } from '@/lib/access'

export default async function SchedulesLayout({ children }: { children: React.ReactNode }) {
  const { profile, allowedPages, roleLabel } = await requirePageAccess('/schedules')

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={profile} allowedPages={allowedPages} roleLabel={roleLabel} />
      <main className="flex-1 overflow-y-auto bg-surface">
        <div className="max-w-7xl mx-auto p-6">
          {children}
        </div>
      </main>
      <FloatingActionButton currentUserId={profile.id} />
    </div>
  )
}
