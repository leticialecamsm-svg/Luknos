import { requireFinanceiroProfile } from '@/lib/financeiro-ia/auth'
import { EmConstrucao } from '@/components/financeiro-ia/EmConstrucao'

export default async function CaixaDoDiaPage() {
  const profile = await requireFinanceiroProfile()
  return (
    <EmConstrucao
      title={`Bom dia, ${profile.full_name.split(' ')[0]}`}
      description="Painel de caixa do dia (RF-01): saldo consolidado, o que vence hoje, o que tem a receber hoje e o sobra/falta. Chega na Fase 2, junto das contas bancárias e dos primeiros lançamentos."
    />
  )
}
