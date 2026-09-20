'use client'

import { useState } from 'react'
import { Loader2, Plus, X, Save, MessageSquareText, HardDrive } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { saveBotConfig, syncPendingToDrive, type BotConfigInput } from '@/lib/bot-actions'

const PRIORITIES = ['Baixa', 'Média', 'Alta', 'Urgente']
const DEFAULT_ORIGINS = ['Visita', 'WhatsApp', 'Loja', 'Indicação', 'Outro']
const DEFAULT_CATEGORIES = ['Iluminação', 'Automação', 'Iluminação + Automação']

const DRIVE_MSG: Record<string, string> = {
  ok: 'Google Drive conectado!',
  denied: 'Autorização negada no Google.',
  invalid_state: 'Sessão de autorização expirou. Tente conectar de novo.',
  no_refresh_token: 'O Google não devolveu a permissão permanente. Tente conectar de novo.',
  save_failed: 'Não foi possível salvar a conexão.',
  error: 'Erro ao conectar com o Google.',
}

export function BotConfigPage({
  initialConfig,
  drive,
  driveResult,
}: {
  initialConfig: any | null
  drive?: { connected: boolean; email: string | null; connected_at: string | null; pending: number } | null
  driveResult?: string | null
}) {
  const toast = useToast()
  const [syncing, setSyncing] = useState(false)

  async function handleSyncDrive() {
    setSyncing(true)
    const r = await syncPendingToDrive()
    setSyncing(false)
    if (r.error && !r.synced) toast.error('Não foi possível sincronizar', String(r.error))
    else toast.success('Sincronização concluída', `${r.synced ?? 0} enviado(s), ${r.failed ?? 0} com falha.`)
  }
  const isFirstSetup = !initialConfig

  const [instance, setInstance] = useState(initialConfig?.evolution_instance_name ?? '')
  const [baseUrl, setBaseUrl] = useState(initialConfig?.system_api_base_url ?? '')
  const [secretRef, setSecretRef] = useState(
    initialConfig?.system_api_key_secret_ref ?? 'NEXTJS_API_KEY',
  )
  const [priority, setPriority] = useState(initialConfig?.default_priority ?? 'Média')
  const [origins, setOrigins] = useState<string[]>(
    initialConfig?.allowed_origins ?? DEFAULT_ORIGINS,
  )
  const [categories, setCategories] = useState<string[]>(
    initialConfig?.allowed_categories ?? DEFAULT_CATEGORIES,
  )
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(initialConfig?.updated_at ?? null)

  async function handleSave() {
    setSaving(true)
    const payload: BotConfigInput = {
      evolution_instance_name: instance,
      system_api_base_url: baseUrl,
      system_api_key_secret_ref: secretRef,
      default_priority: priority,
      allowed_origins: origins,
      allowed_categories: categories,
    }
    const res = await saveBotConfig(payload)
    setSaving(false)
    if (res?.error) {
      toast.error('Não foi possível salvar', res.error)
      return
    }
    toast.success('Configuração salva', 'O robô usará esses valores nos próximos cadastros.')
    setSavedAt(new Date().toISOString())
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuração do Robô</h1>
        <p className="text-gray-500 mt-1">
          Conexão do WhatsApp, integração com o sistema e defaults do cadastro guiado.
        </p>
      </div>

      {isFirstSetup && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Primeira configuração. O robô só opera depois que a instância Evolution estiver
          conectada e o endpoint do sistema estiver preenchido.
        </div>
      )}

      {/* Google Drive */}
      <section className="card p-5 space-y-3">
        <header className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-brand-500" />
          <h2 className="font-semibold text-gray-900">Google Drive</h2>
        </header>
        {driveResult && (
          <p className={`text-sm ${driveResult === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
            {DRIVE_MSG[driveResult] ?? 'Retorno desconhecido.'}
          </p>
        )}
        <p className="text-sm text-gray-500">
          {drive?.connected
            ? `Conectado${drive.email ? ` como ${drive.email}` : ''}. Os arquivos que o robô recebe vão para uma pasta do cliente dentro de ORÇAMENTOS.`
            : 'Não conectado. Entre com a conta comercial@luknoseletrica.com.br para o robô guardar os arquivos no Drive.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/google/authorize" className="btn-secondary">
            {drive?.connected ? 'Reconectar' : 'Conectar Google Drive'}
          </a>
          {drive?.connected && (
            <button type="button" onClick={handleSyncDrive} disabled={syncing} className="btn-secondary">
              {syncing ? 'Sincronizando…' : `Sincronizar pendentes (${drive.pending})`}
            </button>
          )}
        </div>
      </section>

      {/* Conexão WhatsApp */}
      <section className="card p-5 space-y-4">
        <header className="flex items-center gap-2">
          <MessageSquareText className="w-4 h-4 text-brand-500" />
          <h2 className="font-semibold text-gray-900">Conexão WhatsApp (Evolution API)</h2>
        </header>
        <div>
          <label className="label">Nome da instância *</label>
          <input
            value={instance}
            onChange={(e) => setInstance(e.target.value)}
            className="input mt-1"
            placeholder="ex.: robo-orcamentos"
          />
          <p className="text-xs text-gray-400 mt-1">
            Nome da instância do número dedicado do robô na Evolution API.
          </p>
        </div>
      </section>

      {/* Integração com o sistema */}
      <section className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Integração com o sistema</h2>
        <div>
          <label className="label">Base URL do sistema *</label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="input mt-1"
            placeholder="https://app.luknos.com.br"
          />
          <p className="text-xs text-gray-400 mt-1">
            O robô grava o orçamento em <code>POST {baseUrl || '<base>'}/api/external/quotes</code>.
          </p>
        </div>
        <div>
          <label className="label">Referência do segredo da API key *</label>
          <input
            value={secretRef}
            onChange={(e) => setSecretRef(e.target.value)}
            className="input mt-1"
            placeholder="NEXTJS_API_KEY"
          />
          <p className="text-xs text-gray-400 mt-1">
            Apenas o <strong>rótulo</strong> do secret guardado no Supabase (Vault/Edge Functions).
            A chave em si nunca é salva nesta tabela.
          </p>
        </div>
      </section>

      {/* Defaults do cadastro */}
      <section className="card p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Defaults do cadastro</h2>
        <div className="max-w-xs">
          <label className="label">Prioridade padrão</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="input mt-1"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Aplicada quando o colaborador não informa a prioridade.
          </p>
        </div>
        <TagEditor
          label="Origens aceitas"
          hint="Valores válidos para o campo Origem no cadastro guiado."
          values={origins}
          onChange={setOrigins}
        />
        <TagEditor
          label="Categorias aceitas"
          hint="Valores válidos para o campo Categoria no cadastro guiado."
          values={categories}
          onChange={setCategories}
        />
      </section>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar configuração
        </button>
        {savedAt && !saving && (
          <span className="text-xs text-gray-400">
            Última atualização: {new Date(savedAt).toLocaleString('pt-BR')}
          </span>
        )}
      </div>
    </div>
  )
}

function TagEditor({
  label,
  hint,
  values,
  onChange,
}: {
  label: string
  hint?: string
  values: string[]
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  function add() {
    const t = draft.trim()
    if (!t) return
    if (values.some((v) => v.toLowerCase() === t.toLowerCase())) {
      setDraft('')
      return
    }
    onChange([...values, t])
    setDraft('')
  }

  return (
    <div>
      <label className="label">{label}</label>
      {hint && <p className="text-xs text-gray-400 mt-0.5 mb-2">{hint}</p>}
      <div className="flex flex-wrap gap-2 mb-2">
        {values.length === 0 && (
          <span className="text-xs text-gray-400">Nenhum valor cadastrado.</span>
        )}
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full bg-surface border border-surface-border px-2.5 py-1 text-xs text-gray-700"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="text-gray-400 hover:text-red-500"
              aria-label={`Remover ${v}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2 max-w-sm">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          className="input"
          placeholder="Adicionar valor e Enter"
        />
        <button type="button" onClick={add} className="btn-secondary flex items-center gap-1">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
