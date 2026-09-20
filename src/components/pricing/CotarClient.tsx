'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Save, Plus, Trash2, RotateCcw, Tag, Info } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { matchType, normText } from '@/lib/pricing/synonyms'
import { computeQuote, effectiveValue, brl, pct, type Metric } from '@/lib/pricing/engine'
import {
  getTaxProfiles, getReferenceItems, getSupplierQuotes, getSupplierTypes, getNcmSuppliers, saveQuote, deleteQuote, createPricingSupplier,
  type PricingSupplier, type PricingProductType, type TaxProfile, type SavedQuote, type ReferenceItem, type SupplierType,
} from '@/lib/pricing/actions'

const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const parseNum = (s: string) => {
  // com vírgula: pontos são milhar ("1.234,50"); sem vírgula: ponto é decimal ("2.5")
  const clean = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n = Number(clean)
  return Number.isFinite(n) ? n : 0
}
const fmtPct = (f: number) => String(Math.round(f * 100000) / 1000).replace('.', ',')
const inputCls = 'w-full px-3 py-2 bg-white border border-surface-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500'

type Props = {
  suppliers: PricingSupplier[]
  metrics: Metric[]
  productTypes: PricingProductType[]
}

export function CotarClient({ suppliers: initialSuppliers, metrics: defaultMetrics, productTypes }: Props) {
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [suppliers, setSuppliers] = useState(initialSuppliers)
  const [quotes, setQuotes] = useState<SavedQuote[]>([])

  const [supplierId, setSupplierId] = useState('')
  const [newName, setNewName] = useState('')
  const [mirrorId, setMirrorId] = useState('')
  const isNew = supplierId === 'new'

  const [typeQuery, setTypeQuery] = useState('')
  const [typeName, setTypeName] = useState('')
  const [ncm, setNcm] = useState('')
  const [showSuggest, setShowSuggest] = useState(false)

  const [productRef, setProductRef] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [qty, setQty] = useState('1')
  const [tipo, setTipo] = useState<'ST' | 'ANT'>('ST')
  const [uf, setUf] = useState('')
  const [ipi, setIpi] = useState('')
  const [icms, setIcms] = useState('')
  const [fecoep, setFecoep] = useState('')
  const [notes, setNotes] = useState('')

  const [metrics, setMetrics] = useState<Metric[]>(defaultMetrics)
  const [extra, setExtra] = useState({ label: '', kind: 'price_percent' as Metric['kind'], value: '' })

  const [profiles, setProfiles] = useState<TaxProfile[]>([])
  const [profileSource, setProfileSource] = useState<'own' | 'mirror' | 'any' | null>(null)
  const [activeProfile, setActiveProfile] = useState<TaxProfile | null>(null)
  const [refs, setRefs] = useState<ReferenceItem[]>([])
  const [supplierTypes, setSupplierTypes] = useState<SupplierType[] | null>(null)
  const [ncmSuppliers, setNcmSuppliers] = useState<{ id: string; name: string; n: number; last: string | null }[]>([])
  const [activeRef, setActiveRef] = useState<string | null>(null)

  const supplier = suppliers.find(s => s.id === supplierId)
  const validNcm = /^\d{8}$/.test(ncm)

  // ── sugestões de tipo / NCM ────────────────────────────────────────────────
  // Só os tipos/NCMs que o fornecedor escolhido já vendeu; "outros" vêm dos demais (exigem espelho).
  type Sug = { key: string; ncm: string; name: string; count: number; via: boolean; other: boolean }
  const { own, others } = useMemo(() => {
    const q = typeQuery.trim()
    const digits = q.replace(/\D/g, '')
    const test = (name: string, n: string) => {
      if (digits.length >= 3 && n.startsWith(digits)) return { match: true, viaSynonym: false }
      return matchType(name, q)
    }
    const fromSupplier = supplierTypes
    const ownList: Sug[] = []
    const otherList: Sug[] = []
    if (fromSupplier) {
      const ownNcms = new Set(fromSupplier.map(t => t.ncm))
      for (const t of fromSupplier) {
        const m = test(t.name, t.ncm)
        if (m.match) ownList.push({ key: `o${t.ncm}${t.name}`, ncm: t.ncm, name: t.name, count: t.count, via: m.viaSynonym, other: false })
      }
      if (q) for (const t of productTypes) {
        if (ownNcms.has(t.ncm)) continue // NCM que o fornecedor já compra, mesmo com outro nome, usa o histórico dele
        const m = test(t.name, t.ncm)
        if (m.match) otherList.push({ key: `x${t.id}`, ncm: t.ncm, name: t.name, count: t.sample_count, via: m.viaSynonym, other: true })
      }
    } else {
      for (const t of productTypes) {
        const m = q ? test(t.name, t.ncm) : { match: true, viaSynonym: false }
        if (m.match) ownList.push({ key: `g${t.id}`, ncm: t.ncm, name: t.name, count: t.sample_count, via: m.viaSynonym, other: false })
      }
    }
    return { own: ownList.slice(0, 8), others: otherList.slice(0, 6) }
  }, [typeQuery, productTypes, supplierTypes])

  const typesForNcm = useMemo(() => productTypes.filter(t => t.ncm === ncm), [productTypes, ncm])

  const pickType = (t: { name: string; ncm: string }) => { setTypeName(t.name); setNcm(t.ncm); setTypeQuery(t.name); setShowSuggest(false); setMirrorId('') }
  const onTypeInput = (v: string) => {
    setTypeQuery(v); setShowSuggest(true)
    const digits = v.replace(/\D/g, '')
    if (/^\d{8}$/.test(digits)) { setNcm(digits); setTypeName('') }
  }

  // ── perfil de imposto do fornecedor para o NCM ─────────────────────────────
  const applyProfile = (p: TaxProfile) => {
    setActiveProfile(p)
    setActiveRef(null)
    if (p.tipo === 'ST' || p.tipo === 'ANT') setTipo(p.tipo)
    if (p.uf) setUf(p.uf)
    setIpi(p.ipi_pct != null ? fmtPct(p.ipi_pct) : '0')
    setIcms(p.icms_pct != null ? fmtPct(p.icms_pct) : '0')
    setFecoep(p.fecoep_pct != null ? fmtPct(p.fecoep_pct) : '0')
  }

  useEffect(() => {
    if (!validNcm) { setProfiles([]); setRefs([]); setProfileSource(null); setActiveProfile(null); return }
    let cancelled = false
    // Preenche sozinho com a compra mais recente; as outras referências ficam só para trocar.
    Promise.all([
      getReferenceItems(isNew ? null : supplierId || null, mirrorId || null, ncm),
      getTaxProfiles(isNew ? null : supplierId || null, mirrorId || null, ncm),
    ]).then(([refRes, profRes]) => {
      if (cancelled) return
      const items = 'error' in refRes ? [] : refRes.items
      setRefs(items)
      if (!('error' in profRes)) {
        const list = [...profRes.profiles].sort((a, b) => (b.last_date ?? '').localeCompare(a.last_date ?? '') || b.n - a.n)
        setProfiles(list); setProfileSource(profRes.source)
        if (!items.length) {
          const best = list.find(p => p.tipo === tipo && (!uf || p.uf === uf)) ?? list[0]
          if (best) applyProfile(best); else setActiveProfile(null)
        }
      }
      if (items.length) applyRef(items[0])
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ncm, supplierId, mirrorId, isNew])

  useEffect(() => {
    if (!supplierId || isNew) { setQuotes([]); return }
    let cancelled = false
    getSupplierQuotes(supplierId, 5).then(res => { if (!cancelled && !('error' in res)) setQuotes(res.quotes) })
    return () => { cancelled = true }
  }, [supplierId, isNew])

  // ao trocar ST/ANT ou UF à mão, tenta casar com um perfil existente
  useEffect(() => {
    if (activeRef) return
    const match = profiles.find(p => p.tipo === tipo && (!uf || p.uf === uf))
    if (match && match !== activeProfile) applyProfile(match)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, uf])

  useEffect(() => {
    if (!supplierId || isNew) { setSupplierTypes(null); return }
    let cancelled = false
    setSupplierTypes(null)
    getSupplierTypes(supplierId).then(res => { if (!cancelled && !('error' in res)) setSupplierTypes(res.types) })
    return () => { cancelled = true }
  }, [supplierId, isNew])

  useEffect(() => {
    if (!validNcm) { setNcmSuppliers([]); return }
    let cancelled = false
    getNcmSuppliers(ncm).then(res => { if (!cancelled && !('error' in res)) setNcmSuppliers(res.suppliers) })
    return () => { cancelled = true }
  }, [ncm, validNcm])

  useEffect(() => {
    if (supplier?.default_uf && !uf) setUf(supplier.default_uf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId])

  const applyRef = (r: ReferenceItem) => {
    setActiveRef(r.id)
    if (r.tipo === 'ST' || r.tipo === 'ANT') setTipo(r.tipo)
    if (r.uf) setUf(r.uf)
    setIpi(fmtPct(r.ipi_pct)); setIcms(fmtPct(r.icms_pct)); setFecoep(fmtPct(r.fecoep_pct))
  }

  // ── cálculo ────────────────────────────────────────────────────────────────
  const activeMetrics = useMemo(() => [...metrics], [metrics])
  const result = useMemo(() => {
    const price = parseNum(unitPrice)
    if (price <= 0) return null
    return computeQuote({
      unitPrice: price, quantity: parseNum(qty) || 1, ipiPct: parseNum(ipi) / 100, icmsPct: parseNum(icms) / 100,
      fecoepPct: parseNum(fecoep) / 100, tipoIcms: tipo, metrics: activeMetrics,
    })
  }, [unitPrice, qty, ipi, icms, fecoep, tipo, activeMetrics])

  const setMetricValue = (key: string, input: string, kind: Metric['kind']) => {
    const v = parseNum(input) / (kind === 'unit_amount' ? 1 : 100)
    setMetrics(prev => prev.map(m => m.key === key ? { ...m, value: v, value_by_tipo: null } : m))
  }
  const resetMetric = (key: string) => setMetrics(prev => prev.map(m => m.key === key ? defaultMetrics.find(d => d.key === key)! : m))
  const addExtra = () => {
    const v = parseNum(extra.value)
    if (!extra.label.trim() || !v) return toast.error('Informe o nome e o valor da métrica')
    const value = extra.kind === 'unit_amount' ? v : v / 100
    setMetrics(prev => [...prev, { key: `extra_${Date.now()}`, label: extra.label.trim(), kind: extra.kind, value }])
    setExtra({ label: '', kind: 'price_percent', value: '' })
  }
  const removeExtra = (key: string) => setMetrics(prev => prev.filter(m => m.key !== key))

  // ── salvar / reabrir ───────────────────────────────────────────────────────
  const canSave = !!result && result.priceCredit != null && validNcm && (supplierId !== '' && (!isNew || newName.trim() !== ''))

  const save = () => {
    if (!result || result.priceCredit == null) return
    startTransition(async () => {
      let sid: string | null = supplierId && !isNew ? supplierId : null
      let label = supplier?.name ?? ''
      if (isNew) {
        const created = await createPricingSupplier(newName, uf)
        if ('error' in created) return toast.error('Não foi possível criar o fornecedor', created.error)
        setSuppliers(prev => [...prev, created.supplier].sort((a, b) => a.name.localeCompare(b.name)))
        sid = created.supplier.id; label = created.supplier.name
        setSupplierId(sid)
      }
      const res = await saveQuote({
        supplier_id: sid, mirror_supplier_id: mirrorId || null, supplier_label: label,
        product_ref: productRef || undefined, product_type: typeName || undefined, ncm, tipo_icms: tipo, uf_origem: uf || undefined,
        quantity: parseNum(qty) || 1, unit_price: parseNum(unitPrice), ipi_pct: parseNum(ipi) / 100,
        icms_pct: parseNum(icms) / 100, fecoep_pct: parseNum(fecoep) / 100,
        metrics: metrics.map(m => ({ ...m, value: effectiveValue(m, tipo), value_by_tipo: null })),
        cost_unit: result.costUnit, price_credit: result.priceCredit!, price_cash: result.priceCash, notes: notes || undefined,
      })
      if ('error' in res) return toast.error('Erro ao salvar a cotação', res.error)
      setQuotes(prev => [res.quote, ...prev].slice(0, 5))
      toast.success(`Cotação #${res.quote.number} salva`)
    })
  }

  const reopen = (q: SavedQuote) => {
    setSupplierId(suppliers.find(s => s.name === q.supplier_label)?.id ?? '')
    setTypeName(q.product_type ?? ''); setTypeQuery(q.product_type ?? q.ncm); setNcm(q.ncm)
    setProductRef(q.product_ref ?? ''); setUnitPrice(String(q.unit_price).replace('.', ',')); setQty(String(q.quantity))
    setTipo((q.tipo_icms as 'ST' | 'ANT') ?? 'ST'); setUf(q.uf_origem ?? '')
    setIpi(fmtPct(q.ipi_pct)); setIcms(fmtPct(q.icms_pct)); setFecoep(fmtPct(q.fecoep_pct))
    setMetrics(q.metrics); setNotes(q.notes ?? '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const remove = (id: string) => startTransition(async () => {
    const res = await deleteQuote(id)
    if ('error' in res) return toast.error('Não foi possível excluir', res.error)
    setQuotes(prev => prev.filter(q => q.id !== id))
  })

  const modified = (m: Metric) => {
    const d = defaultMetrics.find(x => x.key === m.key)
    return !d || d.value !== m.value || (d.value_by_tipo && !m.value_by_tipo)
  }

  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
      <div className="space-y-5 min-w-0">
        {/* 1. fornecedor + produto */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800">1 · O que estamos cotando</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs text-gray-500">Fabricante / fornecedor</span>
              <select className={inputCls} value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                <option value="">Escolha…</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value="new">+ Fornecedor novo (usar espelho)</option>
              </select>
            </label>
            {isNew ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="text-xs text-gray-500">Nome do novo fornecedor</span>
                  <input className={inputCls} value={newName} onChange={e => setNewName(e.target.value)} /></label>
                <label className="block"><span className="text-xs text-gray-500">Espelho (herda impostos)</span>
                  <select className={inputCls} value={mirrorId} onChange={e => setMirrorId(e.target.value)}>
                    <option value="">Escolha…</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select></label>
              </div>
            ) : (
              <label className="block"><span className="text-xs text-gray-500">Referência do produto (opcional)</span>
                <input className={inputCls} placeholder="ex.: Arandela Pit 5W preta" value={productRef} onChange={e => setProductRef(e.target.value)} /></label>
            )}
          </div>

          <div className="relative">
            <span className="text-xs text-gray-500">Tipo de produto ou NCM</span>
            <input className={inputCls} placeholder="Digite o tipo (ex.: arandela, fita, driver) ou o NCM de 8 dígitos"
              value={typeQuery} onChange={e => onTypeInput(e.target.value)} onFocus={() => setShowSuggest(true)}
              onBlur={() => setTimeout(() => setShowSuggest(false), 150)} />
            {showSuggest && (own.length > 0 || others.length > 0 || (supplierTypes && typeQuery.trim())) && (
              <div className="absolute z-20 mt-1 w-full card p-1 max-h-80 overflow-y-auto">
                {supplier && supplierTypes && <p className="px-3 pt-1.5 pb-1 text-[11px] uppercase tracking-wide text-gray-400 font-semibold">Comprados em {supplier.name}</p>}
                {own.length === 0 && supplierTypes && (
                  <p className="px-3 py-2 text-sm text-gray-500">Nada parecido com “{typeQuery}” nas notas de {supplier?.name}.</p>
                )}
                {own.map(t => <SugRow key={t.key} t={t} query={typeQuery} supplierName={supplier?.name} onPick={pickType} />)}
                {others.length > 0 && (
                  <>
                    <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-amber-600 font-semibold border-t border-surface-border mt-1">
                      Nunca comprado em {supplier?.name} — vai pedir um fornecedor espelho
                    </p>
                    {others.map(t => <SugRow key={t.key} t={t} query={typeQuery} supplierName={supplier?.name} onPick={pickType} />)}
                  </>
                )}
              </div>
            )}
            {validNcm && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs">
                <span className="font-mono text-gray-600 bg-surface-secondary border border-surface-border rounded-full px-2 py-0.5">NCM {ncm}</span>
                {typesForNcm.slice(0, 6).map(t => (
                  <span key={t.id} className="flex items-center gap-1 text-brand-700 bg-brand-50 rounded-full px-2 py-0.5"><Tag className="w-3 h-3" />{t.name}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 2. valores + impostos */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800">2 · Valor de compra e impostos</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <label className="block"><span className="text-xs text-gray-500">Valor unitário do fornecedor (R$)</span>
              <input className={inputCls} inputMode="decimal" placeholder="0,00" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} /></label>
            <label className="block"><span className="text-xs text-gray-500">Quantidade</span>
              <input className={inputCls} inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="text-xs text-gray-500">ICMS</span>
                <select className={inputCls} value={tipo} onChange={e => setTipo(e.target.value as 'ST' | 'ANT')}>
                  <option value="ST">ST</option><option value="ANT">ANT</option></select></label>
              <label className="block"><span className="text-xs text-gray-500">Origem (UF)</span>
                <select className={inputCls} value={uf} onChange={e => setUf(e.target.value)}>
                  <option value="">—</option>{UFS.map(u => <option key={u}>{u}</option>)}</select></label>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <label className="block"><span className="text-xs text-gray-500">IPI (%)</span>
              <input className={inputCls} inputMode="decimal" value={ipi} onChange={e => setIpi(e.target.value)} /></label>
            <label className="block"><span className="text-xs text-gray-500">ICMS ST/ANT (% do valor)</span>
              <input className={inputCls} inputMode="decimal" value={icms} onChange={e => setIcms(e.target.value)} /></label>
            <label className="block"><span className="text-xs text-gray-500">FECOEP (% do valor)</span>
              <input className={inputCls} inputMode="decimal" value={fecoep} onChange={e => setFecoep(e.target.value)} /></label>
          </div>

          {validNcm && (
            <div className="text-xs text-gray-500 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {profiles.length === 0
                ? 'Sem histórico de notas para esse NCM — preencha os percentuais à mão.'
                : <span>
                    Percentuais preenchidos pelo histórico
                    {profileSource === 'mirror' && ' do fornecedor espelho'}
                    {profileSource === 'any' && ' (fornecedor sem histórico com esse NCM — usando outros fornecedores)'}
                    {activeProfile && <> · nota mais recente em {activeProfile.last_date ? new Date(activeProfile.last_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</>}.
                  </span>}
            </div>
          )}
          {refs.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1.5">Já preenchido com a compra mais recente. Se preferir outra referência, clique nela:</p>
              <div className="flex flex-col gap-1">
                {refs.slice(0, 3).map(r => (
                  <button key={r.id} onClick={() => applyRef(r)}
                    className={cn('flex items-center justify-between gap-3 text-left text-xs px-3 py-1.5 rounded-lg border transition-colors',
                      activeRef === r.id ? 'bg-navy text-white border-navy' : 'bg-white border-surface-border text-gray-600 hover:border-gray-400')}>
                    <span className="truncate">{activeRef === r.id && '✓ '}{r.descricao}</span>
                    <span className="shrink-0 opacity-80">{r.tipo} · {r.uf || '—'} · {pct(r.icms_pct, 2)} · {r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString('pt-BR') : 's/ data'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {supplier && validNcm && profileSource !== null && profileSource !== 'own' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-xs text-amber-800 mb-2">
                {supplier.name} nunca comprou o NCM {ncm}. Escolha de qual fornecedor espelhar as taxas (IPI, ICMS, FECOEP):
              </p>
              <select className={inputCls} value={mirrorId} onChange={e => setMirrorId(e.target.value)}>
                <option value="">Escolha o fornecedor espelho…</option>
                {ncmSuppliers.map(m => (
                  <option key={m.id} value={m.id}>{m.name} — {m.n} item(ns){m.last ? `, última nota ${new Date(m.last + 'T00:00:00').toLocaleDateString('pt-BR')}` : ''}</option>
                ))}
              </select>
            </div>
          )}
          {profiles.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {profiles.slice(0, 8).map((p, i) => (
                <button key={i} onClick={() => applyProfile(p)}
                  className={cn('text-xs px-2.5 py-1 rounded-full border transition-colors',
                    p === activeProfile ? 'bg-navy text-white border-navy' : 'bg-white border-surface-border text-gray-600 hover:border-gray-400')}>
                  {p.tipo || '—'} · {p.uf || '—'} · {pct(p.icms_pct, 1)} <span className="opacity-60">({p.n})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 3. métricas */}
        <div className="card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-800">3 · Margens e métricas <span className="font-normal text-gray-400">— mude para simular</span></h2>
          <div className="divide-y divide-surface-border">
            {metrics.map(m => {
              const isMoney = m.kind === 'unit_amount'
              const val = effectiveValue(m, tipo)
              const isExtra = m.key.startsWith('extra_')
              return (
                <div key={m.key} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{m.label}</p>
                    <p className="text-[11px] text-gray-400">
                      {m.kind === 'price_percent' && '% do preço de venda'}{m.kind === 'cost_percent' && '% sobre o custo'}
                      {m.kind === 'unit_amount' && 'R$ por unidade, somado ao custo'}{m.kind === 'cash_discount' && 'desconto do preço à vista'}
                    </p>
                  </div>
                  <div className="relative w-28">
                    <MetricInput className={cn(inputCls, 'text-right pr-8', modified(m) && 'border-amber-300 bg-amber-50/40')}
                      display={isMoney ? String(val).replace('.', ',') : fmtPct(val)} onChange={v => setMetricValue(m.key, v, m.kind)} />
                    <span className="absolute right-3 top-2 text-xs text-gray-400">{isMoney ? 'R$' : '%'}</span>
                  </div>
                  {isExtra
                    ? <button onClick={() => removeExtra(m.key)} title="Remover" className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    : <button onClick={() => resetMetric(m.key)} disabled={!modified(m)} title="Voltar ao padrão"
                        className="p-1.5 text-gray-400 hover:text-brand-600 disabled:opacity-25"><RotateCcw className="w-4 h-4" /></button>}
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap items-end gap-2 pt-2">
            <label className="block flex-1 min-w-[140px]"><span className="text-xs text-gray-500">Nova métrica só nesta cotação</span>
              <input className={inputCls} placeholder="ex.: Frete, Embalagem" value={extra.label} onChange={e => setExtra({ ...extra, label: e.target.value })} /></label>
            <select className={cn(inputCls, 'w-40')} value={extra.kind} onChange={e => setExtra({ ...extra, kind: e.target.value as Metric['kind'] })}>
              <option value="price_percent">% do preço</option><option value="cost_percent">% do custo</option><option value="unit_amount">R$ / unidade</option>
            </select>
            <input className={cn(inputCls, 'w-24')} placeholder="valor" inputMode="decimal" value={extra.value} onChange={e => setExtra({ ...extra, value: e.target.value })} />
            <button onClick={addExtra} className="p-2 rounded-lg border border-surface-border text-gray-600 hover:bg-surface-secondary"><Plus className="w-4 h-4" /></button>
          </div>
        </div>

        {/* histórico */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-border"><h2 className="text-sm font-semibold text-gray-800">{supplier ? `Últimas cotações de ${supplier.name}` : 'Últimas cotações do fornecedor'}</h2></div>
          {quotes.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">{supplier ? 'Nenhuma cotação salva para este fornecedor ainda.' : 'Escolha um fornecedor para ver as cotações dele.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-surface-secondary text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-2.5">Nº</th><th className="px-4 py-2.5">Data</th><th className="px-4 py-2.5">Fornecedor</th>
                  <th className="px-4 py-2.5">Produto</th><th className="px-4 py-2.5 text-right">Compra</th><th className="px-4 py-2.5 text-right">Venda</th><th className="px-4 py-2.5" />
                </tr></thead>
                <tbody>
                  {quotes.map(q => (
                    <tr key={q.id} className="border-t border-surface-border hover:bg-surface-secondary/60">
                      <td className="px-4 py-2.5 text-gray-500">#{q.number}</td>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{new Date(q.created_at).toLocaleDateString('pt-BR')}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-800">{q.supplier_label}</td>
                      <td className="px-4 py-2.5 text-gray-600 max-w-[240px] truncate">{q.product_ref || q.product_type || '—'} <span className="font-mono text-xs text-gray-400">{q.ncm}</span></td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{brl(q.unit_price)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-700">{brl(q.price_credit)}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button onClick={() => reopen(q)} className="text-xs text-brand-600 hover:text-brand-700 font-medium mr-3">Reabrir</button>
                        <button onClick={() => remove(q.id)} disabled={pending} className="text-gray-300 hover:text-red-500 align-middle"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* resultado */}
      <div className="lg:sticky lg:top-4 space-y-4">
        <div className="card p-5">
          <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Preço de venda (crédito)</p>
          <p className="text-4xl font-bold text-navy mt-1 tabular-nums">{result?.priceCredit != null ? brl(result.priceCredit) : '—'}</p>
          {result?.error && <p className="text-xs text-red-600 mt-2">{result.error}</p>}
          {result && result.priceCredit != null && (
            <>
              <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                <div><p className="text-xs text-gray-400">À vista</p><p className="font-semibold tabular-nums">{brl(result.priceCash)}</p></div>
                <div><p className="text-xs text-gray-400">Custo unitário</p><p className="font-semibold tabular-nums">{brl(result.costUnit)}</p></div>
                <div><p className="text-xs text-gray-400">Sobra sobre o custo</p><p className="font-semibold tabular-nums">{brl(result.marginAmount)}</p></div>
                <div><p className="text-xs text-gray-400">Fator sobre a compra</p><p className="font-semibold tabular-nums">{(result.priceCredit / (parseNum(unitPrice) || 1)).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}×</p></div>
              </div>
              <div className="mt-4 border-t border-surface-border pt-3 space-y-1.5">
                <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-1">Para onde vai o preço</p>
                <Row label="Custo do produto" value={brl(result.costUnit)} share={result.costUnit / result.priceCredit} />
                {result.lines.map(l => <Row key={l.key} label={l.label} value={brl(l.amount)} share={l.pct} highlight={l.key === 'lucro'} />)}
              </div>
            </>
          )}
        </div>

        <div className="card p-5 space-y-3">
          <label className="block"><span className="text-xs text-gray-500">Observações</span>
            <textarea className={cn(inputCls, 'min-h-[64px]')} value={notes} onChange={e => setNotes(e.target.value)} /></label>
          <button onClick={save} disabled={!canSave || pending} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
            <Save className="w-4 h-4" /> Salvar cotação
          </button>
          {!canSave && <p className="text-[11px] text-gray-400">Escolha o fornecedor, informe um NCM válido e o valor de compra.</p>}
        </div>
      </div>
    </div>
  )
}

// Mantém o texto exatamente como digitado enquanto o campo está em foco
// (senão "2," vira "2" e o "5" seguinte vira "25"); ao sair, mostra o valor formatado.
function MetricInput({ display, onChange, className }: { display: string; onChange: (v: string) => void; className: string }) {
  const [text, setText] = useState(display)
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setText(display) }, [display, focused])
  return (
    <input className={className} inputMode="decimal" value={text}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onChange={e => { setText(e.target.value); onChange(e.target.value) }} />
  )
}

function SugRow({ t, query, supplierName, onPick }: {
  t: { key: string; ncm: string; name: string; count: number; via: boolean; other: boolean }
  query: string; supplierName?: string; onPick: (t: { name: string; ncm: string }) => void
}) {
  return (
    <button onMouseDown={() => onPick(t)}
      className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm rounded-lg hover:bg-surface-secondary text-left">
      <span className="min-w-0">
        <span className="font-medium text-gray-800">{t.name}</span>
        {t.via && (
          <span className="block text-[11px] text-brand-700">
            {t.other ? `Outros fornecedores chamam de “${t.name}”` : `${supplierName ?? 'Este fornecedor'} chama “${query.trim()}” de “${t.name}”`}
          </span>
        )}
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-xs text-gray-500 font-mono">{t.ncm}</span>
        <span className="block text-[10px] text-gray-400">{t.count} {t.count === 1 ? 'item' : 'itens'}</span>
      </span>
    </button>
  )
}

function Row({ label, value, share, highlight }: { label: string; value: string; share: number; highlight?: boolean }) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className={cn('text-gray-600', highlight && 'font-semibold text-gray-900')}>{label}</span>
        <span className="tabular-nums text-gray-800">{value} <span className="text-xs text-gray-400">({pct(share, 1)})</span></span>
      </div>
      <div className="h-1 bg-surface-secondary rounded-full overflow-hidden mt-0.5">
        <div className={cn('h-full rounded-full', highlight ? 'bg-emerald-500' : 'bg-navy/60')} style={{ width: `${Math.max(0, Math.min(100, share * 100))}%` }} />
      </div>
    </div>
  )
}
