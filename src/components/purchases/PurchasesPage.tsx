'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Plus, Search, Trash2, ChevronRight, AlertCircle, FileText, Loader2, Upload } from 'lucide-react'
import { upsertPurchaseInvoice, savePurchaseInvoiceItems, deletePurchaseInvoice } from '@/lib/actions'

// ── Constantes de cálculo ──────────────────────────────────────────────────────

const IMPOSTO_ANT: Record<string, number> = {
  ST: 0.0345,
  ANT: 0.0524,
}

function calcCusto(params: {
  valorTotal: number
  quantidade: number
  ipi: number
  valorIcms: number
  valorFecoep: number
}): number {
  const { valorTotal, quantidade, ipi, valorIcms, valorFecoep } = params
  if (quantidade <= 0) return 0
  const totalComIpi = valorTotal * (1 + ipi)
  const custoUnit = totalComIpi / quantidade + valorIcms / quantidade + valorFecoep / quantidade
  return custoUnit
}

function calcPrecoCredito(custo: number, tipoIcms: string, comissao: number, lucro: number, maquininha: number): number {
  if (custo <= 0) return 0
  const impostoAnt = IMPOSTO_ANT[tipoIcms?.toUpperCase()] ?? IMPOSTO_ANT.ST
  const divisor = 1 - comissao - lucro - maquininha - impostoAnt
  if (divisor <= 0) return 0
  return custo / divisor
}

// ── Parser XML NF-e ───────────────────────────────────────────────────────────

interface NFeItem {
  nItem: number
  cProd: string       // código do produto no fornecedor
  xProd: string       // descrição
  ncm: string
  quantidade: number
  valorTotal: number
  ipiPercent: number
}

function parseNFeXML(xmlText: string): { items: NFeItem[]; numeroNota: string; dataEmissao: string; fornecedorCnpj: string; fornecedorNome: string } | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlText, 'application/xml')
    if (doc.querySelector('parsererror')) return null

    const get = (el: Element | Document, tag: string) => el.querySelector(tag)?.textContent?.trim() ?? ''

    const numeroNota = get(doc, 'ide nNF')
    const dataEmissao = get(doc, 'ide dhEmi') || get(doc, 'ide dEmi')
    const fornecedorCnpj = get(doc, 'emit CNPJ')
    const fornecedorNome = get(doc, 'emit xFant') || get(doc, 'emit xNome')

    const detElements = doc.querySelectorAll('det')
    const items: NFeItem[] = Array.from(detElements).map(det => {
      const prod = det.querySelector('prod')!
      const ipi = det.querySelector('IPI IPITrib')
      const nItem = parseInt(det.getAttribute('nItem') ?? '0')
      const cProd = get(prod, 'cProd')
      const xProd = get(prod, 'xProd')
      const ncm = get(prod, 'NCM')
      const quantidade = parseFloat(get(prod, 'qCom')) || 0
      const valorTotal = parseFloat(get(prod, 'vProd')) || 0

      // IPI: pIPI é a alíquota (%), ou calcular por vIPI/vProd
      let ipiPercent = 0
      if (ipi) {
        const pIPI = get(ipi, 'pIPI')
        if (pIPI) ipiPercent = parseFloat(pIPI)
        else {
          const vIPI = parseFloat(get(ipi, 'vIPI')) || 0
          if (valorTotal > 0) ipiPercent = (vIPI / valorTotal) * 100
        }
      }

      return { nItem, cProd, xProd, ncm, quantidade, valorTotal, ipiPercent }
    })

    return { items, numeroNota, dataEmissao: dataEmissao.slice(0, 10), fornecedorCnpj, fornecedorNome }
  } catch {
    return null
  }
}

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface InvoiceRow {
  id: string
  chave_nfe: string
  numero_nota: string | null
  fornecedor_nome: string | null
  fornecedor_cnpj: string | null
  data_emissao: string | null
  comissao: number
  lucro: number
  maquininha: number
  created_at: string
  purchase_invoice_items: { count: number }[]
}

