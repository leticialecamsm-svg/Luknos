import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { AppHeader } from '@/components/layout/AppHeader'
import { FloatingActionButton } from '@/components/ui/FloatingActionButton'
import { requirePageAccess } from '@/lib/access'

// Orçamento de Produtos: só admin (não entra no PAGE_CATALOG, então não dá pra liberar por papel).
export default async function PropostasLayout({ children }: { children: React.ReactNode }) {
  const { profile, allowedPages, roleLabel } = await requirePageAccess('/propostas')
  if (profile.role !== 'admin') redirect(allowedPages?.[0] ?? '/dashboard')

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={profile} allowedPages={allowedPages} roleLabel={roleLabel} />

      <div className="flex-1 flex flex-col min-h-0 min-w-0">

        <AppHeader user={profile} roleLabel={roleLabel} />
      <main className="flex-1 min-w-0 overflow-y-auto bg-surface">
        <div className="max-w-7xl mx-auto p-6">{children}</div>
      </main>

      </div>
      <FloatingActionButton currentUserId={profile.id} />
    </div>
  )
}
