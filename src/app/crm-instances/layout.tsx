import { Sidebar } from '@/components/layout/Sidebar'
import { AppHeader } from '@/components/layout/AppHeader'
import { FloatingActionButton } from '@/components/ui/FloatingActionButton'
import { requirePageAccess } from '@/lib/access'

// Página admin-only (gerencia os números/instâncias do CRM). '/crm-instances'
// não entra no PAGE_CATALOG de propósito — não é uma página operacional pra
// liberar por papel, só o admin mesmo mexe (requirePageAccess já deixa
// qualquer role==='admin' passar direto, e redireciona quem não é).
export default async function CrmInstancesLayout({ children }: { children: React.ReactNode }) {
  const { profile, allowedPages, roleLabel } = await requirePageAccess('/crm-instances')

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
      <FloatingActionButton currentUserId={profile.id} />
    </div>
  )
}
