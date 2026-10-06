'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImageOff, ImagePlus, Loader2, RefreshCw, Search, Upload, X, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { matchCatalog, normText, dimsLabel, type CatalogEntry, type ItemPhoto } from '@/lib/catalog/match'
import { setItemCatalogRef, syncSupplierCatalog, uploadItemPhoto, type SheetItem } from '@/lib/pricing/actions'

const MATCH_LABEL: Record<ItemPhoto['match'], string> = {
  codigo: 'pelo código da nota',
  descricao: 'pela REF na descrição',
  nome: 'sugestão pelo nome e medidas — confira',
  manual: 'escolhida manualmente',
}

// Miniatura ao lado do nome do produto. Passar o mouse amplia; clicar abre a escolha da foto.
export function ProductThumb({ item, onPick }: { item: SheetItem; onPick: () => void }) {
  const [hover, setHover] = useState<DOMRect | null>(null)
  const p = item.photo
  const src = p?.finish?.url ?? p?.image_url
  return (
    <>
      <button type="button" title={p ? 'Ver / trocar foto' : 'Escolher foto do catálogo'}
        onClick={e => { e.stopPropagation(); setHover(null); onPick() }}
        onMouseEnter={e => p && setHover(e.currentTarget.getBoundingClientRect())}
        onMouseLeave={() => setHover(null)}
        className={cn('shrink-0 w-9 h-9 rounded-md border bg-white overflow-hidden flex items-center justify-center',
          p ? (p.match === 'nome' ? 'border-amber-300' : 'border-surface-border') : 'border-dashed border-gray-300 text-gray-300 hover:text-gray-500')}>
        {p?.image_url ? <img src={p.image_url} alt="" loading="lazy" className="w-full h-full object-contain" /> : <ImagePlus className="w-4 h-4" />}
      </button>
      {hover && p && typeof document !== 'undefined' && createPortal(
        <div className="fixed z-50 w-72 rounded-xl border border-surface-border bg-white shadow-xl p-3 pointer-events-none"
          style={{ left: Math.min(hover.right + 10, window.innerWidth - 300), top: Math.max(8, Math.min(hover.top - 120, window.innerHeight - 380)) }}>
          <div className="aspect-square w-full bg-white flex items-center justify-center">
            {src ? <img src={src} alt={p.name} className="max-w-full max-h-full object-contain" /> : <ImageOff className="w-8 h-8 text-gray-300" />}
          </div>
          <p className="mt-2 text-sm font-semibold text-gray-900">{p.name}</p>
          <p className="text-xs text-gray-500">Ref. {p.ref}{p.model ? ` · ${p.model}` : ''}{p.dims ? ` · ${p.dims}` : ''}</p>
          {p.finish && <p className="text-xs text-gray-500">Acabamento {p.finish.code}. {p.finish.name}</p>}
          <p className={cn('mt-1 text-[11px]', p.match === 'nome' || p.generic ? 'text-amber-700' : 'text-gray-400')}>{p.generic ? 'Foto ilustrativa do tipo de produto (não é a foto exata)' : `Foto ${MATCH_LABEL[p.match]}`}</p>
        </div>,
        document.body,
      )}
    </>
  )
}

// Reduz a foto no navegador (lado maior 900px, JPEG) antes de enviar: fica ~100 KB.
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, 900 / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return new Promise((ok, fail) => canvas.toBlob(b => (b ? ok(b) : fail(new Error('Não deu para ler a foto'))), 'image/jpeg', 0.85))
}

// Sem busca, em vez de listar o catálogo em ordem alfabética (só 'A…' cabe nos primeiros 120), mostra primeiro
// os produtos que mais se parecem com o item da nota.
function rankByItem(catalog: CatalogEntry[], descricao: string): CatalogEntry[] {
  const terms = Array.from(new Set(normText(descricao).split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !/^\d+$/.test(t))))
  if (!terms.length) return catalog
  const score = (c: CatalogEntry) => { const h = normText(`${c.name} ${c.line ?? ''} ${c.model ?? ''}`); return terms.reduce((n, t) => n + (h.includes(t) ? 1 : 0), 0) }
  return catalog.map(c => [c, score(c)] as const).sort((a, b) => b[1] - a[1]).map(x => x[0])
}

