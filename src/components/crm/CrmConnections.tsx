'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, RotateCcw, Server, WifiOff, XCircle, Wrench, Info, QrCode, X } from 'lucide-react'
import { getCrmConnections, restartCrmInstance, relinkCrmInstance, connectCrmInstance, getCrmInstanceConnectionState, type ConnectionEvent, type ConnectionRow } from '@/lib/crm-actions'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/useConfirm'
import { cn } from '@/lib/utils'

type Data = { rows: ConnectionRow[]; events: ConnectionEvent[]; server: { status: string; detail: string | null; since: string | null } | null }

const dateFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Maceio', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Maceio', weekday: 'short', day: '2-digit', month: 'long' })
const timeFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Maceio', hour: '2-digit', minute: '2-digit' })
const dayKey = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10)

function ago(iso: string | null, now: number) {
  if (!iso) return 'nunca'
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000))
  if (m < 1) return 'agora'
  if (m < 60) return `há ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h} h`
  return `há ${Math.floor(h / 24)} d`
}

const KIND: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  down: { label: 'Caiu', cls: 'text-red-600 bg-red-50', Icon: XCircle },
  up: { label: 'Voltou', cls: 'text-emerald-700 bg-emerald-50', Icon: CheckCircle2 },
  warn: { label: 'Aviso', cls: 'text-amber-700 bg-amber-50', Icon: AlertTriangle },
  recovery_start: { label: 'Religamento automático', cls: 'text-blue-700 bg-blue-50', Icon: Wrench },
  recovery_restart: { label: 'Reinício automático', cls: 'text-blue-700 bg-blue-50', Icon: Wrench },
  recovery_failed: { label: 'Falha ao religar', cls: 'text-red-600 bg-red-50', Icon: XCircle },
  restart_manual: { label: 'Reinício pedido', cls: 'text-blue-700 bg-blue-50', Icon: RotateCcw },
  restart_auto: { label: 'Reinício automático', cls: 'text-blue-700 bg-blue-50', Icon: RotateCcw },
  restart_failed: { label: 'Reinício falhou', cls: 'text-red-600 bg-red-50', Icon: XCircle },
  relink: { label: 'Reconexão por QR', cls: 'text-blue-700 bg-blue-50', Icon: QrCode },
  send_failed: { label: 'Envio falhou', cls: 'text-gray-700 bg-gray-100', Icon: WifiOff },
}

