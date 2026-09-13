import { requireFinanceiroProfile } from '@/lib/financeiro-ia/auth'
import { EmConstrucao } from '@/components/financeiro-ia/EmConstrucao'

export default async function Page() {
  await requireFinanceiroProfile()
  return (
    <EmConstrucao
      title="Aprovações"
      description="Fila de lançamentos acima do valor de corte, aguardando aprovação da gestora ou de quem tiver a permissão."
    />
  )
}
