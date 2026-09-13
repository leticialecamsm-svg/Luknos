import { requireFinanceiroProfile } from '@/lib/financeiro-ia/auth'
import { EmConstrucao } from '@/components/financeiro-ia/EmConstrucao'

export default async function Page() {
  await requireFinanceiroProfile()
  return (
    <EmConstrucao
      title="Importar CSV do Master Lojista"
      description="Upload do CSV de boletos, com deduplicação automática e histórico de importações."
    />
  )
}
