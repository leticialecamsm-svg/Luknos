import { Sidebar } from '@/components/layout/Sidebar'
import { AppHeader } from '@/components/layout/AppHeader'
import { requirePageAccess } from '@/lib/access'
import { CrmTabs } from '@/components/crm/CrmTabs'
import { CrmHealthBanner } from '@/components/crm/CrmHealthBanner'
import { MobileInstallHint } from '@/components/crm/MobileInstallHint'

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const { profile, allowedPages, roleLabel } = await requirePageAccess('/crm')

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={profile} allowedPages={allowedPages} roleLabel={roleLabel} focus />

      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <AppHeader user={profile} roleLabel={roleLabel} />
        <main className="flex-1 min-w-0 overflow-y-auto bg-surface">
          <div className="px-4 pt-3 pb-3">
            <MobileInstallHint />
            <CrmHealthBanner />
            <CrmTabs />
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
