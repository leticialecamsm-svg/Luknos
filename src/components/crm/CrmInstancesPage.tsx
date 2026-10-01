'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, X, Save, Smartphone, Loader2, QrCode, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import {
  createCrmInstance, updateCrmInstance, setCrmInstanceActive,
  connectCrmInstance, getCrmInstanceConnectionState,
  type CrmInstanceInput,
} from '@/lib/crm-actions'
import { cn } from '@/lib/utils'

interface InstanceRow {
  id: string
  instance_name: string
  phone_e164: string | null
  label: string
  default_user_id: string | null
  is_active: boolean
  users: { name: string } | null
}
interface SystemUser { id: string; name: string }

export function CrmInstancesPage({ initial, users }: { initial: InstanceRow[]; users: SystemUser[] }) {
  const toast = useToast()
  const [items, setItems] = useState(initial)
  const [editing, setEditing] = useState<InstanceRow | 'new' | null>(null)
  const [connecting, setConnecting] = useState<InstanceRow | null>(null)

  function refresh() {
    // página é server component acima; forçamos reload simples do client.
    window.location.reload()
  }

  async function toggleActive(row: InstanceRow) {
    const res = await setCrmInstanceActive(row.id, !row.is_active)
    if (res.error) { toast.error('OCORREU UM ERRO', res.error); return }
    setItems((prev) => prev.map((i) => (i.id === row.id ? { ...i, is_active: !i.is_active } : i)))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Números do CRM (WhatsApp)</h1>
          <p className="text-gray-500 mt-1">
            Cada linha é um número de vendedor conectado na Evolution API (instância própria).
          </p>
        </div>
        <button onClick={() => setEditing('new')} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Novo número
        </button>
      </div>

      <div className="card divide-y divide-surface-border">
        {items.length === 0 && (
          <p className="text-sm text-gray-400 p-4">Nenhum número cadastrado ainda.</p>
        )}
        {items.map((row) => (
          <div key={row.id} className="flex items-center gap-3 p-4">
            <Smartphone className={cn('w-5 h-5', row.is_active ? 'text-brand-500' : 'text-gray-300')} />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 truncate">{row.label}</p>
              <p className="text-xs text-gray-400">
                {row.instance_name}{row.phone_e164 ? ` · ${row.phone_e164}` : ''}{row.users?.name ? ` · atendente padrão: ${row.users.name}` : ''}
              </p>
            </div>
            <button onClick={() => toggleActive(row)} className={cn('text-xs px-2 py-1 rounded-full font-medium', row.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
              {row.is_active ? 'Ativo' : 'Inativo'}
            </button>
            <button onClick={() => setConnecting(row)} className="btn-secondary text-xs px-2 py-1.5 flex items-center gap-1">
              <QrCode className="w-3.5 h-3.5" /> Conectar WhatsApp
            </button>
            <button onClick={() => setEditing(row)} className="btn-secondary text-xs px-2 py-1.5">Editar</button>
          </div>
        ))}
      </div>

      {editing && (
        <InstanceForm
          row={editing === 'new' ? null : editing}
          users={users}
          onClose={() => setEditing(null)}
          onSaved={refresh}
          onCreated={(row) => setConnecting(row)}
        />
      )}

      {connecting && (
        <ConnectModal row={connecting} onClose={() => setConnecting(null)} />
      )}
    </div>
  )
}

function InstanceForm({
  row, users, onClose, onSaved, onCreated,
}: {
  row: InstanceRow | null
  users: SystemUser[]
  onClose: () => void
  onSaved: () => void
  onCreated: (row: InstanceRow) => void
}) {
  const toast = useToast()
  const [instanceName, setInstanceName] = useState(row?.instance_name ?? '')
  const [label, setLabel] = useState(row?.label ?? '')
  const [phone, setPhone] = useState(row?.phone_e164 ?? '')
  const [userId, setUserId] = useState(row?.default_user_id ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const input: CrmInstanceInput = {
      instance_name: instanceName,
      label,
      phone_e164: phone,
      default_user_id: userId || null,
    }
    const res = row ? await updateCrmInstance(row.id, input) : await createCrmInstance(input)
    setSaving(false)
    if (res.error) { toast.error('NÃO FOI POSSÍVEL SALVAR', res.error); return }
    toast.success('SALVO!', 'Número configurado.')
    onClose()
    if (!row) {
      // número novo: já manda pra tela de conectar (QR Code) em vez de só
      // recarregar — poupa o clique extra.
      onCreated({
        id: 'pending', instance_name: instanceName, label, phone_e164: phone || null,
        default_user_id: userId || null, is_active: true, users: null,
      })
    } else {
      onSaved()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">{row ? 'Editar número' : 'Novo número'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>

        <div>
          <label className="label">Nome de exibição *</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className="input mt-1" placeholder="ex.: Jennifer — loja" />
        </div>
        <div>
          <label className="label">Nome da instância na Evolution *</label>
          <input
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value)}
            className="input mt-1"
            placeholder="ex.: vendas-jennifer"
            disabled={!!row}
          />
          <p className="text-xs text-gray-400 mt-1">
            Um identificador só seu, sem espaço nem acento (ex.: vendas-jennifer). Depois de salvar, a gente já cria essa
            instância na Evolution e mostra o QR Code pra parear.
            {row && ' Não dá pra mudar depois de criado.'}
          </p>
        </div>
        <div>
          <label className="label">Telefone (E.164)</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input mt-1" placeholder="+5582900000000" />
        </div>
        <div>
          <label className="label">Atendente padrão</label>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className="input mt-1">
            <option value="">— nenhum (fica em "Sem atendente") —</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1">Conversas novas nesse número já chegam atribuídas a essa pessoa.</p>
        </div>

        <button onClick={handleSave} disabled={saving || !label.trim() || !instanceName.trim()} className="btn-primary w-full flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
        </button>
      </div>
    </div>
  )
}

function ConnectModal({ row, onClose }: { row: InstanceRow; onClose: () => void }) {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    connectCrmInstance(row.instance_name).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.error) { setError(res.error); return }
      if (res.alreadyConnected) { setConnected(true); return }
      if (res.qrcodeBase64) {
        setQr(res.qrcodeBase64)
        // confere a cada 4s se o celular já escaneou
        pollRef.current = setInterval(async () => {
          const st = await getCrmInstanceConnectionState(row.instance_name)
          if (st.state === 'open') {
            setConnected(true)
            if (pollRef.current) clearInterval(pollRef.current)
            toast.success('CONECTADO!', `${row.label} está pronto pra usar.`)
          }
        }, 4000)
      }
    })
    return () => { cancelled = true; if (pollRef.current) clearInterval(pollRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.instance_name])

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card p-5 w-full max-w-sm space-y-4 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Conectar {row.label}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>

        {loading && (
          <p className="text-sm text-gray-500 flex items-center justify-center gap-2 py-8">
            <Loader2 className="w-4 h-4 animate-spin" /> Preparando a instância na Evolution…
          </p>
        )}

        {!loading && error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {!loading && connected && (
          <div className="py-6 flex flex-col items-center gap-2 text-green-600">
            <CheckCircle2 className="w-10 h-10" />
            <p className="text-sm font-medium">WhatsApp conectado!</p>
          </div>
        )}

        {!loading && !error && !connected && qr && (
          <>
            <img src={`data:image/png;base64,${qr.replace(/^data:image\/\w+;base64,/, '')}`} alt="QR Code" className="w-56 h-56 mx-auto rounded-lg border border-surface-border" />
            <p className="text-xs text-gray-500">
              No celular desse número: WhatsApp → Aparelhos conectados → Conectar um aparelho, e aponte pra esse QR Code.
              A tela atualiza sozinha assim que conectar.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
