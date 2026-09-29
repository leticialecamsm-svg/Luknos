'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Loader2, Plus, Trash2, FileText, Receipt, ExternalLink, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { brl } from '@/lib/pricing/engine'
import { getSupplierSheet, type SupplierOverview, type SheetItem } from '@/lib/pricing/actions'
import { emitirNfeTeste, emitirNfceTeste, cancelarTeste, type TestItem } from '@/lib/fiscal/teste-actions'

type Picked = TestItem & { id: string }
type Result = { ok?: boolean; error?: string; ref?: string; tipo?: 'nfe' | 'nfce'; status?: string; numero?: string; chave_nfe?: string; mensagem_sefaz?: string; caminho_danfe?: string; qrcode_url?: string }

const inputCls = 'w-full mt-1 px-3 py-2 bg-white border border-surface-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30'

export function TesteEmissaoClient({ suppliers }: { suppliers: SupplierOverview[] }) {
  const [supplierId, setSupplierId] = useState('')
  const [catalog, setCatalog] = useState<SheetItem[] | null>(null)
  const [picked, setPicked] = useState<Picked[]>([])
  const [destNome, setDestNome] = useState('Cliente de Teste Homologação')
  const [destDoc, setDestDoc] = useState('') // CPF ou CNPJ, opcional
  const [busy, setBusy] = useState<'nfe' | 'nfce' | 'cancel' | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [cancelJust, setCancelJust] = useState('')

  async function loadCatalog(id: string) {
    setSupplierId(id); setCatalog(null)
    if (!id) return
    const r = await getSupplierSheet(id)
    if (!('error' in r)) setCatalog(r.invoices.flatMap(inv => inv.items).slice(0, 60))
  }

  function addItem(i: SheetItem) {
    if (picked.some(p => p.id === i.id)) return
    setPicked(prev => [...prev, { id: i.id, descricao: i.descricao, ncm: i.ncm ?? '00000000', quantidade: 1, valorUnitario: i.preco_credito ?? (i.valor_total / i.quantidade) }])
  }
  const removeItem = (id: string) => setPicked(prev => prev.filter(p => p.id !== id))
  const setQty = (id: string, q: number) => setPicked(prev => prev.map(p => p.id === id ? { ...p, quantidade: q } : p))

  const total = useMemo(() => picked.reduce((s, p) => s + p.quantidade * p.valorUnitario, 0), [picked])
  const items: TestItem[] = picked.map(({ id, ...rest }) => rest)

  async function emitir(tipo: 'nfe' | 'nfce') {
    setBusy(tipo); setResult(null); setCancelJust('')
    const r = tipo === 'nfe'
      ? await emitirNfeTeste({ destinatarioNome: destNome, ...(destDoc.replace(/\D/g, '').length > 11 ? { destinatarioCnpj: destDoc } : destDoc ? { destinatarioCpf: destDoc } : {}), items })
      : await emitirNfceTeste({ destinatarioCpf: destDoc || undefined, items })
    setBusy(null)
    setResult({ tipo, ...r })
  }

  async function cancelar() {
    if (!result?.ref || !result.tipo) return
    setBusy('cancel')
    const r = await cancelarTeste(result.tipo, result.ref, cancelJust)
    setBusy(null)
    if ('error' in r) { setResult(prev => prev && ({ ...prev, error: r.error })); return }
    setResult(prev => prev && ({ ...prev, status: r.status as string }))
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/fiscal/configuracoes" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 mb-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Configurações Fiscais
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Teste de Emissão (Homologação)</h1>
        <p className="text-sm text-gray-500">Escolha até alguns produtos já cadastrados em Cotação e Preços e emita uma NF-e ou NFC-e de teste pela Focus. Nada aqui tem valor fiscal.</p>
      </div>

      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">1. Escolher produtos</h2>
        <select className={inputCls} value={supplierId} onChange={e => loadCatalog(e.target.value)}>
          <option value="">Escolha um fornecedor para listar os produtos…</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {catalog && (
          <div className="max-h-64 overflow-y-auto border border-surface-border rounded-lg divide-y divide-surface-border">
            {catalog.map(i => (
              <button key={i.id} type="button" onClick={() => addItem(i)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-secondary disabled:opacity-40"
                disabled={picked.some(p => p.id === i.id)}>
                <span className="truncate">{i.descricao} <span className="text-gray-400">· NCM {i.ncm}</span></span>
                <span className="shrink-0 text-emerald-700 font-medium">{brl(i.preco_credito)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {picked.length > 0 && (
        <div className="card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">2. Itens escolhidos</h2>
          {picked.map(p => (
            <div key={p.id} className="flex items-center gap-3 text-sm">
              <span className="flex-1 truncate">{p.descricao}</span>
              <input type="number" min={1} value={p.quantidade} onChange={e => setQty(p.id, Math.max(1, Number(e.target.value)))}
                className="w-16 px-2 py-1 border border-surface-border rounded text-right tabular-nums" />
              <span className="w-24 text-right tabular-nums">{brl(p.valorUnitario)}</span>
              <button onClick={() => removeItem(p.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <div className="flex justify-end text-sm font-semibold pt-2 border-t border-surface-border">Total: {brl(total)}</div>
        </div>
      )}

      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">3. Destinatário de teste</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block text-xs text-gray-500">Nome (só usado na NF-e)
            <input className={inputCls} value={destNome} onChange={e => setDestNome(e.target.value)} />
          </label>
          <label className="block text-xs text-gray-500">CPF ou CNPJ (opcional — em branco vira consumidor não identificado)
            <input className={inputCls} value={destDoc} onChange={e => setDestDoc(e.target.value)} placeholder="somente números" />
          </label>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={() => emitir('nfe')} disabled={!picked.length || !!busy}
          className="flex items-center gap-2 px-4 py-2.5 bg-navy text-white rounded-lg text-sm font-medium disabled:opacity-40">
          {busy === 'nfe' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Emitir NF-e de teste
        </button>
        <button onClick={() => emitir('nfce')} disabled={!picked.length || !!busy}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-surface-border text-gray-700 rounded-lg text-sm font-medium disabled:opacity-40">
          {busy === 'nfce' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />} Emitir NFC-e de teste
        </button>
      </div>

      {result && (
        <div className={cn('card p-5 space-y-3 border-l-4', result.error ? 'border-l-red-500' : 'border-l-emerald-500')}>
          <h2 className="text-sm font-semibold text-gray-700">Resultado ({result.tipo === 'nfe' ? 'NF-e' : 'NFC-e'})</h2>
          {result.error ? (
            <p className="text-sm text-red-600 whitespace-pre-line">{result.error}</p>
          ) : (
            <div className="text-sm space-y-1 text-gray-700">
              <p>Status: <strong>{result.status}</strong></p>
              {result.numero && <p>Número: {result.numero}</p>}
              {result.chave_nfe && <p className="font-mono text-xs">{result.chave_nfe}</p>}
              {result.mensagem_sefaz && <p className="text-gray-500">{result.mensagem_sefaz}</p>}
              {result.caminho_danfe && (
                <a href={`https://homologacao.focusnfe.com.br${result.caminho_danfe}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-brand-600 hover:underline">Ver DANFE <ExternalLink className="w-3.5 h-3.5" /></a>
              )}
            </div>
          )}
          {result.ref && result.status === 'autorizado' && (
            <div className="pt-3 border-t border-surface-border space-y-2">
              <label className="block text-xs text-gray-500">Justificativa do cancelamento (mín. 15 caracteres)
                <input className={inputCls} value={cancelJust} onChange={e => setCancelJust(e.target.value)} placeholder="Emissão de teste, sem valor fiscal" />
              </label>
              <button onClick={cancelar} disabled={busy === 'cancel' || cancelJust.trim().length < 15}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium disabled:opacity-40">
                {busy === 'cancel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Cancelar esta nota
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
