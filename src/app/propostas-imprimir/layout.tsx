import { redirect } from 'next/navigation'
import { requirePageAccess } from '@/lib/access'

// Página de impressão do Orçamento de Produtos: sem menu nem cabeçalho, só a folha.
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const { profile, allowedPages } = await requirePageAccess('/propostas')
  if (profile.role !== 'admin') redirect(allowedPages?.[0] ?? '/dashboard')
  return <>{children}</>
}