interface ItemDraft {
  numeroItem: number
  descricao: string
  ncm: string
  codigoProduto: string
  quantidade: string
  valorTotal: string
  ipiPercent: string
  tipoIcms: string
  valorIcms: number
  valorFecoep: number
  aliquotaIcms: number
  aliquotaFecoep: number
  mvaValor: number | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseBR(s: string): number {
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
}

function fmtPct(v: number) {
  return (v * 100).toFixed(2).replace('.', ',') + '%'
}

const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
function fmtDate(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d + 'T12:00:00')
  return `${dt.getDate()} ${MONTH_NAMES[dt.getMonth()]} ${dt.getFullYear()}`
}

// ── Modal Nova Nota ────────────────────────────────────────────────────────────

function NewInvoiceModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [step, setStep] = useState<'key' | 'fill'>('key')
  const [chave, setChave] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ numeroNota: string; dataEmissao: string; fornecedorCnpj: string } | null>(null)
  const [fornecedorNome, setFornecedorNome] = useState('')
  const [items, setItems] = useState<ItemDraft[]>([])
  const [nfeItemsFromXML, setNfeItemsFromXML] = useState<Map<number, NFeItem> | null>(null)

  // Parâmetros de precificação
  const [comissao, setComissao] = useState('12,50')
  const [lucro, setLucro] = useState('33,00')
  const [maquininha, setMaquininha] = useState('6,90')

  const [saving, setSaving] = useState(false)

  async function handleFetch() {
    const clean = chave.replace(/\D/g, '')
    if (clean.length !== 44) { setError('A chave deve ter exatamente 44 dígitos numéricos.'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/purchases/fetch-sefaz?chave=${clean}`)
      const data = await res.json()
      if (!res.ok || data.error) { setError(data.error ?? 'Erro ao consultar SEFAZ'); return }

      setMeta(data.meta)
      setMeta(data.meta ?? null)
      setFornecedorNome('')
      setItems(data.items.map((it: any) => ({
        numeroItem: it.numeroItem,
        descricao: it.descricaoProduto,
        ncm: it.codigoNcm ? String(it.codigoNcm) : '',
        codigoProduto: '',
        quantidade: '',
        valorTotal: '',
        ipiPercent: '',
        tipoIcms: it.tipoImposto,
        valorIcms: it.valorIcms,
        valorFecoep: it.valorFecoep,
        aliquotaIcms: it.aliquotaIcms,
        aliquotaFecoep: it.aliquotaFecoep,
        mvaValor: it.mvaValor,
      })))
      // Merge XML data if available
      const xmlMap = nfeItemsFromXML
      if (xmlMap) {
        setItems(prev => prev.map(it => {
          const x = xmlMap.get(it.numeroItem)
          if (!x) return it
          return {
            ...it,
            codigoProduto: x.cProd,
            quantidade: x.quantidade > 0 ? x.quantidade.toFixed(4).replace('.', ',').replace(/,?0+$/, '') || String(x.quantidade) : it.quantidade,
            valorTotal: x.valorTotal > 0 ? x.valorTotal.toFixed(2).replace('.', ',') : it.valorTotal,
            ipiPercent: x.ipiPercent > 0 ? x.ipiPercent.toFixed(2).replace('.', ',') : it.ipiPercent,
          }
        }))
      }

      setStep('fill')
    } catch (e: any) {
      setError(e.message ?? 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }

  function handleXMLUpload(file: File) {
    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const parsed = parseNFeXML(text)
      if (!parsed) { setError('Não foi possível ler o XML. Verifique se é um arquivo NF-e válido.'); return }
      const chaveFromXML = text.match(/\d{44}/)?.[0] ?? ''
      if (chaveFromXML) setChave(chaveFromXML)
      if (parsed.fornecedorNome) setFornecedorNome(parsed.fornecedorNome)
      const map = new Map<number, NFeItem>()
      parsed.items.forEach(it => map.set(it.nItem, it))
      setNfeItemsFromXML(map)
    }
    reader.readAsText(file, 'UTF-8')
  }

  function updateItem(i: number, field: keyof ItemDraft, value: string) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const clean = chave.replace(/\D/g, '')
      const c = parseBR(comissao) / 100
      const l = parseBR(lucro) / 100
      const m = parseBR(maquininha) / 100

      const invResult = await upsertPurchaseInvoice({
        chave_nfe: clean,
        numero_nota: meta?.numeroNota,
        fornecedor_nome: fornecedorNome || undefined,
        fornecedor_cnpj: meta?.fornecedorCnpj,
        data_emissao: meta?.dataEmissao,
        comissao: c,
        lucro: l,
        maquininha: m,
      })
      if (!invResult || 'error' in invResult) { setError((invResult as any)?.error ?? 'Erro ao salvar nota'); return }

      const invoiceId = invResult.data?.id
      if (!invoiceId) { setError('ID da nota não retornado'); return }

      const itemsPayload = items.map(it => {
        const qtd = parseBR(it.quantidade)
        const total = parseBR(it.valorTotal)
        const ipi = parseBR(it.ipiPercent) / 100
        const custo = calcCusto({ valorTotal: total, quantidade: qtd, ipi, valorIcms: it.valorIcms, valorFecoep: it.valorFecoep })
        const preco = calcPrecoCredito(custo, it.tipoIcms, c, l, m)
        const impostoAnt = IMPOSTO_ANT[it.tipoIcms?.toUpperCase()] ?? IMPOSTO_ANT.ST
        return {
          numero_item: it.numeroItem,
          descricao: it.descricao,
          ncm: it.ncm || undefined,
          codigo_produto: it.codigoProduto || undefined,
          quantidade: qtd,
          valor_total: total,
          ipi_percent: ipi,
          tipo_icms: it.tipoIcms,
          valor_icms: it.valorIcms,
          valor_fecoep: it.valorFecoep,
          aliquota_icms: it.aliquotaIcms,
          aliquota_fecoep: it.aliquotaFecoep,
          mva_valor: it.mvaValor ?? undefined,
          custo_unitario: custo,
          preco_credito: preco,
          imposto_ant_percent: impostoAnt,
        }
      })

      const itemsResult = await savePurchaseInvoiceItems(invoiceId, itemsPayload)
      if (itemsResult && 'error' in itemsResult) { setError(itemsResult.error ?? 'Erro ao salvar itens'); return }

      onSaved()
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'Erro inesperado')
    } finally {
      setSaving(false)
    }
  }

  const c = parseBR(comissao) / 100
  const l = parseBR(lucro) / 100
  const m = parseBR(maquininha) / 100

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            {step === 'fill' && (
              <button onClick={() => setStep('key')} className="text-gray-400 hover:text-gray-600">
                <ChevronRight className="w-5 h-5 rotate-180" />
              </button>
            )}
            <h2 className="text-lg font-bold text-gray-900">Nova Nota de Entrada</h2>
            {step === 'fill' && meta && (
              <span className="text-sm text-gray-500">Nota {meta.numeroNota} · {fmtDate(meta.dataEmissao)}</span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: inserir chave */}
          {step === 'key' && (
            <div className="max-w-xl mx-auto space-y-4 py-8">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Chave NF-e (44 dígitos)</label>
                <input
                  className="input w-full font-mono text-sm"
                  placeholder="00000000000000000000000000000000000000000000"
                  value={chave}
                  onChange={e => setChave(e.target.value)}
                  maxLength={50}
                  onKeyDown={e => e.key === 'Enter' && handleFetch()}
                />
                <p className="text-xs text-gray-400 mt-1">Cole a chave que aparece no DANFE ou na nota fiscal.</p>
              </div>
              {error && (
                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
                <div className="relative flex justify-center">
                  <span className="bg-white px-3 text-xs text-gray-400">ou</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Upload do XML da NF-e</label>
                <label className={`flex items-center gap-3 border-2 border-dashed rounded-xl px-4 py-3 cursor-pointer transition-colors ${nfeItemsFromXML ? 'border-emerald-400 bg-emerald-50' : 'border-gray-300 hover:border-gray-400'}`}>
                  <Upload className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-600">
                    {nfeItemsFromXML
                      ? <span className="text-emerald-700 font-semibold">XML carregado — {nfeItemsFromXML.size} itens encontrados</span>
                      : 'Clique para selecionar o arquivo .xml da nota'
                    }
                  </span>
                  <input type="file" accept=".xml" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleXMLUpload(f) }} />
                </label>
                <p className="text-xs text-gray-400 mt-1">Preenche automaticamente qtd, valor, IPI% e código do produto.</p>
              </div>
              <button
                onClick={handleFetch}
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {loading ? 'Consultando SEFAZ AL...' : 'Buscar impostos na SEFAZ'}
              </button>
            </div>
          )}

          {/* Step 2: preencher dados da NF-e e ver cálculos */}
          {step === 'fill' && (
            <div className="space-y-5">
              {/* Config fornecedor + parâmetros */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome do Fornecedor</label>
                  <input
                    className="input w-full text-sm"
                    placeholder="Ex: Luminatti"
                    value={fornecedorNome}
                    onChange={e => setFornecedorNome(e.target.value)}
                  />
                </div>
                <div className="flex gap-3">
                  {[
                    { label: 'Comissão %', val: comissao, set: setComissao },
                    { label: 'Lucro %', val: lucro, set: setLucro },
                    { label: 'Maquininha %', val: maquininha, set: setMaquininha },
                  ].map(({ label, val, set }) => (
                    <div key={label} className="flex-1">
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
                      <div className="relative">
                        <input
                          className="input w-full text-sm pr-6"
                          value={val}
                          onChange={e => set(e.target.value)}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tabela de produtos */}
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-3 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide w-8">#</th>
                      <th className="text-left px-3 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide min-w-[200px]">Produto</th>
                      <th className="text-left px-3 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide w-24">NCM</th>
                      <th className="text-left px-3 py-2.5 text-xs font-bold text-blue-600 uppercase tracking-wide w-24">Cód. Prod.</th>
                      {/* NF-e — entrada manual ou XML */}
                      <th className="text-right px-3 py-2.5 text-xs font-bold text-blue-600 uppercase tracking-wide w-20">Qtd</th>
                      <th className="text-right px-3 py-2.5 text-xs font-bold text-blue-600 uppercase tracking-wide w-28">Valor Total</th>
                      <th className="text-right px-3 py-2.5 text-xs font-bold text-blue-600 uppercase tracking-wide w-20">IPI %</th>
                      {/* SEFAZ — automático */}
                      <th className="text-center px-3 py-2.5 text-xs font-bold text-emerald-600 uppercase tracking-wide w-16">Tipo</th>
                      <th className="text-right px-3 py-2.5 text-xs font-bold text-emerald-600 uppercase tracking-wide w-28">ICMS</th>
                      <th className="text-right px-3 py-2.5 text-xs font-bold text-emerald-600 uppercase tracking-wide w-24">FECOEP</th>
                      {/* Calculado */}
                      <th className="text-right px-3 py-2.5 text-xs font-bold text-violet-600 uppercase tracking-wide w-28">Custo Unit.</th>
                      <th className="text-right px-3 py-2.5 text-xs font-bold text-violet-600 uppercase tracking-wide w-28">Preço Crédito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Legenda das cores */}
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <td colSpan={4} />
                      <td colSpan={3} className="px-3 py-1 text-[10px] text-blue-500 text-center font-medium">← da nota fiscal</td>
                      <td colSpan={3} className="px-3 py-1 text-[10px] text-emerald-500 text-center font-medium">← SEFAZ (automático)</td>
                      <td colSpan={2} className="px-3 py-1 text-[10px] text-violet-500 text-center font-medium">← calculado</td>
                    </tr>

                    {items.map((it, i) => {
                      const qtd = parseBR(it.quantidade)
                      const total = parseBR(it.valorTotal)
                      const ipi = parseBR(it.ipiPercent) / 100
                      const custo = (qtd > 0 && total > 0)
                        ? calcCusto({ valorTotal: total, quantidade: qtd, ipi, valorIcms: it.valorIcms, valorFecoep: it.valorFecoep })
                        : 0
                      const preco = custo > 0 ? calcPrecoCredito(custo, it.tipoIcms, c, l, m) : 0

                      return (
                        <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                          <td className="px-3 py-2.5 text-gray-400 text-xs">{it.numeroItem}</td>
                          <td className="px-3 py-2.5 text-gray-800 font-medium">{it.descricao}</td>
                          <td className="px-3 py-2.5 text-gray-500 font-mono text-xs">{it.ncm}</td>
                          <td className="px-2 py-1.5">
                            <input
                              className="w-full border border-blue-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400 bg-blue-50 font-mono"
                              placeholder="—"
                              value={it.codigoProduto}
                              onChange={e => updateItem(i, 'codigoProduto', e.target.value)}
                            />
                          </td>

                          {/* Campos manuais / XML */}
                          <td className="px-2 py-1.5">
                            <input
                              className="w-full text-right border border-blue-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400 bg-blue-50"
                              placeholder="0"
                              value={it.quantidade}
                              onChange={e => updateItem(i, 'quantidade', e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className="w-full text-right border border-blue-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400 bg-blue-50"
                              placeholder="0,00"
                              value={it.valorTotal}
                              onChange={e => updateItem(i, 'valorTotal', e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="relative">
                              <input
                                className="w-full text-right border border-blue-200 rounded px-2 py-1 pr-5 text-sm focus:outline-none focus:border-blue-400 bg-blue-50"
                                placeholder="0"
                                value={it.ipiPercent}
                                onChange={e => updateItem(i, 'ipiPercent', e.target.value)}
                              />
                              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-blue-400">%</span>
                            </div>
                          </td>

                          {/* SEFAZ */}
                          <td className="px-3 py-2.5 text-center">
                            <span className={cn(
                              'text-xs font-bold px-2 py-0.5 rounded-full',
                              it.tipoIcms === 'ST' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'
                            )}>
                              {it.tipoIcms}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right text-emerald-700 font-semibold tabular-nums">
                            {formatCurrency(it.valorIcms)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-emerald-600 tabular-nums">
                            {formatCurrency(it.valorFecoep)}
                          </td>

                          {/* Calculados */}
                          <td className={cn('px-3 py-2.5 text-right tabular-nums font-semibold', custo > 0 ? 'text-violet-700' : 'text-gray-300')}>
                            {custo > 0 ? formatCurrency(custo) : '—'}
                          </td>
                          <td className={cn('px-3 py-2.5 text-right tabular-nums font-bold', preco > 0 ? 'text-emerald-700' : 'text-gray-300')}>
                            {preco > 0 ? formatCurrency(preco) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'fill' && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
            <button onClick={onClose} className="btn-secondary px-6">Cancelar</button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary flex items-center gap-2 px-8"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? 'Salvando...' : 'Salvar Nota'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Detalhe de nota ────────────────────────────────────────────────────────────

function InvoiceDetailModal({ invoice, onClose }: { invoice: any; onClose: () => void }) {
  const items: any[] = invoice.purchase_invoice_items ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Nota {invoice.numero_nota ?? '—'} · {invoice.fornecedor_nome ?? 'Fornecedor'}
            </h2>
            <p className="text-sm text-gray-500">{fmtDate(invoice.data_emissao)} · {items.length} produtos</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2.5 text-xs font-bold text-gray-500 uppercase">#</th>
                  <th className="text-left px-3 py-2.5 text-xs font-bold text-gray-500 uppercase">Produto</th>
                  <th className="text-left px-3 py-2.5 text-xs font-bold text-gray-500 uppercase">NCM</th>
                  <th className="text-right px-3 py-2.5 text-xs font-bold text-gray-500 uppercase">Qtd</th>
                  <th className="text-right px-3 py-2.5 text-xs font-bold text-gray-500 uppercase">Valor Total</th>
                  <th className="text-right px-3 py-2.5 text-xs font-bold text-gray-500 uppercase">IPI</th>
                  <th className="text-center px-3 py-2.5 text-xs font-bold text-gray-500 uppercase">Tipo</th>
                  <th className="text-right px-3 py-2.5 text-xs font-bold text-gray-500 uppercase">ICMS</th>
                  <th className="text-right px-3 py-2.5 text-xs font-bold text-gray-500 uppercase">FECOEP</th>
                  <th className="text-right px-3 py-2.5 text-xs font-bold text-violet-600 uppercase">Custo Unit.</th>
                  <th className="text-right px-3 py-2.5 text-xs font-bold text-emerald-600 uppercase">Preço Crédito</th>
                </tr>
              </thead>
              <tbody>
                {items.sort((a, b) => a.numero_item - b.numero_item).map((it: any) => (
                  <tr key={it.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-2.5 text-gray-400 text-xs">{it.numero_item}</td>
                    <td className="px-3 py-2.5 text-gray-800 font-medium">{it.descricao}</td>
                    <td className="px-3 py-2.5 text-gray-500 font-mono text-xs">{it.ncm}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{Number(it.quantidade).toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(it.valor_total)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtPct(it.ipi_percent)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn(
                        'text-xs font-bold px-2 py-0.5 rounded-full',
                        it.tipo_icms === 'ST' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'
                      )}>
                        {it.tipo_icms}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 font-semibold">{formatCurrency(it.valor_icms)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600">{formatCurrency(it.valor_fecoep)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-violet-700">{it.custo_unitario ? formatCurrency(it.custo_unitario) : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-emerald-700">{it.preco_credito ? formatCurrency(it.preco_credito) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="btn-secondary px-6">Fechar</button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────

export function PurchasesPage({ invoices: initial }: { invoices: InvoiceRow[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [showNew, setShowNew] = useState(false)
  const [detail, setDetail] = useState<any | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const invoices = initial

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Excluir esta nota? Os dados de precificação serão perdidos.')) return
    setDeleting(id)
    await deletePurchaseInvoice(id)
    startTransition(() => router.refresh())
    setDeleting(null)
  }

  async function handleRowClick(inv: InvoiceRow) {
    // Busca detalhe com itens
    const res = await fetch(`/api/purchases/invoice/${inv.id}`).catch(() => null)
    if (res?.ok) {
      const data = await res.json()
      setDetail(data)
    } else {
      setDetail({ ...inv, purchase_invoice_items: [] })
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notas de Entrada</h1>
          <p className="text-sm text-gray-500 mt-1">Importação e precificação de produtos por NF-e</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Nova Nota
        </button>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FileText className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-gray-500 font-medium">Nenhuma nota registrada ainda</p>
            <p className="text-sm text-gray-400 mt-1">Clique em "Nova Nota" para buscar os impostos na SEFAZ AL</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_160px_130px_80px_80px_44px] bg-gray-50 border-b border-gray-100">
              {['Fornecedor / Nota', 'Chave NF-e', 'Data', 'Produtos', 'Registrado em', ''].map((h, i) => (
                <div key={i} className={cn('px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide', i >= 3 && 'text-right')}>{h}</div>
              ))}
            </div>
            {invoices.map(inv => {
              const count = Array.isArray(inv.purchase_invoice_items)
                ? inv.purchase_invoice_items[0]?.count ?? 0
                : 0
              return (
                <div
                  key={inv.id}
                  className="grid grid-cols-[1fr_160px_130px_80px_80px_44px] items-center border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => handleRowClick(inv)}
                >
                  <div className="px-4 py-3.5">
                    <p className="text-sm font-semibold text-gray-900">{inv.fornecedor_nome ?? 'Fornecedor'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Nota {inv.numero_nota ?? '—'}</p>
                  </div>
                  <div className="px-4 py-3.5 font-mono text-xs text-gray-400 truncate">{inv.chave_nfe.slice(0, 20)}…</div>
                  <div className="px-4 py-3.5 text-sm text-gray-600">{fmtDate(inv.data_emissao)}</div>
                  <div className="px-4 py-3.5 text-sm text-right tabular-nums text-gray-700">{count}</div>
                  <div className="px-4 py-3.5 text-xs text-right text-gray-400">{fmtDate(inv.created_at)}</div>
                  <div className="px-2 py-3.5 flex justify-center">
                    <button
                      onClick={e => handleDelete(inv.id, e)}
                      disabled={deleting === inv.id}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                    >
                      {deleting === inv.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />
                      }
                    </button>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {showNew && (
        <NewInvoiceModal
          onClose={() => setShowNew(false)}
          onSaved={() => { startTransition(() => router.refresh()) }}
        />
      )}

      {detail && (
        <InvoiceDetailModal
          invoice={detail}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}
