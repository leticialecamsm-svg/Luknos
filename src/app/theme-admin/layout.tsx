import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAdmin } from '@/lib/theme-admin/actions'

export default async function ThemeAdminLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = await requireAdmin()
  if (!isAdmin) redirect('/dashboard')

  return (
    <div className="max-w-5xl mx-auto p-6">
      <nav className="flex gap-1 border-b border-gray-200 mb-6">
        {[
          { href: '/theme-admin', label: 'Painel' },
          { href: '/theme-admin/tokens', label: 'Tokens' },
          { href: '/theme-admin/components', label: 'Componentes' },
          { href: '/theme-admin/progress', label: 'Progresso' },
        ].map(item => (
          <Link
            key={item.href}
            href={item.href}
            className="px-4 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-900 border-b-2 border-transparent hover:border-brand-500 transition-colors"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  )
}
