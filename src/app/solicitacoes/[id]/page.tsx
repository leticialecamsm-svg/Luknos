import { notFound } from 'next/navigation'
import { getSolicitation } from '@/lib/solicitations/actions'
import { getQuoteById, getQuoteActivities } from '@/lib/actions'
import { SolicitationDetail } from '@/components/solicitations/SolicitationDetail'

export default async function SolicitationDetailPage({ params, searchParams }: { params: { id: string }; searchParams?: { tab?: string } }) {
  const solicitation = await getSolicitation(params.id)
  if (!solicitation) notFound()

  // Lote 1: reaproveita o QuoteDetail cheio pro primeiro orçamento vinculado
  // (uma Solicitação pode ter mais de um orçamento; escolher entre eles fica
  // pro Lote 2).
  const primaryQuoteId = solicitation.quotes[0]?.id ?? null
  const [primaryQuote, primaryQuoteActivities] = primaryQuoteId
    ? await Promise.all([getQuoteById(primaryQuoteId), getQuoteActivities(primaryQuoteId)])
    : [null, []]

  return (
    <SolicitationDetail
      solicitation={solicitation}
      initialTab={searchParams?.tab}
      primaryQuote={primaryQuote}
      primaryQuoteActivities={primaryQuoteActivities}
    />
  )
}
