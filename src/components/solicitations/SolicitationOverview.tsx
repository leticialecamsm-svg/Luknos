'use client'

// Casca visual da Solicitação: hero (avatar, número grande, chips), barra de
// etapas e a coluna fixa da esquerda (Detalhes + Histórico). Só apresentação —
// as regras vivem em src/lib/solicitations/stages.ts.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Check, Clock, Lock, Phone, Mail, MessageCircle, FolderOpen, User, Users, Compass, Pencil,
  Timer, CalendarDays, Thermometer, ArrowRightCircle, History, Plus, Loader2, Bot, StickyNote,
  MoreHorizontal, Flag, ArrowLeft,
} from 'lucide-react'
import { avatarColor } from '@/lib/avatar-color'
import {
  computeStages, nextStep, bigMetric, currentStageId, stageDeadline, dateChip, daysInPipeline, localToday,
  mergeHistory, STAGES, type DateTone,
} from '@/lib/solicitations/stages'
import { getInitials, formatDate, formatRelativeWithTime, cn } from '@/lib/utils'
import { ORIGIN_LABEL, TEMPERATURE_LABEL, TEMPERATURE_COLOR } from '@/types'
import { addSolicitationNote, type SolicitationView } from '@/lib/solicitations/actions'

export function InitialsAvatar({ seed, name, url, size = 56, square = false }: { seed: string; name: string; url?: string | null; size?: number; square?: boolean }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} title={name} width={size} height={size} className="object-cover shrink-0" style={{ width: size, height: size, borderRadius: square ? 14 : '50%' }} />
  }
  const c = avatarColor(seed)
  return (
    <div
      title={name}
      className="flex items-center justify-center font-semibold shrink-0"
      style={{ width: size, height: size, background: c.bg, color: c.text, fontSize: Math.round(size * 0.38), borderRadius: square ? 14 : '50%', boxShadow: square ? 'inset 0 0 0 1.5px rgba(255,255,255,.7)' : undefined }}
    >
      {getInitials(name || '?')}
    </div>
  )
}

// Pilha de avatares da equipe envolvida.
export function TeamStack({ team }: { team: SolicitationView['team'] }) {
  if (team.length === 0) return null
  return (
    <div className="flex items-center gap-2" title={team.map(u => u.name).join(', ')}>
      <Users className="w-3.5 h-3.5 text-gray-400" />
      <div className="flex -space-x-2">
        {team.slice(0, 5).map(u => (
          <div key={u.id} className="rounded-full ring-2 ring-white">
            <InitialsAvatar seed={u.id} name={u.name} url={u.avatar_url} size={26} />
          </div>
        ))}
        {team.length > 5 && (
          <div className="w-[26px] h-[26px] rounded-full bg-gray-100 ring-2 ring-white text-[10px] font-semibold text-gray-600 flex items-center justify-center">
            +{team.length - 5}
          </div>
        )}
      </div>
    </div>
  )
}

const TONE_CLASS: Record<DateTone, string> = {
  overdue: 'bg-red-50 text-red-700',
  today: 'bg-amber-100 text-amber-800',
  soon: 'bg-sky-50 text-sky-700',
  future: 'bg-gray-100 text-gray-600',
}
export function DateChip({ date, today }: { date: string | null | undefined; today: string }) {
  const c = dateChip(date, today)
  if (!c) return null
  return <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap', TONE_CLASS[c.tone])}>{c.label}</span>
}

function Chip({ icon: Icon, label, children, className, onClick }: { icon: any; label: string; children: React.ReactNode; className?: string; onClick?: () => void }) {
  const Comp: any = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn('flex items-center gap-2 rounded-full border border-surface-border bg-white px-3 py-1.5 text-left', onClick && 'hover:shadow-sm', className)}
    >
      <Icon className="w-4 h-4 text-brand-600 shrink-0" />
      <span className="leading-tight">
        <span className="block text-[10px] uppercase tracking-wide text-gray-400">{label}</span>
        <span className="block text-sm font-semibold text-navy">{children}</span>
      </span>
    </Comp>
  )
}

