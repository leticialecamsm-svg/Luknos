'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Copy, FileText, Loader2, Plus, Printer, Search, Trash2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/useConfirm'
import { createProposal, deleteProposal, duplicateProposal, type ProposalSummary } from '@/lib/proposals/actions'
import { brl, proposalCode } from '@/lib/proposals/calc'
import { normText } from '@/lib/pricing/synonyms'

export function ProposalsList({ proposals }: { proposals: ProposalSummary[] }) {
  const router = useRouter()
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const shown = useMemo(() => {
    const t = normText(q.trim())
    if (!t) return proposals
    return proposals.filter(p => normText(`${p.number} ${p.client_name} ${p.architect_name ?? ''}`).includes(t))
  }, [q, proposals])

  async function run(key: string, fn: () => Promise<{ id: string } | { error: string }>) {
    setBusy(key)
    const r = await fn()
    if ('error' in r) { toast.error('Não deu certo', r.error); setBusy(null); return }
    startTransition(() => router.push(`/propostas/${r.id}`))
  }

  async function remove(p: ProposalSummary) {
    if (!(await confirm(`Excluir o orçamento ${proposalCode(p.number)}${p.client_name ? ` de ${p.client_name}` : ''}?`, 'Excluir'))) return
    setBusy(p.id)
    const r = await deleteProposal(p.id)
    setBusy(null)
    if ('error' in r) toast.error('Não deu para excluir', r.error)
    else router.refresh()
  }

  return (
    <div className="space-y-4">
      {ConfirmDialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Orçamento de Produtos</h1>
          <p className="text-sm text-gray-500">Monte o orçamento com os produtos dos fornecedores, por ambiente, e gere o PDF para o cliente.</p>
        </div>
        <button className="btn-primary" disabled={busy === 'new'} onClick={() => run('new', createProposal)}>
          {busy === 'new' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Novo orçamento
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input className="input pl-9" placeholder="Buscar por número, cliente ou arquiteto" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {shown.length === 0 ? (
        <div className="card p-10 text-center text-sm text-gray-500">
          <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          {proposals.length ? 'Nenhum orçamento encontrado.' : 'Nenhum orçamento ainda. Clique em “Novo orçamento” para começar.'}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500 border-b border-surface-border">
              <tr>
                <th className="px-4 py-2.5 font-medium">Nº</th>
                <th className="px-4 py-2.5 font-medium">Cliente</th>
                <th className="px-4 py-2.5 font-medium hidden md:table-cell">Arquiteto</th>
                <th className="px-4 py-2.5 font-medium hidden sm:table-cell">Data</th>
                <th className="px-4 py-2.5 font-medium hidden lg:table-cell">Itens</th>
                <th className="px-4 py-2.5 font-medium text-right">Total</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {shown.map(p => (
                <tr key={p.id} className="border-b border-surface-border last:border-0 hover:bg-surface-secondary/60 cursor-pointer"
                  onClick={() => router.push(`/propostas/${p.id}`)}>
                  <td className="px-4 py-3 font-mono text-gray-500">{proposalCode(p.number)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{p.client_name || <span className="text-gray-400 font-normal">Sem cliente</span>}</td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{p.architect_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{format(parseISO(p.proposal_date), 'dd/MM/yyyy')}</td>
                  <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{p.items} {p.items === 1 ? 'item' : 'itens'} · {p.rooms} {p.rooms === 1 ? 'ambiente' : 'ambientes'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">{brl(p.total)}</td>
                  <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-end gap-0.5">
                      {busy === p.id || busy === `dup-${p.id}` ? <Loader2 className="w-4 h-4 animate-spin text-gray-400 m-1.5" /> : <>
                        <Link href={`/propostas-imprimir/${p.id}`} target="_blank" title="Imprimir PDF" className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"><Printer className="w-4 h-4" /></Link>
                        <button title="Duplicar" onClick={() => run(`dup-${p.id}`, () => duplicateProposal(p.id))} className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"><Copy className="w-4 h-4" /></button>
                        <button title="Excluir" onClick={() => remove(p)} className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
