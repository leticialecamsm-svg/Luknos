import { notFound } from 'next/navigation'
import { getProposal } from '@/lib/proposals/actions'
import { printOptions, proposalCode } from '@/lib/proposals/calc'
import { ProposalPrint } from '@/components/proposals/ProposalPrint'

export const dynamic = 'force-dynamic'

// O título vira o nome do arquivo ao "Salvar como PDF".
export async function generateMetadata({ params }: { params: { id: string } }) {
  const data = await getProposal(params.id)
  if ('error' in data) return { title: 'Orçamento' }
  const p = data.proposal
  return { title: `Orçamento ${proposalCode(p.number)}${p.client_name ? ` - ${p.client_name}` : ''} - Luknos` }
}

// ?o=images,prices,... sobrepõe as opções salvas (vem do botão "Imprimir PDF" do editor)
export default async function Page({ params, searchParams }: { params: { id: string }; searchParams: { o?: string; auto?: string } }) {
  const data = await getProposal(params.id)
  if ('error' in data) notFound()
  let options = data.proposal.print_options
  if (typeof searchParams.o === 'string') {
    const on = new Set(searchParams.o.split(','))
    options = printOptions(Object.fromEntries(Object.keys(options).map(k => [k, on.has(k)])))
  }
  return <ProposalPrint proposal={data.proposal} initialOptions={options} autoPrint={searchParams.auto === '1'} />
}