function InlineChip({ icon: Icon, label, children, onClick }: { icon: any; label: string; children: React.ReactNode; onClick?: (() => void) | undefined }) {
  const Comp: any = onClick ? 'button' : 'span'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn('inline-flex items-center gap-1.5', onClick && 'hover:opacity-70')}
    >
      <Icon className="w-3.5 h-3.5 text-brand-500 shrink-0" />
      <span className="text-[11px] uppercase tracking-wide text-gray-400">{label}</span>
      <span className="text-sm font-semibold text-navy">{children}</span>
    </Comp>
  )
}

// Chip do hero igual ao wireframe: pill com ícone em círculo colorido + label cinza + valor bold.
function HeroChip({ iconBg, iconColor, icon: Icon, label, children, onClick }: {
  iconBg: string; iconColor: string; icon: any; label: string; children: React.ReactNode; onClick?: () => void
}) {
  const Comp: any = onClick ? 'button' : 'span'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn('inline-flex items-center gap-[7px] pl-2 pr-3 py-1.5 rounded-full bg-white border border-black/[0.08] whitespace-nowrap', onClick && 'hover:border-brand-500 transition-colors')}
    >
      <span className="w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0" style={{ background: iconBg, color: iconColor }}>
        <Icon className="w-3 h-3" />
      </span>
      <span className="text-[11px] text-gray-400">{label}</span>
      <b className="font-semibold text-gray-900 text-[12px]">{children}</b>
    </Comp>
  )
}

function BigNumber({ s, primaryQuote }: { s: SolicitationView; primaryQuote: any | null }) {
  const m = bigMetric(s, primaryQuote)
  if (m.kind === 'days') {
    return (
      <div>
        <div className="text-[11px] uppercase tracking-wide text-gray-400">Tempo</div>
        <div className="text-navy leading-none">
          <span className="text-6xl font-bold">{m.days}</span>
          <span className="text-xl text-gray-400 ml-1.5">{m.days === 1 ? 'dia' : 'dias'} {m.label}</span>
        </div>
      </div>
    )
  }
  const [int, cents] = m.value.toFixed(2).split('.')
  const intFmt = Number(int).toLocaleString('pt-BR')
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-400">{m.label}</div>
      <div className="text-navy leading-none whitespace-nowrap">
        <span className="text-xl text-gray-400 mr-1">R$</span>
        <span className="text-6xl font-bold">{intFmt}</span>
        <span className="text-2xl text-gray-400">,{cents}</span>
      </div>
    </div>
  )
}

