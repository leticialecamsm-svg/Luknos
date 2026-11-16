'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ChevronDown, Info, WifiOff, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useActingContext } from './ActingAsBar'

// Estado do CRM em forma de botão pequeno na barra das abas: só aparece quando há algo para ver
// (WhatsApp fora do ar, número desconectado ou mudo, máquina da Hostinger, monitoramento parado) e mostra
// um contador. O detalhe — motivo, desde quando e histórico — abre só quando alguém clica.
// Lê /api/crm/health (escrito a cada minuto pela função crm-health-check) e atualiza sozinho.

interface HealthRow { component: string; label: string; status: 'ok' | 'warn' | 'down'; detail: string | null; reason: string | null; since: string; checked_at: string }
interface HealthEvent { id: number; component: string; kind: string; message: string; at: string }
interface Snapshot { rows: HealthRow[]; events: HealthEvent[]; now: string }

type Tone = 'red' | 'amber' | 'blue' | 'green'
interface Item { key: string; tone: Tone; icon: ReactNode; title: string; text: string; sub?: string; dismissable: boolean }

const POLL_MS = 30_000
const STALE_MS = 5 * 60_000
const RECOVERED_SHOW_MS = 30 * 60_000

const hhmm = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
function ago(fromIso: string, nowMs: number) {
  const m = Math.max(1, Math.round((nowMs - new Date(fromIso).getTime()) / 60000))
  if (m < 60) return `há ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 ? `há ${h} h ${m % 60} min` : `há ${h} h`
  const d = Math.floor(h / 24)
  return `há ${d} d${h % 24 ? ` ${h % 24} h` : ''}`
}
function dayHhmm(iso: string) {
  const d = new Date(iso)
  const same = d.toDateString() === new Date().toDateString()
  return same ? hhmm(iso) : `${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(d)} ${hhmm(iso)}`
}

const TONE = {
  red: { box: 'border-red-200 bg-red-50 text-red-900', icon: 'text-red-600' },
  amber: { box: 'border-amber-200 bg-amber-50 text-amber-900', icon: 'text-amber-600' },
  blue: { box: 'border-sky-200 bg-sky-50 text-sky-900', icon: 'text-sky-600' },
  green: { box: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: 'text-emerald-600' },
} as const

export function CrmHealthBanner() {
  const acting = useActingContext()
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [open, setOpen] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [dismissed, setDismissed] = useState<string[]>([])
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try { setDismissed(JSON.parse(localStorage.getItem('crm-health-dismissed') ?? '[]')) } catch { /* sem armazenamento */ }
  }, [])

  // o botão vive dentro da barra das abas (mesma linha de Etiquetas / Eu mesmo)
  useEffect(() => {
    let tries = 0
    let t: ReturnType<typeof setTimeout> | undefined
    const find = () => {
      const el = document.getElementById('crm-health-slot')
      if (el) setSlot(el)
      else if (tries++ < 30) t = setTimeout(find, 100)
    }
    find()
    return () => { if (t) clearTimeout(t) }
  }, [])

  useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        const r = await fetch('/api/crm/health', { cache: 'no-store' })
        if (r.ok && !stop) setSnap(await r.json())
      } catch { /* sem resposta: mantém o último estado */ }
    }
    const loop = () => {
      if (document.visibilityState === 'visible') void load()
      timer = setTimeout(loop, POLL_MS)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    loop()
    document.addEventListener('visibilitychange', onVisible)
    return () => { stop = true; if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  function dismiss(key: string) {
    const next = [...dismissed, key].slice(-40)
    setDismissed(next)
    try { localStorage.setItem('crm-health-dismissed', JSON.stringify(next)) } catch { /* sem armazenamento */ }
  }

  const { items, nowMs } = useMemo(() => {
    const list: Item[] = []
    if (!snap) return { items: list, nowMs: Date.now() }
    const nowMs = new Date(snap.now).getTime()
    const rows = snap.rows
    const evo = rows.find((r) => r.component === 'evolution')
    const monitor = rows.find((r) => r.component === 'monitor')
    const vps = rows.find((r) => r.component === 'vps')
    const hostinger = rows.find((r) => r.component === 'hostinger')
    const stale = !monitor || nowMs - new Date(monitor.checked_at).getTime() > STALE_MS
    const evoDown = evo?.status === 'down'

    if (evoDown && evo) list.push({
      key: `evo-${evo.since}`, tone: 'red', icon: <WifiOff className="h-4 w-4" />, dismissable: false,
      title: `WhatsApp fora do ar desde ${dayHhmm(evo.since)}`, sub: ago(evo.since, nowMs),
      text: `Mensagens não estão sendo enviadas nem recebidas por aqui. Use o WhatsApp do celular enquanto isso.${evo.reason ? ` Motivo: ${evo.reason}.` : ''} O sistema confere a cada minuto e avisa quando voltar.`,
    })
    if (!evoDown) for (const r of rows.filter((x) => x.component.startsWith('instance:') && x.status === 'down')) list.push({
      key: `${r.component}-${r.since}`, tone: 'red', icon: <AlertTriangle className="h-4 w-4" />, dismissable: true,
      title: r.label.replace(/^WhatsApp\s+/, ''), sub: `${/desconectado/i.test(r.detail ?? '') ? 'desconectado' : 'sem receber'} desde ${dayHhmm(r.since)} · ${ago(r.since, nowMs)}`,
      text: r.detail ?? '',
    })
    if (!evoDown && vps && vps.status !== 'ok') list.push({
      key: `vps-${vps.since}`, tone: 'amber', icon: <AlertTriangle className="h-4 w-4" />, dismissable: true,
      title: 'Máquina na Hostinger', text: `${vps.detail ?? ''}${vps.reason ? ` ${vps.reason}` : ''}`,
    })
    if (stale) list.push({
      key: 'stale', tone: 'amber', icon: <AlertTriangle className="h-4 w-4" />, dismissable: false,
      title: 'Monitoramento parado', text: `O monitoramento do CRM parou de atualizar${monitor ? ` (última checagem às ${hhmm(monitor.checked_at)})` : ''}. Não dá para garantir que o WhatsApp esteja funcionando; avise o suporte do sistema.`,
    })
    const lastUp = snap.events.find((e) => e.component === 'evolution' && e.kind === 'up')
    if (!stale && evo?.status === 'ok' && lastUp && nowMs - new Date(lastUp.at).getTime() < RECOVERED_SHOW_MS) {
      const dur = lastUp.message.match(/\(ficou[^)]*\)/)?.[0]
      list.push({
        key: `up-${lastUp.id}`, tone: 'green', icon: <CheckCircle2 className="h-4 w-4" />, dismissable: true,
        title: `WhatsApp voltou às ${hhmm(lastUp.at)}`, text: `${dur ? `${dur}. ` : ''}Mensagens do período podem chegar com atraso; confira as conversas e reenvie o que não saiu.`,
      })
    }
    if (!evoDown && hostinger && hostinger.status !== 'ok') list.push({
      key: `host-${hostinger.since}`, tone: 'blue', icon: <Info className="h-4 w-4" />, dismissable: true,
      title: hostinger.detail ?? 'Manutenção na Hostinger', text: 'A hospedagem do servidor do WhatsApp está em manutenção; pode haver quedas curtas. O CRM está funcionando agora.',
    })
    return { items: list, nowMs }
  }, [snap])

  const visible = items.filter((i) => !dismissed.includes(i.key))
  if (!snap || visible.length === 0) return null

  const alerts = visible.filter((i) => i.tone === 'red' || i.tone === 'amber')
  const worst: Tone = visible.some((i) => i.tone === 'red') ? 'red' : visible.some((i) => i.tone === 'amber') ? 'amber' : visible.some((i) => i.tone === 'green') ? 'green' : 'blue'
  const label = alerts.length ? `${alerts.length} ${alerts.length === 1 ? 'aviso' : 'avisos'} de conexão` : worst === 'green' ? 'WhatsApp voltou' : 'Aviso da Hostinger'

  const control = (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors',
          worst === 'red' ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
            : worst === 'amber' ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
            : worst === 'green' ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            : 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100',
        )}
      >
        {worst === 'green' ? <CheckCircle2 className="h-3.5 w-3.5" /> : worst === 'blue' ? <Info className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
        {alerts.length > 0 && <span className="tabular-nums">{alerts.length}</span>}
        <span className="max-sm:hidden">{worst === 'green' ? 'Voltou' : worst === 'blue' ? 'Hostinger' : 'Conexão'}</span>
      </button>

      {open && (
        <div role="dialog" aria-label="Avisos de conexão" className="absolute right-0 top-full z-40 mt-1.5 w-[min(92vw,27rem)] max-h-[75vh] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3.5 py-2.5">
            <h3 className="text-sm font-semibold text-gray-900">Avisos de conexão</h3>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="ml-auto rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-4 w-4" /></button>
          </div>
          <ul className="space-y-2 p-3">
            {visible.map((it) => (
              <li key={it.key} className={cn('rounded-lg border px-3 py-2', TONE[it.tone].box)}>
                <div className="flex items-start gap-2">
                  <span className={cn('mt-0.5 shrink-0', TONE[it.tone].icon)}>{it.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-5">{it.title}</p>
                    {it.sub && <p className="text-[11.5px] opacity-80">{it.sub}</p>}
                    {it.text && <p className="mt-1 text-[12.5px] leading-[18px]">{it.text}</p>}
                  </div>
                  {it.dismissable && <button type="button" onClick={() => dismiss(it.key)} className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium underline-offset-2 hover:underline">Dispensar</button>}
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-gray-100 px-3.5 py-2">
            <div className="flex items-center gap-3 text-xs">
              <button type="button" onClick={() => setShowLog((v) => !v)} className="inline-flex items-center gap-1 font-medium text-gray-600 hover:text-gray-900">
                Últimos eventos <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showLog && 'rotate-180')} />
              </button>
              {acting?.can_act && <Link href="/crm/conexoes" onClick={() => setOpen(false)} className="ml-auto font-medium text-brand-600 hover:underline">Abrir Conexões</Link>}
            </div>
            {showLog && (
              snap.events.length === 0 ? <p className="mt-2 text-xs text-gray-500">Nenhum evento registrado.</p> : (
                <ul className="mt-2 space-y-1.5">
                  {snap.events.slice(0, 10).map((e) => (
                    <li key={e.id} className="flex gap-2 text-[12px] text-gray-700"><span className="w-20 shrink-0 text-gray-400">{dayHhmm(e.at)}</span><span className="min-w-0">{e.message}</span></li>
                  ))}
                </ul>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )

  // sem a barra das abas na tela (não deveria acontecer): mostra o botão solto, sem ocupar uma faixa inteira
  return slot ? createPortal(control, slot) : <div className="mb-2 flex justify-end" data-now={nowMs}>{control}</div>
}
