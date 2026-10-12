'use client'

// Casca visual da Solicitação: hero (avatar, número grande, chips), barra de
// etapas e a coluna fixa da esquerda (Detalhes + Histórico). Só apresentação —
// as regras vivem em src/lib/solicitations/stages.ts.

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Check, Clock, Lock, Phone, Mail, MessageCircle, FolderOpen, User, Users, Compass, Pencil,
  Timer, CalendarDays, Thermometer, ArrowRightCircle, History, Plus, Loader2, Bot, StickyNote,
  MoreHorizontal, Flag, ArrowLeft, Filter, Ruler, Hammer, Flame, Tag, ChevronDown, ChevronUp,
  ChevronsLeft, ChevronsRight,
} from 'lucide-react'
import { avatarColor } from '@/lib/avatar-color'
import {
  computeStages, nextStep, bigMetric, currentStageId, stageDeadline, dateChip, daysInPipeline, localToday,
  mergeHistory, STAGES, type DateTone,
} from '@/lib/solicitations/stages'
import { getInitials, formatDate, formatRelativeWithTime, cn } from '@/lib/utils'
import { ORIGIN_LABEL, CATEGORY_LABEL, SIZE_LABEL, PRIORITY_LABEL, TEMPERATURE_LABEL, TEMPERATURE_COLOR } from '@/types'
import { addSolicitationNote, updateSolicitationDetails, type SolicitationView } from '@/lib/solicitations/actions'
import { searchContacts } from '@/lib/actions'

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
  const days = daysInPipeline(s.createdAt)
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
      <div className="text-[11px] text-gray-400 mt-1">
        {days} {days === 1 ? 'dia' : 'dias'} na esteira
      </div>
    </div>
  )
}

