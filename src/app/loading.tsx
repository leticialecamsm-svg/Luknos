import { AppShellLoader } from '@/components/ui/PageLoader'

// Ao trocar de seção (ex: Dashboard → Orçamentos) o layout inteiro é
// remontado, então a tela de carregamento precisa desenhar o menu também.
export default function Loading() {
  return <AppShellLoader />
}
