// Tipos e helpers puros do Luknos Financeiro (sem next/headers) — seguros
// pra importar tanto em Server Components quanto em Client Components.
export type FinanceiroProfile = {
  id: string
  full_name: string
  email: string
  role: 'gestora' | 'socio_gestor' | 'colaborador_logistica' | 'colaborador_venda' | 'colaborador'
  can_approve: boolean
}

export const isGestor = (p: FinanceiroProfile) => p.role === 'gestora' || p.role === 'socio_gestor'
