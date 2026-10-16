import { redirect } from 'next/navigation'

// A listagem agora vive na tela inicial; mantém links antigos funcionando.
export default function SolicitacoesListaPage({ searchParams }: { searchParams?: { etapa?: string } }) {
  redirect(searchParams?.etapa ? `/solicitacoes?etapa=${encodeURIComponent(searchParams.etapa)}` : '/solicitacoes')
}
