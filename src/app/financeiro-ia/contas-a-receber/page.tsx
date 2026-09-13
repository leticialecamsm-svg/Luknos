import { requireFinanceiroProfile } from '@/lib/financeiro-ia/auth'
import { EmConstrucao } from '@/components/financeiro-ia/EmConstrucao'

export default async function Page() {
  await requireFinanceiroProfile()
  return (
    <EmConstrucao
      title="Contas a receber"
      description="Alimentada pelas vendas fechadas — o objetivo é acabar com o relançamento manual que hoje isola o financeiro do resto do Luknos."
    />
  )
}
