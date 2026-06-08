import { notFound } from 'next/navigation'
import { getQuoteById, getQuoteActivities } from '@/lib/actions'
import { QuoteDetail } from '@/components/quotes/QuoteDetail'

export default async function QuoteDetailPage({ params }: { params: { id: string } }) {
  const [quote, activities] = await Promise.all([
    getQuoteById(params.id),
    getQuoteActivities(params.id),
  ])

  if (!quote) notFound()

  return <QuoteDetail quote={quote} activities={activities} />
}
