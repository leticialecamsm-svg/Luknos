import { Sidebar } from '@/components/layout/Sidebar'
import { ContentContainer } from '@/components/layout/ContentContainer'
import { FloatingActionButton } from '@/components/ui/FloatingActionButton'
import { requirePageAccess } from '@/lib/access'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, allowedPages, roleLabel } = await requirePageAccess('/dashboard')

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={profile} allowedPages={allowedPages} roleLabel={roleLabel} />
      <main className="flex-1 overflow-y-auto bg-surface">
        <ContentContainer>{children}</ContentContainer>
      </main>
      <FloatingActionButton currentUserId={profile.id} />
    </div>
  )
}
