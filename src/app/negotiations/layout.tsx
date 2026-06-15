import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { FloatingActionButton } from '@/components/ui/FloatingActionButton'

export default async function NegotiationsLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/auth/login')
  const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={profile} />
      <main className="flex-1 overflow-y-auto bg-surface">
        <div className="max-w-full mx-auto p-6">{children}</div>
      </main>
      <FloatingActionButton currentUserId={user.id} />
    </div>
  )
}

