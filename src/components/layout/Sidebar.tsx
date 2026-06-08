'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LayoutDashboard, FileText, LogOut, Settings, ChevronRight, Zap, Users2, TrendingUp, Menu, X } from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import type { User } from '@/types'

const NAV = [
  { href: '/dashboard',     label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/quotes',        label: 'Orçamentos',   icon: FileText },
  { href: '/negotiations',  label: 'Negociações',  icon: TrendingUp },
  { href: '/partners',      label: 'Parceiros',    icon: Users2 },
]
const ADMIN_NAV = [
  { href: '/admin', label: 'Administração', icon: Settings },
]

export function Sidebar({ user }: { user: User | null }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem('sidebar-collapsed') === 'true'
    setCollapsed(saved)
  }, [])

  function toggleCollapse() {
    const newState = !collapsed
    setCollapsed(newState)
    localStorage.setItem('sidebar-collapsed', String(newState))
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  const isAdmin = user?.role === 'admin'

  if (!mounted) return null

  return (
    <aside className={`flex flex-col shrink-0 transition-all ${collapsed ? 'w-16' : 'w-56'}`} style={{ background: '#1A1A2E' }}>
      <div className={`border-b border-white/10 flex items-center ${collapsed ? 'justify-center px-3 py-3' : 'px-5 py-5'}`}>
        {!collapsed && (
          <div className="flex items-center gap-2.5 flex-1">
            <svg className="w-8 h-8" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
              <path d="M 80 40 Q 100 20, 130 35 Q 140 40, 135 60 Q 120 70, 90 65 Q 75 60, 80 40 Z" fill="#C9A961"/>
              <path d="M 90 65 Q 120 70, 140 50 Q 145 45, 165 55 Q 160 75, 130 80 Q 110 85, 90 65 Z" fill="#D4B577"/>
              <path d="M 40 95 Q 65 85, 90 105 L 100 130 L 70 115 Q 50 105, 40 95 Z" fill="#0F2A4A"/>
              <path d="M 90 105 L 100 130 L 130 110 Q 110 95, 90 105 Z" fill="#1a3a54"/>
              <path d="M 100 130 L 130 110 Q 155 95, 170 100 Q 160 120, 130 140 Q 110 150, 100 130 Z" fill="#0F2A4A"/>
            </svg>
            <div>
              <p className="font-semibold text-sm text-white leading-tight">Luknos</p>
              <p className="text-xs text-white/40 leading-tight">Iluminação</p>
            </div>
          </div>
        )}
        {collapsed && (
          <svg className="w-6 h-6" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <path d="M 80 40 Q 100 20, 130 35 Q 140 40, 135 60 Q 120 70, 90 65 Q 75 60, 80 40 Z" fill="#C9A961"/>
            <path d="M 90 65 Q 120 70, 140 50 Q 145 45, 165 55 Q 160 75, 130 80 Q 110 85, 90 65 Z" fill="#D4B577"/>
            <path d="M 40 95 Q 65 85, 90 105 L 100 130 L 70 115 Q 50 105, 40 95 Z" fill="#0F2A4A"/>
            <path d="M 90 105 L 100 130 L 130 110 Q 110 95, 90 105 Z" fill="#1a3a54"/>
            <path d="M 100 130 L 130 110 Q 155 95, 170 100 Q 160 120, 130 140 Q 110 150, 100 130 Z" fill="#0F2A4A"/>
          </svg>
        )}
        <button onClick={toggleCollapse} className="text-white/30 hover:text-white transition-colors ml-auto"
          title={collapsed ? 'Expandir' : 'Recolher'}>
          {collapsed ? <Menu className="w-4 h-4" /> : <X className="w-4 h-4" />}
        </button>
      </div>

      <nav className={`flex-1 space-y-0.5 ${collapsed ? 'p-1' : 'p-3'}`}>
        {NAV.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link key={item.href} href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn('flex items-center gap-2.5 rounded-lg text-sm transition-colors',
                collapsed ? 'justify-center px-3 py-2' : 'px-3 py-2',
                active ? 'bg-white/15 text-white font-medium' : 'text-white/60 hover:text-white hover:bg-white/8'
              )}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {!collapsed && (
                <>
                  {item.label}
                  {active && <ChevronRight className="w-3 h-3 ml-auto opacity-50" />}
                </>
              )}
            </Link>
          )
        })}

        {isAdmin && (
          <>
            {!collapsed && (
              <div className="pt-4 pb-1 px-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25">Admin</p>
              </div>
            )}
            {ADMIN_NAV.map(item => {
              const active = pathname.startsWith(item.href)
              return (
                <Link key={item.href} href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn('flex items-center gap-2.5 rounded-lg text-sm transition-colors',
                    collapsed ? 'justify-center px-3 py-2' : 'px-3 py-2',
                    active ? 'bg-white/15 text-white font-medium' : 'text-white/60 hover:text-white hover:bg-white/8'
                  )}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {!collapsed && item.label}
                </Link>
              )
            })}
          </>
        )}
      </nav>

      <div className={`border-t border-white/10 ${collapsed ? 'px-3 py-3 flex justify-center' : 'p-3'}`}>
        {collapsed ? (
          <button onClick={handleLogout} className="text-white/30 hover:text-white transition-colors" title="Sair">
            <LogOut className="w-4 h-4" />
          </button>
        ) : (
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
              style={{ backgroundColor: user?.avatar_color ?? '#185FA5' }}>
              {getInitials(user?.name ?? 'U')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.name ?? '—'}</p>
              <p className="text-[10px] text-white/35 truncate">
                {user?.role === 'admin' ? 'Administrador' : 'Vendedor'}
              </p>
            </div>
            <button onClick={handleLogout} className="text-white/30 hover:text-white transition-colors" title="Sair">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
