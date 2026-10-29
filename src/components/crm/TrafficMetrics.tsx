'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Clock, Download, ExternalLink, Facebook, FileText, Info, Instagram, Lightbulb, Loader2, Megaphone,
  MessageCircle, Search, TrendingDown, TrendingUp, UserX, Wallet, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import { DateRangePicker, fmtDay, rangeLabel } from '@/components/ui/DateRangePicker'
import { WhatsappIcon } from './WhatsappIcon'
import type { TrafficLead, TrafficMetricsData, TrafficSource } from '@/lib/traffic-metrics'

const TZ = 'America/Maceio'

const SOURCE: Record<TrafficSource, { label: string; short: string; color: string; icon: (p: { className?: string }) => JSX.Element }> = {
  status: { label: 'Status do WhatsApp', short: 'Status', color: '#16a34a', icon: ({ className }) => <WhatsappIcon className={className} /> },
  instagram: { label: 'Instagram', short: 'Instagram', color: '#db2777', icon: ({ className }) => <Instagram className={className} /> },
  facebook: { label: 'Facebook', short: 'Facebook', color: '#2563eb', icon: ({ className }) => <Facebook className={className} /> },
  google: { label: 'Google', short: 'Google', color: '#d97706', icon: ({ className }) => <Search className={className} /> },
}
const SOURCES: TrafficSource[] = ['status', 'instagram', 'facebook', 'google']
const META: TrafficSource[] = ['status', 'instagram', 'facebook']
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// ── tempo ──────────────────────────────────────────────────────────────────────
const fmtParts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short' })
function local(isoStr: string) {
  const p = Object.fromEntries(fmtParts.formatToParts(new Date(isoStr)).map((x) => [x.type, x.value]))
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) }
}
function dateTime(isoStr: string) {
  return new Date(isoStr).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
// horário de atendimento da loja: seg–sex 9h–18h, sáb 8h–12h
function inBusinessHours(isoStr: string) {
  const { hour, weekday } = local(isoStr)
  if (weekday >= 1 && weekday <= 5) return hour >= 9 && hour < 18
  if (weekday === 6) return hour >= 8 && hour < 12
  return false
}
const replyMin = (l: TrafficLead) => (l.first_reply_at ? (Date.parse(l.first_reply_at) - Date.parse(l.entry_at)) / 60_000 : null)
function median(xs: number[]) {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const h = Math.floor(s.length / 2)
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2
}
function dur(min: number | null) {
  if (min == null) return '—'
  if (min < 1) return '< 1 min'
  if (min < 60) return `${Math.round(min)} min`
  if (min < 24 * 60) { const h = Math.floor(min / 60), m = Math.round(min % 60); return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h` }
  const d = Math.floor(min / 1440), h = Math.round((min % 1440) / 60)
  return h ? `${d}d ${h}h` : `${d}d`
}
const brl = (v: number, cents = false) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
function addDays(day: string, n: number) { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

// ── componente ─────────────────────────────────────────────────────────────────
export function TrafficMetrics({ data }: { data: TrafficMetricsData }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [source, setSource] = useState<TrafficSource | null>(null)
  const [campaign, setCampaign] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [listMode, setListMode] = useState<'all' | 'ghost' | 'noreply'>('all')

  const go = (from: string, to: string) => {
    setShowAll(false)
    startTransition(() => router.push(`/crm/metricas-trafego?de=${from}&ate=${to}`, { scroll: false }))
  }

  const userOf = useMemo(() => new Map(data.users.map((u) => [u.id, u])), [data.users])
  const instOf = useMemo(() => new Map(data.instances.map((i) => [i.id, i.label])), [data.instances])
  const stageOf = useMemo(() => new Map(data.stages.map((s) => [s.id, s])), [data.stages])
  const campOf = useMemo(() => new Map(data.campaigns.map((c) => [c.key, c])), [data.campaigns])

  const byCampaign = campaign ? data.leads.filter((l) => l.campaign === campaign) : data.leads
  const leads = source ? byCampaign.filter((l) => l.source === source) : byCampaign

  // ── números do topo ──
  const total = leads.length
  const replied = leads.filter((l) => l.first_reply_at)
  const times = replied.map(replyMin).filter((x): x is number => x != null)
  const inside = leads.filter((l) => inBusinessHours(l.entry_at))
  const outside = leads.filter((l) => !inBusinessHours(l.entry_at))
  const medIn = median(inside.map(replyMin).filter((x): x is number => x != null))
  const medOut = median(outside.map(replyMin).filter((x): x is number => x != null))
  const unanswered = leads.filter((l) => !l.first_reply_at)
  const solic = leads.filter((l) => l.has_solicitation).length
  const withValue = leads.filter((l) => (l.deal_value ?? 0) > 0)
  const value = withValue.reduce((s, l) => s + (l.deal_value ?? 0), 0)
  const newOnes = leads.filter((l) => !l.returning_contact).length
  // retorno do cliente depois que a equipe respondeu
  const ghosted = replied.filter((l) => l.inbound_after_reply === 0) // respondemos e o cliente não voltou a falar
  const talked = replied.filter((l) => l.inbound_after_reply >= 3) // conversou de fato depois da nossa resposta
  const cameBack = replied.length - ghosted.length
  const ghostTries = ghosted.length ? ghosted.reduce((s, l) => s + l.outbound_count, 0) / ghosted.length : 0
  const fast = replied.filter((l) => (replyMin(l) ?? Infinity) <= 30)
  const fastGhost = fast.filter((l) => l.inbound_after_reply === 0).length
  const prevTotal = campaign ? null : source ? (data.prev.bySource[source] ?? 0) : data.prev.total

  // ── por canal (respeita só o filtro de anúncio) ──
  const channels = SOURCES.map((s) => {
    const ls = byCampaign.filter((l) => l.source === s)
    return {
      s, n: ls.length, prev: data.prev.bySource[s] ?? 0,
      replied: ls.filter((l) => l.first_reply_at).length,
      med: median(ls.map(replyMin).filter((x): x is number => x != null)),
      solic: ls.filter((l) => l.has_solicitation).length,
      ghost: ls.filter((l) => l.first_reply_at && l.inbound_after_reply === 0).length,
    }
  }).filter((c) => c.n > 0 || c.prev > 0 || META.includes(c.s))
  const channelMax = Math.max(1, ...channels.map((c) => c.n))

  // ── por anúncio (respeita o filtro de canal) ──
  const campaigns = useMemo(() => {
    const base = source ? data.leads.filter((l) => l.source === source) : data.leads
    const map = new Map<string, TrafficLead[]>()
    for (const l of base) map.set(l.campaign, [...(map.get(l.campaign) ?? []), l])
    return Array.from(map.entries()).map(([key, ls]) => ({
      key, ls, info: campOf.get(key),
      bySource: SOURCES.map((s) => ({ s, n: ls.filter((l) => l.source === s).length })).filter((x) => x.n),
      replied: ls.filter((l) => l.first_reply_at).length,
      med: median(ls.map(replyMin).filter((x): x is number => x != null)),
      solic: ls.filter((l) => l.has_solicitation).length,
      ghost: ls.filter((l) => l.first_reply_at && l.inbound_after_reply === 0).length,
      value: ls.reduce((s, l) => s + (l.deal_value ?? 0), 0),
      first: ls.reduce((m, l) => (l.entry_at < m ? l.entry_at : m), ls[0].entry_at),
      last: ls.reduce((m, l) => (l.entry_at > m ? l.entry_at : m), ls[0].entry_at),
    })).sort((a, b) => b.ls.length - a.ls.length)
  }, [data.leads, source, campOf])

  // ── linha do tempo: por dia, semana ou mês conforme o tamanho do período ──
  const timeline = useMemo(() => {
    const days = Math.round((Date.parse(`${data.to}T12:00:00Z`) - Date.parse(`${data.from}T12:00:00Z`)) / 86_400_000) + 1
    const unit: 'dia' | 'semana' | 'mês' = days <= 62 ? 'dia' : days <= 370 ? 'semana' : 'mês'
    const keyOf = (day: string) => {
      if (unit === 'dia') return day
      if (unit === 'mês') return day.slice(0, 7)
      const d = new Date(`${day}T12:00:00Z`)
      return addDays(day, -((d.getUTCDay() + 6) % 7)) // segunda-feira da semana
    }
    const buckets: string[] = []
    for (let d = data.from; d <= data.to; d = addDays(d, 1)) { const k = keyOf(d); if (buckets[buckets.length - 1] !== k) buckets.push(k) }
    const counts = new Map(buckets.map((b) => [b, Object.fromEntries(SOURCES.map((s) => [s, 0])) as Record<TrafficSource, number>]))
    for (const l of leads) { const c = counts.get(keyOf(local(l.entry_at).day)); if (c) c[l.source]++ }
    const label = (k: string) => unit === 'mês' ? `${k.slice(5, 7)}/${k.slice(2, 4)}` : `${k.slice(8, 10)}/${k.slice(5, 7)}`
    const rows = buckets.map((k) => ({ k, label: label(k), c: counts.get(k)!, n: SOURCES.reduce((s, x) => s + counts.get(k)![x], 0) }))
    return { unit, rows, max: Math.max(1, ...rows.map((r) => r.n)) }
  }, [leads, data.from, data.to])

  // ── quando chegam (dia da semana × hora) ──
  const heat = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0) as number[])
    for (const l of leads) { const { weekday, hour } = local(l.entry_at); grid[weekday][hour]++ }
    const max = Math.max(1, ...grid.flat())
    const byHour = Array.from({ length: 24 }, (_, h) => grid.reduce((s, r) => s + r[h], 0))
    const byDay = grid.map((r) => r.reduce((a, b) => a + b, 0))
    return { grid, max, byHour, byDay }
  }, [leads])
  const peakHours = (() => {
    // janela de 3 horas com mais conversas
    let best = -1, at = 0
    for (let h = 0; h < 24; h++) { const n = heat.byHour[h] + heat.byHour[(h + 1) % 24] + heat.byHour[(h + 2) % 24]; if (n > best) { best = n; at = h } }
    return best > 0 ? { at, n: best } : null
  })()
  const peakDay = heat.byDay.some((n) => n > 0) ? heat.byDay.indexOf(Math.max(...heat.byDay)) : null

  // ── tempo até a 1ª resposta ──
  const buckets = [
    { label: 'Até 5 min', test: (m: number) => m <= 5, color: '#16a34a' },
    { label: '5 a 30 min', test: (m: number) => m > 5 && m <= 30, color: '#65a30d' },
    { label: '30 min a 2 h', test: (m: number) => m > 30 && m <= 120, color: '#ca8a04' },
    { label: '2 h a 12 h', test: (m: number) => m > 120 && m <= 720, color: '#ea580c' },
    { label: '12 h a 24 h', test: (m: number) => m > 720 && m <= 1440, color: '#dc2626' },
    { label: 'Mais de 24 h', test: (m: number) => m > 1440, color: '#991b1b' },
  ].map((b) => ({ ...b, n: times.filter(b.test).length }))
  const bucketMax = Math.max(1, unanswered.length, ...buckets.map((b) => b.n))

  // ── quem atendeu ──
  const attendants = (() => {
    const map = new Map<string, TrafficLead[]>()
    for (const l of leads) { const who = l.first_reply_user ?? l.assigned_user_id ?? '—'; map.set(who, [...(map.get(who) ?? []), l]) }
    return Array.from(map.entries()).map(([id, ls]) => ({
      id, user: userOf.get(id), n: ls.length,
      replied: ls.filter((l) => l.first_reply_at).length,
      med: median(ls.map(replyMin).filter((x): x is number => x != null)),
      solic: ls.filter((l) => l.has_solicitation).length,
    })).sort((a, b) => b.n - a.n)
  })()
  const numbers = (() => {
    const map = new Map<string, number>()
    for (const l of leads) map.set(l.instance_id, (map.get(l.instance_id) ?? 0) + 1)
    return Array.from(map.entries()).map(([id, n]) => ({ label: instOf.get(id) ?? 'WhatsApp', n })).sort((a, b) => b.n - a.n)
  })()
  const stages = (() => {
    const map = new Map<string, number>()
    for (const l of leads) map.set(l.stage_id ?? '—', (map.get(l.stage_id ?? '—') ?? 0) + 1)
    return [
      ...data.stages.filter((s) => map.get(s.id)).map((s) => ({ name: s.name, color: s.color, n: map.get(s.id)! })),
      ...(map.get('—') ? [{ name: 'Sem etapa no Quadro', color: null, n: map.get('—')! }] : []),
    ]
  })()

  // ── investimento (opcional, guardado só neste navegador): custo por conversa ──
  const spendKey = `traffic-spend:${data.from}:${data.to}`
  const [spend, setSpend] = useState<{ meta: string; google: string }>({ meta: '', google: '' })
  useEffect(() => {
    try { setSpend(JSON.parse(localStorage.getItem(spendKey) ?? '{"meta":"","google":""}')) } catch { setSpend({ meta: '', google: '' }) }
  }, [spendKey])
  const saveSpend = (next: { meta: string; google: string }) => {
    setSpend(next)
    try { localStorage.setItem(spendKey, JSON.stringify(next)) } catch { /* ignore */ }
  }
  const money = (s: string) => { const n = Number(s.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0 }
  const metaLeads = data.leads.filter((l) => META.includes(l.source))
  const googleLeads = data.leads.filter((l) => l.source === 'google')
  const metaSpend = money(spend.meta), googleSpend = money(spend.google)

  // ── leitura rápida ──
  const insights: string[] = []
  if (total) {
    const top = [...channels].sort((a, b) => b.n - a.n)[0]
    if (!source && top?.n) insights.push(`${SOURCE[top.s].label} trouxe ${pct(top.n, total)}% das conversas (${top.n} de ${total}).`)
    if (peakHours) insights.push(`Pico de chegada entre ${peakHours.at}h e ${(peakHours.at + 3) % 24}h${peakDay != null ? `; o dia com mais conversas é ${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][peakDay]}` : ''}.`)
    if (outside.length) insights.push(`${pct(outside.length, total)}% chegaram fora do horário da loja (seg–sex 9h–18h, sáb 8h–12h)${medOut != null ? `; a 1ª resposta para elas levou ${dur(medOut)} (mediana)` : ''}${medIn != null ? `, contra ${dur(medIn)} dentro do horário` : ''}.`)
    if (unanswered.length) insights.push(`${unanswered.length} ${unanswered.length === 1 ? 'conversa ainda não teve' : 'conversas ainda não tiveram'} resposta.`)
    if (prevTotal != null && prevTotal > 0) {
      const d = Math.round(((total - prevTotal) / prevTotal) * 100)
      insights.push(`${d >= 0 ? 'Aumento' : 'Queda'} de ${Math.abs(d)}% em relação ao período anterior (${fmtDay(data.prev.from)} – ${fmtDay(data.prev.to)}: ${prevTotal}).`)
    }
    if (ghosted.length) insights.push(`${ghosted.length} de ${replied.length} clientes (${pct(ghosted.length, replied.length)}%) não responderam depois que a equipe falou com eles — mesmo recebendo em média ${ghostTries.toFixed(1).replace('.', ',')} mensagens nossas.`)
    if (fast.length >= 3 && fastGhost) insights.push(`Entre os atendidos em até 30 min, ${fastGhost} de ${fast.length} (${pct(fastGhost, fast.length)}%) também não responderam: a demora no atendimento não explica a falta de retorno.`)
  }

  // ── exportar ──
  const exportCsv = () => {
    const head = ['Data', 'Contato', 'Telefone', 'Canal', 'Anúncio', 'WhatsApp', 'Atendente', '1ª resposta (min)', 'Respondeu à equipe', 'Msgs do cliente depois da resposta', 'Msgs do cliente', 'Msgs nossas', 'Etapa', 'Valor', 'Solicitação', 'Já era contato']
    const rows = listed.map((l) => [
      dateTime(l.entry_at), l.contact_name ?? '', l.phone ?? '', SOURCE[l.source].label, campOf.get(l.campaign)?.title ?? '',
      instOf.get(l.instance_id) ?? '', userOf.get(l.first_reply_user ?? l.assigned_user_id ?? '')?.name ?? '',
      replyMin(l) != null ? String(Math.round(replyMin(l)!)) : 'sem resposta',
      !l.first_reply_at ? '' : l.inbound_after_reply ? 'sim' : 'não', l.first_reply_at ? l.inbound_after_reply : '', l.inbound_count, l.outbound_count,
      l.stage_id ? stageOf.get(l.stage_id)?.name ?? '' : '', l.deal_value ?? '', l.has_solicitation ? 'sim' : 'não', l.returning_contact ? 'sim' : 'não',
    ])
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `trafego-${data.from}-a-${data.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const listed = listMode === 'ghost' ? ghosted : listMode === 'noreply' ? unanswered : leads
  const visible = showAll ? listed : listed.slice(0, 30)

  return (
    <div className={cn('space-y-4 pb-10 transition-opacity', pending && 'opacity-60')}>
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            Métricas do tráfego {pending && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          </h1>
          <p className="text-sm text-gray-500">Conversas que chegaram por anúncio (Status, Instagram, Facebook) e pelo Google</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker from={data.from} to={data.to} onChange={go} earliest={data.firstDataDay} />
          <button type="button" onClick={exportCsv} disabled={!leads.length} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50">
            <Download className="w-4 h-4" /> Exportar
          </button>
        </div>
      </div>

      {/* Filtros ativos */}
      {(source || campaign) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-500">Filtrando:</span>
          {source && <Chip color={SOURCE[source].color} onClear={() => setSource(null)}>{SOURCE[source].label}</Chip>}
          {campaign && <Chip color="#111827" onClear={() => setCampaign(null)}>{campOf.get(campaign)?.title ?? 'Anúncio'}</Chip>}
        </div>
      )}

      {/* Números */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi icon={MessageCircle} label="Conversas" value={String(total)}
          sub={prevTotal != null ? <Delta now={total} before={prevTotal} /> : <span>no período</span>} />
        <Kpi icon={Clock} label="1ª resposta (mediana)" value={dur(median(times))}
          sub={<span>{pct(replied.length, total)}% respondidas</span>} />
        <Kpi icon={MessageCircle} label="Sem resposta nossa" value={String(unanswered.length)} tone={unanswered.length ? 'warn' : undefined}
          sub={<span>{total ? `${pct(unanswered.length, total)}% do total · ${newOnes} cliente(s) novo(s)` : '—'}</span>} />
        <Kpi icon={UserX} label="Não responderam à equipe" value={String(ghosted.length)} tone={ghosted.length ? 'warn' : undefined}
          sub={<span>{replied.length ? `${pct(ghosted.length, replied.length)}% dos atendidos` : '—'}</span>} />
        <Kpi icon={FileText} label="Viraram solicitação" value={String(solic)}
          sub={<span>{pct(solic, total)}% das conversas</span>} />
        <Kpi icon={Wallet} label="Valor em negociação" value={value ? brl(value) : '—'}
          sub={<span>{withValue.length} com valor no Quadro</span>} />
      </div>

      {total === 0 && (
        <div className="card p-8 text-center text-sm text-gray-500">
          Nenhuma conversa de tráfego neste período.
          {data.firstDataDay && data.from < data.firstDataDay && <> O CRM registra anúncios desde {fmtDay(data.firstDataDay)}.</>}
        </div>
      )}

      {total > 0 && insights.length > 0 && (
        <div className="card p-4 bg-amber-50/60 border-amber-100">
          <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-2"><Lightbulb className="w-4 h-4 text-amber-500" /> Leitura rápida</p>
          <ul className="space-y-1 text-sm text-gray-700 list-disc pl-5">{insights.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}

      {replied.length > 0 && (
        <section className="card p-4">
          <Title hint="Do clique no anúncio até virar solicitação. “Respondeu à equipe” = mandou ao menos uma mensagem depois da nossa 1ª resposta.">Retorno dos clientes</Title>
          <div className="mt-4 grid md:grid-cols-[1fr_18rem] gap-5 items-start">
            <div className="space-y-2">
              {[
                { label: 'Chegaram pelo tráfego', n: total, color: '#111827' },
                { label: 'Equipe respondeu', n: replied.length, color: '#2563eb' },
                { label: 'Cliente respondeu à equipe', n: cameBack, color: '#16a34a' },
                { label: 'Conversou (3+ mensagens depois)', n: talked.length, color: '#15803d' },
                { label: 'Virou solicitação', n: solic, color: '#7c3aed' },
              ].map((f) => (
                <div key={f.label} className="flex items-center gap-3 text-sm">
                  <span className="w-52 shrink-0 text-gray-700 max-sm:w-36 max-sm:text-xs">{f.label}</span>
                  <div className="flex-1 h-6 bg-gray-100 rounded-md overflow-hidden">
                    <div className="h-full rounded-md flex items-center justify-end pr-2 text-[11px] font-semibold text-white min-w-[1.75rem]" style={{ width: `${Math.max(total ? (f.n / total) * 100 : 0, f.n ? 6 : 0)}%`, background: f.color }}>{f.n || ''}</div>
                  </div>
                  <span className="w-10 text-right text-xs text-gray-500 tabular-nums">{pct(f.n, total)}%</span>
                </div>
              ))}
            </div>
            <div className="rounded-xl bg-red-50 ring-1 ring-red-100 p-4">
              <p className="text-xs font-medium text-red-800">Não responderam depois do contato da equipe</p>
              <p className="text-3xl font-semibold text-red-700 tabular-nums mt-1">{ghosted.length} <span className="text-base font-medium">de {replied.length}</span></p>
              <p className="text-sm text-red-800">{pct(ghosted.length, replied.length)}% dos clientes atendidos</p>
              <ul className="mt-2 space-y-1 text-xs text-gray-700">
                <li>Enviamos em média <b>{ghostTries.toFixed(1).replace('.', ',')}</b> mensagens para cada um deles</li>
                {fast.length > 0 && <li>Atendidos em até 30 min que não voltaram: <b>{fastGhost} de {fast.length}</b> ({pct(fastGhost, fast.length)}%)</li>}
                <li>Mandaram só a mensagem do anúncio: <b>{leads.filter((l) => l.inbound_count <= 1).length}</b></li>
              </ul>
              <button type="button" onClick={() => { setListMode('ghost'); setShowAll(true); document.getElementById('lista-trafego')?.scrollIntoView({ behavior: 'smooth' }) }} className="mt-3 text-xs font-medium text-red-700 hover:underline">
                Ver quem são →
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Por canal */}
        <section className="card p-4">
          <Title hint="Clique para filtrar a página toda pelo canal">Conversas por canal</Title>
          <div className="space-y-3 mt-3">
            {channels.map((c) => {
              const S = SOURCE[c.s]
              const on = source === c.s
              return (
                <button key={c.s} type="button" onClick={() => setSource(on ? null : c.s)}
                  className={cn('w-full text-left rounded-lg p-2 -m-2 transition-colors', on ? 'bg-gray-100' : 'hover:bg-gray-50', source && !on && 'opacity-50')}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 font-medium text-gray-900"><span style={{ color: S.color }}><S.icon className="w-4 h-4" /></span>{S.label}</span>
                    <span className="tabular-nums text-gray-900 font-semibold">{c.n}<span className="font-normal text-gray-500 ml-1.5">{pct(c.n, byCampaign.length)}%</span></span>
                  </div>
                  <div className="h-2.5 rounded-full bg-gray-100 mt-1.5 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(c.n / channelMax) * 100}%`, background: S.color }} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-gray-500">
                    {!campaign && <span><Delta now={c.n} before={c.prev} small /></span>}
                    <span>1ª resposta {dur(c.med)}</span>
                    <span>{pct(c.replied, c.n)}% respondidas</span>
                    {c.replied > 0 && <span className={c.ghost ? 'text-red-600' : undefined}>{pct(c.ghost, c.replied)}% não responderam à equipe</span>}
                    {c.solic > 0 && <span>{c.solic} solicitação(ões)</span>}
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {/* Linha do tempo */}
        <section className="card p-4">
          <Title hint={`Conversas por ${timeline.unit}`}>Ao longo do período</Title>
          <div className="mt-4 flex items-end gap-[2px] h-40">
            {timeline.rows.map((r) => (
              <div key={r.k} className="flex-1 min-w-0 h-full flex flex-col justify-end group relative" title={`${r.label}: ${r.n} conversa(s)\n${SOURCES.filter((s) => r.c[s]).map((s) => `${SOURCE[s].short}: ${r.c[s]}`).join('\n')}`}>
                {SOURCES.map((s) => r.c[s] ? <div key={s} style={{ height: `${(r.c[s] / timeline.max) * 100}%`, background: SOURCE[s].color }} className="w-full first:rounded-t-sm" /> : null)}
                {r.n === 0 && <div className="w-full h-px bg-gray-200" />}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-1 tabular-nums">
            <span>{timeline.rows[0]?.label}</span>
            {timeline.rows.length > 2 && <span>{timeline.rows[Math.floor(timeline.rows.length / 2)]?.label}</span>}
            <span>{timeline.rows[timeline.rows.length - 1]?.label}</span>
          </div>
          <Legend />
        </section>
      </div>

      {/* Por anúncio */}
      <section className="card p-4">
        <Title hint="Mesmo anúncio rodando em lugares diferentes aparece junto, com a divisão por canal. Clique para filtrar.">Conversas por anúncio (campanha)</Title>
        <div className="mt-3 grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {campaigns.map((c) => {
            const on = campaign === c.key
            return (
              <div key={c.key} className={cn('rounded-xl border p-3 flex gap-3 transition-colors', on ? 'border-gray-900 bg-gray-50' : 'border-gray-200', campaign && !on && 'opacity-50')}>
                {c.info?.thumb
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={c.info.thumb} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0 bg-gray-100" />
                  : <span className="w-16 h-16 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">{c.key === 'google' ? <Search className="w-6 h-6" /> : <Megaphone className="w-6 h-6" />}</span>}
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => setCampaign(on ? null : c.key)} className="text-sm font-semibold text-gray-900 text-left hover:underline line-clamp-2">{c.info?.title ?? 'Anúncio'}</button>
                  <p className="text-2xl font-semibold text-gray-900 tabular-nums leading-tight">{c.ls.length} <span className="text-xs font-normal text-gray-500">conversas</span></p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c.bySource.map((x) => (
                      <span key={x.s} className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full text-white" style={{ background: SOURCE[x.s].color }}>{SOURCE[x.s].short} {x.n}</span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">
                    1ª resposta {dur(c.med)} · {pct(c.replied, c.ls.length)}% respondidas
                    {c.replied > 0 && <> · <span className={c.ghost ? 'text-red-600' : undefined}>{pct(c.ghost, c.replied)}% não responderam à equipe</span></>}
                    {c.solic > 0 && <> · {c.solic} solicitação(ões)</>}
                    {c.value > 0 && <> · {brl(c.value)}</>}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {fmtDay(local(c.first).day)}{c.first !== c.last && ` a ${fmtDay(local(c.last).day)}`}
                    {c.info?.url && <> · <a href={c.info.url} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:underline inline-flex items-center gap-0.5">ver anúncio <ExternalLink className="w-3 h-3" /></a></>}
                  </p>
                </div>
              </div>
            )
          })}
          {!campaigns.length && <p className="text-sm text-gray-500">Nenhum anúncio no período.</p>}
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Quando chegam */}
        <section className="card p-4">
          <Title hint="Quanto mais escuro, mais conversas começaram naquele dia e hora. Ajuda a decidir quando o anúncio deve rodar e quem precisa estar atendendo.">Quando as conversas chegam</Title>
          <div className="mt-3 overflow-x-auto">
            <div className="min-w-[30rem]">
              <div className="grid grid-cols-[2.25rem_repeat(24,minmax(0,1fr))] gap-[2px]">
                <span />
                {Array.from({ length: 24 }, (_, h) => <span key={h} className="text-[9px] text-gray-400 text-center tabular-nums">{h % 3 === 0 ? h : ''}</span>)}
                {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
                  <Row key={wd} label={WEEKDAYS[wd]} cells={heat.grid[wd]} max={heat.max} total={heat.byDay[wd]} />
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-2 flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border border-emerald-500" /> borda verde = horário da loja</p>
            </div>
          </div>
        </section>

        {/* Tempo de resposta */}
        <section className="card p-4">
          <Title hint="Quanto tempo o cliente esperou pela 1ª mensagem de alguém da equipe (respostas automáticas nos primeiros 15 s não contam).">Tempo até a 1ª resposta</Title>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="rounded-lg bg-emerald-50 p-2.5">
              <p className="text-[11px] text-emerald-800">Chegou no horário da loja</p>
              <p className="text-lg font-semibold text-gray-900">{dur(medIn)}</p>
              <p className="text-[11px] text-gray-500">{inside.length} conversa(s)</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-2.5">
              <p className="text-[11px] text-gray-600">Chegou fora do horário</p>
              <p className="text-lg font-semibold text-gray-900">{dur(medOut)}</p>
              <p className="text-[11px] text-gray-500">{outside.length} conversa(s)</p>
            </div>
          </div>
          <div className="space-y-1.5 mt-3">
            {[...buckets, { label: 'Sem resposta', n: unanswered.length, color: '#9ca3af' }].map((b) => (
              <div key={b.label} className="flex items-center gap-2 text-sm">
                <span className="w-28 shrink-0 text-gray-600 text-xs">{b.label}</span>
                <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden"><div className="h-full rounded" style={{ width: `${(b.n / bucketMax) * 100}%`, background: b.color }} /></div>
                <span className="w-14 text-right tabular-nums text-xs text-gray-700">{b.n} <span className="text-gray-400">{pct(b.n, total)}%</span></span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Atendentes */}
        <section className="card p-4">
          <Title hint="Quem mandou a 1ª resposta (ou o responsável, se ainda não respondeu). Mensagens pelo celular contam para o dono do número.">Quem atendeu</Title>
          <div className="mt-3 divide-y divide-gray-100">
            {attendants.map((a) => (
              <div key={a.id} className="flex items-center gap-2.5 py-2">
                {a.user ? <Avatar user={a.user} size="sm" /> : <span className="w-7 h-7 rounded-full bg-gray-100" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{a.user?.name ?? 'Sem responsável'}</p>
                  <p className="text-[11px] text-gray-500">1ª resposta {dur(a.med)} · {pct(a.replied, a.n)}% respondidas{a.solic ? ` · ${a.solic} solic.` : ''}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{a.n}</span>
              </div>
            ))}
            {!attendants.length && <p className="text-sm text-gray-500 py-2">—</p>}
          </div>
        </section>

        {/* Etapas */}
        <section className="card p-4">
          <Title hint="Em que coluna do Quadro do CRM essas conversas estão hoje.">Onde estão no funil</Title>
          <div className="mt-3 space-y-2">
            {stages.map((s) => (
              <div key={s.name} className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-gray-300" style={s.color?.startsWith('#') ? { background: s.color } : undefined} />
                <span className="flex-1 min-w-0 truncate text-gray-700">{s.name}</span>
                <span className="tabular-nums font-semibold">{s.n}</span>
                <span className="w-10 text-right text-xs text-gray-400 tabular-nums">{pct(s.n, total)}%</span>
              </div>
            ))}
            {!stages.length && <p className="text-sm text-gray-500">—</p>}
          </div>
          {numbers.length > 1 && (
            <>
              <p className="text-xs font-medium text-gray-500 mt-4 mb-1.5">Por número de WhatsApp</p>
              {numbers.map((n) => (
                <div key={n.label} className="flex items-center justify-between text-sm py-0.5"><span className="text-gray-700 truncate">{n.label}</span><span className="tabular-nums font-semibold">{n.n}</span></div>
              ))}
            </>
          )}
        </section>

        {/* Investimento */}
        <section className="card p-4">
          <Title hint="Digite quanto foi investido neste período (está no Gerenciador de Anúncios / Google Ads). Fica guardado só neste navegador.">Custo por conversa</Title>
          <div className="mt-3 space-y-3">
            <SpendRow label="Meta (Status, Instagram, Facebook)" value={spend.meta} onChange={(v) => saveSpend({ ...spend, meta: v })}
              leads={metaLeads.length} solic={metaLeads.filter((l) => l.has_solicitation).length} spend={metaSpend} />
            <SpendRow label="Google" value={spend.google} onChange={(v) => saveSpend({ ...spend, google: v })}
              leads={googleLeads.length} solic={googleLeads.filter((l) => l.has_solicitation).length} spend={googleSpend} />
          </div>
        </section>
      </div>

      {/* Lista */}
      <section id="lista-trafego" className="card p-0 overflow-hidden scroll-mt-4">
        <div className="p-4 pb-2 flex flex-wrap items-center justify-between gap-2">
          <Title hint="Mais recentes primeiro. Clique no nome para abrir a conversa.">Conversas ({listed.length})</Title>
          <div className="flex gap-1">
            {([['all', `Todas ${total}`], ['ghost', `Não responderam à equipe ${ghosted.length}`], ['noreply', `Sem resposta nossa ${unanswered.length}`]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setListMode(k)}
                className={cn('px-2.5 py-1 rounded-full text-xs font-medium', listMode === k ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 bg-gray-50">
              <tr>
                <th className="text-left font-medium px-4 py-2">Chegou</th>
                <th className="text-left font-medium px-2 py-2">Contato</th>
                <th className="text-left font-medium px-2 py-2">Canal</th>
                <th className="text-left font-medium px-2 py-2">Anúncio</th>
                <th className="text-left font-medium px-2 py-2">Atendente</th>
                <th className="text-right font-medium px-2 py-2">1ª resposta</th>
                <th className="text-left font-medium px-2 py-2" title="O cliente mandou mensagem depois da nossa 1ª resposta?">Retorno do cliente</th>
                <th className="text-right font-medium px-2 py-2" title="Mensagens do cliente / nossas desde que chegou">Msgs</th>
                <th className="text-left font-medium px-2 py-2">Etapa</th>
                <th className="text-right font-medium px-4 py-2">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((l) => {
                const S = SOURCE[l.source]
                const who = userOf.get(l.first_reply_user ?? l.assigned_user_id ?? '')
                const st = l.stage_id ? stageOf.get(l.stage_id) : null
                const m = replyMin(l)
                return (
                  <tr key={`${l.conversation_id}-${l.entry_at}`} className="hover:bg-gray-50">
                    <td className="px-4 py-2 whitespace-nowrap tabular-nums text-gray-600">{dateTime(l.entry_at)}</td>
                    <td className="px-2 py-2 min-w-[10rem]">
                      <Link href={`/crm/conversas?c=${l.conversation_id}`} className="font-medium text-gray-900 hover:underline">{l.contact_name || l.phone || 'Sem nome'}</Link>
                      <span className="block text-[11px] text-gray-400">
                        {l.phone}{l.returning_contact && ' · já era contato'}{l.has_solicitation && ' · solicitação'}
                      </span>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap"><span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: S.color }}><S.icon className="w-3.5 h-3.5" />{S.short}</span></td>
                    <td className="px-2 py-2 text-gray-600 max-w-[14rem] truncate">{campOf.get(l.campaign)?.title ?? '—'}</td>
                    <td className="px-2 py-2 text-gray-600 whitespace-nowrap">{who?.name.split(' ')[0] ?? '—'}</td>
                    <td className={cn('px-2 py-2 text-right whitespace-nowrap tabular-nums', m == null ? 'text-red-600 font-medium' : m > 120 ? 'text-orange-600' : 'text-gray-700')}>{m == null ? 'sem resposta' : dur(m)}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-xs">
                      {!l.first_reply_at ? <span className="text-gray-400">—</span>
                        : l.inbound_after_reply === 0 ? <span className="text-red-600 font-medium">não respondeu</span>
                        : <span className="text-emerald-700">{l.inbound_after_reply} msg{l.inbound_after_reply > 1 ? 's' : ''}{l.last_inbound_at && <span className="text-gray-400"> · últ. {dateTime(l.last_inbound_at).slice(0, 5)}</span>}</span>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-gray-500">{l.inbound_count}/{l.outbound_count}</td>
                    <td className="px-2 py-2 text-gray-600 whitespace-nowrap">{st?.name ?? '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-700">{l.deal_value ? brl(l.deal_value) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {listed.length > visible.length && (
          <button type="button" onClick={() => setShowAll(true)} className="w-full py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 border-t border-gray-100">
            Ver todas ({listed.length})
          </button>
        )}
        {!listed.length && <p className="px-4 pb-4 text-sm text-gray-500">Nenhuma conversa aqui.</p>}
      </section>

      <p className="text-xs text-gray-400 flex gap-1.5">
        <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
        <span>
          Anúncios da Meta são reconhecidos pelos dados que o WhatsApp manda junto com o clique (imagem, título e onde apareceu).
          Google é reconhecido pela frase pronta “vim pelo google”. Nome da campanha, alcance e valor gasto ficam só no Gerenciador de Anúncios / Google Ads.
          {data.firstDataDay && <> O CRM registra anúncios desde {fmtDay(data.firstDataDay)}.</>} Período: {rangeLabel(data.from, data.to)}.
        </span>
      </p>
    </div>
  )
}

// ── peças ──────────────────────────────────────────────────────────────────────
function Title({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-900">{children}</h2>
      {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
    </div>
  )
}

function Kpi({ icon: Icon, label, value, sub, tone }: { icon: typeof Clock; label: string; value: string; sub: React.ReactNode; tone?: 'warn' }) {
  return (
    <div className={cn('card p-3', tone === 'warn' && 'ring-1 ring-red-200 bg-red-50/40')}>
      <p className="text-xs text-gray-500 flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" />{label}</p>
      <p className={cn('text-2xl font-semibold tabular-nums mt-1', tone === 'warn' ? 'text-red-700' : 'text-gray-900')}>{value}</p>
      <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>
    </div>
  )
}

function Delta({ now, before, small }: { now: number; before: number; small?: boolean }) {
  if (!before) return <span className="text-gray-400">{now ? 'sem dados no período anterior' : 'igual ao período anterior'}</span>
  const d = Math.round(((now - before) / before) * 100)
  const up = d >= 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className={cn('inline-flex items-center gap-1', up ? 'text-emerald-700' : 'text-red-600')}>
      <Icon className={small ? 'w-3 h-3' : 'w-3.5 h-3.5'} />{up ? '+' : ''}{d}% <span className="text-gray-400">vs. anterior ({before})</span>
    </span>
  )
}

function Chip({ children, color, onClear }: { children: React.ReactNode; color: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-white text-xs font-medium" style={{ background: color }}>
      {children}
      <button type="button" onClick={onClear} aria-label="Tirar filtro" className="p-0.5 rounded-full hover:bg-white/20"><X className="w-3 h-3" /></button>
    </span>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-gray-600">
      {SOURCES.map((s) => <span key={s} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: SOURCE[s].color }} />{SOURCE[s].short}</span>)}
    </div>
  )
}

function Row({ label, cells, max, total }: { label: string; cells: number[]; max: number; total: number }) {
  const wd = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].indexOf(label)
  const open = (h: number) => (wd >= 1 && wd <= 5 ? h >= 9 && h < 18 : wd === 6 ? h >= 8 && h < 12 : false)
  return (
    <>
      <span className="text-[10px] text-gray-500 self-center" title={`${total} conversa(s)`}>{label}</span>
      {cells.map((n, h) => (
        <span
          key={h}
          title={`${label} ${h}h: ${n} conversa(s)`}
          className={cn('h-5 rounded-[3px]', open(h) && 'ring-1 ring-inset ring-emerald-500/70')}
          style={{ background: n ? `rgba(22,163,74,${0.15 + 0.85 * (n / max)})` : '#f3f4f6' }}
        />
      ))}
    </>
  )
}

function SpendRow({ label, value, onChange, leads, solic, spend }: { label: string; value: string; onChange: (v: string) => void; leads: number; solic: number; spend: number }) {
  return (
    <div>
      <label className="text-xs text-gray-600">{label}</label>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-sm text-gray-500">R$</span>
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
          placeholder="0,00"
          className="w-28 px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
      </div>
      <p className="text-[11px] text-gray-500 mt-1">
        {spend > 0 && leads > 0
          ? <>Custo por conversa <b className="text-gray-900">{brl(spend / leads, true)}</b>{solic > 0 && <> · por solicitação <b className="text-gray-900">{brl(spend / solic, true)}</b></>}</>
          : `${leads} conversa(s) no período`}
      </p>
    </div>
  )
}
