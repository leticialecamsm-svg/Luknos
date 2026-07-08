'use client'

import { useState, useRef, useEffect } from 'react'
import { createMarketingPost, updateMarketingPost, createEditorialLine } from '@/lib/actions'
import { MARKETING_POST_TYPE_LABEL, MARKETING_POST_STATUS_LABEL, MarketingPostType, MarketingPostStatus } from '@/types'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import { Portal } from '@/components/ui/Portal'
import { X, Loader2, Plus, Check, Link as LinkIcon, CircleDashed, Clapperboard, GalleryHorizontalEnd, FileText, Calendar, Users, BookOpen, Image as ImageIcon, CircleDot, FolderOpen } from 'lucide-react'

export const TYPE_ICON: Record<MarketingPostType, any> = {
  story:    CircleDashed,
  reels:    Clapperboard,
  carousel: GalleryHorizontalEnd,
}

// Cor de cada tipo (pill estilo Categoria)
export const TYPE_STYLE: Record<MarketingPostType, { active: string; icon: string }> = {
  story:    { active: 'bg-purple-50 text-purple-700 border-purple-300 ring-1 ring-inset ring-purple-200', icon: 'text-purple-500' },
  reels:    { active: 'bg-pink-50 text-pink-700 border-pink-300 ring-1 ring-inset ring-pink-200',         icon: 'text-pink-500' },
  carousel: { active: 'bg-blue-50 text-blue-700 border-blue-300 ring-1 ring-inset ring-blue-200',         icon: 'text-blue-500' },
}

// Pasta do Drive de marketing (atalho fixo)
const DRIVE_URL = 'https://drive.google.com/drive/folders/1J59jgELctmlDYax1u4-wUGTwbbEdqK2f?usp=sharing'

interface Props {
  post: any | null
  defaultDate?: string
  editorialLines: any[]
  users: any[]
  onClose: () => void
  onSaved: () => void
  onEditorialLineCreated: (line: any) => void
}

// Cabeçalho de seção reutilizável (padrão dos formulários de orçamento)
function Section({ icon: Icon, title, action, children }: { icon: any; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
        <Icon className="w-4 h-4 text-brand-500" />
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </div>
  )
}

