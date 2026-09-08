'use client'

import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { statusMeta, FIELD_LABEL } from './botStatus'

type Row = {
  id: string
  status: string
  current_field: string | null
  system_quote_id: string | null
  last_message_at: string
  created_at: string
  collaborator: { display_name: string; phone_e164: string } | null
}

const FILTERS = [
  ['all', 'Todas'],
  ['collecting', 'Coletando'],
  ['awaiting_confirmation', 'Aguardando'],
  ['submitted', 'Cadastradas'],
  ['failed', 'Falhas'],
  ['expired', 'Expiradas'],
] as const

export function BotConversationsPage({
  rows,
  counts,
  status,
}: {
  rows: Row[]
  counts: Record<string, number>
  status: string
}) {
  const router = useRouter()
  const active = counts.collecting ?? 0
  const awaiting = counts.awaiting_confirmation ?? 0
  const failed = counts.failed ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Conversas do Robô</h1>
        <p className="text-gray-500 mt-1">
          Monitor dos cadastros em andamento e concluídos — pra garantir que nenhuma demanda se perca.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3 sm:max-w-lg">
        <Counter label="Ativas agora" value={active} />
        <Counter label="Aguardando" value={awaiting} />
        <Counter label="Falhas" value={failed} highlight={failed > 0} />
      </div>

      <div className="flex flex-wrap gap-2 -mx-1 px-1 overflow-x-auto">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            onClick={() =>
              router.push(key === 'all' ? '/bot-conversations' : `/bot-conversations?status=${key}`)
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
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-surface-border bg-surface text-left">
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Colaborador</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600 hidden sm:table-cell">Perguntando</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Última atividade</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-600">Orçamento</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                  Nenhuma conversa {status !== 'all' ? 'neste filtro' : 'ainda'} — assim que a equipe
                  encaminhar um projeto ao robô, aparece aqui.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const m = statusMeta(r.status)
              return (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/bot-conversations/${r.id}`)}
                  className="border-b border-surface-border last:border-0 hover:bg-surface cursor-pointer"
                >
                  <td className="px-4 py-3 text-sm">
                    <div className="font-medium text-gray-800">
                      {r.collaborator?.display_name ?? '—'}
                    </div>
                    <div className="text-xs text-gray-400 font-mono">
                      {r.collaborator?.phone_e164 ?? ''}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${m.cls}`}>
                      {m.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell">
                    {r.status === 'collecting' && r.current_field
                      ? FIELD_LABEL[r.current_field] ?? r.current_field
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {formatDistanceToNow(new Date(r.last_message_at), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {r.system_quote_id ? (
                      <span className="font-mono text-gray-700">
                        {/^\d+$/.test(r.system_quote_id) ? `#${r.system_quote_id}` : r.system_quote_id}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
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

function Counter({
  label,
  value,
  highlight,
}: {
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <div className={'card p-4 ' + (highlight ? 'border-red-200 bg-red-50' : '')}>
      <div className={'text-2xl font-bold ' + (highlight ? 'text-red-600' : 'text-gray-900')}>
        {value}
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}
