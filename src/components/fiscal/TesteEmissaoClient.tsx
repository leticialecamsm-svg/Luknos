'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Loader2, Plus, Trash2, FileText, Receipt, ExternalLink, XCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { brl } from '@/lib/pricing/engine'
import { getSupplierSheet, type SupplierOverview, type SheetItem } from '@/lib/pricing/actions'
import { emitirNfeTeste, emitirNfceTeste, consultarTeste, cancelarTeste, listarUltimosDocumentos, type TestItem, type TestEndereco, type FiscalDocRow } from '@/lib/fiscal/teste-actions'

const fmtDateTime = (s: string) => new Date(s).toLocaleString('pt-BR')
const STATUS_LABEL: Record<string, string> = {
  autorizado: 'Autorizado', cancelado: 'Cancelado', erro_autorizacao: 'Rejeitado', erro_cancelamento: 'Erro ao cancelar', processando_autorizacao: 'Processando',
}
const STATUS_COLOR: Record<string, string> = {
  autorizado: 'bg-emerald-50 text-emerald-700', cancelado: 'bg-gray-100 text-gray-600', erro_autorizacao: 'bg-red-50 text-red-700',
  erro_cancelamento: 'bg-red-50 text-red-700', processando_autorizacao: 'bg-amber-50 text-amber-700',
}

type Picked = TestItem & { id: string }
type Result = { ok?: boolean; error?: string; ref?: string; tipo?: 'nfe' | 'nfce'; status?: string; numero?: string; chave_nfe?: string; mensagem_sefaz?: string; caminho_danfe?: string; qrcode_url?: string }

const inputCls = 'w-full mt-1 px-3 py-2 bg-white border border-surface-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30'