// Escolha manual da foto de um item, a partir do catálogo do fornecedor.
export function CatalogPickerModal({ item, supplierId, catalog, canSync, onClose, onChanged, onCatalogReload }: {
  item: SheetItem; supplierId: string; catalog: CatalogEntry[] | null; canSync?: boolean
  onClose: () => void; onChanged: (i: SheetItem) => void; onCatalogReload: () => Promise<CatalogEntry[]>
}) {
  const [q, setQ] = useState('')
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const list = useMemo(() => {
    if (!catalog) return []
    const terms = normText(q.trim()).split(/\s+/).filter(Boolean)
    const rows = terms.length
      ? catalog.filter(c => { const h = normText(`${c.name} ${c.ref} ${c.model ?? ''} ${c.line ?? ''} ${(c.source_image_url ?? '').split('/').pop()}`); return terms.every(t => h.includes(t)) })
      : rankByItem(catalog, item.descricao)
    return rows.slice(0, 120)
  }, [catalog, q, item.descricao])

  async function choose(ref: string | null) {
    setSaving(true); setErr(null)
    const r = await setItemCatalogRef(item.id, ref)
    setSaving(false)
    if ('error' in r) { setErr(r.error ?? 'Erro'); return }
    const photo = catalog ? matchCatalog({ ...item, catalog_ref: ref }, catalog) : null
    onChanged({ ...item, catalog_ref: ref, photo })
  }

  async function upload(f: File | undefined) {
    if (!f) return
    setSaving(true); setErr(null)
    try {
      const form = new FormData()
      form.set('itemId', item.id)
      if (item.photo?.ref) form.set('ref', item.photo.ref)
      form.set('file', await shrink(f), 'foto.jpg')
      const r = await uploadItemPhoto(form)
      if ('error' in r) throw new Error(r.error)
      const fresh = await onCatalogReload()
      onChanged({ ...item, catalog_ref: r.ref ?? null, photo: matchCatalog({ ...item, catalog_ref: r.ref ?? null }, fresh) })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function sync() {
    setSyncing('Lendo o site do fornecedor… (leva 1–2 min)'); setErr(null)
    let r: Awaited<ReturnType<typeof syncSupplierCatalog>>
    try {
      // A rodada tem no máximo ~5 min; se o servidor for interrompido a resposta nunca chega, então não esperamos para sempre.
      r = await Promise.race([
        syncSupplierCatalog(supplierId),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('A rodada demorou mais que o limite e foi interrompida. Clique em Atualizar de novo (o que já foi lido fica salvo).')), 330_000)),
      ])
    } catch (e) {
      setErr((e as Error).message); setSyncing(null); return
    }
    if ('error' in r) { setErr(r.error ?? 'Erro'); setSyncing(null); return }
    await onCatalogReload()
    setSyncing(`${r.refs} referências atualizadas${r.partial ? ' (o site é grande: clique de novo para continuar)' : ''}${r.errors.length ? ` · ${r.errors.length} erro(s)` : ''}`)
  }

  const current = item.photo
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-4 p-5 border-b border-surface-border">
          <div className="w-28 h-28 shrink-0 rounded-lg border border-surface-border flex items-center justify-center bg-white overflow-hidden">
            {current?.image_url ? <img src={current.finish?.url ?? current.image_url} alt="" className="max-w-full max-h-full object-contain" /> : <ImageOff className="w-8 h-8 text-gray-300" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400">Item da nota{item.codigo_produto ? ` · código ${item.codigo_produto}` : ''}</p>
            <p className="text-sm font-semibold text-gray-900">{item.descricao}</p>
            {current ? (
              <p className="mt-1 text-xs text-gray-600">
                {current.name} · Ref. {current.ref}{current.model ? ` · ${current.model}` : ''}{current.dims ? ` · ${current.dims}` : ''}{current.finish ? ` · ${current.finish.code}. ${current.finish.name}` : ''}
                <span className={cn('block', current.match === 'nome' || current.generic ? 'text-amber-700' : 'text-gray-400')}>{current.generic ? 'Foto ilustrativa do tipo de produto (não é a foto exata)' : `Foto ${MATCH_LABEL[current.match]}`}</span>
              </p>
            ) : <p className="mt-1 text-xs text-gray-400">Sem foto. Escolha abaixo.</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {current?.product_url && <a href={current.product_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline"><ExternalLink className="w-3 h-3" /> Ver no site</a>}
              {item.catalog_ref && <button disabled={saving} onClick={() => choose(null)} className="text-xs text-gray-500 hover:text-gray-800 underline">Voltar ao automático</button>}
              {item.catalog_ref !== '-' && <button disabled={saving} onClick={() => choose('-')} className="text-xs text-gray-500 hover:text-gray-800 underline">Sem foto</button>}
              <label title={current ? 'Troca a foto desta Ref para todas as notas' : 'Envia a foto deste produto'}
                className={cn('inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline cursor-pointer', saving && 'opacity-50 pointer-events-none')}>
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} {current ? 'Enviar outra foto' : 'Enviar foto'}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { upload(e.target.files?.[0]); e.target.value = '' }} />
              </label>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-surface-border">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar no catálogo: nome, linha ou Ref…"
              className="w-full pl-9 pr-3 py-2 bg-white border border-surface-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
          </div>
          {canSync && (
            <button onClick={sync} disabled={!!syncing && syncing.startsWith('Lendo')} title="Relê o site do fornecedor (só administradores; roda sozinho toda segunda)"
              className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 disabled:opacity-60">
              <RefreshCw className={cn('w-3.5 h-3.5', syncing?.startsWith('Lendo') && 'animate-spin')} /> Atualizar catálogo
            </button>
          )}
          {syncing && <span className="text-xs text-gray-500">{syncing}</span>}
          {err && <span className="text-xs text-red-600">{err}</span>}
        </div>

        <div className="overflow-y-auto p-5">
          {catalog === null ? (
            <p className="py-10 text-sm text-gray-400 text-center flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando catálogo…</p>
          ) : catalog.length === 0 ? (
            <p className="py-10 text-sm text-gray-400 text-center">{canSync ? 'Catálogo vazio. Clique em Atualizar catálogo.' : 'Nenhuma foto deste fornecedor ainda. Use “Enviar foto”.'}</p>
          ) : list.length === 0 ? (
            <p className="py-10 text-sm text-gray-400 text-center">Nada encontrado.</p>
          ) : (
            <>
            <p className="mb-3 text-xs text-gray-400">{q.trim() ? `${list.length >= 120 ? '120+' : list.length} resultados` : `Os ${list.length} mais parecidos com o item da nota, de ${catalog.length} no catálogo.`} Use a busca para achar outro.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {list.map(c => (
                <button key={c.ref} disabled={saving} onClick={() => choose(c.ref)}
                  className={cn('text-left rounded-lg border p-2 hover:border-brand-500 transition-colors', current?.ref === c.ref ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-surface-border')}>
                  <div className="aspect-square bg-white flex items-center justify-center overflow-hidden">
                    {c.image_url ? <img src={c.image_url} alt="" loading="lazy" className="max-w-full max-h-full object-contain" /> : <ImageOff className="w-6 h-6 text-gray-300" />}
                  </div>
                  <p className="mt-1 text-xs font-medium text-gray-800 leading-tight">{c.name}</p>
                  <p className="text-[11px] text-gray-500">Ref. {c.ref}{c.model ? ` · ${c.model}` : ''}</p>
                  <p className="text-[11px] text-gray-400">{dimsLabel(c)}</p>
                </button>
              ))}
            </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
