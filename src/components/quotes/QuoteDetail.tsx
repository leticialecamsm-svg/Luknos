'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateQuoteStatus, updateTemperature,
  markAsLost, addActivity
} from '@/lib/actions'
import {
  QUOTE_STATUS_LABEL, STATUS_COLOR,
  TEMPERATURE_LABEL, TEMPERATURE_COLOR,
  CATEGORY_LABEL, SIZE_LABEL, ORIGIN_LABEL,
  LOSS_REASON_LABEL,
} from '@/types'
import {
  formatCurrency, formatDate, formatRelative,
  getInitials, isOverdue, cn
} from '@/lib/utils'
import {
  ChevronLeft, Flame, CheckCircle2, XCircle,
  Phone, MessageSquare, MapPin, Clock, Loader2,
  Pencil, Trash2, StickyNote, PhoneCall, Send, CalendarDays, Folder, ExternalLink, Percent
} from 'lucide-react'
import { deleteQuote } from '@/lib/actions'
import { useConfirm } from '@/components/ui/useConfirm'
import { Avatar } from '@/components/ui/Avatar'
import { QuoteTasks } from './QuoteTasks'
import { QuoteSchedules } from './QuoteSchedules'
import { CloseSaleForm } from './CloseSaleForm'
import { DiscountTable } from './DiscountTable'
import { EditPaymentForm } from './EditPaymentForm'
import { DEFAULT_PAYMENT_RATES } from '@/lib/payment-rates'

