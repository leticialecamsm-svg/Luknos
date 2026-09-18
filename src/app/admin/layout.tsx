import { Sidebar } from '@/components/layout/Sidebar'
import { AppHeader } from '@/components/layout/AppHeader'
import { requirePageAccess } from '@/lib/access'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, allowedPages, roleLabel } = await requirePageAccess('/admin')

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={profile} allowedPages={allowedPages} roleLabel={roleLabel} />

      <div className="flex-1 flex flex-col min-h-0 min-w-0">

        <AppHeader user={profile} roleLabel={roleLabel} />
      <main className="flex-1 min-w-0 overflow-y-auto bg-surface">
        <div className="max-w-7xl mx-auto p-6">
          {children}
        </div>
      </main>

      </div>
    </div>
  )
}
