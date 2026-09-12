'use client'

import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react'
import { colorOf, monthLabel, nf } from './lib'

export function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][]
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="bg-white border border-surface-border rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-brand-500">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}

export function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="flex bg-gray-100 rounded-lg p-1 gap-0.5 self-end">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)}
          className={cn('px-3 py-1.5 rounded-md text-sm font-medium transition-all',
            value === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
          {l}
        </button>
      ))}
    </div>
  )
}

export function Card({ icon: Icon, title, subtitle, right, children, help }: {
  icon: any; title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode; help?: string
}) {
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2.5">
          <Icon className="w-4 h-4 text-gray-400 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
              {title}
              {help && <span title={help}><Info className="w-3.5 h-3.5 text-gray-300 hover:text-gray-500 cursor-help" /></span>}
            </h2>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

export function Delta({ cur, prev, inverse }: { cur: number; prev: number; inverse?: boolean }) {
  if (!prev && !cur) return <span className="text-xs text-gray-300">—</span>
  if (!prev) return <span className="text-xs font-semibold text-emerald-600">novo</span>
  const d = (cur - prev) / Math.abs(prev)
  const good = inverse ? d < 0 : d > 0
  const flat = Math.abs(d) < 0.005
  const Icon = flat ? Minus : d > 0 ? TrendingUp : TrendingDown
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums',
      flat ? 'text-gray-400' : good ? 'text-emerald-600' : 'text-red-500')}>
      <Icon className="w-3 h-3" /> {d > 0 ? '+' : ''}{nf(d * 100, 0)}%
    </span>
  )
}

export function Kpi({ label, value, cur, prev, compare, hint, inverse }: {
  label: string; value: string; cur?: number; prev?: number; compare?: string; hint?: string; inverse?: boolean
}) {
  return (
    <div className="card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1.5 tabular-nums">{value}</p>
      {compare && cur !== undefined && prev !== undefined && (
        <div className="flex items-center gap-1.5 mt-1">
          <Delta cur={cur} prev={prev} inverse={inverse} />
          <span className="text-[11px] text-gray-400">vs {monthLabel(compare, true)}</span>
        </div>
      )}
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

export function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className="rounded-lg bg-surface border border-surface-border px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={cn('text-lg font-bold mt-0.5 tabular-nums',
        tone === 'good' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : tone === 'bad' ? 'text-red-600' : 'text-gray-900')}>
        {value}
      </p>
    </div>
  )
}

export function Legend({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {items.map(c => (
        <span key={c} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600">
          <i className="w-2.5 h-2.5 rounded-sm" style={{ background: colorOf(c) }} />{c}
        </span>
      ))}
    </div>
  )
}

export function SellerName({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-2 font-medium text-gray-800 whitespace-nowrap">
      <i className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} /> {name}
    </span>
  )
}

export function Empty({ text = 'Nenhuma venda fechada nesse período.' }: { text?: string }) {
  return <p className="text-sm text-gray-400 py-6 text-center">{text}</p>
}

export const TH = 'font-semibold py-2 text-[11px] uppercase tracking-wide text-gray-400'
