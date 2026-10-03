'use client'

// Casca visual da Solicitação (Bloco A): avatar de iniciais, barra de etapas e
// aba Resumo. Só apresentação — regras vivem em src/lib/solicitations/stages.ts.

import { Check, Clock, Lock, User, Wallet, ArrowRightCircle, Users } from 'lucide-react'
import { avatarColor } from '@/lib/avatar-color'
import { computeStages, nextStep, quoteValues } from '@/lib/solicitations/stages'
import { getInitials, formatCurrency, formatDate, cn } from '@/lib/utils'
import type { SolicitationView } from '@/lib/solicitations/actions'

export function InitialsAvatar({ seed, name, url, size = 56 }: { seed: string; name: string; url?: string | null; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} title={name} width={size} height={size} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  }
  const c = avatarColor(seed)
  return (
    <div
      title={name}
      className="rounded-full flex items-center justify-center font-semibold shrink-0"
      style={{ width: size, height: size, background: c.bg, color: c.text, fontSize: Math.round(size * 0.38) }}
    >
      {getInitials(name || '?')}
    </div>
  )
}

export function SolicitationHeader({ s, doneCount, startedCount }: { s: SolicitationView; doneCount: number; startedCount: number }) {
  const name = s.clientName ?? 'Cliente'
  return (
    <div className="flex items-center gap-4 flex-wrap mb-4">
      <InitialsAvatar seed={s.clientId || name} name={name} size={64} />
      <div className="min-w-0">
        <div className="text-sm text-gray-500">Solicitação #{s.number}</div>
        <h1 className="text-2xl font-semibold truncate">{name}</h1>
        <div className="flex items-center gap-2 flex-wrap mt-1 text-xs text-gray-500">
          {s.architectName && <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 font-medium">Arq. {s.architectName}</span>}
          <span>Criada em {formatDate(s.createdAt)}</span>
          <span
            className="font-medium px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-700"
            title="Etapa concluída = já tem um desfecho registrado (orçamento concluído, negociação fechada/perdida, compra toda recebida, etc.). O total considera só as etapas já iniciadas (com algum registro) nesta Solicitação."
          >
            {doneCount} de {startedCount} etapas concluídas
          </span>
        </div>
      </div>
    </div>
  )
}

export function StagePipeline({ s, onSelect }: { s: SolicitationView; onSelect: (id: string) => void }) {
  const stages = computeStages(s)
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 mb-5">
      {stages.map(st => {
        const Icon = st.state === 'done' ? Check : st.state === 'current' ? Clock : Lock
        return (
          <button
            key={st.id}
            type="button"
            onClick={() => onSelect(st.id)}
            className={cn(
              'flex-1 min-w-[112px] text-left rounded-card px-3 py-2 border transition-shadow hover:shadow-sm',
              st.state === 'done' && 'bg-green-500 border-green-500 text-white',
              st.state === 'current' && 'bg-brand-500/15 border-brand-500 text-navy',
              st.state === 'not_started' && 'border-dashed border-gray-300 text-gray-400 bg-gray-50'
            )}
            style={st.state === 'not_started' ? { backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 6px, rgba(0,0,0,0.04) 6px 12px)' } : undefined}
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{st.label}</span>
            </div>
            <div className="text-[11px] mt-0.5 opacity-90 h-4">
              {st.days != null ? `${st.days} ${st.days === 1 ? 'dia' : 'dias'}` : ''}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function SummaryCard({ icon: Icon, title, tint, children }: { icon: any; title: string; tint: string; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-card border border-surface-border p-4', tint)}>
      <div className="flex items-center gap-2 mb-3 text-navy">
        <Icon className="w-4 h-4" />
        <h3 className="eyebrow">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm py-0.5">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  )
}

export function SolicitationSummary({ s, primaryQuote, onSelect }: { s: SolicitationView; primaryQuote: any | null; onSelect: (id: string) => void }) {
  const v = quoteValues(primaryQuote)
  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const next = nextStep(s, today, x => formatDate(x))
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SummaryCard icon={User} title="Cliente" tint="bg-sky-50/60">
        <Row label="Nome" value={s.clientName ?? '—'} />
        {s.clientPhone && <Row label="Telefone" value={s.clientPhone} />}
        {s.clientEmail && <Row label="E-mail" value={s.clientEmail} />}
        {s.architectName && <Row label="Arquiteto(a)" value={s.architectName} />}
      </SummaryCard>
      <SummaryCard icon={Wallet} title="Valores" tint="bg-green-50/60">
        {v.quoted == null && v.final == null && v.received == null ? (
          <p className="text-sm text-gray-400 italic">Sem valores registrados ainda.</p>
        ) : (
          <>
            {v.quoted != null && <Row label="Valor orçado" value={formatCurrency(v.quoted)} />}
            {v.final != null && <Row label="Valor final / fechado" value={formatCurrency(v.final)} />}
            {v.received != null && <Row label="Recebido" value={formatCurrency(v.received)} />}
            {v.open != null && <Row label="Em aberto" value={formatCurrency(v.open)} />}
          </>
        )}
      </SummaryCard>
      <SummaryCard icon={ArrowRightCircle} title="Próximo passo" tint="bg-amber-50/60">
        <p className="text-sm font-medium">{next.text}</p>
        {next.tab && (
          <button type="button" onClick={() => onSelect(next.tab!)} className="text-xs text-brand-700 hover:underline mt-1">
            Abrir etapa
          </button>
        )}
      </SummaryCard>
      <SummaryCard icon={Users} title="Equipe envolvida" tint="bg-violet-50/60">
        {s.team.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Ninguém registrado ainda.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {s.team.map(u => (
              <div key={u.id} className="flex items-center gap-2">
                <InitialsAvatar seed={u.id} name={u.name} url={u.avatar_url} size={32} />
                <span className="text-sm">{u.name}</span>
              </div>
            ))}
          </div>
        )}
      </SummaryCard>
    </div>
  )
}
