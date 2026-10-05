'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createCrmInstance,
  updateCrmInstance,
  setCrmInstanceActive,
  connectCrmInstance,
  getCrmInstanceConnectionState,
} from '@/lib/crm-actions'
import { useToast } from '@/components/ui/Toast'
import { useFocusTrap } from '@/components/ui/useFocusTrap'
import { cn } from '@/lib/utils'
import { Plus, QrCode, Loader2, Pencil, Power, X, CheckCircle2 } from 'lucide-react'

interface Instance {
  id: string
  instance_name: string
  phone_e164: string | null
  label: string
  default_user_id: string | null
  is_active: boolean
  users?: { name: string } | null
}
interface SysUser { id: string; name: string }

const STATE_LABEL: Record<string, { text: string; cls: string }> = {
  open: { text: 'Conectado', cls: 'bg-green-100 text-green-700' },
  connecting: { text: 'Aguardando QR', cls: 'bg-amber-100 text-amber-700' },
  close: { text: 'Desconectado', cls: 'bg-red-100 text-red-700' },
  unknown: { text: 'Status indisponível', cls: 'bg-gray-100 text-gray-600' },
}

export function CrmInstancesPage({ instances, users }: { instances: Instance[]; users: SysUser[] }) {
  const router = useRouter()
  const toast = useToast()
  const [states, setStates] = useState<Record<string, string>>({})
  const [form, setForm] = useState<{ inst: Instance | null } | null>(null)
  const [qr, setQr] = useState<{ inst: Instance; img?: string; pairing?: string | null; loading: boolean; error?: string } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const qrRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    Promise.all(instances.map(async (i) => [i.id, (await getCrmInstanceConnectionState(i.instance_name)).state] as const))
      .then((r) => { if (alive) setStates(Object.fromEntries(r)) })
    return () => { alive = false }
  }, [instances])

  // enquanto o QR está aberto, consulta o estado até conectar
  useEffect(() => {
    if (!qr) return
    const t = setInterval(async () => {
      const { state } = await getCrmInstanceConnectionState(qr.inst.instance_name)
      if (state === 'open') {
        setStates((s) => ({ ...s, [qr.inst.id]: 'open' }))
        setQr(null)
        toast.success('WHATSAPP CONECTADO', qr.inst.label)
      }
    }, 3000)
    return () => clearInterval(t)
  }, [qr, toast])

  async function openQr(inst: Instance) {
    setQr({ inst, loading: true })
    const r = await connectCrmInstance(inst.instance_name)
    if ('error' in r && r.error) { setQr({ inst, loading: false, error: r.error }); return }
    if ('alreadyConnected' in r && r.alreadyConnected) {
      setQr(null); setStates((s) => ({ ...s, [inst.id]: 'open' })); toast.info('JÁ CONECTADO', inst.label); return
    }
    const img = (r as any).qrcodeBase64 as string | undefined
    setQr({
      inst, loading: false,
      img: img ? (img.startsWith('data:') ? img : `data:image/png;base64,${img}`) : undefined,
      pairing: (r as any).pairingCode,
      error: img ? undefined : 'A Evolution não devolveu QR Code.',
    })
  }

  async function toggleActive(inst: Instance) {
    if (busyId) return
    setBusyId(inst.id)
    const r = await setCrmInstanceActive(inst.id, !inst.is_active)
    setBusyId(null)
    if ('error' in r && r.error) toast.error('ERRO', r.error)
    else router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Números do CRM</h1>
          <p className="text-sm text-gray-500">Cada número é uma instância da Evolution API. Cadastre, pareie pelo QR Code e defina quem atende por padrão.</p>
        </div>
        <button onClick={() => setForm({ inst: null })} className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-full bg-gray-900 text-white hover:bg-gray-700">
          <Plus className="w-4 h-4" /> Novo número
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {instances.length === 0 && <p className="p-6 text-sm text-gray-500 text-center">Nenhum número cadastrado.</p>}
        {instances.map((i) => {
          const st = STATE_LABEL[states[i.id] ?? 'unknown'] ?? STATE_LABEL.unknown
          return (
            <div key={i.id} className={cn('flex flex-wrap items-center gap-3 p-4', !i.is_active && 'opacity-60')}>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900">{i.label}</p>
                <p className="text-xs text-gray-500 truncate">
                  {i.phone_e164 ?? 'sem telefone'} · instância “{i.instance_name}” · atendente padrão: {(i.users as any)?.name ?? '—'}
                </p>
              </div>
              <span title={states[i.id] === 'unknown' ? 'Não foi possível consultar a Evolution agora. Tente recarregar; se persistir, confira a conexão do servidor.' : undefined} className={cn('text-xs px-2 py-0.5 rounded-full', st.cls)}>{states[i.id] ? st.text : 'Verificando…'}</span>
              {!i.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">Inativo</span>}
              <button onClick={() => openQr(i)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200"><QrCode className="w-4 h-4" /> Conectar</button>
              <button onClick={() => setForm({ inst: i })} aria-label={`Editar ${i.label}`} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => toggleActive(i)} disabled={busyId === i.id} aria-label={i.is_active ? `Desativar ${i.label}` : `Ativar ${i.label}`} title={i.is_active ? 'Desativar' : 'Ativar'} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 disabled:opacity-50"><Power className="w-4 h-4" /></button>
            </div>
          )
        })}
      </div>

      {form && <InstanceForm inst={form.inst} users={users} onClose={() => setForm(null)} onSaved={(created) => { setForm(null); router.refresh(); if (created) toast.success('NÚMERO CADASTRADO', 'Agora clique em Conectar para ler o QR Code.') }} />}

      {qr && <QrTrap refEl={qrRef} onClose={() => setQr(null)} />}
      {qr && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setQr(null) }}>
          <div ref={qrRef} role="dialog" aria-modal="true" aria-label="Conectar WhatsApp" className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 text-center space-y-3">
            <div className="flex items-center">
              <h3 className="font-semibold text-gray-900">Conectar {qr.inst.label}</h3>
              <button onClick={() => setQr(null)} aria-label="Fechar" className="ml-auto text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>
            {qr.loading && <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto my-8" />}
            {qr.error && <p role="alert" className="text-sm text-red-600">{qr.error}</p>}
            {qr.img && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr.img} alt="QR Code do WhatsApp" className="w-64 h-64 mx-auto" />
            )}
            {qr.pairing && <p className="text-sm">Ou use o código: <b className="tracking-widest">{qr.pairing}</b></p>}
            {qr.img && <p className="text-xs text-gray-500">WhatsApp → Aparelhos conectados → Conectar um aparelho. A tela fecha sozinha quando conectar.</p>}
            {!qr.loading && <button onClick={() => openQr(qr.inst)} className="text-sm underline text-gray-600">Gerar novo QR</button>}
          </div>
        </div>
      )}
    </div>
  )
}

