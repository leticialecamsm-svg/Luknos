import { notFound } from 'next/navigation'
import { getProposal } from '@/lib/proposals/actions'
import { ProposalEditor } from '@/components/proposals/ProposalEditor'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { id: string } }) {
  const data = await getProposal(params.id)
  return { title: 'proposal' in data ? `Orçamento ${data.proposal.number} — Luknos` : 'Orçamento — Luknos' }
}

export default async function Page({ params }: { params: { id: string } }) {
  const data = await getProposal(params.id)
  if ('error' in data) notFound()
  return <ProposalEditor initial={data.proposal} />
}
