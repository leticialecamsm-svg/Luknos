'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, FileText, Image as ImageIcon, Loader2, RefreshCw, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useToast } from '@/components/ui/Toast'
import { getBotAttachmentSignedUrl, retryBotSubmission } from '@/lib/bot-actions'
import { statusMeta, FIELD_LABEL } from './botStatus'

type Detail = {
  conversation: any
  messages: any[]
  attachments: any[]
  collaborator: any
  submissionLog: any[]
  isAdmin: boolean
}

const KIND_LABEL: Record<string, string> = {
  plant_pdf: 'Planta (PDF)',
  image_3d: 'Imagem 3D',
  dwg: 'DWG',
  sketchup: 'SketchUp',
  other: 'Arquivo',
}

export function BotConversationDetail({ data }: { data: Detail }) {
  const toast = useToast()
  const { conversation: c, messages, attachments, collaborator, submissionLog, isAdmin } = data
  const m = statusMeta(c.status)
  const [retrying, setRetrying] = useState(false)
  const [openingId, setOpeningId] = useState<string | null>(null)

  const collected = (c.collected_data ?? {}) as Record<string, any>

  async function openAttachment(id: string) {
    setOpeningId(id)
    const res = await getBotAttachmentSignedUrl(id)
    setOpeningId(null)
    if ('error' in res || !res.url) {
      toast.error('Erro', ('error' in res && res.error) || 'Não foi possível abrir o arquivo')
      return
    }
    window.open(res.url, '_blank', 'noopener')
  }

  async function retry() {
    setRetrying(true)
    const res = await retryBotSubmission(c.id)
    setRetrying(false)
    if (res?.error) {
      toast.error('Falha ao reprocessar', res.error)
      return
    }
    toast.success('Reprocessado', 'Atualize a página para ver o resultado.')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/bot-conversations" className="text-gray-400 hover:text-gray-600">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">
              {collaborator?.display_name ?? 'Colaborador'}
            </h1>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${m.cls}`}>{m.label}</span>
          </div>
          <p className="text-sm text-gray-400">
            Início {format(new Date(c.created_at), "d 'de' MMM HH:mm", { locale: ptBR })} · última
            atividade {format(new Date(c.last_message_at), "d 'de' MMM HH:mm", { locale: ptBR })}
            {c.system_quote_id ? (
              <>
                {' · '}Orçamento{' '}
                <span className="font-mono text-gray-600">
                  {/^\d+$/.test(String(c.system_quote_id)) ? `#${c.system_quote_id}` : c.system_quote_id}
                </span>
              </>
            ) : null}
          </p>
        </div>
        {isAdmin && c.status === 'failed' && (
          <button onClick={retry} disabled={retrying} className="btn-primary flex items-center gap-2">
            {retrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Reprocessar
          </button>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Timeline */}
        <section className="lg:col-span-2 card p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Mensagens</h2>
          {messages.length === 0 && (
            <p className="text-sm text-gray-400">Nenhuma mensagem ainda.</p>
          )}
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={'flex ' + (msg.direction === 'outbound' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={
                    'max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ' +
                    (msg.direction === 'outbound'
                      ? 'bg-brand-500 text-white'
                      : 'bg-surface text-gray-800 border border-surface-border')
                  }
                >
                  {msg.message_type !== 'text' && (
                    <span className="block text-xs opacity-70 mb-0.5">
                      [{msg.message_type}]
                    </span>
                  )}
                  {msg.body || <span className="opacity-50">(sem texto)</span>}
                  <span
                    className={
                      'block text-[10px] mt-1 ' +
                      (msg.direction === 'outbound' ? 'text-white/60' : 'text-gray-400')
                    }
                  >
                    {format(new Date(msg.created_at), 'HH:mm', { locale: ptBR })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Lateral */}
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Anexos</h2>
            {attachments.length === 0 && (
              <p className="text-sm text-gray-400">Nenhum arquivo recebido ainda.</p>
            )}
            <ul className="space-y-2">
              {attachments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2 rounded-lg border border-surface-border p-2"
                >
                  {a.detected_kind === 'image_3d' ? (
                    <ImageIcon className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-800 truncate">{a.file_name}</div>
                    <div className="text-xs text-gray-400">
                      {KIND_LABEL[a.detected_kind] ?? a.detected_kind}
                      {a.size_bytes ? ` · ${(a.size_bytes / 1024).toFixed(0)} KB` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => openAttachment(a.id)}
                    disabled={openingId === a.id}
                    className="text-gray-400 hover:text-brand-500 shrink-0"
                    title="Abrir"
                  >
                    {openingId === a.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ExternalLink className="w-4 h-4" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Dados coletados</h2>
            <dl className="space-y-1.5 text-sm">
              {DATA_ROWS.map(([key, render]) => {
                const val = render(collected)
                return (
                  <div key={key} className="flex justify-between gap-3">
                    <dt className="text-gray-400">{FIELD_LABEL[key] ?? key}</dt>
                    <dd className="text-gray-800 text-right">{val || '—'}</dd>
                  </div>
                )
              })}
            </dl>
          </section>

          {isAdmin && (
            <section className="card p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Log de submissão</h2>
              {submissionLog.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhuma tentativa de gravação ainda.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {submissionLog.map((l) => (
                    <li key={l.id} className="flex items-center gap-2">
                      <span
                        className={
                          'text-xs font-medium px-1.5 py-0.5 rounded ' +
                          (l.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')
                        }
                      >
                        #{l.attempt_number} {l.success ? 'ok' : `erro ${l.response_status ?? ''}`}
                      </span>
                      <span className="text-xs text-gray-400">
                        {format(new Date(l.created_at), 'd/MM HH:mm')}
                      </span>
                      {l.error_message && (
                        <span className="text-xs text-red-500 truncate">{l.error_message}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

const SKIP = '__skip__'
const show = (v: any) => (v === undefined || v === null || v === '' || v === SKIP ? '' : v)

const DATA_ROWS: [string, (d: Record<string, any>) => string][] = [
  ['client', (d) => {
    const c = d.client
    if (!c) return ''
    return c.needs_creation
      ? `${c.name ?? '?'}${c.phone ? ` (${c.phone})` : ''} — novo`
      : c.name ?? ''
  }],
  ['partner', (d) => {
    const p = d.partner
    if (!p || p === SKIP) return ''
    return typeof p === 'string' ? p : p.name ?? ''
  }],
  ['origin', (d) => show(d.origin)],
  ['category', (d) => show(d.category)],
  ['priority', (d) => show(d.priority)],
  ['size', (d) => show(d.size)],
  ['stage', (d) => show(d.stage)],
  ['deadline', (d) => show(d.deadline)],
  ['quote_date', (d) => show(d.quote_date)],
  ['quote_value', (d) =>
    typeof d.quote_value === 'number'
      ? `R$ ${d.quote_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      : ''],
  ['notes', (d) => show(d.notes)],
  ['drive_link', (d) => show(d.drive_link)],
  ['seller', (d) => {
    const s = d.seller
    if (!s || s === SKIP) return ''
    return typeof s === 'string' ? s : s.display_name ?? ''
  }],
]
