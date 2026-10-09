'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ActingAsBar } from './ActingAsBar'

const TABS = [
  { href: '/crm', label: 'Quadro' },
  { href: '/crm/conversas', label: 'Conversas' },
]

export function CrmTabs() {
  const pathname = usePathname()
  return (
    <>
    <ActingAsBar />
    <nav aria-label="CRM" className="flex gap-1 mb-3 border-b border-gray-200">
      {TABS.map((t) => {
        const active = t.href === '/crm' ? pathname === '/crm' : pathname.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'px-4 py-2 text-sm font-medium -mb-px border-b-2',
              active ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800',
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
    </>
  )
}