export function SolicitationHero({
  s, primaryQuote, doneCount, startedCount, onSelect,
}: { s: SolicitationView; primaryQuote: any | null; doneCount: number; startedCount: number; onSelect: (id: string) => void }) {
  const name = s.clientName ?? 'Cliente'
  const neg = s.negotiations[0]
  const temp = neg?.temperature as keyof typeof TEMPERATURE_LABEL | undefined

  return (
    <div className="mb-4">
      {/* Linha 1: ← + Avatar quadrado + nome + #número + "Em andamento" + contagem */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/solicitacoes" aria-label="Voltar" className="w-8 h-8 rounded-full border border-black/10 bg-white/85 flex items-center justify-center text-gray-600 hover:text-navy shrink-0">
          <ArrowLeft className="w-3.5 h-3.5" />
        </Link>
        <InitialsAvatar seed={s.clientId || name} name={name} size={40} square />
        <h1 className="text-[22px] font-bold leading-tight text-gray-900">{name}</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white border border-amber-200 font-mono text-[11px] font-medium text-amber-800">#{s.number}</span>
        <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11.5px] font-medium">Em andamento</span>
        <span
          className="px-2 py-0.5 rounded-full bg-green-100 border border-green-200 text-green-800 text-[11.5px] font-semibold"
          title="Etapa concluída = já tem um desfecho registrado"
        >
          {doneCount} de {startedCount} etapas concluídas
        </span>
        {s.architectName && <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-xs font-medium">Arq. {s.architectName}</span>}
      </div>

      {/* Linha 2: Valor grande à esquerda + botões de ação à direita */}
      <div className="flex items-end justify-between mt-3 flex-wrap gap-4">
        <BigNumber s={s} primaryQuote={primaryQuote} />
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => onSelect('negociacao')}
            className={cn(
              'inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[12.5px] font-semibold border transition-colors',
              temp === 'closed'
                ? 'bg-green-100 text-green-800 border-green-300'
                : 'bg-white text-green-700 border-green-500 hover:bg-green-50'
            )}
          >
            <Check className="w-3.5 h-3.5" /> Venda fechada
          </button>
          <button
            type="button"
            onClick={() => onSelect('negociacao')}
            className={cn(
              'inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-semibold bg-white border border-black/10 shadow-sm transition-colors hover:border-brand-500',
              temp === 'lost' ? 'text-red-700' : 'text-red-700'
            )}
          >
            Perdida
          </button>
          <button
            type="button"
            aria-label="Mais ações"
            className="w-9 h-9 rounded-full bg-white border border-black/10 flex items-center justify-center text-gray-500 hover:text-navy shadow-sm transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Adicionar"
            className="w-9 h-9 rounded-full bg-brand-500 border border-brand-500 flex items-center justify-center text-white shadow-sm"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function StagePipeline({ s, primaryQuote, onSelect }: { s: SolicitationView; primaryQuote: any | null; onSelect: (id: string) => void }) {
  const stages = computeStages(s)
  const today = localToday()
  const curId = currentStageId(s)
  const deadline = stageDeadline(s, primaryQuote, curId)
  const curLabel = STAGES.find(x => x.id === curId)?.label
  const neg = s.negotiations[0]
  const temp = neg?.temperature as keyof typeof TEMPERATURE_LABEL | undefined
  const next = nextStep(s, today, x => formatDate(x))
  const days = daysInPipeline(s.createdAt)

  return (
    <div className="mb-0">
      {/* Linha de segmentos + prazo no canto direito */}
      <div className="flex items-stretch gap-3">
        <div className="flex-1 min-w-0 flex gap-1 overflow-x-auto pb-1">
          {stages.map(st => {
            const isDone = st.state === 'done'
            const isCur = st.state === 'current'
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => onSelect(st.id)}
                className={cn(
                  'flex-1 min-w-[100px] text-left rounded-card px-3 py-2.5 border transition-shadow hover:shadow-sm',
                  isDone && 'bg-green-500 border-green-500 text-white',
                  isCur && 'bg-amber-50 border-amber-300 text-amber-900',
                  !isDone && !isCur && 'border-dashed border-gray-300 text-gray-400'
                )}
                style={!isDone && !isCur ? { backgroundImage: 'repeating-linear-gradient(45deg,#eef0f4,#eef0f4 9px,#f7f8fa 9px,#f7f8fa 18px)' } : undefined}
              >
                <div className="flex items-center gap-1 w-full">
                  <span className="text-[11.5px] font-semibold truncate">{st.label}</span>
                  {isDone && <Check className="ml-auto shrink-0 w-3 h-3" />}
                  {isCur && <Clock className="ml-auto shrink-0 w-3 h-3" />}
                </div>
                <div className="text-[10.5px] font-medium opacity-85 mt-0.5">
                  {st.days != null ? `${st.days} ${st.days === 1 ? 'dia' : 'dias'}` : ' '}
                </div>
              </button>
            )
          })}
        </div>
        {/* Prazo da etapa atual — canto direito da barra */}
        {deadline && (
          <button
            type="button"
            onClick={() => onSelect(deadline.stage)}
            className="shrink-0 flex items-center gap-2 pl-3 pr-2 hover:opacity-80 transition-opacity"
          >
            <Flag className="w-4 h-4 text-brand-500 shrink-0" />
            <div className="text-left">
              <p className="text-[9.5px] uppercase tracking-wide text-gray-400 font-semibold leading-none mb-0.5">Prazo da etapa atual</p>
              <p className="text-[12.5px] font-semibold text-gray-900 leading-none">{formatDate(deadline.date)}</p>
            </div>
          </button>
        )}
      </div>

      {/* Chips — pill com ícone colorido + label + valor, igual ao wireframe */}
      <div className="flex flex-wrap gap-2 mt-3">
        <HeroChip iconBg="#e0f2fe" iconColor="#0369a1" icon={Timer} label="Tempo na esteira">
          {days} {days === 1 ? 'dia' : 'dias'}
        </HeroChip>
        {deadline && (
          <HeroChip iconBg="#fef3c7" iconColor="#92400e" icon={CalendarDays} label="Prazo da etapa atual" onClick={() => onSelect(deadline.stage)}>
            <span className="flex items-center gap-1">{formatDate(deadline.date)} <DateChip date={deadline.date} today={today} /></span>
          </HeroChip>
        )}
        {temp && TEMPERATURE_LABEL[temp] && (
          <HeroChip iconBg="#d1fae5" iconColor="#065f46" icon={Thermometer} label="Temperatura" onClick={() => onSelect('negociacao')}>
            <span className={TEMPERATURE_COLOR[temp].text}>{TEMPERATURE_LABEL[temp]}</span>
          </HeroChip>
        )}
        <HeroChip iconBg="#ede9fe" iconColor="#5b21b6" icon={ArrowRightCircle} label="Próximo passo" onClick={next.tab ? () => onSelect(next.tab!) : undefined}>
          {next.text}
        </HeroChip>
        {/* Equipe como último chip */}
        {s.team.length > 0 && (
          <span className="inline-flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-white border border-black/[0.08]">
            <span className="text-[11px] text-gray-400 pl-1">Equipe</span>
            <div className="flex -space-x-1.5 pl-1">
              {s.team.slice(0, 5).map(u => (
                <div key={u.id} className="rounded-full ring-1 ring-white">
                  <InitialsAvatar seed={u.id} name={u.name} url={u.avatar_url} size={22} />
                </div>
              ))}
              {s.team.length > 5 && (
                <div className="w-[22px] h-[22px] rounded-full bg-gray-100 ring-1 ring-white text-[9px] font-semibold text-gray-600 flex items-center justify-center">
                  +{s.team.length - 5}
                </div>
              )}
            </div>
          </span>
        )}
      </div>
    </div>
  )
}

