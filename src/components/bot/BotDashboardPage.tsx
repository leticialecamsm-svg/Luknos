'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'

type Stats = {
  range: string
  since: string
  submitted: number
  failed: number
  active: number
  awaiting_confirmation: number
  expired: number
  cancelled: number
  avg_minutes_to_submit: number | null
  notifications_sent: number
  notifications_failed: number
  submission_attempts: number
  submission_failures: number
  by_day: { day: string; count: number }[]
  by_origin: { origin: string; count: number }[]
  by_category: { category: string; count: number }[]
} | null

const RANGES: [string, string][] = [
  ['today', 'Hoje'],
  ['7d', '7 dias'],
  ['30d', '30 dias'],
]

export function BotDashboardPage({ stats, range }: { stats: Stats; range: string }) {
  const router = useRouter()

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Painel do Robô</h1>
          <p className="text-gray-500 mt-1">
            Pra garantir que nenhuma demanda recebida no WhatsApp ficou sem cadastro.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-surface-border p-0.5">
          {RANGES.map(([key, label]) => (
            <button
              key={key}
              onClick={() => router.push(`/bot-dashboard?range=${key}`)}
              className={
                'px-3 py-1.5 rounded-md text-sm transition-colors ' +
                (range === key ? 'bg-brand-500 text-white' : 'text-gray-600 hover:bg-surface')
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!stats ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Não foi possível carregar as métricas.{' '}
          <button onClick={() => router.refresh()} className="underline">
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          {/* Alertas */}
          {(stats.failed > 0 || stats.expired > 0) && (
            <Link
              href="/bot-conversations?status=failed"
              className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100"
            >
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>
                <strong>{stats.failed}</strong> cadastro(s) falharam e{' '}
                <strong>{stats.expired}</strong> conversa(s) expiraram neste período — revise para
                não perder a demanda.
              </span>
            </Link>
          )}

          {/* Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            <Card label="Cadastrados pelo robô" value={stats.submitted} accent="green" />
            <Card label="Falhas de cadastro" value={stats.failed} accent={stats.failed ? 'red' : undefined} />
            <Card label="Conversas ativas agora" value={stats.active + stats.awaiting_confirmation} />
            <Card
              label="Tempo médio de cadastro"
              value={stats.avg_minutes_to_submit != null ? `${stats.avg_minutes_to_submit} min` : '—'}
            />
          </div>

          {/* Volume por dia */}
          <section className="card p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Orçamentos cadastrados por dia</h2>
            <BarChart data={stats.by_day.map((d) => ({ label: fmtDay(d.day), value: d.count }))} />
          </section>

          <div className="grid md:grid-cols-2 gap-6">
            <Distribution title="Por origem" rows={stats.by_origin.map((o) => ({ label: o.origin, value: o.count }))} />
            <Distribution
              title="Por categoria"
              rows={stats.by_category.map((c) => ({ label: c.category, value: c.count }))}
            />
          </div>

          <p className="text-xs text-gray-400">
            Notificações ao vendedor: {stats.notifications_sent} enviadas ·{' '}
            {stats.notifications_failed} com falha · Tentativas de gravação:{' '}
            {stats.submission_attempts} ({stats.submission_failures} falharam)
          </p>
        </>
      )}
    </div>
  )
}

function Card({
  label,
  value,
  accent,
}: {
  label: string
  value: number | string
  accent?: 'green' | 'red'
}) {
  const color =
    accent === 'green' ? 'text-green-600' : accent === 'red' ? 'text-red-600' : 'text-gray-900'
  return (
    <div className="card p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}

function BarChart({ data }: { data: { label: string; value: number }[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-gray-400">Ainda não há cadastros pelo robô neste período.</p>
  }
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="overflow-x-auto">
      <div
        className="flex items-end gap-2 h-40"
        style={{ minWidth: `${Math.max(data.length * 28, 240)}px` }}
      >
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-[20px]">
            <span className="text-xs text-gray-500">{d.value}</span>
            <div
              className="w-full bg-brand-500 rounded-t"
              style={{ height: `${Math.max((d.value / max) * 100, 4)}%` }}
            />
            <span className="text-[10px] text-gray-400 w-full text-center">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Distribution({
  title,
  rows,
}: {
  title: string
  rows: { label: string; value: number }[]
}) {
  const total = rows.reduce((s, r) => s + r.value, 0)
  return (
    <section className="card p-5">
      <h2 className="font-semibold text-gray-900 mb-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">Sem dados no período.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={i}>
              <div className="flex justify-between text-sm mb-0.5">
                <span className="text-gray-700">{r.label || '—'}</span>
                <span className="text-gray-400">{r.value}</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                <div
                  className="h-full bg-brand-500"
                  style={{ width: `${total ? (r.value / total) * 100 : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function fmtDay(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}` : iso
}
