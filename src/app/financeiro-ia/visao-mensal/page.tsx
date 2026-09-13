import { requireFinanceiroProfile } from '@/lib/financeiro-ia/auth'
import { EmConstrucao } from '@/components/financeiro-ia/EmConstrucao'

export default async function Page() {
  await requireFinanceiroProfile()
  return (
    <EmConstrucao
      title="Visão mensal"
      description="Total a pagar e a receber do mês, e a meta implícita de quanto precisamos vender para fechar no positivo."
    />
  )
}
