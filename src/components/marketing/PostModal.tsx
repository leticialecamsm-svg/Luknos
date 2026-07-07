'use client'

import { useState, useRef, useEffect } from 'react'
import { createMarketingPost, updateMarketingPost, deleteMarketingPost, createEditorialLine } from '@/lib/actions'
import { MARKETING_POST_TYPE_LABEL, MARKETING_POST_STATUS_LABEL, MarketingPostType, MarketingPostStatus } from '@/types'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import { X, Loader2, Trash2, Plus, Check, Link as LinkIcon } from 'lucide-react'

interface Props {
  post: any | null            // null = criar
  defaultDate?: string        // data pré-preenchida ao criar por um dia
  editorialLines: any[]
  users: any[]
  onClose: () => void
  onSaved: () => void
  onEditorialLineCreated: (line: any) => void
}

export function PostModal({ post, defaultDate, editorialLines, users, onClose, onSaved, onEditorialLineCreated }: Props) {
  const [name, setName] = useState(post?.name ?? '')
  const [type, setType] = useState<MarketingPostType>(post?.type ?? 'story')
  const [postDate, setPostDate] = useState(post?.post_date ?? defaultDate ?? '')
  const [captureDate, setCaptureDate] = useState(post?.capture_date ?? '')
  const [status, setStatus] = useState<MarketingPostStatus>(post?.status ?? 'scheduled')
  const [roteiro, setRoteiro] = useState(post?.roteiro_url ?? '')
  const [editorialId, setEditorialId] = useState<string | null>(post?.editorial_line_id ?? null)
  const [participantIds, setParticipantIds] = useState<string[]>(
    (post?.participants ?? []).map((p: any) => p.id)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim()) { setError('Informe o nome da postagem'); return }
    setSaving(true)
    setError('')
    const input = {
      name, type, post_date: postDate || null, editorial_line_id: editorialId,
      roteiro_url: roteiro || null, status, capture_date: captureDate || null,
      participant_ids: participantIds,
    }
    const res = post
      ? await updateMarketingPost(post.id, input)
      : await createMarketingPost(input)
    setSaving(false)
    if (res?.error) { setError(res.error); return }
    onSaved()
  }

  async function remove() {
    if (!post || !confirm('Excluir esta postagem?')) return
    setSaving(true)
    await deleteMarketingPost(post.id)
    setSaving(false)
    onSaved()
  }

  function toggleParticipant(id: string) {
    setParticipantIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-base font-semibold text-gray-900">{post ? 'Editar postagem' : 'Nova postagem'}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Nome */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Nome</label>
            <input value={name} onChange={e => setName(e.target.value)} className="input mt-1" placeholder="Ex: Bastidores da montagem" autoFocus />
          </div>

          {/* Tipo */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Tipo</label>
            <div className="flex gap-2 mt-1">
              {(Object.keys(MARKETING_POST_TYPE_LABEL) as MarketingPostType[]).map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={cn('flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-all',
                    type === t ? 'bg-brand-600 text-white border-brand-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300')}>
                  {MARKETING_POST_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Data de postagem</label>
              <input type="date" value={postDate} onChange={e => setPostDate(e.target.value)} className="input mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Data de captação</label>
              <input type="date" value={captureDate} onChange={e => setCaptureDate(e.target.value)} className="input mt-1" />
            </div>
          </div>

          {/* Linha Editorial */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Linha editorial</label>
            <EditorialCombobox
              lines={editorialLines}
              value={editorialId}
              onChange={setEditorialId}
              onCreated={line => { onEditorialLineCreated(line); setEditorialId(line.id) }}
            />
          </div>

          {/* Participantes */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Participantes</label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {users.map(u => {
                const on = participantIds.includes(u.id)
                return (
                  <button key={u.id} onClick={() => toggleParticipant(u.id)}
                    className={cn('flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border text-sm transition-all',
                      on ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:border-gray-300')}>
                    <Avatar user={u} size={20} />
                    {u.name}
                    {on && <Check className="w-3.5 h-3.5" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Roteiro */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Roteiro (link do Google Docs)</label>
            <div className="relative mt-1">
              <LinkIcon className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input value={roteiro} onChange={e => setRoteiro(e.target.value)} className="input pl-9" placeholder="https://docs.google.com/..." />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase">Status</label>
            <div className="flex gap-2 mt-1">
              {(Object.keys(MARKETING_POST_STATUS_LABEL) as MarketingPostStatus[]).map(s => (
                <button key={s} onClick={() => setStatus(s)}
                  className={cn('flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-all',
                    status === s
                      ? (s === 'posted' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-amber-500 text-white border-amber-500')
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300')}>
                  {MARKETING_POST_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-between">
          {post ? (
            <button onClick={remove} disabled={saving} className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1.5">
              <Trash2 className="w-4 h-4" /> Excluir
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-secondary px-5">Cancelar</button>
            <button onClick={save} disabled={saving} className="btn-primary px-6 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Combobox de linha editorial: filtra ao digitar e permite criar se não existir
function EditorialCombobox({ lines, value, onChange, onCreated }: {
  lines: any[]
  value: string | null
  onChange: (id: string | null) => void
  onCreated: (line: any) => void
}) {
  const selected = lines.find(l => l.id === value)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
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
    if (res?.ok && res.data) {
      onCreated(res.data)
      setQuery('')
      setOpen(false)
    }
  }

  return (
    <div className="relative mt-1" ref={ref}>
      <input
        value={open ? query : (selected?.name ?? '')}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => { setOpen(true); setQuery('') }}
        placeholder="Buscar ou criar linha editorial..."
        className="input"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {value && (
            <button onClick={() => { onChange(null); setOpen(false) }} className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50">
              — Nenhuma —
            </button>
          )}
          {filtered.map(l => (
            <button key={l.id} onClick={() => { onChange(l.id); setOpen(false) }}
              className={cn('w-full text-left px-3 py-2 text-sm hover:bg-gray-50', l.id === value && 'bg-brand-50 text-brand-700')}>
              {l.name}
            </button>
          ))}
          {query.trim() && !exact && (
            <button onClick={handleCreate} disabled={creating}
              className="w-full text-left px-3 py-2 text-sm text-brand-600 hover:bg-brand-50 flex items-center gap-1.5 border-t border-gray-100">
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Criar "{query.trim()}"
            </button>
          )}
          {filtered.length === 0 && !query.trim() && (
            <p className="px-3 py-2 text-sm text-gray-400">Digite para buscar ou criar</p>
          )}
        </div>
      )}
    </div>
  )
}
