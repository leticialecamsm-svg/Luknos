import { requireFinanceiroProfile } from '@/lib/financeiro-ia/auth'
import { EmConstrucao } from '@/components/financeiro-ia/EmConstrucao'

export default async function Page() {
  await requireFinanceiroProfile()
  return (
    <EmConstrucao
      title="Fluxo semanal"
      description={'Saldo inicial, entradas e saídas previstas e saldo final dia a dia — responde "quanto sobra se pagar todos os boletos essa semana" (RF-02).'}
    />
  )
}
