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
            <svg className="w-8 h-8" viewBox="0 0 201 175" xmlns="http://www.w3.org/2000/svg">
              <path d="M0 93.5108C19.7295 95.568 42.4118 100.348 55.9324 111.344C69.3309 121.392 79.2522 141.777 86.4781 156.623C91.3862 166.707 95.0507 174.237 97.7168 174.237C101.259 174.237 102.414 170.092 104.278 163.403C106.904 153.98 110.938 139.507 125.037 124.468C140.037 109.255 152.09 102.33 153.965 101.973C151.62 94.4469 144.319 97.5756 144.319 97.5756C144.319 97.5756 140.669 98.6187 137.09 100.897C134.835 102.334 132.814 103.58 130.922 104.747C121.278 110.697 114.958 114.596 97.7168 131.165C97.0372 128.215 97.3339 124.97 97.6406 121.614C99.0937 105.722 100.772 87.361 0 86.2582V93.5108Z" fill="#001A3C"/>
              <path d="M200.115 85.3726C183.762 82.7467 165.563 77.1312 152.626 65.4878C140.825 56.6367 129.202 39.0534 119.472 24.3335C110.652 10.9903 103.388 3.04137e-08 98.955 3.04137e-08C93.7376 -0.000461065 92.2749 5.24204 90.0089 13.3636C87.2639 23.2019 83.34 37.2652 70.1346 51.351C55.1351 66.5648 48.7062 69.5645 45.7599 70.9035C45.7599 70.9035 58.8671 72.2477 62.3497 70.9035C74.2881 66.2954 82.9049 56.2281 90.5988 47.2389C92.5618 44.9455 94.4648 42.7222 96.3475 40.6777L98.9537 48.2933C99.3425 49.9807 99.5955 51.6879 99.8497 53.4028C102.087 68.4957 104.413 84.19 200.115 92.267V85.3726Z" fill="#CBA455"/>
            </svg>
            <div>
              <p className="font-semibold text-sm text-white leading-tight">Luknos</p>
              <p className="text-xs text-white/40 leading-tight">Iluminação</p>
            </div>
          </div>
        )}
        {collapsed && (
          <svg className="w-6 h-6" viewBox="0 0 201 175" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 93.5108C19.7295 95.568 42.4118 100.348 55.9324 111.344C69.3309 121.392 79.2522 141.777 86.4781 156.623C91.3862 166.707 95.0507 174.237 97.7168 174.237C101.259 174.237 102.414 170.092 104.278 163.403C106.904 153.98 110.938 139.507 125.037 124.468C140.037 109.255 152.09 102.33 153.965 101.973C151.62 94.4469 144.319 97.5756 144.319 97.5756C144.319 97.5756 140.669 98.6187 137.09 100.897C134.835 102.334 132.814 103.58 130.922 104.747C121.278 110.697 114.958 114.596 97.7168 131.165C97.0372 128.215 97.3339 124.97 97.6406 121.614C99.0937 105.722 100.772 87.361 0 86.2582V93.5108Z" fill="#001A3C"/>
            <path d="M200.115 85.3726C183.762 82.7467 165.563 77.1312 152.626 65.4878C140.825 56.6367 129.202 39.0534 119.472 24.3335C110.652 10.9903 103.388 3.04137e-08 98.955 3.04137e-08C93.7376 -0.000461065 92.2749 5.24204 90.0089 13.3636C87.2639 23.2019 83.34 37.2652 70.1346 51.351C55.1351 66.5648 48.7062 69.5645 45.7599 70.9035C45.7599 70.9035 58.8671 72.2477 62.3497 70.9035C74.2881 66.2954 82.9049 56.2281 90.5988 47.2389C92.5618 44.9455 94.4648 42.7222 96.3475 40.6777L98.9537 48.2933C99.3425 49.9807 99.5955 51.6879 99.8497 53.4028C102.087 68.4957 104.413 84.19 200.115 92.267V85.3726Z" fill="#CBA455"/>
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