// Menu de ações do hero: Editar detalhes, Gerenciar equipe, Pasta no Drive.
// Dispara eventos custom window para o DetailsCard reagir (abrir em modo
// edição, scrollar até a seção da equipe).
function HeroActionsMenu({ s }: { s: SolicitationView }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  function editDetails() {
    setOpen(false)
    window.dispatchEvent(new CustomEvent('solicitation:edit-details'))
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Mais ações"
        title="Mais ações"
        onClick={() => setOpen(o => !o)}
        className="w-9 h-9 rounded-full bg-white border border-black/10 flex items-center justify-center text-gray-500 hover:text-navy shadow-sm transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-xl border border-black/5 py-1 z-30">
          <button type="button" onClick={editDetails}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left">
            <Pencil className="w-3.5 h-3.5 text-gray-400" /> Editar detalhes
          </button>
          <p className="px-3 py-2 text-[10.5px] text-gray-400 italic">
            Para gerenciar a equipe envolvida, abra o card Detalhes (ela aparece conforme quem registra ações).
          </p>
        </div>
      )}
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
        <div className="flex flex-col leading-tight">
          <h1 className="text-[22px] font-bold text-gray-900">{s.title || name}</h1>
          {s.title && <span className="text-[11px] text-gray-500 font-medium">{name}</span>}
        </div>
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

      {/* Linha 2: Valor grande à esquerda + status/ações à direita */}
      <div className="flex items-end justify-between mt-3 flex-wrap gap-4">
        <BigNumber s={s} primaryQuote={primaryQuote} />
        <div className="flex items-center gap-2 flex-wrap">
          {/* Chip de status conforme negociação real — não mais botões soltos */}
          {temp === 'closed' && (
            <button
              type="button"
              onClick={() => onSelect('negociacao')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[12.5px] font-semibold border bg-green-100 text-green-800 border-green-300 hover:bg-green-200 transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> Venda fechada
            </button>
          )}
          {temp === 'lost' && (
            <button
              type="button"
              onClick={() => onSelect('negociacao')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[12.5px] font-semibold border bg-red-100 text-red-800 border-red-300 hover:bg-red-200 transition-colors"
            >
              Perdida
            </button>
          )}
          <HeroActionsMenu s={s} />
          <button
            type="button"
            aria-label="Adicionar nota"
            title="Adicionar nota"
            onClick={() => {
              const el = document.querySelector<HTMLInputElement>('input[placeholder="Anotar ou atualizar…"]')
              if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus() }
            }}
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
                className="flex-1 min-w-[100px] text-left px-3 py-2.5 transition-shadow hover:opacity-90"
                style={{
                  borderRadius: 12,
                  ...(isDone
                    ? { background: 'linear-gradient(180deg,#d9f7e6,#bdeed3)', color: '#065f46', border: '1px solid #9fe0bc' }
                    : isCur
                    ? { background: 'linear-gradient(180deg,#fdecc0,#f5d78a)', color: '#5c4410', border: '1px solid #e0bd69' }
                    : { backgroundImage: 'repeating-linear-gradient(45deg,#eef0f4,#eef0f4 9px,#f7f8fa 9px,#f7f8fa 18px)', color: '#8b94a5', border: '1px dashed #cdd3de' }),
                }}
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

// Cartão pastel com título em "aba de pasta". `actions` renderiza botões à direita do título.
function NotchCard({ title, icon: Icon, tint, borderColor, bodyBg, textColor, actions, children }: {
  title: string; icon: any; tint: string; borderColor: string; bodyBg: string; textColor: string;
  actions?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div>
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold"
        style={{ background: tint, color: textColor, borderRadius: '14px 14px 0 0', border: `1px solid ${borderColor}`, borderBottom: 'none', position: 'relative', zIndex: 2, marginBottom: -1 }}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{title}</span>
        {actions && <span className="ml-auto flex items-center gap-1 pl-2">{actions}</span>}
      </div>
      <div
        className="p-3"
        style={{ background: bodyBg, borderRadius: '0 16px 16px 16px', border: `1px solid ${borderColor}`, boxShadow: 'rgba(255,255,255,.9) 0 1.5px 0 0 inset, rgba(10,31,59,.05) 0 2px 8px 0, rgba(10,31,59,.10) 0 18px 36px -22px' }}
      >
        {children}
      </div>
    </div>
  )
}

function Field({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 24, height: 24, borderRadius: 8, background: 'rgba(255,255,255,.85)', color: '#8a6a1f', boxShadow: 'inset 0 0 0 1px rgba(203,164,85,.25)', flexShrink: 0 }}
      >
        <Icon style={{ width: 12, height: 12 }} />
      </div>
      <div className="min-w-0 leading-tight">
        <div className="text-[9px] uppercase tracking-wide" style={{ color: '#9aa3b2', letterSpacing: '.05em', fontWeight: 600 }}>{label}</div>
        <div className="text-[12px] font-medium break-words" style={{ color: '#111827' }}>{value}</div>
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

const TAB_BTN_STYLE: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 999,
  border: '1px solid rgba(255,255,255,.55)',
  background: 'rgba(255,255,255,.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', flexShrink: 0,
}

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABEL) as [string, string][]
const SIZE_OPTIONS = Object.entries(SIZE_LABEL) as [string, string][]
const ORIGIN_OPTIONS = Object.entries(ORIGIN_LABEL) as [string, string][]
const PRIORITY_OPTIONS = Object.entries(PRIORITY_LABEL) as [string, string][]
const WORK_STAGE_OPTIONS = [
  ['foundation', 'Fundação'],
  ['structure', 'Estrutura'],
  ['masonry', 'Alvenaria'],
  ['rough', 'Obra bruta'],
  ['finishing', 'Acabamento'],
  ['delivered', 'Entregue'],
] as [string, string][]

