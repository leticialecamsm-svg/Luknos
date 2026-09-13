import { requireFinanceiroProfile } from '@/lib/financeiro-ia/auth'
import { EmConstrucao } from '@/components/financeiro-ia/EmConstrucao'

export default async function Page() {
  await requireFinanceiroProfile()
  return (
    <EmConstrucao
      title="Configurações"
      description="Contas bancárias, categorias, fornecedores, centros de custo, recorrências e o valor de corte da aprovação."
    />
  )
}
