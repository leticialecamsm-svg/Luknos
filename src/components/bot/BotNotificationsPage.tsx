'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Loader2, RefreshCw, ExternalLink } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { resendBotNotification } from '@/lib/bot-actions'

type Row = {
  id: string
  conversation_id: string
  target_phone_e164: string
  system_quote_id: string
  channel: string
  status: string
  sent_at: string | null
  created_at: string
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendente', cls: 'bg-amber-50 text-amber-700' },
  sent: { label: 'Enviada', cls: 'bg-green-50 text-green-700' },
  failed: { label: 'Falhou', cls: 'bg-red-50 text-red-700' },
}

const FILTERS: [string, string][] = [
  ['all', 'Todas'],
  ['pending', 'Pendentes'],
  ['sent', 'Enviadas'],
  ['failed', 'Falhas'],
]

export function BotNotificationsPage({
  rows,
  counts,
  status,
  isAdmin,
}: {
  rows: Row[]
  counts: Record<string, number>
  status: string
  isAdmin: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  async function resend(id: string) {
    setBusy(id)
    const res = await resendBotNotification(id)
    setBusy(null)
    if (res?.error) {
      toast.error('Erro', res.error)
      return
    }
    toast.success('Reenvio disparado', 'Atualize em instantes para ver o status.')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notificações do Robô</h1>
        <p className="text-gray-500 mt-1">
          Avisos "novo orçamento em seu nome" enviados ao vendedor responsável.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            onClick={() =>
              router.push(key === 'all' ? '/bot-notifications' : `/bot-notifications?status=${key}`)
            }
            className={
              'px-3 py-1.5 rounded-full text-sm border transition-colors ' +
              (status === key
                ? 'bg-brand-500 text-white border-brand-500'
                : 'bg-white text-gray-600 border-surface-border hover:bg-surface')
            }
          >
            {label}
            {counts[key] != null && key !== 'all' ? (
              <span className="ml-1.5 opacity-60">{counts[key]}</span>
            ) : null}
          </button>
        ))}
        <span className="text-sm text-gray-400">
          {counts.pending ?? 0} pendente(s) · {counts.sent ?? 0} enviada(s) · {counts.failed ?? 0}{' '}
          falha(s)
        </span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="border-b border-surface-border bg-surface text-left">
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Vendedor (telefone)</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Orçamento</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600 hidden sm:table-cell">Enviada em</th>
              <th className="px-4 py-3 w-28" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                  Nenhuma notificação {status !== 'all' ? 'neste filtro' : 'ainda'} — aparecem à
                  medida que orçamentos são cadastrados pelo robô.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const s = STATUS[r.status] ?? { label: r.status, cls: 'bg-gray-100 text-gray-500' }
              const qid = /^\d+$/.test(r.system_quote_id) ? `#${r.system_quote_id}` : r.system_quote_id
              return (
                <tr key={r.id} className="border-b border-surface-border last:border-0 hover:bg-surface">
                  <td className="px-4 py-3 text-sm font-mono text-gray-700">{r.target_phone_e164}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-700">{qid}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${s.cls}`}>
                      {s.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 hidden sm:table-cell whitespace-nowrap">
                    {r.sent_at ? format(new Date(r.sent_at), 'd/MM HH:mm') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/bot-conversations/${r.conversation_id}`}
                        className="text-gray-300 hover:text-brand-500"
                        title="Abrir conversa"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                      {isAdmin && r.status === 'failed' && (
                        <button
                          onClick={() => resend(r.id)}
                          disabled={busy === r.id}
                          className="text-gray-300 hover:text-brand-500"
                          title="Reenviar"
                        >
                          {busy === r.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