export function DetailsCard({ s, primaryQuote }: { s: SolicitationView; primaryQuote: any | null }) {
  const [editing, setEditing] = useState(false)
  // Escuta o evento disparado pelo menu "..." do hero para entrar em edição
  // e rolar o card para a vista.
  useEffect(() => {
    function onEdit() {
      setEditing(true)
      setTimeout(() => {
        const el = document.querySelector<HTMLElement>('[data-details-card]')
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 60)
    }
    window.addEventListener('solicitation:edit-details', onEdit)
    return () => window.removeEventListener('solicitation:edit-details', onEdit)
  }, [])
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const [title, setTitle] = useState(s.title ?? '')
  const [category, setCategory] = useState(s.category ?? '')
  const [size, setSize] = useState(s.size ?? '')
  const [origin, setOrigin] = useState(s.origin ?? '')
  const [workStage, setWorkStage] = useState(s.workStage ?? '')
  const [priority, setPriority] = useState(s.priority ?? 'normal')

  // Arquiteto typeahead
  const [architectId, setArchitectId] = useState<string | null>(s.architectId ?? null)
  const [architectLabel, setArchitectLabel] = useState(s.architectName ?? '')
  const [archQuery, setArchQuery] = useState('')
  const [archResults, setArchResults] = useState<any[]>([])
  const [archOpen, setArchOpen] = useState(false)
  const archRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (archQuery.length < 2) { setArchResults([]); return }
    let active = true
    searchContacts(archQuery).then(r => { if (active) setArchResults(r as any[]) })
    return () => { active = false }
  }, [archQuery])

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (archRef.current && !archRef.current.contains(e.target as Node)) setArchOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  function save() {
    startTransition(async () => {
      await updateSolicitationDetails(s.id, {
        title: title.trim() || null,
        category: category || null,
        size: size || null,
        origin: origin || null,
        workStage: workStage || null,
        priority: priority || 'normal',
        architectId: architectId ?? null,
      })
      setEditing(false)
      router.refresh()
    })
  }

  const driveLink: string | null = primaryQuote?.drive_link ?? null

  const detailActions = (
    <>
      <button type="button" aria-label="Editar" title="Editar detalhes" onClick={() => setEditing(e => !e)} style={{ ...TAB_BTN_STYLE, background: editing ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.55)' }}>
        <Pencil style={{ width: 10, height: 10 }} />
      </button>
    </>
  )

  return (
    <NotchCard title="Detalhes" icon={User} tint="#fdf1cf" borderColor="#f3e0ae" bodyBg="linear-gradient(160deg,#fdf1cf 0%,#fffaf0 70%)" textColor="#7a5a14" actions={detailActions}>
      <div className="space-y-2" data-details-card>
        <Field icon={User} label="Nome" value={s.clientName ?? '—'} />
        {s.clientPhone && <Field icon={Phone} label="Telefone" value={s.clientPhone} />}
        {s.clientEmail && <Field icon={Mail} label="E-mail" value={s.clientEmail} />}
        {s.architectName && <Field icon={Pencil} label="Arquiteto(a)" value={s.architectName} />}

        {/* Campos de caracterização — sempre visíveis se preenchidos */}
        {s.category && !editing && <Field icon={Tag} label="Categoria" value={CATEGORY_LABEL[s.category as keyof typeof CATEGORY_LABEL] ?? s.category} />}
        {s.size && !editing && <Field icon={Ruler} label="Tamanho" value={SIZE_LABEL[s.size as keyof typeof SIZE_LABEL] ?? s.size} />}
        {s.origin && !editing && <Field icon={Compass} label="Origem" value={ORIGIN_LABEL[s.origin as keyof typeof ORIGIN_LABEL] ?? s.origin} />}
        {s.workStage && !editing && <Field icon={Hammer} label="Etapa da obra" value={WORK_STAGE_OPTIONS.find(([k]) => k === s.workStage)?.[1] ?? s.workStage} />}
        {s.priority && s.priority !== 'normal' && !editing && <Field icon={Flame} label="Prioridade" value={PRIORITY_LABEL[s.priority as keyof typeof PRIORITY_LABEL] ?? s.priority} />}

        {/* Formulário de edição inline */}
        {editing && (
          <div className="space-y-2 rounded-xl bg-white/70 p-3 border border-amber-200">
            <div>
              <label className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold block mb-1">Título</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex.: Reforma Apê 708 — Iluminação" className="input w-full text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold block mb-1">Categoria</label>
                <select value={category} onChange={e => setCategory(e.target.value)} className="select w-full text-xs">
                  <option value="">—</option>
                  {CATEGORY_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold block mb-1">Tamanho</label>
                <select value={size} onChange={e => setSize(e.target.value)} className="select w-full text-xs">
                  <option value="">—</option>
                  {SIZE_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold block mb-1">Origem</label>
                <select value={origin} onChange={e => setOrigin(e.target.value)} className="select w-full text-xs">
                  <option value="">—</option>
                  {ORIGIN_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold block mb-1">Etapa da obra</label>
                <select value={workStage} onChange={e => setWorkStage(e.target.value)} className="select w-full text-xs">
                  <option value="">—</option>
                  {WORK_STAGE_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold block mb-1">Prioridade</label>
                <select value={priority} onChange={e => setPriority(e.target.value)} className="select w-full text-xs">
                  {PRIORITY_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div className="col-span-2" ref={archRef}>
                <label className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold block mb-1">Arquiteto(a)</label>
                <div className="relative">
                  <input
                    value={archQuery || architectLabel}
                    placeholder="Buscar arquiteto…"
                    className="input w-full text-xs"
                    onChange={e => { setArchQuery(e.target.value); setArchitectLabel(e.target.value); setArchOpen(true) }}
                    onFocus={() => setArchOpen(true)}
                  />
                  {architectId && archQuery === '' && (
                    <button type="button" onClick={() => { setArchitectId(null); setArchitectLabel(''); setArchQuery('') }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
                  )}
                  {archOpen && archResults.length > 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {archResults.map((c: any) => (
                        <button key={c.id} type="button"
                          className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50"
                          onClick={() => { setArchitectId(c.id); setArchitectLabel(c.name); setArchQuery(''); setArchOpen(false) }}>
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={save} disabled={pending} className="btn-primary px-3 py-1 text-xs">
                {pending ? 'Salvando…' : 'Salvar'}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="btn-secondary px-3 py-1 text-xs">Cancelar</button>
            </div>
          </div>
        )}

        {s.team.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Equipe envolvida</div>
            <TeamStack team={s.team} />
          </div>
        )}
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          {s.clientPhone && <RoundAction href={waLink(s.clientPhone)} title="WhatsApp" icon={MessageCircle} external />}
          {s.clientPhone && <RoundAction href={`tel:${s.clientPhone.replace(/[^\d+]/g, '')}`} title="Ligar" icon={Phone} />}
          {s.clientEmail && <RoundAction href={`mailto:${s.clientEmail}`} title="Enviar e-mail" icon={Mail} />}
          {driveLink && (
            <a
              href={driveLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/80 hover:bg-white border border-amber-300/60 text-amber-800 transition-colors"
            >
              <FolderOpen className="w-3 h-3" /> Pasta no Drive
            </a>
          )}
        </div>
      </div>
    </NotchCard>
  )
}

type HistoryFilter = 'all' | 'note' | 'auto'
const FILTER_CYCLE: Record<HistoryFilter, HistoryFilter> = { all: 'note', note: 'auto', auto: 'all' }
const FILTER_TITLE: Record<HistoryFilter, string> = { all: 'Mostrar: todos', note: 'Mostrar: só notas', auto: 'Mostrar: só automáticos' }

export function HistoryCard({ s, activities }: { s: SolicitationView; activities: any[] }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [filter, setFilter] = useState<HistoryFilter>('all')
  const allEntries = mergeHistory(s.events, activities)
  const entries = filter === 'all' ? allEntries : allEntries.filter(e => filter === 'note' ? e.kind === 'note' : e.kind !== 'note')

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

  const historyActions = (
    <>
      {filter !== 'all' && (
        <span style={{ fontSize: 9, fontWeight: 700, color: '#5b21b6', letterSpacing: '.03em', paddingRight: 2 }}>
          {filter === 'note' ? 'Notas' : 'Auto'}
        </span>
      )}
      <button
        type="button"
        aria-label="Filtrar histórico"
        title={FILTER_TITLE[filter]}
        onClick={() => setFilter(f => FILTER_CYCLE[f])}
        style={{ ...TAB_BTN_STYLE, background: filter !== 'all' ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.55)', color: filter !== 'all' ? '#5b21b6' : 'inherit' }}
      >
        <Filter style={{ width: 10, height: 10 }} />
      </button>
      <button type="button" aria-label="Mais opções" title="Mais opções (em breve)" style={TAB_BTN_STYLE}>
        <MoreHorizontal style={{ width: 11, height: 11 }} />
      </button>
    </>
  )

  return (
    <NotchCard title="Histórico" icon={History} tint="#ece6fb" borderColor="#ddd2f8" bodyBg="linear-gradient(160deg,#ece6fb 0%,#f8f6ff 70%)" textColor="#5b21b6" actions={historyActions}>
      <div className="flex items-center gap-1.5 mb-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="Anotar ou atualizar…"
          maxLength={2000}
          className="input flex-1 min-w-0 !rounded-full bg-white !text-xs !py-1 !px-3"
        />
        <button type="button" onClick={add} disabled={pending || !text.trim()} className="btn-primary !rounded-full px-2.5 py-1 text-xs shrink-0">
          {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
        {entries.length === 0 && (
          <p className="text-xs text-gray-400 italic text-center py-2">
            {filter !== 'all' ? `Nenhum registro do tipo "${filter === 'note' ? 'Nota' : 'Automático'}".` : 'Nada registrado ainda.'}
          </p>
        )}
        {entries.map(e => {
          const isNote = e.kind === 'note'
          return (
            <div
              key={e.id}
              className="flex gap-2 px-2 py-1.5"
              style={{
                borderRadius: 10,
                border: `1px solid ${isNote ? '#f3e0ae' : 'rgba(10,31,59,.06)'}`,
                background: isNote ? '#fff7d6' : 'rgba(255,255,255,.85)',
              }}
            >
              {e.kind === 'system' && !e.authorName ? (
                <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center shrink-0"><Bot className="w-2.5 h-2.5 text-blue-600" /></div>
              ) : (
                <InitialsAvatar seed={e.authorId ?? e.authorName ?? 'x'} name={e.authorName ?? 'Sistema'} url={e.authorAvatarUrl} size={20} />
              )}
              <div className="min-w-0 flex-1 leading-tight">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[11px] font-semibold" style={{ color: '#111827' }}>{e.authorName ?? 'Sistema'}</span>
                  {isNote ? (
                    <span style={{ padding: '0 5px', borderRadius: 999, fontSize: 8.5, fontWeight: 700, background: '#fde68a', color: '#78490b', letterSpacing: '.03em' }}>NOTA</span>
                  ) : (
                    <span style={{ padding: '0 5px', borderRadius: 999, fontSize: 8.5, fontWeight: 600, background: '#ece6fb', color: '#6b5aa8', letterSpacing: '.03em' }}>AUTO</span>
                  )}
                  <span className="text-[9px] ml-auto" style={{ color: '#9aa3b2' }}>{formatRelativeWithTime(e.createdAt)}</span>
                </div>
                <p className="text-[11.5px] break-words whitespace-pre-wrap" style={{ color: isNote ? '#374151' : '#6b7280', marginTop: 1 }}>{e.text}</p>
              </div>
            </div>
          )
        })}
      </div>
    </NotchCard>
  )
}

export function SolicitationSidebar({ s, primaryQuote, activities }: { s: SolicitationView; primaryQuote: any | null; activities: any[] }) {
  const [collapsed, setCollapsed] = useState(false)

  if (collapsed) {
    return (
      <aside className="w-full lg:w-10 lg:shrink-0">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Expandir detalhes e histórico"
          className="w-full lg:w-10 h-full lg:min-h-[200px] flex lg:flex-col items-center justify-center gap-2 rounded-xl bg-white/80 border border-gray-200 hover:border-amber-300 hover:bg-amber-50 py-3 lg:py-6 text-gray-500 hover:text-amber-700 transition-colors"
        >
          <ChevronsRight className="w-4 h-4" />
          <span className="text-[10px] font-semibold uppercase tracking-wider lg:[writing-mode:vertical-rl] lg:rotate-180">Detalhes · Histórico</span>
        </button>
      </aside>
    )
  }

  return (
    <aside className="space-y-3 w-full lg:w-[280px] lg:shrink-0">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Recolher"
          className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-700 transition-colors"
        >
          <ChevronsLeft className="w-3 h-3" /> Recolher
        </button>
      </div>
      <DetailsCard s={s} primaryQuote={primaryQuote} />
      <HistoryCard s={s} activities={activities} />
    </aside>
  )
}