export function QuoteDetail({ quote, activities }: { quote: any; activities: any[] }) {
  const router = useRouter()
  const { confirm, ConfirmDialog } = useConfirm()
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState('')
  const [noteType, setNoteType] = useState<'note'|'call'|'whatsapp'|'visit'>('note')
  const [showCloseSale, setShowCloseSale] = useState(false)
  const [showMarkLost, setShowMarkLost] = useState(false)
  const [showEditPayment, setShowEditPayment] = useState(false)
  const [showDiscounts, setShowDiscounts] = useState(false)
  const [lossReason, setLossReason] = useState('price')
  const [localFinalValue, setLocalFinalValue] = useState<number | null>(quote.final_value ?? null)
  const [localSplits, setLocalSplits] = useState<any[]>(quote.payment_splits ?? [])

  const statusC = STATUS_COLOR[quote.status as keyof typeof STATUS_COLOR]
  const tempC   = quote.temperature ? TEMPERATURE_COLOR[quote.temperature as keyof typeof TEMPERATURE_COLOR] : null
  const overdue = isOverdue(quote.deadline) && quote.status !== 'done'

  function act(fn: () => Promise<any>) {
    startTransition(async () => { await fn(); router.refresh() })
  }

  const TEMPS = ['cold','warm','hot','closed','lost'] as const

  return (
    <div className="max-w-6xl">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="w-4 h-4" />
          Orçamentos
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/quotes/${quote.id}/edit`)}
            className="btn-secondary text-xs py-1.5 gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" /> Editar
          </button>
          <button
            onClick={async () => {
              const ok = await confirm(`Excluir orçamento de "${quote.client_name}"?`, 'Sim, excluir')
              if (!ok) return
              act(async () => { await deleteQuote(quote.id); router.push('/quotes') })
            }}
            className="btn-secondary text-xs py-1.5 gap-1.5 text-red-500 hover:bg-red-50 hover:border-red-200"
          >
            <Trash2 className="w-3.5 h-3.5" /> Excluir
          </button>
        </div>
      </div>

      {/* Grid: conteúdo esquerda + tarefas direita */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
      <div className="space-y-4">
      {/* Header card */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-gray-400">
                #{String(quote.number).padStart(3,'0')}
              </span>
              <span className={cn('badge', statusC.bg, statusC.text)}>
                {QUOTE_STATUS_LABEL[quote.status as keyof typeof QUOTE_STATUS_LABEL]}
              </span>
              {overdue && (
                <span className="badge bg-red-50 text-red-600">⚠️ Prazo vencido</span>
              )}
              {localSplits.some((s: any) => s.status === 'open') && (
                <span className="badge bg-amber-100 text-amber-800">⏳ Pagamento Pendente</span>
              )}
            </div>
            <h1 className="text-xl font-semibold text-gray-900">{quote.client_name}</h1>
            {quote.client_phone && (
              <p className="text-sm text-gray-500 mt-0.5">{quote.client_phone}</p>
            )}
            {quote.architect_name && (
              <p className="text-sm text-gray-400 mt-0.5">Arq. {quote.architect_name}</p>
            )}
            {quote.drive_link && (
              <a href={quote.drive_link} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700 mt-2">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4c-1.48 0-2.85.43-4.01 1.17l1.46 1.46C10.21 5.23 11.08 5 12 5c3.04 0 5.5 2.46 5.5 5.5v.5H19c2.05 0 3.71 1.66 3.71 3.71 0 1.71-1.04 2.86-2.34 3.24-.01-.1-.04-.21-.04-.32zM3 5.5v13h18V9.5h-1v9H4v-9H3z"/>
                </svg>
                Pasta do projeto
              </a>
            )}
          </div>

          {/* Donos */}
          <div className="flex items-center gap-1.5 shrink-0">
            {quote.owners?.map((o: any) => (
              <Avatar key={o.user_id} user={o} size={32}
                title={`${o.name} (${o.role === 'primary' ? 'primário' : 'colaborador'})`} />
            ))}
          </div>
        </div>

        {/* Detalhes rápidos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-surface-border">
          {[
            ['Categoria', CATEGORY_LABEL[quote.category as keyof typeof CATEGORY_LABEL]],
            ['Tamanho', quote.size ? SIZE_LABEL[quote.size as keyof typeof SIZE_LABEL] : '—'],
            ['Prazo', formatDate(quote.deadline)],
            ['Valor orçado', formatCurrency(quote.quoted_value)],
          ].map(([k,v]) => (
            <div key={k}>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">{k}</p>
              <p className="text-sm font-medium mt-0.5">{v}</p>
            </div>
          ))}
        </div>

        {/* Datas e tempo */}
        {(() => {
          const createdDate = quote.quote_date ?? quote.created_at
          const daysOpen = createdDate
            ? Math.floor((Date.now() - new Date(createdDate.includes('T') ? createdDate : createdDate + 'T00:00:00').getTime()) / 86400000)
            : null
          const deadlineMs = quote.deadline ? new Date(quote.deadline + 'T23:59:59').getTime() : null
          const daysOverdue = deadlineMs && quote.status !== 'done'
            ? Math.floor((Date.now() - deadlineMs) / 86400000)
            : null
          // Se concluído com atraso: calcula usando closed_at ou updated_at
          const closedAt = quote.closed_at ?? quote.updated_at
          const daysLate = quote.status === 'done' && deadlineMs && closedAt
            ? Math.floor((new Date(closedAt).getTime() - deadlineMs) / 86400000)
            : null
          const lastActivity = activities?.[0]?.created_at ?? quote.updated_at ?? quote.created_at
          const daysSinceUpdate = lastActivity
            ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000)
            : null
          return (
            <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-surface-border text-xs">
              <span className="flex items-center gap-1 text-gray-400">
                <CalendarDays className="w-3.5 h-3.5" />
                Aberto em {formatDate(createdDate)}
                {daysOpen !== null && <span className="ml-1 text-gray-400">({daysOpen}d aberto)</span>}
              </span>
              {daysOverdue !== null && daysOverdue > 0 && (
                <span className="flex items-center gap-1 text-red-500 font-semibold bg-red-50 px-2 py-0.5 rounded-full">
                  ⚠️ {daysOverdue} dia{daysOverdue !== 1 ? 's' : ''} em atraso
                </span>
              )}
              {daysLate !== null && daysLate > 0 && (
                <span className="text-[11px] text-gray-400">
                  concluído com {daysLate} dia{daysLate !== 1 ? 's' : ''} de atraso
                </span>
              )}
              {daysSinceUpdate !== null && (
                <span className={cn('flex items-center gap-1', daysSinceUpdate > 7 ? 'text-amber-500 font-medium' : 'text-gray-400')}>
                  <Clock className="w-3.5 h-3.5" />
                  {daysSinceUpdate === 0 ? 'Atualizado hoje' : `Sem atualização há ${daysSinceUpdate}d`}
                </span>
              )}
            </div>
          )
        })()}

        {/* Status actions */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-surface-border">
          <span className="text-xs text-gray-400 self-center">Status:</span>
          {(['queue','in_progress','review','done'] as const).map(s => (
            <button
              key={s}
              disabled={pending || quote.status === s}
              onClick={() => act(() => updateQuoteStatus(quote.id, s))}
              className={cn(
                'badge cursor-pointer transition-all',
                quote.status === s
                  ? cn(STATUS_COLOR[s].bg, STATUS_COLOR[s].text, 'ring-1 ring-current')
                  : 'bg-surface-secondary text-gray-500 hover:bg-surface-border'
              )}
            >
              {QUOTE_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Negociação */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Negociação</h2>

        {/* Temperatura */}
        <div className="flex flex-wrap gap-2 mb-4">
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

        {/* CTA: fechar ou perder */}
        {quote.temperature !== 'closed' && quote.temperature !== 'lost' && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowCloseSale(true)}
              className="btn-primary text-xs py-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Fechar venda
            </button>
            <button
              onClick={() => setShowMarkLost(true)}
              className="btn-secondary text-xs py-1.5"
            >
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
                    {localSplits.length > 0
                      ? ' · ' + localSplits.map((s: any) => {
                          const r = DEFAULT_PAYMENT_RATES.find(x => x.method_key === s.method_key)
                          return `${r?.label ?? s.method_key} R$${Number(s.amount).toLocaleString('pt-BR',{minimumFractionDigits:2})}`
                        }).join(' + ')
                      : quote.payment_method ? ` · ${quote.payment_method}` : ''}
                    {' · '}{formatDate(quote.closed_at)}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowEditPayment(v => !v)}
                className="p-1.5 hover:bg-green-100 rounded-lg transition-colors text-green-600" title="Editar pagamento">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
            {showEditPayment && (
              <EditPaymentForm
                quoteId={quote.id}
                currentFinalValue={localFinalValue ?? quote.final_value ?? 0}
                currentSplits={localSplits}
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
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center gap-3">
            <XCircle className="w-5 h-5 text-gray-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-gray-700">Negociação perdida</p>
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
            onConfirm={() => { setShowCloseSale(false); router.refresh() }}
            onCancel={() => setShowCloseSale(false)}
          />
        )}

        {/* Modal marcar perdida */}
        {showMarkLost && (
          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Motivo da perda</h3>
            <select value={lossReason} onChange={e => setLossReason(e.target.value)} className="select">
              {Object.entries(LOSS_REASON_LABEL).map(([k,v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                disabled={pending}
                onClick={() => act(() => markAsLost(quote.id, lossReason))}
                className="btn-secondary text-xs py-1.5"
              >
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
        <button
          onClick={() => setShowDiscounts(v => !v)}
          className="w-full flex items-center justify-between text-sm font-semibold text-gray-700"
        >
          <span className="flex items-center gap-2"><Percent className="w-4 h-4" /> Tabela de descontos</span>
          <span className="text-xs text-gray-400">{showDiscounts ? 'Ocultar' : 'Ver'}</span>
        </button>
        {showDiscounts && (
          <div className="mt-3">
            <DiscountTable quotedValue={quote.quoted_value ?? null} />
          </div>
        )}
      </div>

      {/* Visita */}
      {(quote.visit_status || quote.visit_address) && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Visita
          </h2>
          <div className="flex items-center gap-3">
            <span className="badge bg-surface-secondary text-gray-600">
              {quote.visit_status?.replace('_', ' ')}
            </span>
            {quote.visit_date && (
              <span className="text-sm text-gray-500">{formatDate(quote.visit_date)}</span>
            )}
          </div>
          {quote.visit_address && (
            <p className="text-sm text-gray-500 mt-2">{quote.visit_address}</p>
          )}
        </div>
      )}

      {/* Observações */}
      {quote.notes && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Observações</h2>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{quote.notes}</p>
        </div>
      )}

      {/* Arquivos */}
      {quote.drive_link && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Folder className="w-4 h-4" />
            Arquivos
          </h2>
          <a href={quote.drive_link} target="_blank" rel="noopener noreferrer"
            className="block p-4 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Folder className="w-6 h-6 text-blue-600 group-hover:text-blue-700" />
                <div>
                  <p className="font-medium text-blue-900">Pasta no Google Drive</p>
                  <p className="text-xs text-blue-600">Clique para abrir</p>
                </div>
              </div>
              <ExternalLink className="w-5 h-5 text-blue-400 group-hover:text-blue-600" />
            </div>
          </a>
        </div>
      )}

      {/* Timeline / Atividades */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Histórico
        </h2>

        {/* Adicionar anotação */}
        <div className="mb-4 space-y-2">
          <div className="flex gap-1.5">
            {([
              { type: 'note',     label: 'Nota',     Icon: StickyNote  },
              { type: 'call',     label: 'Ligação',  Icon: PhoneCall   },
              { type: 'whatsapp', label: 'WhatsApp', Icon: Send        },
              { type: 'visit',    label: 'Visita',   Icon: MapPin      },
            ] as const).map(({ type, label, Icon }) => (
              <button key={type} type="button"
                onClick={() => setNoteType(type)}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all',
                  noteType === type
                    ? 'bg-brand-500 text-white border-brand-500'
                    : 'bg-white text-gray-500 border-surface-border hover:border-brand-300'
                )}
              >
                <Icon className="w-3 h-3" />{label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={
                noteType === 'call' ? 'Resumo da ligação...' :
                noteType === 'whatsapp' ? 'Resumo da conversa no WhatsApp...' :
                noteType === 'visit' ? 'Observações da visita...' :
                'Anotação, feedback do cliente, arquiteto...'
              }
              className="input flex-1"
              onKeyDown={e => {
                if (e.key === 'Enter' && note.trim()) {
                  act(() => addActivity(quote.id, note, noteType))
                  setNote('')
                }
              }}
            />
            <button
              disabled={pending || !note.trim()}
              onClick={() => { act(() => addActivity(quote.id, note, noteType)); setNote('') }}
              className="btn-primary text-xs"
            >
              {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Salvar'}
            </button>
          </div>
        </div>

        {/* Lista de atividades */}
        <div className="space-y-3">
          {activities.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Nenhuma atividade ainda</p>
          )}
          {activities.map((a: any) => {
            const typeIcon: Record<string, React.ReactNode> = {
              call:     <PhoneCall className="w-3 h-3 text-blue-500" />,
              whatsapp: <Send className="w-3 h-3 text-green-500" />,
              visit:    <MapPin className="w-3 h-3 text-purple-500" />,
              note:     <StickyNote className="w-3 h-3 text-amber-500" />,
            }
            return (
              <div key={a.id} className="flex gap-3">
                <div className="mt-0.5">
                  <Avatar user={a.user ?? { name: 'U' }} size={28} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-700">{a.user?.name}</span>
                    {typeIcon[a.type] && <span>{typeIcon[a.type]}</span>}
                    <span className="text-[10px] text-gray-400">{formatRelative(a.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">{a.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      </div>{/* fim col esquerda */}

      {/* Coluna direita: Tarefas + Agendamentos */}
      <div className="sticky top-4 space-y-4">
        <QuoteTasks quoteId={quote.id} quoteLabel={`#${quote.number} · ${quote.client_name}`} />
        <QuoteSchedules quoteId={quote.id} quoteLabel={`#${quote.number} · ${quote.client_name}`} />
      </div>

      </div>{/* fim grid */}
      {ConfirmDialog}
    </div>
  )
}