export function PostModal({ post, defaultDate, editorialLines, users, onClose, onSaved, onEditorialLineCreated }: Props) {
  const [name, setName] = useState(post?.name ?? '')
  const [type, setType] = useState<MarketingPostType>(post?.type ?? 'story')
  const [postDate, setPostDate] = useState(post?.post_date ?? defaultDate ?? '')
  const [captureDate, setCaptureDate] = useState(post?.capture_date ?? '')
  const [status, setStatus] = useState<MarketingPostStatus>(post?.status ?? 'scheduled')
  const [roteiro, setRoteiro] = useState(post?.roteiro_url ?? '')
  const [creative, setCreative] = useState(post?.creative_url ?? '')
  const [editorialId, setEditorialId] = useState<string | null>(post?.editorial_line_id ?? null)
  const [participantIds, setParticipantIds] = useState<string[]>((post?.participants ?? []).map((p: any) => p.id))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim()) { setError('Informe o nome da postagem'); return }
    setSaving(true)
    setError('')
    const input = {
      name, type, post_date: postDate || null, editorial_line_id: editorialId,
      roteiro_url: roteiro || null, creative_url: creative || null, status, capture_date: captureDate || null,
      participant_ids: participantIds,
    }
    const res = post ? await updateMarketingPost(post.id, input) : await createMarketingPost(input)
    setSaving(false)
    if (res?.error) { setError(res.error); return }
    onSaved()
  }

  function toggleParticipant(id: string) {
    setParticipantIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-base font-semibold text-gray-900">{post ? 'Editar postagem' : 'Nova postagem'}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
          {/* ── Coluna esquerda ── */}
          <div className="space-y-6">
            {/* Informações */}
            <Section icon={FileText} title="Informações">
              <div>
                <label className="text-xs font-medium text-gray-500">Nome <span className="text-red-400">*</span></label>
                <input value={name} onChange={e => setName(e.target.value)} className="input mt-1" placeholder="Ex: Bastidores da montagem" autoFocus />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Tipo</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {(Object.keys(MARKETING_POST_TYPE_LABEL) as MarketingPostType[]).map(t => {
                    const Icon = TYPE_ICON[t]; const st = TYPE_STYLE[t]; const active = type === t
                    return (
                      <button key={t} onClick={() => setType(t)}
                        className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
                          active ? st.active : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300')}>
                        <Icon className={cn('w-4 h-4', active ? st.icon : 'text-gray-400')} />
                        {MARKETING_POST_TYPE_LABEL[t]}
                      </button>
                    )
                  })}
                </div>
              </div>
            </Section>

            {/* Conteúdo — com atalho do Drive no cabeçalho */}
            <Section icon={BookOpen} title="Conteúdo" action={
              <a href={DRIVE_URL} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 normal-case">
                <FolderOpen className="w-3.5 h-3.5" /> Link do Drive
              </a>
            }>
              <div>
                <label className="text-xs font-medium text-gray-500">Linha editorial</label>
                <EditorialCombobox lines={editorialLines} value={editorialId} onChange={setEditorialId}
                  onCreated={line => { onEditorialLineCreated(line); setEditorialId(line.id) }} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Roteiro (link do Google Docs)</label>
                <div className="relative mt-1">
                  <LinkIcon className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input value={roteiro} onChange={e => setRoteiro(e.target.value)} className="input pl-9" placeholder="https://docs.google.com/..." />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Link do criativo</label>
                <div className="relative mt-1">
                  <ImageIcon className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input value={creative} onChange={e => setCreative(e.target.value)} className="input pl-9" placeholder="Link da arte / vídeo final" />
                </div>
              </div>
            </Section>
          </div>

          {/* ── Coluna direita ── */}
          <div className="space-y-6">
            {/* Datas */}
            <Section icon={Calendar} title="Datas">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500">Postagem</label>
                  <input type="date" value={postDate} onChange={e => setPostDate(e.target.value)} className="input mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Captação</label>
                  <input type="date" value={captureDate} onChange={e => setCaptureDate(e.target.value)} className="input mt-1" />
                </div>
              </div>
            </Section>

            {/* Status */}
            <Section icon={CircleDot} title="Status">
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(MARKETING_POST_STATUS_LABEL) as MarketingPostStatus[]).map(s => {
                  const on = status === s
                  const dot = s === 'posted' ? 'bg-emerald-500' : 'bg-amber-500'
                  return (
                    <button key={s} onClick={() => setStatus(s)}
                      className={cn('flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition-all',
                        on
                          ? (s === 'posted' ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-1 ring-inset ring-emerald-200'
                                            : 'bg-amber-50 text-amber-700 border-amber-300 ring-1 ring-inset ring-amber-200')
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300')}>
                      <span className={cn('w-2 h-2 rounded-full', on ? dot : 'bg-gray-300')} />
                      {MARKETING_POST_STATUS_LABEL[s]}
                    </button>
                  )
                })}
              </div>
            </Section>

            {/* Participantes */}
            <Section icon={Users} title={`Participantes${participantIds.length ? ` · ${participantIds.length}` : ''}`}>
              <div className="flex flex-wrap gap-1.5">
                {users.map(u => {
                  const on = participantIds.includes(u.id)
                  return (
                    <button key={u.id} onClick={() => toggleParticipant(u.id)}
                      className={cn('flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border text-sm transition-all',
                        on ? 'border-brand-400 bg-brand-50 text-brand-700 font-medium' : 'border-gray-200 text-gray-500 hover:border-gray-300')}>
                      <Avatar user={u} size={20} />
                      {u.name}
                      {on && <Check className="w-3.5 h-3.5" />}
                    </button>
                  )
                })}
              </div>
            </Section>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-secondary px-5">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary px-6 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
          </button>
        </div>
      </div>
    </div>
    </Portal>
  )
}

function EditorialCombobox({ lines, value, onChange, onCreated }: {
  lines: any[]; value: string | null; onChange: (id: string | null) => void; onCreated: (line: any) => void
}) {
  const selected = lines.find(l => l.id === value)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered = lines.filter(l => l.name.toLowerCase().includes(query.toLowerCase()))
  const exact = lines.some(l => l.name.toLowerCase() === query.trim().toLowerCase())

  async function handleCreate() {
    if (!query.trim()) return
    setCreating(true)
    const res = await createEditorialLine(query.trim())
    setCreating(false)
    if (res?.ok && res.data) { onCreated(res.data); setQuery(''); setOpen(false) }
  }

  return (
    <div className="relative mt-1" ref={ref}>
      <input value={open ? query : (selected?.name ?? '')} onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => { setOpen(true); setQuery('') }} placeholder="Buscar ou criar linha editorial..." className="input" />
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {value && (
            <button onClick={() => { onChange(null); setOpen(false) }} className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50">— Nenhuma —</button>
          )}
          {filtered.map(l => (
            <button key={l.id} onClick={() => { onChange(l.id); setOpen(false) }}
              className={cn('w-full text-left px-3 py-2 text-sm hover:bg-gray-50', l.id === value && 'bg-brand-50 text-brand-700')}>{l.name}</button>
          ))}
          {query.trim() && !exact && (
            <button onClick={handleCreate} disabled={creating}
              className="w-full text-left px-3 py-2 text-sm text-brand-600 hover:bg-brand-50 flex items-center gap-1.5 border-t border-gray-100">
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Criar "{query.trim()}"
            </button>
          )}
          {filtered.length === 0 && !query.trim() && <p className="px-3 py-2 text-sm text-gray-400">Digite para buscar ou criar</p>}
        </div>
      )}
    </div>
  )
}
