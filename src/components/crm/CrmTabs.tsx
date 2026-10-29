'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ActingAsBanner, ActingAsSelect, useActingContext } from './ActingAsBar'
import { FollowupNotifier } from './FollowupNotifier'

const TABS = [
  { href: '/crm', label: 'Quadro' },
  { href: '/crm/conversas', label: 'Conversas' },
  { href: '/crm/metricas-trafego', label: 'Métricas do tráfego', adminOnly: true },
]

export function CrmTabs() {
  const pathname = usePathname()
  const acting = useActingContext()
  return (
    <>
    <ActingAsBanner ctx={acting} />
    <nav aria-label="CRM" className="flex items-center gap-1 mb-2 border-b border-gray-200 min-w-0">
      {TABS.filter((t) => !t.adminOnly || acting?.can_act || pathname.startsWith(t.href)).map((t) => {
        const active = t.href === '/crm' ? pathname === '/crm' : pathname.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'shrink-0 px-3 max-sm:px-2 py-1.5 text-sm font-medium -mb-px border-b-2',
              active ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800',
            )}
          >
            {t.label}
          </Link>
        )
      })}
      <div className="ml-auto flex items-center gap-2 pb-1 min-w-0">
        {/* a tela de Conversas põe aqui o filtro de etiquetas */}
        <div id="crm-tabs-slot" className="contents" />
        <ActingAsSelect ctx={acting} />
        <FollowupNotifier />
      </div>
    </nav>
    </>
  )
}
