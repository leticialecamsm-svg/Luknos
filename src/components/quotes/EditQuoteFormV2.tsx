'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateQuote } from '@/lib/actions'
import { useToast } from '@/components/ui/Toast'
import { Avatar } from '@/components/ui/Avatar'
import { ContactSearch } from './EditQuoteForm'
import { QuoteTasks } from './QuoteTasks'
import { QuoteSchedules } from './QuoteSchedules'
import { ChevronLeft, Loader2, X } from 'lucide-react'
import { QUOTE_STATUS_LABEL, STATUS_COLOR } from '@/types'
import { cn } from '@/lib/utils'
import { OptionPills, CATEGORY_OPTS, SIZE_OPTS, ORIGIN_OPTS, STAGE_OPTS, PRIORITY_OPTS } from './OptionPills'

// Edição com o MESMO layout da tela de visualização (header + grid 2 colunas)
export function EditQuoteFormV2({ quote, users, currentUserId }: any) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [selectedClient, setSelectedClient] = useState<any>({ id: quote.client_id, name: quote.client_name })
  const [selectedArch, setSelectedArch] = useState<any>(
    quote.architect_id ? { id: quote.architect_id, name: quote.architect_name } : null
  )

  const currentPrimary = quote.owners?.find((o: any) => o.role === 'primary')?.user_id ?? null
  const [primaryOwner, setPrimaryOwner] = useState<string | null>(currentPrimary)
  const [collaborators, setCollaborators] = useState<string[]>(
    quote.owners?.filter((o: any) => o.role === 'collaborator').map((o: any) => o.user_id) ?? []
  )

  function toggleCollab(uid: string) {
    setCollaborators(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid])
  }

  const statusC = STATUS_COLOR[quote.status as keyof typeof STATUS_COLOR]

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await updateQuote(quote.id, {
        client_id:        selectedClient?.id,
        architect_id:     selectedArch?.id || null,
        origin:           fd.get('origin') as string,
        category:         fd.get('category') as string,
        size:             fd.get('size') as string || null,
        work_stage:       fd.get('work_stage') as string || null,
        priority:         fd.get('priority') as string,
        deadline:         fd.get('deadline') as string || null,
        quote_date:       fd.get('quote_date') as string || null,
        quoted_value:     fd.get('quoted_value') ? Number(fd.get('quoted_value')) : null,
        notes:            fd.get('notes') as string || null,
        drive_link:       fd.get('drive_link') as string || null,
        primary_owner_id: primaryOwner,
        collaborator_ids: collaborators,
      })
      if (res.error) { setError(res.error); toast.error('OCORREU UM ERRO', 'Não foi possível salvar.'); return }
      toast.success('TUDO CERTO!', 'Orçamento atualizado.')
      router.push(`/quotes/${quote.id}`)
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Top bar — igual à visualização */}
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => router.push(`/quotes/${quote.id}`)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeft className="w-4 h-4" /> Orçamentos
        </button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => router.push(`/quotes/${quote.id}`)} className="btn-secondary text-xs py-1.5">
            <X className="w-3.5 h-3.5" /> Cancelar
          </button>
          <button type="submit" disabled={pending} className="btn-primary text-xs py-1.5">
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        {/* Coluna esquerda */}
        <div className="space-y-4">
          {/* Header card — mesma cara da visualização, mas editável */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">#{String(quote.number).padStart(3,'0')}</span>
              {statusC && (
                <span className={cn('badge', statusC.bg, statusC.text)}>
                  {QUOTE_STATUS_LABEL[quote.status as keyof typeof QUOTE_STATUS_LABEL]}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ContactSearch label="Cliente" required placeholder="Buscar ou criar cliente..."
                initialValue={{ id: quote.client_id, name: quote.client_name }} onSelect={setSelectedClient} />
              <ContactSearch label="Parceiro" placeholder="Buscar ou criar parceiro..." type="architect"
                initialValue={quote.architect_id ? { id: quote.architect_id, name: quote.architect_name } : null}
                onSelect={setSelectedArch} />
            </div>

            <div className="border-t border-surface-border pt-4 space-y-4">
              <OptionPills name="category" label="Categoria" defaultValue={quote.category} options={CATEGORY_OPTS} />
              <OptionPills name="size" label="Tamanho" defaultValue={quote.size ?? ''} options={SIZE_OPTS} allowEmpty />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Prazo</label>
                  <input type="date" name="deadline" defaultValue={quote.deadline ?? ''} className="input mt-1" />
                </div>
                <div>
                  <label className="label">Valor orçado (R$)</label>
                  <input type="number" name="quoted_value" step="0.01" min="0" defaultValue={quote.quoted_value ?? ''} className="input mt-1" />
                </div>
              </div>
            </div>
          </div>

          {/* Detalhes */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Detalhes</h2>
            <OptionPills name="origin" label="Origem" defaultValue={quote.origin} options={ORIGIN_OPTS} />
            <OptionPills name="work_stage" label="Etapa da obra" defaultValue={quote.work_stage ?? ''} options={STAGE_OPTS} allowEmpty />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <OptionPills name="priority" label="Prioridade" defaultValue={quote.priority} options={PRIORITY_OPTS} />
              <div>
                <label className="label">Data do orçamento</label>
                <input type="date" name="quote_date"
                  defaultValue={quote.quote_date ?? quote.created_at?.split('T')[0] ?? ''} className="input mt-1" />
              </div>
            </div>
            <div>
              <label className="label">Observações</label>
              <textarea name="notes" rows={3} defaultValue={quote.notes ?? ''} className="input resize-none mt-1" />
            </div>
            <div>
              <label className="label">Pasta Google Drive <span className="text-gray-400 font-normal">(opcional)</span></label>
              <input type="url" name="drive_link" placeholder="https://drive.google.com/drive/folders/..."
                defaultValue={quote.drive_link ?? ''} className="input mt-1" />
            </div>
          </div>

          {/* Responsáveis */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Responsáveis</h2>
            <div>
              <label className="label">Responsável primário</label>
              <div className="flex flex-wrap gap-2 mt-1">
                <button type="button" onClick={() => setPrimaryOwner(null)}
                  className={cn('px-3 py-1.5 rounded-full text-sm border transition-all',
                    primaryOwner === null ? 'bg-gray-500 text-white border-gray-500' : 'bg-white text-gray-500 border-surface-border hover:border-gray-400')}>
                  Nenhum
                </button>
                {users.map((u: any) => (
                  <button key={u.id} type="button"
                    onClick={() => { setPrimaryOwner(u.id); setCollaborators(prev => prev.filter(id => id !== u.id)) }}
                    className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-all',
                      primaryOwner === u.id ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-surface-border hover:border-brand-300')}>
                    <Avatar user={u} size={20} /> {u.name.split(' ')[0]}
                    {u.id === currentUserId && <span className="text-[10px] opacity-70">(você)</span>}
                  </button>
                ))}
              </div>
            </div>
            {primaryOwner && (
              <div>
                <label className="label">Colaboradores</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {users.filter((u: any) => u.id !== primaryOwner).map((u: any) => (
                    <button key={u.id} type="button" onClick={() => toggleCollab(u.id)}
                      className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-all',
                        collaborators.includes(u.id) ? 'bg-gray-600 text-white border-gray-600' : 'bg-white text-gray-600 border-surface-border hover:border-gray-400')}>
                      <Avatar user={u} size={20} /> {u.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">{error}</p>}

          {/* Ações (rodapé) */}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="btn-primary">
              {pending && <Loader2 className="w-4 h-4 animate-spin" />} Salvar alterações
            </button>
            <button type="button" onClick={() => router.push(`/quotes/${quote.id}`)} className="btn-secondary">Cancelar</button>
          </div>
        </div>

        {/* Coluna direita — igual à visualização */}
        <div className="sticky top-4 space-y-4">
          <QuoteTasks quoteId={quote.id} quoteLabel={`#${quote.number} · ${quote.client_name}`} />
          <QuoteSchedules quoteId={quote.id} quoteLabel={`#${quote.number} · ${quote.client_name}`} />
        </div>
      </div>
    </form>
  )
}