// Cartão pastel com título em "aba de pasta" (chip com entalhe).
function NotchCard({ title, icon: Icon, tint, borderColor, bodyBg, textColor, children }: {
  title: string; icon: any; tint: string; borderColor: string; bodyBg: string; textColor: string; children: React.ReactNode
}) {
  return (
    <div>
      <div
        className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold"
        style={{ background: tint, color: textColor, borderRadius: '14px 14px 0 0', border: `1px solid ${borderColor}`, borderBottom: 'none', position: 'relative', zIndex: 2, marginBottom: -1 }}
      >
        <Icon className="w-3.5 h-3.5" /> {title}
      </div>
      <div
        className="p-4 relative"
        style={{ background: bodyBg, borderRadius: '0 22px 22px 22px', border: `1px solid ${borderColor}`, boxShadow: 'rgba(255,255,255,.9) 0 1.5px 0 0 inset, rgba(10,31,59,.05) 0 2px 8px 0, rgba(10,31,59,.10) 0 18px 36px -22px' }}
      >
        {children}
      </div>
    </div>
  )
}

function Field({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-full bg-white/70 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-brand-700" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
        <div className="text-sm font-medium text-navy break-words">{value}</div>
      </div>
    </div>
  )
}

function waLink(phone: string): string {
  const d = phone.replace(/\D/g, '')
  return `https://wa.me/${d.length <= 11 ? '55' + d : d}`
}

function RoundAction({ href, title, icon: Icon, external }: { href: string; title: string; icon: any; external?: boolean }) {
  return (
    <a
      href={href}
      title={title}
      aria-label={title}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-navy hover:bg-brand-500 hover:text-white transition-colors shadow-sm"
    >
      <Icon className="w-4 h-4" />
    </a>
  )
}

