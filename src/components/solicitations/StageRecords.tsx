'use client'

// Peças do layout das abas de etapa ("Planejado / Concluído + Arquivos"):
// linha de registro com bolha colorida + linha do tempo, menu "…", seletor de
// status colorido e o painel de 2 colunas. Só layout — a escrita continua nas
// server actions existentes (ver SolicitationDetail).

import { useEffect, useRef, useState } from 'react'
import { Check, MoreHorizontal, Pencil, Trash2, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { shortDayLabel, localToday } from '@/lib/solicitations/stages'
import { DateChip } from '@/components/solicitations/SolicitationOverview'
import { StageFilesColumn } from '@/components/solicitations/StageFiles'
import type { StageFileStage } from '@/lib/solicitations/actions'

export function StatusSelect({ value, options, colors, onChange, disabled }: {
  value: string
  options: Record<string, string>
  colors: Record<string, { bg: string; text: string }>
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const c = colors[value] ?? Object.values(colors)[0]
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      className={cn('badge font-semibold border-0 cursor-pointer', c?.bg, c?.text)}
    >
      {Object.entries(options).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  )
}

function RowMenu({ onEdit, onDelete, disabled }: { onEdit?: () => void; onDelete?: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  if (!onEdit && !onDelete) return null
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} disabled={disabled} aria-label="Mais ações"
        className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600">
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-32 rounded-xl border border-surface-border bg-white shadow-lg py-1">
          {onEdit && (
            <button type="button" onClick={() => { setOpen(false); onEdit() }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={() => { setOpen(false); onDelete() }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function RecordRow({
  accent, icon: Icon, title, date, finished, meta, status, onEdit, onDelete, pending, children,
}: {
  accent: string
  icon: any
  title: React.ReactNode
  date?: string | null
  finished: boolean
  meta: string
  status?: React.ReactNode
  onEdit?: () => void
  onDelete?: () => void
  pending?: boolean
  children?: React.ReactNode
}) {
  const today = localToday()
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center w-11 shrink-0">
        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: accent + '26', color: accent }}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="w-px flex-1 bg-gray-200 my-1" />
        <div className="text-[10px] text-gray-400 text-center leading-tight min-h-[12px]">{shortDayLabel(date)}</div>
      </div>
      <div
        className={cn('flex-1 min-w-0 rounded-card border border-surface-border bg-white px-3 py-2.5 mb-3', pending && 'opacity-60')}
        style={{ borderLeftWidth: 4, borderLeftColor: accent, borderLeftStyle: 'solid' }}
      >
        <div className="flex items-center gap-2">
          <span className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0', finished ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300')} aria-label={finished ? 'Concluído' : 'Pendente'}>
            {finished && <Check className="w-3 h-3" strokeWidth={3} />}
          </span>
          <div className="font-semibold text-sm text-navy truncate flex-1 min-w-0">{title}</div>
          <DateChip date={date} today={today} />
          <RowMenu onEdit={onEdit} onDelete={onDelete} disabled={pending} />
        </div>
        {status && <div className="mt-2 flex items-center gap-2 flex-wrap">{status}</div>}
        <div className="text-[11px] text-gray-400 mt-1.5">{meta}</div>
        {children}
      </div>
    </div>
  )
}

function Section({ title, count, children, empty }: { title: string; count: number; children: React.ReactNode; empty: string }) {
  return (
    <section className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="eyebrow">{title}</h3>
        <span className="text-xs rounded-full bg-gray-100 text-gray-500 px-1.5 py-0.5 leading-none">{count}</span>
      </div>
      {count === 0 ? <p className="text-sm text-gray-400 italic py-3 px-1">{empty}</p> : children}
    </section>
  )
}

// Painel de uma etapa: esquerda = Planejado/Concluído + barra "Adicionar";
// direita = Arquivos (subpasta da etapa no Drive).
export function StagePanel({
  stage, solicitationId, planned, done, addLabel, renderAddForm, emptyPlanned, emptyDone,
}: {
  stage: StageFileStage
  solicitationId: string
  planned: React.ReactNode[]
  done: React.ReactNode[]
  addLabel?: string
  renderAddForm?: (close: () => void) => React.ReactNode
  emptyPlanned: string
  emptyDone: string
}) {
  const [adding, setAdding] = useState(false)
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        <Section title="Planejado" count={planned.length} empty={emptyPlanned}>{planned}</Section>
        <Section title="Concluído" count={done.length} empty={emptyDone}>{done}</Section>
        {addLabel && renderAddForm && (
          adding ? (
            <div className="relative">
              <button type="button" onClick={() => setAdding(false)} aria-label="Fechar" className="absolute right-2 top-2 z-10 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
              {renderAddForm(() => setAdding(false))}
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(true)}
              className="w-full flex items-center gap-2 rounded-full border border-surface-border bg-white px-4 py-2.5 text-sm text-gray-400 hover:border-brand-300 shadow-sm">
              <span className="flex-1 text-left">Registrar nesta etapa…</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-navy text-white px-3 py-1 text-xs font-medium"><Plus className="w-3.5 h-3.5" /> {addLabel}</span>
            </button>
          )
        )}
      </div>
      <StageFilesColumn solicitationId={solicitationId} stage={stage} />
    </div>
  )
}
