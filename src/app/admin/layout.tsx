import { Sidebar } from '@/components/layout/Sidebar'
import { requirePageAccess } from '@/lib/access'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, allowedPages } = await requirePageAccess('/admin')

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={profile} allowedPages={allowedPages} />
      <main className="flex-1 overflow-y-auto bg-surface">
        <div className="max-w-7xl mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
