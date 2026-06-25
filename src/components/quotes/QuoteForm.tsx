'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateQuote, createQuote } from '@/lib/actions'
import { useToast } from '@/components/ui/Toast'
import { Avatar } from '@/components/ui/Avatar'
import { ContactSearch } from './EditQuoteForm'
import { QuoteTasks } from './QuoteTasks'
import { QuoteSchedules } from './QuoteSchedules'
import { ChevronLeft, Loader2, X } from 'lucide-react'
import { QUOTE_STATUS_LABEL, STATUS_COLOR } from '@/types'
import { cn } from '@/lib/utils'
import { OptionPills, TagSelect, CATEGORY_OPTS, SIZE_OPTS, ORIGIN_OPTS, STAGE_OPTS, PRIORITY_OPTS } from './OptionPills'

// Form unificado de criação E edição, no layout da tela de visualização.
export function QuoteForm({ quote, users, currentUserId, inModal, onCancel, onSuccess }: {
  quote?: any; users: any[]; currentUserId: string
  inModal?: boolean
  onCancel?: () => void
  onSuccess?: (id?: string) => void
}) {
  const router = useRouter()
  const toast = useToast()
  const isEdit = !!quote?.id
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [selectedClient, setSelectedClient] = useState<any>(
    isEdit ? { id: quote.client_id, name: quote.client_name } : null
  )
  const [selectedArch, setSelectedArch] = useState<any>(
    quote?.architect_id ? { id: quote.architect_id, name: quote.architect_name } : null
  )

  const currentPrimary = isEdit ? (quote.owners?.find((o: any) => o.role === 'primary')?.user_id ?? null) : null
  const [primaryOwner, setPrimaryOwner] = useState<string | null>(currentPrimary)
  const [collaborators, setCollaborators] = useState<string[]>(
    quote?.owners?.filter((o: any) => o.role === 'collaborator').map((o: any) => o.user_id) ?? []
  )

  function toggleCollab(uid: string) {
    setCollaborators(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid])
  }

  const statusC = isEdit ? STATUS_COLOR[quote.status as keyof typeof STATUS_COLOR] : null
  const backTo = isEdit ? `/quotes/${quote.id}` : '/quotes'

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!selectedClient?.id) { setError('Selecione o cliente'); return }
    const fd = new FormData(e.currentTarget)
    const payload = {
      client_id:        selectedClient.id,
      architect_id:     selectedArch?.id || null,
      origin:           fd.get('origin') as string,
      category:         fd.get('category') as string,
      size:             (fd.get('size') as string) || null,
      work_stage:       (fd.get('work_stage') as string) || null,
      priority:         fd.get('priority') as string,
      deadline:         (fd.get('deadline') as string) || null,
      quote_date:       (fd.get('quote_date') as string) || null,
      quoted_value:     fd.get('quoted_value') ? Number(fd.get('quoted_value')) : null,
      notes:            (fd.get('notes') as string) || null,
      drive_link:       (fd.get('drive_link') as string) || null,
      primary_owner_id: primaryOwner,
      collaborator_ids: collaborators,
    }
    startTransition(async () => {
      if (isEdit) {
        const res = await updateQuote(quote.id, payload)
        if (res.error) { setError(res.error); toast.error('OCORREU UM ERRO', 'Não foi possível salvar.'); return }
        toast.success('TUDO CERTO!', 'Orçamento atualizado.')
        router.push(`/quotes/${quote.id}`); router.refresh()
      } else {
        const res = await createQuote(payload as any)
        if (res.error) { setError(res.error); toast.error('OCORREU UM ERRO', 'Não foi possível criar.'); return }
        toast.success('TUDO CERTO!', 'Orçamento criado.')
        if (onSuccess) onSuccess(res.data?.id)
        else { router.push(`/quotes/${res.data?.id}`); router.refresh() }
      }
    })
  }

  const today = new Date().toISOString().split('T')[0]

  const cancel = () => { if (onCancel) onCancel(); else router.push(backTo) }

  return (
    <form onSubmit={handleSubmit}>
      {/* Top bar — escondida quando em modal (o modal tem seu próprio cabeçalho) */}
      {!inModal && (
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => router.push(backTo)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
            <ChevronLeft className="w-4 h-4" /> Orçamentos
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={cancel} className="btn-secondary text-xs py-1.5">
              <X className="w-3.5 h-3.5" /> Cancelar
            </button>
            <button type="submit" disabled={pending} className="btn-primary text-xs py-1.5">
              {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {isEdit ? 'Salvar' : 'Criar orçamento'}
            </button>
          </div>
        </div>
      )}

      <div className={cn('grid grid-cols-1 gap-4 items-start', !inModal && 'mt-4', isEdit && 'lg:grid-cols-[1fr_320px]')}>
        {/* Coluna esquerda */}
        <div className="space-y-4">
          {/* Header card */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-2">
              {isEdit ? (
                <>
                  <span className="text-sm text-gray-400">#{String(quote.number).padStart(3, '0')}</span>
                  {statusC && <span className={cn('badge', statusC.bg, statusC.text)}>{QUOTE_STATUS_LABEL[quote.status as keyof typeof QUOTE_STATUS_LABEL]}</span>}
                </>
              ) : (
                <h1 className="text-base font-semibold text-gray-900">Novo orçamento</h1>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ContactSearch label="Cliente" required placeholder="Buscar ou criar cliente..."
                initialValue={isEdit ? { id: quote.client_id, name: quote.client_name } : null} onSelect={setSelectedClient} />
              <ContactSearch label="Parceiro" placeholder="Buscar ou criar parceiro..." type="architect" excludeType="client"
                initialValue={quote?.architect_id ? { id: quote.architect_id, name: quote.architect_name } : null}
                onSelect={setSelectedArch} />
            </div>

            <div className="border-t border-surface-border pt-4 space-y-4">
              {/* Categoria + Tamanho */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <OptionPills name="category" label="Categoria" defaultValue={quote?.category ?? 'lighting'} options={CATEGORY_OPTS} />
                <OptionPills name="size" label="Tamanho" defaultValue={quote?.size ?? 'small'} options={SIZE_OPTS} allowEmpty />
              </div>
              {/* Data da solicitação + Prazo (ambas datas) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Data da solicitação</label>
                  <input type="date" name="quote_date"
                    defaultValue={quote?.quote_date ?? quote?.created_at?.split('T')[0] ?? today} className="input mt-1" />
                </div>
                <div>
                  <label className="label">Prazo</label>
                  <input type="date" name="deadline" defaultValue={quote?.deadline ?? ''} className="input mt-1" />
                </div>
              </div>
              {/* Prioridade + Valor */}
              <div className="grid grid-cols-2 gap-4 items-start">
                <TagSelect name="priority" label="Prioridade" defaultValue={quote?.priority ?? 'normal'} options={PRIORITY_OPTS} />
                <div>
                  <label className="label">Valor orçado (R$)</label>
                  <input type="number" name="quoted_value" step="0.01" min="0" defaultValue={quote?.quoted_value ?? ''} className="input mt-1" placeholder="0,00" />
                </div>
              </div>
            </div>
          </div>

          {/* Detalhes */}
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Detalhes</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TagSelect name="origin" label="Origem" defaultValue={quote?.origin ?? 'store'} options={ORIGIN_OPTS} />
              <TagSelect name="work_stage" label="Etapa da obra" defaultValue={quote?.work_stage ?? 'project'} options={STAGE_OPTS} placeholder="—" allowEmpty />
            </div>
            <div>
              <label className="label">Observações</label>
              <textarea name="notes" rows={3} defaultValue={quote?.notes ?? ''} className="input resize-none mt-1" placeholder="Detalhes, feedback do cliente..." />
            </div>
            <div>
              <label className="label">Pasta Google Drive <span className="text-gray-400 font-normal">(opcional)</span></label>
              <input type="url" name="drive_link" placeholder="https://drive.google.com/drive/folders/..."
                defaultValue={quote?.drive_link ?? ''} className="input mt-1" />
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

          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="btn-primary">
              {pending && <Loader2 className="w-4 h-4 animate-spin" />} {isEdit ? 'Salvar alterações' : 'Criar orçamento'}
            </button>
            <button type="button" onClick={cancel} className="btn-secondary">Cancelar</button>
          </div>
        </div>

        {/* Coluna direita — só na edição (orçamento já existe) */}
        {isEdit && (
          <div className="sticky top-4 space-y-4">
            <QuoteTasks quoteId={quote.id} quoteLabel={`#${quote.number} · ${quote.client_name}`} />
            <QuoteSchedules quoteId={quote.id} quoteLabel={`#${quote.number} · ${quote.client_name}`} />
          </div>
        )}
      </div>
    </form>
  )
}
