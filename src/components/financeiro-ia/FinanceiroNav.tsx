'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, CalendarRange, CalendarDays, FileBarChart, ArrowDownCircle, ArrowUpCircle,
  ShoppingCart, Upload, ClipboardCheck, FileSpreadsheet, Settings, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { isGestor, type FinanceiroProfile } from '@/lib/financeiro-ia/types'

// Rotas de docs/PAGINAS.md, prefixadas com /financeiro-ia (módulo novo,
// separado do /finance legado enquanto os dois convivem).
const NAV: { href: string; label: string; icon: any; gestorOnly?: boolean }[] = [
  { href: '/financeiro-ia', label: 'Caixa do dia', icon: LayoutDashboard },
  { href: '/financeiro-ia/fluxo-semanal', label: 'Fluxo semanal', icon: CalendarRange },
  { href: '/financeiro-ia/visao-mensal', label: 'Visão mensal', icon: CalendarDays },
  { href: '/financeiro-ia/dre', label: 'DRE', icon: FileBarChart },
  { href: '/financeiro-ia/contas-a-pagar', label: 'Contas a pagar', icon: ArrowUpCircle },
  { href: '/financeiro-ia/contas-a-receber', label: 'Contas a receber', icon: ArrowDownCircle },
  { href: '/financeiro-ia/vendas', label: 'Vendas', icon: ShoppingCart },
  { href: '/financeiro-ia/importar-csv', label: 'Importar CSV', icon: Upload, gestorOnly: true },
  { href: '/financeiro-ia/aprovacoes', label: 'Aprovações', icon: ClipboardCheck, gestorOnly: true },
  { href: '/financeiro-ia/relatorios', label: 'Relatórios', icon: FileSpreadsheet },
  { href: '/financeiro-ia/configuracoes', label: 'Configurações', icon: Settings, gestorOnly: true },
]

export function FinanceiroNav({ profile }: { profile: FinanceiroProfile }) {
  const pathname = usePathname()
  const gestor = isGestor(profile)
  const items = NAV.filter(i => !i.gestorOnly || gestor)

  return (
    <aside className="w-60 shrink-0 h-full flex flex-col border-r border-surface-border bg-white shadow-[rgba(10,31,59,0.08)_8px_0_24px_-16px]">
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-brand-500" />
          <span className="font-bold text-gray-900 leading-tight">Luknos<br />Financeiro</span>
        </div>
        <p className="text-[11px] text-gray-400 mt-2">Fase 1 · fundação</p>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 space-y-0.5">
        {items.map(item => {
          const active = pathname === item.href
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href}
              className={cn('flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                active ? 'bg-navy text-white shadow-[0_8px_20px_-8px_rgba(10,31,59,0.45)]' : 'text-gray-600 hover:bg-surface-secondary hover:text-gray-900')}>
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="px-4 py-4 border-t border-surface-border">
        <p className="text-xs font-medium text-gray-700 truncate">{profile.full_name}</p>
        <p className="text-[11px] text-gray-400 capitalize">{profile.role.replace(/_/g, ' ')}</p>
      </div>
      <Link href="/dashboard" className="px-4 py-3 border-t border-surface-border text-xs text-gray-400 hover:text-brand-600">
        ← Voltar pro Luknos
      </Link>
    </aside>
  )
}
