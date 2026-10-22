'use client'

import { useMemo, useRef, useState } from 'react'
import {
  ArrowDown, ArrowUp, Box, ExternalLink, Eye, EyeOff, FileText, ImagePlus, Link2, Loader2,
  Pencil, Plus, Search, Trash2, Upload, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/useConfirm'
import { Portal } from '@/components/ui/Portal'

export interface SiteBrandCatalog {
  label: string
  url: string
  // preenchido quando o PDF foi enviado pelo sistema (bucket 'site'); links externos não têm
  path?: string | null
}

export interface SiteBrand {
  id: string
  name: string
  logo_url: string | null
  logo_path: string | null
  is_decorative: boolean
  is_technical: boolean
  catalogs: SiteBrandCatalog[]
  blocks_url: string | null
  visible: boolean
  sort_order: number
}

const SITE_URL = 'https://luknosiluminacao.com.br/especificadores'
const BUCKET = 'site'

type Filter = 'todas' | 'visiveis' | 'ocultas' | 'decorativa' | 'tecnica'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'visiveis', label: 'No site' },
  { key: 'ocultas', label: 'Ocultas' },
  { key: 'decorativa', label: 'Decorativa' },
  { key: 'tecnica', label: 'Técnica' },
]

function slug(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'arquivo'
}

function storagePaths(b: Pick<SiteBrand, 'logo_path' | 'catalogs'>) {
  return [b.logo_path, ...b.catalogs.map((c) => c.path)].filter((p): p is string => !!p)
}

async function uploadToSite(path: string, file: File) {
  const supabase = createClient()
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: true,
  })
  if (error) {
    const tooBig = /size|large|exceed/i.test(error.message)
    return { error: tooBig ? 'Arquivo grande demais para enviar. Suba no Google Drive e cole o link.' : error.message }
  }
  return { url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl }
}