function InstanceForm({ inst, users, onClose, onSaved }: { inst: Instance | null; users: SysUser[]; onClose: () => void; onSaved: (created: boolean) => void }) {
  const [instanceName, setInstanceName] = useState(inst?.instance_name ?? '')
  const [label, setLabel] = useState(inst?.label ?? '')
  const [phone, setPhone] = useState(inst?.phone_e164 ?? '')
  const [userId, setUserId] = useState(inst?.default_user_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  useFocusTrap(formRef, onClose, !saving)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true); setError(null)
    const payload = { instance_name: instanceName, label, phone_e164: phone.replace(/[\s()-]/g, ''), default_user_id: userId || null }
    const r = inst ? await updateCrmInstance(inst.id, payload) : await createCrmInstance(payload)
    setSaving(false)
    if ('error' in r && r.error) { setError(r.error); return }
    onSaved(!inst)
  }

  const input = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300'
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <form ref={formRef} onSubmit={submit} role="dialog" aria-modal="true" aria-label={inst ? 'Editar número' : 'Novo número'} className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-3">
        <h3 className="font-semibold text-gray-900">{inst ? 'Editar número' : 'Novo número'}</h3>
        <div>
          <label htmlFor="i-label" className="block text-sm text-gray-700 mb-1">Nome de exibição</label>
          <input id="i-label" className={input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Vendas — Maria" />
        </div>
        <div>
          <label htmlFor="i-name" className="block text-sm text-gray-700 mb-1">Nome da instância (Evolution)</label>
          <input id="i-name" className={cn(input, inst && 'bg-gray-100')} value={instanceName} onChange={(e) => setInstanceName(e.target.value)} disabled={!!inst} placeholder="Ex.: vendas-maria (sem espaços)" />
          {!inst && <p className="text-xs text-gray-500 mt-1">Não dá para mudar depois.</p>}
        </div>
        <div>
          <label htmlFor="i-phone" className="block text-sm text-gray-700 mb-1">Telefone (opcional)</label>
          <input id="i-phone" className={input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+5582999999999" inputMode="tel" />
        </div>
        <div>
          <label htmlFor="i-user" className="block text-sm text-gray-700 mb-1">Atendente padrão</label>
          <select id="i-user" className={input} value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">— ninguém (conversas ficam pendentes) —</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={saving} className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200">Cancelar</button>
          <button type="submit" disabled={saving} className="px-3 py-1.5 text-sm rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-60 inline-flex items-center gap-1.5">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar
          </button>
        </div>
      </form>
    </div>
  )
}

function QrTrap({ refEl, onClose }: { refEl: React.RefObject<HTMLDivElement>; onClose: () => void }) {
  useFocusTrap(refEl, onClose)
  return null
}
