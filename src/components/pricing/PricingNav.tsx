'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/pricing', label: 'Cotar', exact: true },
  { href: '/pricing/precos', label: 'Preços', soon: true },
  { href: '/pricing/comparar', label: 'Comparar', soon: true },
  { href: '/pricing/importar', label: 'Importar planilha' },
]

export function PricingNav() {
  const pathname = usePathname()
  return (
    <div className="flex items-center gap-1 border-b border-surface-border mb-6">
      {TABS.map(t => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href)
        if (t.soon) {
          return (
            <span key={t.href} title="Em breve" className="px-4 py-2.5 text-sm font-medium text-gray-300 cursor-not-allowed">
              {t.label} <span className="text-[10px] uppercase tracking-wide">em breve</span>
            </span>
          )
        }
        return (
          <Link key={t.href} href={t.href}
            className={cn('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              active ? 'border-navy text-navy' : 'border-transparent text-gray-500 hover:text-gray-800')}>
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
