import { notFound } from 'next/navigation'
import { getSolicitation } from '@/lib/solicitations/actions'
import { getQuoteById, getQuoteActivities, getQuoteProposals } from '@/lib/actions'
import { SolicitationDetail } from '@/components/solicitations/SolicitationDetail'

export default async function SolicitationDetailPage({ params, searchParams }: { params: { id: string }; searchParams?: { tab?: string } }) {
  const solicitation = await getSolicitation(params.id)
  if (!solicitation) notFound()

  const primaryQuoteId = solicitation.quotes[0]?.id ?? null
  const [primaryQuoteRaw, primaryQuoteActivities, primaryQuoteProposals] = primaryQuoteId
    ? await Promise.all([
        getQuoteById(primaryQuoteId),
        getQuoteActivities(primaryQuoteId),
        getQuoteProposals(primaryQuoteId),
      ])
    : [null, [], []]

  // Enriquece primaryQuote com as proposals para bigMetric usar a mais recente
  // como "valor orçado" quando quoted_value estiver vazio.
  const primaryQuote = primaryQuoteRaw
    ? { ...primaryQuoteRaw, proposals: primaryQuoteProposals ?? [] }
    : null

  return (
    <SolicitationDetail
      solicitation={solicitation}
      initialTab={searchParams?.tab}
      primaryQuote={primaryQuote}
      primaryQuoteActivities={primaryQuoteActivities}
    />
  )
}
