'use client'

import { useState, useRef, useEffect } from 'react'
import { HelpCircle, ChevronDown, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui/Avatar'
import { ScheduleNotifier } from '@/components/schedules/ScheduleNotifier'
import type { User } from '@/types'

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrador',
  seller: 'Vendedor',
  logistics: 'Logística',
  marketing: 'Marketing',
}

// Header superior com busca/ajuda/notificações/usuário no canto direito,
// igual ao app.viverdeia.ai — antes esses itens viviam no rodapé da Sidebar.
export function AppHeader({ user, roleLabel }: { user: User | null; roleLabel?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  return (
    <header className="sticky top-0 z-20 h-14 shrink-0 flex items-center justify-end gap-1 px-6 bg-white/85 backdrop-blur-md border-b border-surface-border">
      <button
        type="button"
        className="w-9 h-9 rounded-full flex items-center justify-center text-navy-muted hover:text-navy hover:bg-[rgba(10,31,59,0.04)] transition-colors"
        title="Ajuda"
      >
        <HelpCircle className="w-[18px] h-[18px]" />
      </button>

      <ScheduleNotifier mode="header" />

      <div className="relative ml-1" ref={ref}>
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-[rgba(10,31,59,0.04)] transition-colors"
        >
          {user ? <Avatar user={user} size={30} /> : (
            <div className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0" style={{ backgroundColor: '#0A1F3B' }}>U</div>
          )}
          <span className="text-sm font-medium text-navy">{user?.name?.split(' ')[0] ?? 'Você'}</span>
          <ChevronDown className="w-3.5 h-3.5 text-navy-muted" />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-2xl border border-surface-border overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-border flex items-center gap-2.5">
              {user ? <Avatar user={user} size={32} /> : null}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy truncate">{user?.name ?? '—'}</p>
                <p className="text-xs text-navy-muted truncate">
                  {roleLabel ?? ROLE_LABEL[user?.role ?? 'seller'] ?? user?.role ?? ''}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" /> Sair da conta
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