function statusOf(r: ConnectionRow): { text: string; cls: string; dot: string } {
  if (!r.is_active) return { text: 'Desativado', cls: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' }
  if (r.status === 'down' && r.silent) return { text: 'Conectado, mas sem receber', cls: 'bg-red-100 text-red-700', dot: 'bg-red-500' }
  if (r.status === 'down') return { text: r.state === 'connecting' ? 'Aguardando QR code' : 'Desconectado', cls: 'bg-red-100 text-red-700', dot: 'bg-red-500' }
  if (r.status === 'ok') return { text: 'Conectado', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' }
  return { text: 'Sem leitura', cls: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' }
}

export function CrmConnections({ initial }: { initial: Data }) {
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [data, setData] = useState<Data>(initial)
  const [filter, setFilter] = useState<string>('all') // all | server | <instance id>
  const [busy, setBusy] = useState<string | null>(null)
  const [qr, setQr] = useState<{ row: ConnectionRow; img?: string; pairing?: string | null; loading: boolean; error?: string } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const reload = useCallback(async () => {
    setRefreshing(true)
    const r = await getCrmConnections()
    setRefreshing(false)
    if (!('error' in r)) { setData(r); setNow(Date.now()) }
  }, [])

  // o monitor roda a cada minuto: a tela acompanha sozinha
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) reload() }, 30_000)
    return () => clearInterval(t)
  }, [reload])

  async function restart(r: ConnectionRow) {
    const ok = await confirm(
      `Reiniciar a conexão de "${r.label}"? O número fica alguns segundos fora do ar e volta sozinho, sem precisar ler QR code. Mensagens recebidas nesse instante podem demorar um pouco.`,
      'Reiniciar',
    )
    if (!ok) return
    setBusy(r.id)
    const res = await restartCrmInstance(r.id)
    setBusy(null)
    if ('error' in res && res.error) toast.error('NÃO REINICIOU', res.error)
    else toast.success('CONEXÃO REINICIADA', 'Em 1–2 minutos o monitor confirma se voltou a receber')
    reload()
  }

  // Reconectar de vez: desconecta a sessão travada e mostra o QR para ler no celular do número.
  async function relink(r: ConnectionRow) {
    const ok = await confirm(
      `Reconectar "${r.label}" com novo QR code? A sessão atual é desconectada e você precisa ler o QR no celular desse número (WhatsApp → Aparelhos conectados). Depois disso o número volta a receber. O que chegou enquanto estava parado não volta para o CRM: fica só no celular.`,
      'Gerar QR code',
    )
    if (!ok) return
    setQr({ row: r, loading: true })
    const res: any = await relinkCrmInstance(r.id)
    if (res.error) { setQr({ row: r, loading: false, error: res.error }); return }
    if (res.alreadyConnected) { setQr({ row: r, loading: false, error: 'O número ainda aparece conectado. Tente de novo em alguns segundos.' }); return }
    setQr({ row: r, loading: false, img: res.qrcodeBase64, pairing: res.pairingCode, error: res.qrcodeBase64 ? undefined : 'A Evolution não devolveu o QR code.' })
  }
  async function newQr(r: ConnectionRow) {
    setQr({ row: r, loading: true })
    const res: any = await connectCrmInstance(r.instance_name)
    if (res.error) { setQr({ row: r, loading: false, error: res.error }); return }
    if (res.alreadyConnected) { setQr(null); toast.success('WHATSAPP CONECTADO', r.label); reload(); return }
    setQr({ row: r, loading: false, img: res.qrcodeBase64, pairing: res.pairingCode, error: res.qrcodeBase64 ? undefined : 'A Evolution não devolveu o QR code.' })
  }
  // com o QR aberto, acompanha até conectar
  useEffect(() => {
    if (!qr?.img) return
    const t = setInterval(async () => {
      const { state } = await getCrmInstanceConnectionState(qr.row.instance_name)
      if (state === 'open') { setQr(null); toast.success('WHATSAPP RECONECTADO', `${qr.row.label} voltou. Em 1–2 minutos o monitor confirma que está recebendo.`); reload() }
    }, 3000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qr?.img, qr?.row.instance_name])

  const events = useMemo(() => data.events.filter((e) => filter === 'all' || (filter === 'server' ? !e.instance_id : e.instance_id === filter)), [data.events, filter])
  const groups = useMemo(() => {
    const out: { day: string; label: string; items: ConnectionEvent[] }[] = []
    for (const e of events) {
      const k = dayKey(e.at)
      const g = out[out.length - 1]
      if (g && g.day === k) g.items.push(e)
      else out.push({ day: k, label: dayFmt.format(new Date(e.at)), items: [e] })
    }
    return out
  }, [events])

  const problems = data.rows.filter((r) => r.is_active && r.status === 'down').length

  return (
    <div className="space-y-5 pb-8">
      {ConfirmDialog}
      {qr && (
        <div className="fixed inset-0 modal-backdrop z-50 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setQr(null) }}>
          <div role="dialog" aria-modal="true" aria-label="Reconectar WhatsApp" className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 text-center space-y-3">
            <div className="flex items-center">
              <h3 className="font-semibold text-gray-900">Reconectar {qr.row.label}</h3>
              <button onClick={() => setQr(null)} aria-label="Fechar" className="ml-auto text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>
            {qr.loading && <div className="py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" /><p className="text-xs text-gray-500 mt-2">Desconectando a sessão e gerando o QR…</p></div>}
            {qr.error && <p role="alert" className="text-sm text-red-600">{qr.error}</p>}
            {qr.img && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr.img} alt="QR Code do WhatsApp" className="w-64 h-64 mx-auto" />
            )}
            {qr.pairing && <p className="text-sm">Ou use o código: <b className="tracking-widest">{qr.pairing}</b></p>}
            {qr.img && <p className="text-xs text-gray-500">No celular de <b>{qr.row.label}</b>: WhatsApp → Aparelhos conectados → Conectar um aparelho. Esta tela fecha sozinha quando conectar.</p>}
            {!qr.loading && <button onClick={() => newQr(qr.row)} className="text-sm underline text-gray-600">Gerar novo QR</button>}
          </div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-gray-900">Conexões dos WhatsApps</h1>
          <p className="text-sm text-gray-500">
            {problems ? <span className="text-red-600 font-medium">{problems} número{problems > 1 ? 's' : ''} com problema</span> : 'Todos os números conectados e recebendo'} · o monitor confere a cada minuto
          </p>
        </div>
        <button onClick={reload} disabled={refreshing} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-60">
          <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} /> Atualizar
        </button>
      </div>

      {data.server && data.server.status !== 'ok' && (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          <Server className="w-4 h-4 mt-0.5 shrink-0" />
          <span><b>Servidor do WhatsApp fora do ar</b>{data.server.since ? ` desde ${dateFmt.format(new Date(data.server.since))}` : ''}. {data.server.detail}</span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.rows.map((r) => {
          const st = statusOf(r)
          const mute = r.is_active && r.status === 'down' && r.silent
          const noEdit = r.webhook?.events && !r.webhook.events.includes('MESSAGES_UPDATE')
          return (
            <div key={r.id} className={cn('rounded-xl border bg-white p-4 space-y-3', mute || (r.is_active && r.status === 'down') ? 'border-red-300' : 'border-gray-200', !r.is_active && 'opacity-60')}>
              <div className="flex items-start gap-2">
                <span className={cn('mt-1.5 w-2.5 h-2.5 rounded-full shrink-0', st.dot)} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 truncate">{r.label}</p>
                  <p className="text-xs text-gray-500 truncate">{r.phone ?? 'sem telefone'}</p>
                </div>
                <span className={cn('text-xs px-2 py-0.5 rounded-full whitespace-nowrap', st.cls)}>{st.text}</span>
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-gray-500">Última recebida</dt>
                <dd className={cn('text-right', mute ? 'text-red-600 font-medium' : 'text-gray-800')} title={r.last_inbound_at ? dateFmt.format(new Date(r.last_inbound_at)) : undefined}>{ago(r.last_inbound_at, now)}</dd>
                <dt className="text-gray-500">Última enviada</dt>
                <dd className="text-right text-gray-800" title={r.last_outbound_at ? dateFmt.format(new Date(r.last_outbound_at)) : undefined}>{ago(r.last_outbound_at, now)}</dd>
                {r.since && r.status !== 'unknown' && (
                  <>
                    <dt className="text-gray-500">{r.status === 'ok' ? 'Estável desde' : 'Problema desde'}</dt>
                    <dd className="text-right text-gray-800">{dateFmt.format(new Date(r.since))}</dd>
                  </>
                )}
              </dl>

              {r.status === 'down' && r.is_active && (
                <p className="text-xs text-red-700 bg-red-50 rounded-lg px-2.5 py-2 leading-relaxed">{r.detail}{r.reason && r.silent ? ` ${r.reason.replace(/^sem receber desde [^.]*\.\s?/, '')}` : ''}</p>
              )}
              {noEdit && r.status === 'ok' && (
                <p className="text-[11px] text-gray-500 flex items-start gap-1.5"><Info className="w-3.5 h-3.5 shrink-0 mt-px" /> Sem os avisos de “digitando” e de mensagem editada/apagada neste número.</p>
              )}

              {r.is_active && r.state !== 'close' && (
                <button
                  onClick={() => restart(r)}
                  disabled={busy === r.id}
                  className={cn('w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded-lg disabled:opacity-60', mute ? 'bg-gray-900 text-white hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')}
                >
                  {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} Reiniciar conexão
                </button>
              )}
              {r.is_active && (mute || r.status === 'down') && (
                <button
                  onClick={() => relink(r)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700"
                >
                  <QrCode className="w-4 h-4" /> Reconectar com novo QR
                </button>
              )}
            </div>
          )
        })}
      </div>

      <section>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-gray-900 mr-2">Log de acontecimentos</h2>
          {[{ id: 'all', label: 'Tudo' }, ...data.rows.map((r) => ({ id: r.id, label: r.label })), { id: 'server', label: 'Servidor' }].map((o) => (
            <button
              key={o.id}
              onClick={() => setFilter(o.id)}
              className={cn('px-2.5 py-1 text-xs font-medium rounded-full transition-colors', filter === o.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
            >
              {o.label}
            </button>
          ))}
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">Nada registrado para este filtro.</p>
        ) : (
          groups.map((g) => (
            <div key={g.day} className="mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5 first-letter:uppercase">{g.label}</p>
              <ul className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
                {g.items.map((e) => {
                  const k = KIND[e.kind] ?? { label: e.kind, cls: 'text-gray-700 bg-gray-100', Icon: Info }
                  return (
                    <li key={e.id} className="flex items-start gap-3 px-3 py-2.5">
                      <span className="w-11 shrink-0 text-xs tabular-nums text-gray-500 pt-0.5">{timeFmt.format(new Date(e.at))}</span>
                      <span className={cn('shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap', k.cls)}>
                        <k.Icon className="w-3 h-3" /> {k.label}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-medium text-gray-900">{e.who}</span>
                        <span className="block text-xs text-gray-600 break-words">{e.message}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  )
}
