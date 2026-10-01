'use client'

// Extraído de QuoteDetail.tsx (card "Negociação" + tabela de descontos) pra
// poder ser reaproveitado 100% como está em dois lugares: dentro do
// QuoteDetail de /quotes/[id] (comportamento de sempre) e na aba
// "Negociação" de /solicitacoes/[id] (Lote 1 - Bug #1/#2), sem duplicar
// a lógica/visual.

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { updateTemperature, markAsLost, cancelSale, getQuoteProposals } from '@/lib/actions'
import { TEMPERATURE_LABEL, TEMPERATURE_COLOR, LOSS_REASON_LABEL } from '@/types'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { Flame, CheckCircle2, XCircle, Pencil, Trash2, Percent } from 'lucide-react'
import { CloseSaleForm } from './CloseSaleForm'
import { DiscountTable } from './DiscountTable'
import { EditPaymentForm } from './EditPaymentForm'
import { DEFAULT_PAYMENT_RATES } from '@/lib/payment-rates'

const TEMPS = ['no_forecast', 'cold', 'warm', 'hot', 'closed', 'lost'] as const

export function NegotiationSection({ quote }: { quote: any }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [showCloseSale, setShowCloseSale] = useState(false)
  const [showMarkLost, setShowMarkLost] = useState(false)
  const [showEditPayment, setShowEditPayment] = useState(false)
  const [showDiscounts, setShowDiscounts] = useState(false)
  const [lossReason, setLossReason] = useState('price')
  const [localFinalValue, setLocalFinalValue] = useState<number | null>(quote.final_value ?? null)
  const [localSplits, setLocalSplits] = useState<any[]>(quote.payment_splits ?? [])
  const [proposals, setProposals] = useState<any[]>([])
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null)

  useEffect(() => {
    getQuoteProposals(quote.id).then(setProposals)
  }, [quote.id])

  function act(fn: () => Promise<any>) {
    startTransition(async () => { await fn(); router.refresh() })
  }

  if (quote.status !== 'done' && quote.status !== 'revision') {
    return (
      <div className="card p-4 text-sm text-gray-400 italic text-center py-6">
        A negociação começa quando o orçamento é concluído.
      </div>
    )
  }

  return (
    <>
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Negociação</h2>

        {/* Temperatura */}
        <div className="flex flex-wrap gap-2 mb-2">
          {TEMPS.filter(t => t !== 'closed' && t !== 'lost').map(t => {
            const c = TEMPERATURE_COLOR[t]
            const active = quote.temperature === t
            return (
              <button
                key={t}
                disabled={pending}
                onClick={() => act(() => updateTemperature(quote.id, t))}
                className={cn(
                  'badge cursor-pointer border transition-all',
                  active ? cn(c.bg, c.text, c.border, 'ring-1 ring-current') : 'bg-white border-surface-border text-gray-500 hover:border-gray-300'
                )}
              >
                {t === 'hot' && <Flame className="w-3 h-3 mr-1 inline" />}
                {TEMPERATURE_LABEL[t]}
              </button>
            )
          })}
        </div>

        {/* Badges de movimento */}
        {(() => {
          const demotedAt = quote.last_auto_demoted_at ? new Date(quote.last_auto_demoted_at) : null
          const promotedAt = quote.last_promoted_at ? new Date(quote.last_promoted_at) : null
          const now = Date.now()
          const showDemoted = demotedAt && (now - demotedAt.getTime()) < 48 * 60 * 60 * 1000
          const showPromoted = promotedAt && (now - promotedAt.getTime()) < 24 * 60 * 60 * 1000
          if (!showDemoted && !showPromoted) return null
          return (
            <div className="flex gap-2 mb-3">
              {showDemoted && <span className="text-xs font-medium text-orange-500 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">⬇ Rebaixado</span>}
              {showPromoted && <span className="text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">⬆ Subiu</span>}
            </div>
          )
        })()}

        {/* CTA: fechar ou perder */}
        {quote.temperature !== 'closed' && quote.temperature !== 'lost' && (
          <div className="flex gap-2">
            <button onClick={() => setShowCloseSale(true)} className="btn-primary text-xs py-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Fechar venda
            </button>
            <button onClick={() => setShowMarkLost(true)} className="btn-secondary text-xs py-1.5">
              <XCircle className="w-3.5 h-3.5" />
              Marcar como perdida
            </button>
          </div>
        )}

        {/* Venda fechada */}
        {quote.temperature === 'closed' && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-800">Venda fechada</p>
                  <p className="text-xs text-green-700">
                    {formatCurrency(localFinalValue ?? quote.final_value)}
                    {' · '}{formatDate(quote.closed_at)}
                  </p>
                  {localSplits.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {localSplits.map((s: any, idx: number) => {
                        const r = DEFAULT_PAYMENT_RATES.find(x => x.method_key === s.method_key)
                        const isOpen = s.status === 'open'
                        return (
                          <span key={idx} className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border',
                            isOpen ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200')}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', isOpen ? 'bg-amber-500' : 'bg-emerald-500')} />
                            {r?.label ?? s.method_key} R${Number(s.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            <span className="opacity-70">· {isOpen ? 'em aberto' : 'pago'}</span>
                          </span>
                        )
                      })}
                    </div>
                  )}
                  {(() => {
                    const recebido = localSplits.filter((s: any) => s.status !== 'open').reduce((a: number, s: any) => a + Number(s.amount ?? 0), 0)
                    const aberto = localSplits.filter((s: any) => s.status === 'open').reduce((a: number, s: any) => a + Number(s.amount ?? 0), 0)
                    if (aberto <= 0) return null
                    return (
                      <p className="text-[11px] mt-1 text-green-800">
                        Recebido <strong>{formatCurrency(recebido)}</strong> · Em aberto <strong className="text-amber-700">{formatCurrency(aberto)}</strong>
                      </p>
                    )
                  })()}
                </div>
              </div>
              <button onClick={() => setShowEditPayment(v => !v)}
                className="p-1.5 hover:bg-green-100 rounded-lg transition-colors text-green-600" title="Editar pagamento">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={async () => {
                  if (!confirm('Cancelar a venda fechada? Isso irá reverter a negociação para status "Quente".')) return
                  await cancelSale(quote.id)
                  router.refresh()
                }}
                className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-red-400 hover:text-red-600"
                title="Cancelar venda"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {showEditPayment && (
              <EditPaymentForm
                quoteId={quote.id}
                currentFinalValue={localFinalValue ?? quote.final_value ?? 0}
                currentSplits={localSplits}
                currentClosedDate={quote.closed_at}
                onSaved={(fv, splits) => {
                  setLocalFinalValue(fv)
                  setLocalSplits(splits)
                  setShowEditPayment(false)
                }}
                onCancel={() => setShowEditPayment(false)}
              />
            )}
          </div>
        )}

        {/* Perdida */}
        {quote.temperature === 'lost' && (
          <div className="bg-surface-secondary border border-surface-border rounded-lg p-3 flex items-center gap-3">
            <XCircle className="w-5 h-5 text-gray-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-gray-700">
                Negociação perdida
                {quote.temperature_updated_at && (
                  <span className="font-normal text-gray-500"> · {formatDate(quote.temperature_updated_at)}</span>
                )}
              </p>
              {quote.loss_reason && (
                <p className="text-xs text-gray-500">
                  Motivo: {LOSS_REASON_LABEL[quote.loss_reason as keyof typeof LOSS_REASON_LABEL]}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Fechar venda */}
        {showCloseSale && (
          <CloseSaleForm
            quoteId={quote.id}
            quotedValue={quote.quoted_value ?? null}
            proposals={proposals}
            onConfirm={() => { setShowCloseSale(false); router.refresh() }}
            onCancel={() => setShowCloseSale(false)}
          />
        )}

        {/* Modal marcar perdida */}
        {showMarkLost && (
          <div className="mt-4 bg-surface-secondary border border-surface-border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Motivo da perda</h3>
            <select value={lossReason} onChange={e => setLossReason(e.target.value)} className="select">
              {Object.entries(LOSS_REASON_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button disabled={pending} onClick={() => act(() => markAsLost(quote.id, lossReason))} className="btn-secondary text-xs py-1.5">
                Confirmar
              </button>
              <button onClick={() => setShowMarkLost(false)} className="btn-secondary text-xs py-1.5">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabela de descontos */}
      <div className="card p-4">
        <button onClick={() => setShowDiscounts(v => !v)} className="w-full flex items-center justify-between text-sm font-semibold text-gray-700">
          <span className="flex items-center gap-2"><Percent className="w-4 h-4" /> Tabela de descontos</span>
          <span className="text-xs text-gray-400">{showDiscounts ? 'Ocultar' : 'Ver'}</span>
        </button>
        {showDiscounts && (
          <div className="mt-3 space-y-3">
            {proposals.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSelectedProposalId(null)}
                  className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                    selectedProposalId === null
                      ? 'bg-brand-50 text-brand-700 border-brand-300'
                      : 'bg-white text-gray-500 border-surface-border hover:border-gray-300'
                  )}
                >
                  Proposta 1 (orçado) · {formatCurrency(quote.quoted_value)}
                </button>
                {proposals.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProposalId(p.id)}
                    className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                      selectedProposalId === p.id
                        ? 'bg-brand-50 text-brand-700 border-brand-300'
                        : 'bg-white text-gray-500 border-surface-border hover:border-gray-300'
                    )}
                    title={p.info ?? undefined}
                  >
                    Proposta {i + 2} · {formatCurrency(p.value)}
                  </button>
                ))}
              </div>
            )}
            <DiscountTable
              quotedValue={
                selectedProposalId
                  ? (proposals.find(p => p.id === selectedProposalId)?.value ?? quote.quoted_value ?? null)
                  : (quote.quoted_value ?? null)
              }
            />
          </div>
        )}
      </div>
    </>
  )
}
