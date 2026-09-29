import { redirect } from 'next/navigation'

// A emissão em si (Fase 2/3) ainda não existe — por ora /fiscal leva direto
// para a configuração, que é o que a Fase 1 entrega.
export default function Page() {
  redirect('/fiscal/configuracoes')
}
