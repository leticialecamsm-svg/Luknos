import { listProposals } from '@/lib/proposals/actions'
import { ProposalsList } from '@/components/proposals/ProposalsList'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Orçamento de Produtos — Luknos' }

export default async function Page() {
  const data = await listProposals()
  if ('error' in data) return <p className="text-sm text-red-600">{data.error}</p>
  return <ProposalsList proposals={data.proposals} />
}