export function TesteEmissaoClient({ suppliers }: { suppliers: SupplierOverview[] }) {
  const [supplierId, setSupplierId] = useState('')
  const [catalog, setCatalog] = useState<SheetItem[] | null>(null)
  const [picked, setPicked] = useState<Picked[]>([])
  const [destNome, setDestNome] = useState('Cliente de Teste Homologação')
  const [destDoc, setDestDoc] = useState('') // CPF ou CNPJ, opcional
  const [endereco, setEndereco] = useState<TestEndereco>({
    logradouro: 'Avenida Menino Marcelo', numero: '7737', bairro: 'Serraria', municipio: 'Maceió', uf: 'AL', cep: '57073470',
  })
  const [busy, setBusy] = useState<'nfe' | 'nfce' | 'cancel' | 'consultar' | null>(null)
  const [docs, setDocs] = useState<FiscalDocRow[] | null>(null)
  const [consultingRef, setConsultingRef] = useState<string | null>(null)

  async function loadDocs() {
    const r = await listarUltimosDocumentos()
    if (!('error' in r)) setDocs(r.docs)
  }
  useEffect(() => { loadDocs() }, [])

  async function consultarLinha(d: FiscalDocRow) {
    setConsultingRef(d.ref)
    await consultarTeste(d.tipo === 55 ? 'nfe' : 'nfce', d.ref)
    setConsultingRef(null)
    loadDocs()
  }
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
      ? await emitirNfeTeste({ destinatarioNome: destNome, ...(destDoc.replace(/\D/g, '').length > 11 ? { destinatarioCnpj: destDoc } : destDoc ? { destinatarioCpf: destDoc } : {}), endereco, items })
      : await emitirNfceTeste({ destinatarioCpf: destDoc || undefined, items })
    setBusy(null)
    setResult({ tipo, ...r })
    loadDocs()
  }

  async function cancelar() {
    if (!result?.ref || !result.tipo) return
    setBusy('cancel')
    const r = await cancelarTeste(result.tipo, result.ref, cancelJust)
    setBusy(null)
    if ('error' in r) { setResult(prev => prev && ({ ...prev, error: r.error })); return }
    setResult(prev => prev && ({ ...prev, status: r.status as string }))
    loadDocs()
  }

  async function consultar() {
    if (!result?.ref || !result.tipo) return
    setBusy('consultar')
    const r = await consultarTeste(result.tipo, result.ref)
    setBusy(null)
    if ('error' in r) { setResult(prev => prev && ({ ...prev, error: r.error })); return }
    setResult(prev => prev && ({ ...prev, error: undefined, ...r }))
    loadDocs()
  }

  // a NF-e é assíncrona: fica "processando_autorizacao" por alguns segundos.
  // Consulta sozinha a cada 4s, até 6 vezes, enquanto o status não fechar.
  const pending = result?.tipo === 'nfe' && !result.error && result.status === 'processando_autorizacao'
  const pollRef = useRef(0)
  useEffect(() => {
    if (!pending) { pollRef.current = 0; return }
    if (pollRef.current >= 6) return
    const t = setTimeout(() => { pollRef.current++; consultar() }, 4000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, result?.status])

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
        <p className="text-xs text-gray-500 pt-2">Endereço (obrigatório na NF-e; a NFC-e não usa isto). Vem pré-preenchido, pode editar.</p>
        <div className="grid sm:grid-cols-3 gap-4">
          <label className="block text-xs text-gray-500 sm:col-span-2">Logradouro
            <input className={inputCls} value={endereco.logradouro} onChange={e => setEndereco(v => ({ ...v, logradouro: e.target.value }))} />
          </label>
          <label className="block text-xs text-gray-500">Número
            <input className={inputCls} value={endereco.numero} onChange={e => setEndereco(v => ({ ...v, numero: e.target.value }))} />
          </label>
          <label className="block text-xs text-gray-500">Bairro
            <input className={inputCls} value={endereco.bairro} onChange={e => setEndereco(v => ({ ...v, bairro: e.target.value }))} />
          </label>
          <label className="block text-xs text-gray-500">Município
            <input className={inputCls} value={endereco.municipio} onChange={e => setEndereco(v => ({ ...v, municipio: e.target.value }))} />
          </label>
          <label className="block text-xs text-gray-500">UF
            <input className={inputCls} value={endereco.uf} onChange={e => setEndereco(v => ({ ...v, uf: e.target.value.toUpperCase().slice(0, 2) }))} />
          </label>
          <label className="block text-xs text-gray-500">CEP
            <input className={inputCls} value={endereco.cep} onChange={e => setEndereco(v => ({ ...v, cep: e.target.value }))} />
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
        <div className={cn('card p-5 space-y-3 border-l-4', result.error ? 'border-l-red-500' : pending ? 'border-l-amber-400' : 'border-l-emerald-500')}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Resultado ({result.tipo === 'nfe' ? 'NF-e' : 'NFC-e'})</h2>
            {result.ref && (
              <button onClick={consultar} disabled={busy === 'consultar'} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40">
                {busy === 'consultar' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Consultar de novo
              </button>
            )}
          </div>
          {result.error ? (
            <p className="text-sm text-red-600 whitespace-pre-line">{result.error}</p>
          ) : (
            <div className="text-sm space-y-1 text-gray-700">
              <p>Status: <strong>{result.status}</strong>{pending && <span className="text-amber-600 font-normal"> — aguardando a SEFAZ, consultando sozinho a cada poucos segundos…</span>}</p>
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

      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Últimas emissões</h2>
          <button onClick={loadDocs} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800">
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </button>
        </div>
        <p className="text-xs text-gray-400">Fica salvo mesmo se você atualizar a página — não é preciso reemitir para ver o status de novo.</p>
        {docs === null ? (
          <p className="text-sm text-gray-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma emissão ainda.</p>
        ) : (
          <div className="divide-y divide-surface-border">
            {docs.map(d => (
              <div key={d.id} className="flex items-center gap-3 py-2 text-sm">
                <span className={cn('shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full', STATUS_COLOR[d.status] ?? 'bg-gray-100 text-gray-600')}>
                  {STATUS_LABEL[d.status] ?? d.status}
                </span>
                <span className="w-14 shrink-0 text-gray-500">{d.tipo === 55 ? 'NF-e' : 'NFC-e'}</span>
                <span className="flex-1 truncate text-gray-600">{d.numero ? `nº ${d.numero}` : d.ref}</span>
                <span className="shrink-0 text-xs text-gray-400">{fmtDateTime(d.created_at)}</span>
                {d.status === 'processando_autorizacao' && (
                  <button onClick={() => consultarLinha(d)} disabled={consultingRef === d.ref}
                    className="shrink-0 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40">
                    {consultingRef === d.ref ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Consultar
                  </button>
                )}
                {d.pdf_url && (
                  <a href={`https://homologacao.focusnfe.com.br${d.pdf_url}`} target="_blank" rel="noopener noreferrer" className="shrink-0 text-brand-600 hover:underline">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
