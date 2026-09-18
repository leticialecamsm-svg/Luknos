import { requireFinanceiroProfile } from '@/lib/financeiro-ia/auth'
import { FinanceiroNav } from '@/components/financeiro-ia/FinanceiroNav'

export const metadata = { title: 'Luknos Financeiro' }

export default async function FinanceiroIALayout({ children }: { children: React.ReactNode }) {
  const profile = await requireFinanceiroProfile()

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <FinanceiroNav profile={profile} />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6">{children}</div>
      </main>
    </div>
  )
}
