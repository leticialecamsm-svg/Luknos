import { FileText, Image as ImageIcon, File as FileIcon, PlayCircle, HardDrive, ExternalLink, Clock, AlertTriangle, CheckCircle2, CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Pace } from '@/lib/training/state'

export const KIND_ICON: Record<string, typeof FileText> = {
  text: FileText, image: ImageIcon, pdf: FileIcon, youtube: PlayCircle, drive: HardDrive, link: ExternalLink,
}

export function ProgressBar({ pct, className, tone = 'gold' }: { pct: number; className?: string; tone?: 'gold' | 'green' }) {
  return (
    <div className={cn('h-2 rounded-full bg-surface-secondary border border-surface-border overflow-hidden', className)}>
      <div className={cn('h-full rounded-full transition-all', tone === 'green' || pct >= 100 ? 'bg-green-500' : 'bg-brand-500')} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

const PACE_STYLE: Record<Pace['status'], string> = {
  sem_prazo: 'bg-surface-secondary text-gray-500',
  concluida: 'bg-green-50 text-green-700',
  ok: 'bg-blue-50 text-blue-700',
  apertado: 'bg-amber-50 text-amber-700',
  atrasada: 'bg-red-50 text-red-700',
}

export function DeadlineChip({ pace, due }: { pace: Pace; due: string | null }) {
  const Icon = pace.status === 'concluida' ? CheckCircle2 : pace.status === 'atrasada' || pace.status === 'apertado' ? AlertTriangle : due ? CalendarClock : Clock
  const label = pace.status === 'concluida' ? 'Concluída'
    : !due ? 'Sem prazo'
    : pace.status === 'atrasada' ? `Atrasada ${Math.abs(pace.daysLeft ?? 0)}d`
    : pace.daysLeft === 0 ? 'Vence hoje'
    : `${pace.daysLeft} dia${pace.daysLeft === 1 ? '' : 's'} restantes`
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', PACE_STYLE[pace.status])}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  )
}

export const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
export const fmtMin = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m} min`
