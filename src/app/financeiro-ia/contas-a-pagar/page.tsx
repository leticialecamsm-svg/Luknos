import { requireFinanceiroProfile } from '@/lib/financeiro-ia/auth'
import { EmConstrucao } from '@/components/financeiro-ia/EmConstrucao'

export default async function Page() {
  await requireFinanceiroProfile()
  return (
    <EmConstrucao
      title="Contas a pagar"
      description="Lista e filtro dos lançamentos a pagar: fornecedor, categoria, vencimento, status. Anexo de nota fiscal e marcar como pago."
    />
  )
}
