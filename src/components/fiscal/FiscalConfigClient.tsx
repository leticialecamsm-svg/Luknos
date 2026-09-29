'use client'

import { useState } from 'react'
import { Loader2, Save, ShieldCheck, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { updateFiscalConfig, getFiscalConfig, type FiscalConfig } from '@/lib/fiscal/actions'

const inputCls = 'w-full mt-1 px-3 py-2 bg-white border border-surface-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30'

export function FiscalConfigClient({ initial }: { initial: FiscalConfig }) {
  const [form, setForm] = useState({
    cnpj: initial.cnpj ?? '', ie: initial.ie ?? '', crt: initial.crt ?? 1, ambiente: initial.ambiente,
    focus_token_homologacao: initial.focus_token_homologacao ?? '', focus_token_producao: initial.focus_token_producao ?? '',
    nfe_serie_homologacao: initial.nfe_serie_homologacao, nfe_serie_producao: initial.nfe_serie_producao,
    nfce_serie_homologacao: initial.nfce_serie_homologacao, nfce_serie_producao: initial.nfce_serie_producao,
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  async function save() {
    setSaving(true); setMsg(null)
    const r = await updateFiscalConfig(form)
    setSaving(false)
    if ('error' in r) { setMsg({ type: 'error', text: r.error ?? 'Erro ao salvar' }); return }
    setMsg({ type: 'ok', text: 'Salvo.' })
    // busca de novo do servidor pra mostrar os tokens já mascarados, sem deixar o valor em texto puro na tela
    const fresh = await getFiscalConfig()
    if (!('error' in fresh)) {
      setForm({
        cnpj: fresh.config.cnpj ?? '', ie: fresh.config.ie ?? '', crt: fresh.config.crt ?? 1, ambiente: fresh.config.ambiente,
        focus_token_homologacao: fresh.config.focus_token_homologacao ?? '', focus_token_producao: fresh.config.focus_token_producao ?? '',
        nfe_serie_homologacao: fresh.config.nfe_serie_homologacao, nfe_serie_producao: fresh.config.nfe_serie_producao,
        nfce_serie_homologacao: fresh.config.nfce_serie_homologacao, nfce_serie_producao: fresh.config.nfce_serie_producao,
      })
    }
  }

  const homolog = form.ambiente === 'homologacao'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Configurações Fiscais</h1>
        <p className="text-sm text-gray-500">Dados da empresa e credenciais da Focus NFe para emissão de NF-e e NFC-e.</p>
      </div>

      <div className={cn('flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium',
        homolog ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-red-50 border-red-200 text-red-800')}>
        {homolog ? <ShieldCheck className="w-4 h-4 shrink-0" /> : <ShieldAlert className="w-4 h-4 shrink-0" />}
        {homolog
          ? 'Ambiente de HOMOLOGAÇÃO — notas emitidas aqui não têm valor fiscal.'
          : 'Ambiente de PRODUÇÃO — notas emitidas aqui são reais e valem para a SEFAZ.'}
      </div>

      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Empresa</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <label className="block text-xs text-gray-500">CNPJ
            <input className={inputCls} value={form.cnpj} onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))} placeholder="45.118.870/0001-06" />
          </label>
          <label className="block text-xs text-gray-500">Inscrição Estadual
            <input className={inputCls} value={form.ie} onChange={e => setForm(f => ({ ...f, ie: e.target.value }))} placeholder="240322851" />
          </label>
          <label className="block text-xs text-gray-500">CRT
            <select className={inputCls} value={form.crt} onChange={e => setForm(f => ({ ...f, crt: Number(e.target.value) }))}>
              <option value={1}>1 — Simples Nacional</option>
              <option value={2}>2 — Simples Nacional, excesso de sublimite</option>
              <option value={3}>3 — Regime Normal</option>
            </select>
          </label>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Ambiente ativo</h2>
        <p className="text-xs text-gray-500">Só troque para Produção quando o checklist de virada estiver concluído (Fase 4 do plano). Emissão em Produção não existe ainda nesta versão.</p>
        <div className="flex gap-2">
          {(['homologacao', 'producao'] as const).map(a => (
            <button key={a} type="button" onClick={() => setForm(f => ({ ...f, ambiente: a }))}
              className={cn('px-4 py-2 rounded-lg text-sm font-medium border', form.ambiente === a ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-surface-border')}>
              {a === 'homologacao' ? 'Homologação' : 'Produção'}
            </button>
          ))}
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Tokens da Focus NFe</h2>
        <p className="text-xs text-gray-500">Cada token fica salvo mascarado. Para trocar, apague o campo e cole o novo valor — deixar como está não altera nada.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block text-xs text-gray-500">Token de Homologação
            <input className={inputCls} value={form.focus_token_homologacao}
              onChange={e => setForm(f => ({ ...f, focus_token_homologacao: e.target.value }))} placeholder="cole o token aqui" />
          </label>
          <label className="block text-xs text-gray-500">Token de Produção
            <input className={inputCls} value={form.focus_token_producao}
              onChange={e => setForm(f => ({ ...f, focus_token_producao: e.target.value }))} placeholder="cole o token aqui" />
          </label>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Numeração (série)</h2>
        <p className="text-xs text-gray-500">A série de Produção deve ser diferente da usada no seu emissor atual, para não repetir número de nota.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-gray-500">NF-e · Homologação
              <input type="number" className={inputCls} value={form.nfe_serie_homologacao} onChange={e => setForm(f => ({ ...f, nfe_serie_homologacao: Number(e.target.value) }))} />
            </label>
            <label className="block text-xs text-gray-500">NF-e · Produção
              <input type="number" className={inputCls} value={form.nfe_serie_producao} onChange={e => setForm(f => ({ ...f, nfe_serie_producao: Number(e.target.value) }))} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-gray-500">NFC-e · Homologação
              <input type="number" className={inputCls} value={form.nfce_serie_homologacao} onChange={e => setForm(f => ({ ...f, nfce_serie_homologacao: Number(e.target.value) }))} />
            </label>
            <label className="block text-xs text-gray-500">NFC-e · Produção
              <input type="number" className={inputCls} value={form.nfce_serie_producao} onChange={e => setForm(f => ({ ...f, nfce_serie_producao: Number(e.target.value) }))} />
            </label>
          </div>
        </div>
      </div>

      {msg && <p className={cn('text-sm', msg.type === 'ok' ? 'text-emerald-700' : 'text-red-600')}>{msg.text}</p>}

      <button onClick={save} disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 bg-navy text-white rounded-lg text-sm font-medium disabled:opacity-50">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
      </button>
    </div>
  )
}
