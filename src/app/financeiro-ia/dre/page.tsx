import { requireFinanceiroProfile } from '@/lib/financeiro-ia/auth'
import { EmConstrucao } from '@/components/financeiro-ia/EmConstrucao'

export default async function Page() {
  await requireFinanceiroProfile()
  return (
    <EmConstrucao
      title="DRE simplificado"
      description="Receita das vendas fechadas, despesas por categoria e centro de custo, resultado do período — com gráfico de pizza por categoria."
    />
  )
}
