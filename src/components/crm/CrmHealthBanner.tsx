'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, Info, WifiOff, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Faixa de estado do CRM: avisa na própria tela quando o WhatsApp está fora do ar, um número
// desconectou, a máquina da Hostinger caiu ou o monitoramento parou — com o motivo e desde quando.
// Lê /api/crm/health (escrito a cada minuto pela função crm-health-check) e atualiza sozinha.

interface HealthRow { component: string; label: string; status: 'ok' | 'warn' | 'down'; detail: string | null; reason: string | null; since: string; checked_at: string }
interface HealthEvent { id: number; component: string; kind: string; message: string; at: string }
interface Snapshot { rows: HealthRow[]; events: HealthEvent[]; now: string }

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
  const today = new Date()
  const same = d.toDateString() === today.toDateString()
  return same ? hhmm(iso) : `${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(d)} ${hhmm(iso)}`
}

export function CrmHealthBanner() {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [offline, setOffline] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [dismissed, setDismissed] = useState<string[]>([])
  const [tick, setTick] = useState(() => Date.now())

  useEffect(() => {
    try { setDismissed(JSON.parse(localStorage.getItem('crm-health-dismissed') ?? '[]')) } catch { /* sem armazenamento */ }
  }, [])

  useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        const r = await fetch('/api/crm/health', { cache: 'no-store' })
        if (r.ok) { if (!stop) { setSnap(await r.json()); setOffline(false) } }
      } catch { if (!stop) setOffline(true) }
      setTick(Date.now())
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

  function dismiss(key: string) {
    const next = [...dismissed, key].slice(-30)
    setDismissed(next)
    try { localStorage.setItem('crm-health-dismissed', JSON.stringify(next)) } catch { /* sem armazenamento */ }
  }

  const view = useMemo(() => {
    if (!snap) return null
    const nowMs = new Date(snap.now).getTime()
    const rows = snap.rows
    const evo = rows.find((r) => r.component === 'evolution')
    const monitor = rows.find((r) => r.component === 'monitor')
    const vps = rows.find((r) => r.component === 'vps')
    const hostinger = rows.find((r) => r.component === 'hostinger')
    const instances = rows.filter((r) => r.component.startsWith('instance:') && r.status === 'down')
    const stale = !monitor || nowMs - new Date(monitor.checked_at).getTime() > STALE_MS
    const lastUp = snap.events.find((e) => e.component === 'evolution' && e.kind === 'up')
    const recovered = !stale && evo?.status === 'ok' && lastUp && nowMs - new Date(lastUp.at).getTime() < RECOVERED_SHOW_MS ? lastUp : null
    return { nowMs, evo, monitor, vps, hostinger, instances, stale, recovered }
  }, [snap])

  // sem resposta do próprio sistema (internet da pessoa ou o Luknos fora)
  if (offline && !snap) return null
  if (!view) return null
  const { nowMs, evo, monitor, vps, hostinger, instances, stale, recovered } = view
  const evoDown = evo?.status === 'down'
  const hasProblem = evoDown || instances.length > 0 || stale || (vps && vps.status !== 'ok') || (hostinger && hostinger.status !== 'ok') || (recovered && !dismissed.includes(`up-${recovered.id}`))
  if (!hasProblem) return null

  return (
    <div className="mb-2 space-y-1.5" data-tick={tick}>
      {evoDown && evo && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-600 px-3 py-2.5 text-white shadow-sm">
          <div className="flex items-start gap-2.5">
            <WifiOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">WhatsApp fora do ar desde {dayHhmm(evo.since)} ({ago(evo.since, nowMs)})</p>
              <p className="mt-0.5 text-white/95">Mensagens não estão sendo enviadas nem recebidas por aqui. Use o WhatsApp do celular para falar com clientes enquanto isso.</p>
              {evo.reason && <p className="mt-1 text-[13px] text-white/90"><span className="font-semibold">Motivo:</span> {evo.reason}</p>}
              <p className="mt-1 text-[12px] text-white/80">O sistema confere a cada minuto, tenta religar o servidor sozinho quando possível e avisa quando voltar.</p>
            </div>
            <button type="button" onClick={() => setShowLog((v) => !v)} className="flex shrink-0 items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-xs font-medium hover:bg-white/25">
              Histórico <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showLog && 'rotate-180')} />
            </button>
          </div>
        </div>
      )}

      {!evoDown && instances.map((r) => (
        <div key={r.component} role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{r.label} desconectado desde {dayHhmm(r.since)} ({ago(r.since, nowMs)})</p>
            <p className="text-[13px]">{r.detail}</p>
          </div>
        </div>
      ))}

      {!evoDown && vps && vps.status !== 'ok' && (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <p className="min-w-0 flex-1"><span className="font-semibold">{vps.detail}</span>{vps.reason ? ` ${vps.reason}` : ''}</p>
        </div>
      )}

      {stale && (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <p className="min-w-0 flex-1"><span className="font-semibold">O monitoramento do CRM parou de atualizar{monitor ? ` (última checagem às ${hhmm(monitor.checked_at)})` : ''}.</span> Não dá para garantir que o WhatsApp esteja funcionando; avise o suporte do sistema.</p>
        </div>
      )}

      {recovered && !dismissed.includes(`up-${recovered.id}`) && (
        <div className="flex items-start gap-2.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          <p className="min-w-0 flex-1"><span className="font-semibold">WhatsApp voltou às {hhmm(recovered.at)}.</span> {recovered.message.replace(/^[^:]+: /, '')} Mensagens do período podem chegar com atraso.</p>
          <button type="button" onClick={() => dismiss(`up-${recovered.id}`)} aria-label="Dispensar aviso" className="shrink-0 rounded p-0.5 hover:bg-emerald-100"><X className="h-4 w-4" /></button>
        </div>
      )}

      {!evoDown && hostinger && hostinger.status !== 'ok' && !dismissed.includes(`host-${hostinger.since}`) && (
        <div className="flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] text-sky-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden />
          <p className="min-w-0 flex-1"><span className="font-semibold">{hostinger.detail}.</span> A hospedagem do servidor do WhatsApp está em manutenção; pode haver quedas curtas. O CRM está funcionando agora.</p>
          <button type="button" onClick={() => dismiss(`host-${hostinger.since}`)} aria-label="Dispensar aviso" className="shrink-0 rounded p-0.5 hover:bg-sky-100"><X className="h-4 w-4" /></button>
        </div>
      )}

      {showLog && snap && (
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-700">
          <p className="mb-1 font-semibold text-gray-900">Últimos eventos</p>
          {snap.events.length === 0 ? <p>Nenhum evento registrado.</p> : (
            <ul className="space-y-1">
              {snap.events.map((e) => (
                <li key={e.id} className="flex gap-2"><span className="w-24 shrink-0 text-gray-500">{dayHhmm(e.at)}</span><span>{e.message}</span></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