export function SiteBrandsManager({ initialBrands }: { initialBrands: SiteBrand[] }) {
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [brands, setBrands] = useState<SiteBrand[]>(initialBrands)
  const [filter, setFilter] = useState<Filter>('todas')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<SiteBrand | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const stats = {
    total: brands.length,
    visiveis: brands.filter((b) => b.visible).length,
    decorativa: brands.filter((b) => b.visible && b.is_decorative).length,
    tecnica: brands.filter((b) => b.visible && b.is_technical).length,
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return brands.filter((b) => {
      if (term && !b.name.toLowerCase().includes(term)) return false
      if (filter === 'visiveis') return b.visible
      if (filter === 'ocultas') return !b.visible
      if (filter === 'decorativa') return b.is_decorative
      if (filter === 'tecnica') return b.is_technical
      return true
    })
  }, [brands, filter, search])

  function newBrand(): SiteBrand {
    return {
      id: crypto.randomUUID(),
      name: '',
      logo_url: null,
      logo_path: null,
      is_decorative: false,
      is_technical: false,
      catalogs: [{ label: 'Catálogo', url: '' }],
      blocks_url: null,
      visible: true,
      sort_order: (brands.reduce((m, b) => Math.max(m, b.sort_order), 0) || 0) + 10,
    }
  }

  async function toggleVisible(brand: SiteBrand) {
    setBusyId(brand.id)
    const visible = !brand.visible
    setBrands((prev) => prev.map((b) => (b.id === brand.id ? { ...b, visible } : b)))
    const { error } = await createClient().from('site_brands').update({ visible, updated_at: new Date().toISOString() }).eq('id', brand.id)
    setBusyId(null)
    if (error) {
      setBrands((prev) => prev.map((b) => (b.id === brand.id ? { ...b, visible: brand.visible } : b)))
      toast.error('OCORREU UM ERRO', error.message)
      return
    }
    toast.success('TUDO CERTO!', visible ? `${brand.name} voltou a aparecer no site.` : `${brand.name} foi ocultada do site.`)
  }

  // Troca a posição com a vizinha na lista completa (a ordem é a mesma do site)
  async function move(brand: SiteBrand, dir: -1 | 1) {
    const idx = brands.findIndex((b) => b.id === brand.id)
    const other = brands[idx + dir]
    if (!other) return
    const a = { ...brand, sort_order: other.sort_order }
    const b = { ...other, sort_order: brand.sort_order }
    // ordens iguais (ex: duas marcas novas) não trocariam nada — desempata
    if (a.sort_order === b.sort_order) a.sort_order += dir
    const next = [...brands]
    next[idx] = b
    next[idx + dir] = a
    setBrands(next)
    const supabase = createClient()
    const [r1, r2] = await Promise.all([
      supabase.from('site_brands').update({ sort_order: a.sort_order }).eq('id', a.id),
      supabase.from('site_brands').update({ sort_order: b.sort_order }).eq('id', b.id),
    ])
    if (r1.error || r2.error) {
      setBrands(brands)
      toast.error('OCORREU UM ERRO', 'Não foi possível mudar a ordem.')
    }
  }

  async function remove(brand: SiteBrand) {
    const ok = await confirm(
      `Excluir a marca ${brand.name}? Ela some do site e a logo e os catálogos enviados pelo sistema são apagados. Para só tirar do site, use "Ocultar".`,
      'Sim, excluir',
    )
    if (!ok) return
    setBusyId(brand.id)
    const supabase = createClient()
    const { error } = await supabase.from('site_brands').delete().eq('id', brand.id)
    setBusyId(null)
    if (error) {
      toast.error('OCORREU UM ERRO', error.message)
      return
    }
    const paths = storagePaths(brand)
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
    setBrands((prev) => prev.filter((b) => b.id !== brand.id))
    toast.success('TUDO CERTO!', `${brand.name} foi excluída.`)
  }

  function onSaved(saved: SiteBrand) {
    setBrands((prev) => {
      const exists = prev.some((b) => b.id === saved.id)
      const next = exists ? prev.map((b) => (b.id === saved.id ? saved : b)) : [...prev, saved]
      return next.sort((x, y) => x.sort_order - y.sort_order || x.name.localeCompare(y.name))
    })
    setEditing(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Site · Especificadores</h2>
          <p className="text-sm text-gray-500 mt-1">
            Marcas, catálogos e blocos 3D da página de especificadores. As mudanças aparecem no site em até 1 minuto.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-surface-border text-gray-700 hover:bg-surface-secondary transition-colors"
          >
            <ExternalLink size={15} />
            Ver no site
          </a>
          <button
            type="button"
            onClick={() => setEditing(newBrand())}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 transition-colors"
          >
            <Plus size={15} />
            Nova marca
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="bg-white rounded-lg border border-surface-border p-4">
          <p className="text-xs text-gray-500 font-semibold uppercase">Marcas</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg border border-surface-border p-4">
          <p className="text-xs text-gray-500 font-semibold uppercase">No site</p>
          <p className="text-3xl font-bold text-green-600 mt-2">{stats.visiveis}</p>
        </div>
        <div className="bg-white rounded-lg border border-surface-border p-4">
          <p className="text-xs text-gray-500 font-semibold uppercase">Decorativa</p>
          <p className="text-3xl font-bold text-amber-600 mt-2">{stats.decorativa}</p>
        </div>
        <div className="bg-white rounded-lg border border-surface-border p-4">
          <p className="text-xs text-gray-500 font-semibold uppercase">Técnica</p>
          <p className="text-3xl font-bold text-blue-600 mt-2">{stats.tecnica}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                filter === f.key
                  ? 'border-brand-600 bg-brand-50 text-brand-700 font-medium'
                  : 'border-surface-border text-gray-600 hover:bg-surface-secondary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar marca"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-surface-border bg-white outline-none focus:border-brand-500"
          />
        </div>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg border border-surface-border p-10 text-center text-gray-400">
          Nenhuma marca por aqui.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-surface-border divide-y divide-surface-border">
          {filtered.map((brand) => {
            const pos = brands.findIndex((b) => b.id === brand.id)
            return (
              <div
                key={brand.id}
                className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${brand.visible ? '' : 'bg-surface-secondary/60'}`}
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className={`w-24 h-14 shrink-0 rounded-lg border border-surface-border bg-white flex items-center justify-center overflow-hidden ${brand.visible ? '' : 'opacity-50'}`}>
                    {brand.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={brand.logo_url} alt={brand.name} className="max-w-full max-h-full object-contain p-1.5" />
                    ) : (
                      <span className="text-xs text-gray-400">sem logo</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`font-semibold ${brand.visible ? 'text-gray-900' : 'text-gray-500'}`}>{brand.name}</p>
                      {!brand.visible && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide bg-gray-200 text-gray-600 px-2 py-0.5 rounded">Oculta</span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {brand.is_decorative && (
                        <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-medium">Decorativa</span>
                      )}
                      {brand.is_technical && (
                        <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-medium">Técnica</span>
                      )}
                      {!brand.is_decorative && !brand.is_technical && (
                        <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded font-medium">Sem tag</span>
                      )}
                      {brand.catalogs.map((c, i) => (
                        <a
                          key={i}
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-brand-700 px-1.5"
                          title={c.url}
                        >
                          <FileText size={12} />
                          {c.label}
                        </a>
                      ))}
                      {brand.blocks_url ? (
                        <a
                          href={brand.blocks_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-brand-700 px-1.5"
                          title={brand.blocks_url}
                        >
                          <Box size={12} />
                          Blocos 3D
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400 px-1.5">sem blocos</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 sm:shrink-0">
                  <button
                    type="button"
                    onClick={() => move(brand, -1)}
                    disabled={pos <= 0}
                    className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-surface-secondary disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Subir na ordem do site"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(brand, 1)}
                    disabled={pos >= brands.length - 1}
                    className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-surface-secondary disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Descer na ordem do site"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleVisible(brand)}
                    disabled={busyId === brand.id}
                    className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-sm font-medium transition-colors ${
                      brand.visible ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    title={brand.visible ? 'Ocultar do site' : 'Mostrar no site'}
                  >
                    {brand.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                    {brand.visible ? 'No site' : 'Oculta'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(brand)}
                    className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-sm font-medium bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors"
                  >
                    <Pencil size={14} />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(brand)}
                    disabled={busyId === brand.id}
                    className="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                    title="Excluir marca"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <BrandEditor
          brand={editing}
          isNew={!brands.some((b) => b.id === editing.id)}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
      {ConfirmDialog}
    </div>
  )
}

function BrandEditor({
  brand,
  isNew,
  onClose,
  onSaved,
}: {
  brand: SiteBrand
  isNew: boolean
  onClose: () => void
  onSaved: (b: SiteBrand) => void
}) {
  const toast = useToast()
  const [form, setForm] = useState<SiteBrand>({ ...brand, catalogs: brand.catalogs.map((c) => ({ ...c })) })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null) // 'logo' | 'cat-<i>'
  // arquivos enviados nesta edição — se cancelar, são apagados pra não sobrar lixo no bucket
  const uploadedRef = useRef<string[]>([])
  const logoInput = useRef<HTMLInputElement>(null)
  const catInputs = useRef<(HTMLInputElement | null)[]>([])

  function set<K extends keyof SiteBrand>(key: K, value: SiteBrand[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function setCatalog(i: number, patch: Partial<SiteBrandCatalog>) {
    setForm((f) => ({ ...f, catalogs: f.catalogs.map((c, j) => (j === i ? { ...c, ...patch } : c)) }))
  }

  function moveCatalog(i: number, dir: -1 | 1) {
    setForm((f) => {
      const next = [...f.catalogs]
      const j = i + dir
      if (j < 0 || j >= next.length) return f
      ;[next[i], next[j]] = [next[j], next[i]]
      return { ...f, catalogs: next }
    })
  }

  async function onLogo(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('ERRO', 'Envie uma imagem (PNG, JPG, SVG ou WEBP).')
      return
    }
    setUploading('logo')
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
    const path = `brands/${form.id}/logo-${Date.now()}.${ext}`
    const res = await uploadToSite(path, file)
    setUploading(null)
    if (res.error) {
      toast.error('OCORREU UM ERRO', res.error)
      return
    }
    uploadedRef.current.push(path)
    setForm((f) => ({ ...f, logo_url: res.url!, logo_path: path }))
  }

  async function onCatalogFile(i: number, file: File | undefined) {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('ERRO', 'O catálogo precisa ser um PDF.')
      return
    }
    setUploading(`cat-${i}`)
    const base = file.name.replace(/\.pdf$/i, '')
    const path = `brands/${form.id}/catalogos/${Date.now()}-${slug(base)}.pdf`
    const res = await uploadToSite(path, file)
    setUploading(null)
    if (res.error) {
      toast.error('OCORREU UM ERRO', res.error)
      return
    }
    uploadedRef.current.push(path)
    setCatalog(i, { url: res.url!, path })
  }

  async function cancel() {
    if (uploadedRef.current.length) await createClient().storage.from(BUCKET).remove(uploadedRef.current)
    onClose()
  }

  async function save() {
    const name = form.name.trim()
    if (!name) return toast.error('ERRO', 'Informe o nome da marca.')
    const catalogs = form.catalogs
      .map((c) => ({ label: c.label.trim() || 'Catálogo', url: c.url.trim(), ...(c.path ? { path: c.path } : {}) }))
      .filter((c) => c.url)
    const badUrl = [...catalogs.map((c) => c.url), form.blocks_url?.trim()].find((u) => u && !/^https?:\/\//i.test(u))
    if (badUrl) return toast.error('ERRO', `Link inválido: ${badUrl}. Os links precisam começar com https://`)

    const payload = {
      id: form.id,
      name,
      logo_url: form.logo_url,
      logo_path: form.logo_path,
      is_decorative: form.is_decorative,
      is_technical: form.is_technical,
      catalogs,
      blocks_url: form.blocks_url?.trim() || null,
      visible: form.visible,
      sort_order: form.sort_order,
      updated_at: new Date().toISOString(),
    }

    setSaving(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('site_brands').upsert(payload).select('*').single()
    setSaving(false)
    if (error || !data) {
      toast.error('OCORREU UM ERRO', error?.message ?? 'Não foi possível salvar.')
      return
    }

    // apaga do bucket o que foi substituído/removido (logo antiga, PDFs trocados)
    const keep = new Set(storagePaths(payload))
    const stale = [...storagePaths(brand), ...uploadedRef.current].filter((p) => !keep.has(p))
    if (stale.length) await supabase.storage.from(BUCKET).remove(Array.from(new Set(stale)))

    toast.success('TUDO CERTO!', isNew ? `${name} foi adicionada.` : `${name} foi atualizada.`)
    onSaved(data as SiteBrand)
  }

  const busy = saving || uploading !== null
  const noTag = !form.is_decorative && !form.is_technical

  return (
    <Portal>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[9990] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
            <h3 className="text-lg font-bold text-gray-900">{isNew ? 'Nova marca' : `Editar ${brand.name}`}</h3>
            <button type="button" onClick={cancel} disabled={saving} className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-surface-secondary">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Nome + logo */}
            <div className="grid gap-5 sm:grid-cols-[1fr_180px]">
              <div className="space-y-4">
                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">Nome da marca</span>
                  <input
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="Ex: Accord Iluminação"
                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-surface-border outline-none focus:border-brand-500"
                    autoFocus={isNew}
                  />
                </label>

                <div>
                  <span className="text-sm font-semibold text-gray-700">Tags do filtro no site</span>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <TagToggle checked={form.is_decorative} onChange={(v) => set('is_decorative', v)} label="Iluminação decorativa" />
                    <TagToggle checked={form.is_technical} onChange={(v) => set('is_technical', v)} label="Iluminação técnica" />
                  </div>
                  {noTag && (
                    <p className="mt-1.5 text-xs text-red-600">Sem tag, a marca só aparece no filtro &quot;Todos&quot; do site.</p>
                  )}
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.visible}
                    onChange={(e) => set('visible', e.target.checked)}
                    className="w-4 h-4 accent-brand-600"
                  />
                  <span className="text-sm text-gray-700">Mostrar no site</span>
                </label>
              </div>

              <div>
                <span className="text-sm font-semibold text-gray-700">Logo / foto</span>
                <button
                  type="button"
                  onClick={() => logoInput.current?.click()}
                  disabled={busy}
                  className="mt-1 w-full h-28 rounded-lg border border-dashed border-surface-border bg-surface-secondary/50 hover:border-brand-500 flex items-center justify-center overflow-hidden"
                >
                  {uploading === 'logo' ? (
                    <Loader2 size={20} className="animate-spin text-gray-400" />
                  ) : form.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.logo_url} alt="" className="max-w-full max-h-full object-contain p-2" />
                  ) : (
                    <span className="flex flex-col items-center gap-1 text-xs text-gray-500">
                      <ImagePlus size={20} />
                      Enviar imagem
                    </span>
                  )}
                </button>
                <div className="mt-1.5 flex items-center justify-between text-xs">
                  <button type="button" onClick={() => logoInput.current?.click()} disabled={busy} className="text-brand-700 hover:underline">
                    {form.logo_url ? 'Trocar' : 'Escolher arquivo'}
                  </button>
                  {form.logo_url && (
                    <button type="button" onClick={() => setForm((f) => ({ ...f, logo_url: null, logo_path: null }))} disabled={busy} className="text-red-500 hover:underline">
                      Remover
                    </button>
                  )}
                </div>
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { onLogo(e.target.files?.[0]); e.target.value = '' }}
                />
              </div>
            </div>

            {/* Catálogos */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Catálogos</span>
                <button
                  type="button"
                  onClick={() => set('catalogs', [...form.catalogs, { label: form.catalogs.length ? '' : 'Catálogo', url: '' }])}
                  className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"
                >
                  <Plus size={14} />
                  Adicionar catálogo
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Cole o link (Google Drive, site da marca) ou envie o PDF. Cada catálogo vira um botão no card.
              </p>
              <div className="mt-3 space-y-3">
                {form.catalogs.length === 0 && (
                  <p className="text-sm text-gray-400">Nenhum catálogo.</p>
                )}
                {form.catalogs.map((c, i) => (
                  <div key={i} className="rounded-lg border border-surface-border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={c.label}
                        onChange={(e) => setCatalog(i, { label: e.target.value })}
                        placeholder="Nome do botão (ex: Catálogo, Linha Reserva)"
                        className="flex-1 min-w-0 px-3 py-1.5 text-sm rounded-lg border border-surface-border outline-none focus:border-brand-500"
                      />
                      <button type="button" onClick={() => moveCatalog(i, -1)} disabled={i === 0} className="w-7 h-7 inline-flex items-center justify-center rounded text-gray-500 hover:bg-surface-secondary disabled:opacity-30" title="Subir">
                        <ArrowUp size={14} />
                      </button>
                      <button type="button" onClick={() => moveCatalog(i, 1)} disabled={i === form.catalogs.length - 1} className="w-7 h-7 inline-flex items-center justify-center rounded text-gray-500 hover:bg-surface-secondary disabled:opacity-30" title="Descer">
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => set('catalogs', form.catalogs.filter((_, j) => j !== i))}
                        className="w-7 h-7 inline-flex items-center justify-center rounded text-red-500 hover:bg-red-50"
                        title="Remover catálogo"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1 min-w-0">
                        <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          value={c.url}
                          onChange={(e) => setCatalog(i, { url: e.target.value, path: null })}
                          placeholder="https://drive.google.com/..."
                          className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-surface-border outline-none focus:border-brand-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => catInputs.current[i]?.click()}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-surface-border text-gray-700 hover:bg-surface-secondary shrink-0"
                      >
                        {uploading === `cat-${i}` ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        PDF
                      </button>
                      {c.url && (
                        <a href={c.url} target="_blank" rel="noopener noreferrer" className="w-8 h-8 inline-flex items-center justify-center rounded text-gray-500 hover:bg-surface-secondary shrink-0" title="Abrir">
                          <ExternalLink size={14} />
                        </a>
                      )}
                      <input
                        ref={(el) => { catInputs.current[i] = el }}
                        type="file"
                        accept="application/pdf,.pdf"
                        className="hidden"
                        onChange={(e) => { onCatalogFile(i, e.target.files?.[0]); e.target.value = '' }}
                      />
                    </div>
                    {c.path && <p className="text-xs text-green-700">PDF enviado pelo sistema</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* Blocos */}
            <label className="block">
              <span className="text-sm font-semibold text-gray-700">Link dos blocos 3D</span>
              <div className="relative mt-1">
                <Box size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={form.blocks_url ?? ''}
                  onChange={(e) => set('blocks_url', e.target.value)}
                  placeholder="https://3dwarehouse.sketchup.com/by/..."
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-surface-border outline-none focus:border-brand-500"
                />
              </div>
              <span className="text-xs text-gray-500">Deixe vazio se a marca não tiver blocos — o botão some do card.</span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-surface-border">
            <button type="button" onClick={cancel} disabled={saving} className="px-4 py-2 text-sm rounded-lg text-gray-600 hover:bg-surface-secondary">
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-60"
            >
              {saving && <Loader2 size={15} className="animate-spin" />}
              {isNew ? 'Adicionar marca' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

function TagToggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
        checked ? 'border-brand-600 bg-brand-50 text-brand-700 font-medium' : 'border-surface-border text-gray-500 hover:bg-surface-secondary'
      }`}
    >
      {checked ? '✓ ' : ''}{label}
    </button>
  )
}