export function DetailsCard({ s, primaryQuote }: { s: SolicitationView; primaryQuote: any | null }) {
  const origin = primaryQuote?.origin ? ORIGIN_LABEL[primaryQuote.origin as keyof typeof ORIGIN_LABEL] ?? null : null
  const driveLink: string | null = primaryQuote?.drive_link ?? null
  return (
    <NotchCard title="Detalhes" icon={User} tint="#fdf1cf" borderColor="#f3e0ae" bodyBg="linear-gradient(160deg,#fdf1cf 0%,#fffaf0 70%)" textColor="#7a5a14">
      <div className="space-y-3">
        <Field icon={User} label="Cliente" value={s.clientName ?? '—'} />
        {s.clientPhone && <Field icon={Phone} label="Telefone" value={s.clientPhone} />}
        {s.clientEmail && <Field icon={Mail} label="E-mail" value={s.clientEmail} />}
        {s.architectName && <Field icon={Pencil} label="Arquiteto(a)" value={s.architectName} />}
        {origin && <Field icon={Compass} label="Origem" value={origin} />}
        {s.team.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Equipe envolvida</div>
            <TeamStack team={s.team} />
          </div>
        )}
        <div className="flex items-center gap-2 pt-1">
          {s.clientPhone && <RoundAction href={waLink(s.clientPhone)} title="WhatsApp" icon={MessageCircle} external />}
          {s.clientPhone && <RoundAction href={`tel:${s.clientPhone.replace(/[^\d+]/g, '')}`} title="Ligar" icon={Phone} />}
          {s.clientEmail && <RoundAction href={`mailto:${s.clientEmail}`} title="Enviar e-mail" icon={Mail} />}
          {driveLink && <RoundAction href={driveLink} title="Pasta no Drive" icon={FolderOpen} external />}
        </div>
      </div>
    </NotchCard>
  )
}

export function HistoryCard({ s, activities }: { s: SolicitationView; activities: any[] }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const entries = mergeHistory(s.events, activities)

  function add() {
    const t = text.trim()
    if (!t) return
    setError(null)
    startTransition(async () => {
      const res = await addSolicitationNote(s.id, t)
      if (res.error) { setError(res.error); return }
      setText('')
      router.refresh()
    })
  }

  return (
    <NotchCard title="Histórico" icon={History} tint="#ece6fb" borderColor="#ddd2f8" bodyBg="linear-gradient(160deg,#ece6fb 0%,#f8f6ff 70%)" textColor="#5b21b6">
      <div className="flex items-center gap-2 mb-3">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="Anotar ou atualizar…"
          maxLength={2000}
          className="input flex-1 min-w-0 !rounded-full bg-white"
        />
        <button type="button" onClick={add} disabled={pending || !text.trim()} className="btn-primary !rounded-full px-3 py-1.5 text-sm shrink-0">
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Adicionar
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
        {entries.length === 0 && <p className="text-sm text-gray-400 italic text-center py-3">Nada registrado ainda.</p>}
        {entries.map(e => (
          <div key={e.id} className="flex gap-2.5 rounded-xl bg-white/70 p-2.5">
            {e.kind === 'system' && !e.authorName ? (
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0"><Bot className="w-3.5 h-3.5 text-blue-600" /></div>
            ) : (
              <InitialsAvatar seed={e.authorId ?? e.authorName ?? 'x'} name={e.authorName ?? 'Sistema'} url={e.authorAvatarUrl} size={28} />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-gray-700">{e.authorName ?? 'Sistema'}</span>
                {e.kind === 'note' ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full"><StickyNote className="w-2.5 h-2.5" /> Nota</span>
                ) : (
                  <span className="text-[10px] font-medium text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">Automático</span>
                )}
                <span className="text-[10px] text-gray-400 ml-auto">{formatRelativeWithTime(e.createdAt)}</span>
              </div>
              {/* Texto puro (React escapa) — nunca HTML. */}
              <p className={cn('text-sm mt-0.5 break-words whitespace-pre-wrap', e.kind === 'system' ? 'text-gray-500' : 'text-gray-800')}>{e.text}</p>
            </div>
          </div>
        ))}
      </div>
    </NotchCard>
  )
}

export function SolicitationSidebar({ s, primaryQuote, activities }: { s: SolicitationView; primaryQuote: any | null; activities: any[] }) {
  return (
    <aside className="space-y-5 w-full lg:w-[320px] lg:shrink-0">
      <DetailsCard s={s} primaryQuote={primaryQuote} />
      <HistoryCard s={s} activities={activities} />
    </aside>
  )
}
