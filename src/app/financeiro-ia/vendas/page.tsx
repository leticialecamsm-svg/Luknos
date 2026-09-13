import { requireFinanceiroProfile } from '@/lib/financeiro-ia/auth'
import { EmConstrucao } from '@/components/financeiro-ia/EmConstrucao'

export default async function Page() {
  await requireFinanceiroProfile()
  return (
    <EmConstrucao
      title="Vendas"
      description="Registro das vendas fechadas que alimentam o contas a receber. Na Fase 2 avaliamos puxar direto de Orçamentos/Negociações em vez de redigitar."
    />
  )
}
