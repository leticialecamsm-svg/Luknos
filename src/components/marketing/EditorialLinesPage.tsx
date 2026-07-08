'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createEditorialLine, updateEditorialLine, deleteEditorialLine } from '@/lib/actions'
import { MARKETING_POST_TYPE_LABEL, MARKETING_POST_STATUS_LABEL, MarketingPostType } from '@/types'
import { cn, formatDate } from '@/lib/utils'
import { Portal } from '@/components/ui/Portal'
import { PostViewModal } from './PostViewModal'
import { TYPE_ICON } from './PostModal'
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Loader2, Check, X, BookOpen, PieChart as PieIcon, BarChart3, ArrowLeft } from 'lucide-react'

const PALETTE = ['#6366F1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EF4444', '#14B8A6', '#F97316', '#A855F7', '#0EA5E9', '#84CC16']

function monthKeyOf(dateStr: string) { return (dateStr ?? '').slice(0, 7) }

export function EditorialLinesPage({ initialLines, posts }: { initialLines: any[]; posts: any[] }) {
  const router = useRouter()
  const [lines, setLines] = useState(initialLines)
  const [monthOffset, setMonthOffset] = useState(0)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [viewLine, setViewLine] = useState<any | null>(null)

  const now = new Date()
  const monthDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`
  const monthLabel = monthDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const monthPosts = posts.filter(p => p.post_date && monthKeyOf(p.post_date) === monthKey)

  // Contagem por linha editorial (pizza)
  const byLine = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of monthPosts) {
      const key = p.editorial_line_id ?? '__none__'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const rows = lines.map((l, i) => ({ id: l.id, name: l.name, count: counts.get(l.id) ?? 0, color: PALETTE[i % PALETTE.length] }))
    const none = counts.get('__none__') ?? 0
    if (none > 0) rows.push({ id: '__none__', name: 'Sem linha', count: none, color: '#CBD5E1' })
    return rows.filter(r => r.count > 0).sort((a, b) => b.count - a.count)
  }, [monthPosts, lines])

  // Contagem por tipo (barras) — ajuda a equilibrar formatos
  const byType = useMemo(() => {
    return (Object.keys(MARKETING_POST_TYPE_LABEL) as MarketingPostType[]).map(t => ({
      type: t, label: MARKETING_POST_TYPE_LABEL[t], count: monthPosts.filter(p => p.type === t).length,
    }))
  }, [monthPosts])

  const totalMonth = monthPosts.length
  const postedCount = monthPosts.filter(p => p.status === 'posted').length
  const scheduledCount = totalMonth - postedCount

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    const res = await createEditorialLine(newName.trim())
    setCreating(false)
    if (res?.ok && res.data) { setLines(prev => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name))); setNewName('') }
  }
  async function handleUpdate(id: string) {
    if (!editName.trim()) return
    await updateEditorialLine(id, editName.trim())
    setLines(prev => prev.map(l => l.id === id ? { ...l, name: editName.trim() } : l))
    setEditingId(null)
  }
  async function handleDelete(id: string) {
    if (!confirm('Excluir esta linha editorial? Os posts vinculados ficarão sem linha.')) return
    await deleteEditorialLine(id)
    setLines(prev => prev.filter(l => l.id !== id))
    setViewLine(null)
  }

  const countByLineId = (id: string) => monthPosts.filter(p => (p.editorial_line_id ?? '__none__') === id).length

  return (
    <div className="relative space-y-5 overflow-hidden">
      {/* Blobs decorativos desfocados */}
      <div aria-hidden className="pointer-events-none absolute -top-24 -left-16 w-72 h-72 rounded-full bg-brand-300/30 blur-3xl -z-10" />
      <div aria-hidden className="pointer-events-none absolute top-10 right-0 w-72 h-72 rounded-full bg-pink-300/20 blur-3xl -z-10" />
      <div aria-hidden className="pointer-events-none absolute bottom-0 left-1/3 w-72 h-72 rounded-full bg-indigo-300/20 blur-3xl -z-10" />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/marketing" className="text-xs text-brand-600 hover:underline flex items-center gap-1 mb-1"><ArrowLeft className="w-3.5 h-3.5" /> Voltar ao calendário</Link>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><BookOpen className="w-6 h-6 text-brand-500" /> Linhas editoriais</h1>
        </div>
        {/* Passador de mês */}
        <div className="flex items-center gap-1 rounded-xl border border-white/70 bg-white/60 backdrop-blur-md shadow-sm px-1 py-0.5">
          <button onClick={() => setMonthOffset(o => o - 1)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-white/60"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-semibold text-gray-700 capitalize min-w-[130px] text-center">{monthLabel}</span>
          <button onClick={() => setMonthOffset(o => o + 1)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-white/60"><ChevronRight className="w-4 h-4" /></button>
          {monthOffset !== 0 && <button onClick={() => setMonthOffset(0)} className="text-[11px] font-medium text-brand-600 hover:underline px-1.5">Hoje</button>}
        </div>
      </div>

      {/* Stats rápidos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatChip label="Posts no mês" value={totalMonth} color="brand" />
        <StatChip label="Postados" value={postedCount} color="emerald" />
        <StatChip label="Agendados" value={scheduledCount} color="amber" />
        <StatChip label="Linhas ativas" value={lines.length} color="indigo" />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pizza — distribuição por linha editorial */}
        <div className="rounded-2xl border border-white/70 bg-white/60 backdrop-blur-md shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4"><PieIcon className="w-4 h-4 text-brand-500" /> Posts por linha editorial</h3>
          {byLine.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">Nenhum post neste mês</p>
          ) : (
            <div className="flex items-center gap-5">
              <PieChart data={byLine} total={totalMonth} />
              <div className="flex-1 space-y-1.5 min-w-0">
                {byLine.map(r => (
                  <div key={r.id} className="flex items-center gap-2 text-sm">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: r.color }} />
                    <span className="text-gray-700 truncate flex-1">{r.name}</span>
                    <span className="font-semibold text-gray-800">{r.count}</span>
                    <span className="text-xs text-gray-400 w-9 text-right">{Math.round((r.count / totalMonth) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Barras — formatos (tipo) */}
        <div className="rounded-2xl border border-white/70 bg-white/60 backdrop-blur-md shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-brand-500" /> Formatos publicados</h3>
            <span className="text-xs text-gray-400">{postedCount}/{totalMonth} postados</span>
          </div>
          {totalMonth === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">Nenhum post neste mês</p>
          ) : (
            <div className="space-y-3 pt-2">
              {byType.map(t => {
                const Icon = TYPE_ICON[t.type]
                const pct = totalMonth > 0 ? (t.count / totalMonth) * 100 : 0
                return (
                  <div key={t.type}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="flex items-center gap-1.5 text-gray-700"><Icon className="w-4 h-4 text-gray-400" /> {t.label}</span>
                      <span className="font-semibold text-gray-800">{t.count}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Gerenciar linhas editoriais */}
      <div className="rounded-2xl border border-white/70 bg-white/60 backdrop-blur-md shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Gerenciar linhas editoriais</h3>

        {/* Criar */}
        <div className="flex gap-2 mb-4">
          <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="Nome da nova linha editorial" className="input flex-1" />
          <button onClick={handleCreate} disabled={creating || !newName.trim()} className="btn-primary flex items-center gap-2 px-5 disabled:opacity-60">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Criar
          </button>
        </div>

        {/* Lista */}
        <div className="divide-y divide-gray-100">
          {lines.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Nenhuma linha editorial cadastrada</p>}
          {lines.map((l, i) => {
            const count = countByLineId(l.id)
            const color = PALETTE[i % PALETTE.length]
            return (
              <div key={l.id} className="flex items-center gap-3 py-2.5 group">
                {editingId === l.id ? (
                  <>
                    <input value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleUpdate(l.id); if (e.key === 'Escape') setEditingId(null) }}
                      className="input flex-1 py-1.5" autoFocus />
                    <button onClick={() => handleUpdate(l.id)} className="p-1.5 text-emerald-600 hover:text-emerald-700"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                  </>
                ) : (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <button onClick={() => setViewLine(l)} className="flex-1 text-left text-sm font-medium text-gray-800 hover:text-brand-600">{l.name}</button>
                    <span className="text-xs font-medium rounded-full px-2 py-0.5" style={{ color, backgroundColor: `${color}14` }}>{count} no mês</span>
                    <button onClick={() => { setEditingId(l.id); setEditName(l.name) }} className="p-1.5 text-gray-300 hover:text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(l.id)} className="p-1.5 text-gray-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-4 h-4" /></button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {viewLine && (
        <EditorialViewModal line={viewLine} posts={posts}
          onClose={() => setViewLine(null)}
          onEditLine={() => { setEditingId(viewLine.id); setEditName(viewLine.name); setViewLine(null) }}
          onDeleteLine={() => handleDelete(viewLine.id)}
          onChanged={() => router.refresh()} />
      )}
    </div>
  )
}

const STAT_TONES: Record<string, string> = {
  brand:   'text-brand-600',
  emerald: 'text-emerald-600',
  amber:   'text-amber-600',
  indigo:  'text-indigo-600',
}
function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/60 backdrop-blur-md shadow-sm px-4 py-3">
      <p className="text-xs text-gray-400 font-medium">{label}</p>
      <p className={cn('text-2xl font-bold mt-0.5', STAT_TONES[color])}>{value}</p>
    </div>
  )
}

function PieChart({ data, total }: { data: { id: string; count: number; color: string }[]; total: number }) {
  const R = 52, C = 60, stroke = 16
  const circ = 2 * Math.PI * R
  const GAP = data.length > 1 ? 5 : 0 // respiro entre segmentos (px de arco)
  let offset = 0
  return (
    <div className="relative w-36 h-36 shrink-0">
      <svg viewBox="0 0 120 120" className="w-36 h-36 -rotate-90">
        <circle cx={C} cy={C} r={R} fill="none" stroke="#F1F5F9" strokeWidth={stroke} />
        {data.map(d => {
          const frac = d.count / total
          const dash = Math.max(frac * circ - GAP, 1)
          const el = (
            <circle key={d.id} cx={C} cy={C} r={R} fill="none" stroke={d.color} strokeWidth={stroke}
              strokeLinecap="round" strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset} />
          )
          offset += frac * circ
          return el
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-gray-800 leading-none">{total}</span>
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mt-0.5">posts</span>
      </div>
    </div>
  )
}

// Modal: posts de uma linha editorial no mês selecionado + editar/excluir a linha
function EditorialViewModal({ line, posts, onClose, onEditLine, onDeleteLine, onChanged }: {
  line: any; posts: any[]; onClose: () => void; onEditLine: () => void; onDeleteLine: () => void; onChanged: () => void
}) {
  const [monthOffset, setMonthOffset] = useState(0)
  const [viewPost, setViewPost] = useState<any | null>(null)
  const now = new Date()
  const monthDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`
  const monthLabel = monthDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const linePosts = posts.filter(p => p.editorial_line_id === line.id && p.post_date && monthKeyOf(p.post_date) === monthKey)
    .sort((a, b) => String(a.post_date).localeCompare(String(b.post_date)))

  return (
    <>
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="w-5 h-5 text-brand-500 shrink-0" />
            <h2 className="text-base font-semibold text-gray-900 truncate">{line.name}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50 shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Passador de mês */}
          <div className="flex items-center justify-center gap-1">
            <button onClick={() => setMonthOffset(o => o - 1)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-50"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-semibold text-gray-700 capitalize min-w-[130px] text-center">{monthLabel}</span>
            <button onClick={() => setMonthOffset(o => o + 1)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-50"><ChevronRight className="w-4 h-4" /></button>
            {monthOffset !== 0 && <button onClick={() => setMonthOffset(0)} className="text-[11px] font-medium text-brand-600 hover:underline px-1.5">Hoje</button>}
          </div>

          <p className="text-xs text-gray-400">{linePosts.length} post(s) neste mês</p>

          <div className="space-y-2">
            {linePosts.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Nenhum post desta linha no mês</p>}
            {linePosts.map(p => {
              const Icon = TYPE_ICON[p.type as MarketingPostType]
              return (
                <button key={p.id} onClick={() => setViewPost(p)} className="w-full flex items-center gap-3 rounded-xl border border-gray-200 p-3 hover:border-gray-300 text-left">
                  <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-gray-500" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">{MARKETING_POST_TYPE_LABEL[p.type as MarketingPostType]} · {p.post_date ? formatDate(p.post_date) : '—'}</p>
                  </div>
                  <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', p.status === 'posted' ? 'bg-emerald-500' : 'bg-amber-500')}
                    title={MARKETING_POST_STATUS_LABEL[p.status as keyof typeof MARKETING_POST_STATUS_LABEL]} />
                </button>
              )
            })}
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-between">
          <button onClick={onDeleteLine} className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1.5"><Trash2 className="w-4 h-4" /> Excluir linha</button>
          <button onClick={onEditLine} className="btn-primary px-6 flex items-center gap-2"><Pencil className="w-4 h-4" /> Editar linha</button>
        </div>
      </div>
    </div>
    </Portal>
    {viewPost && <PostViewModal post={viewPost} onClose={() => setViewPost(null)} onChanged={onChanged} />}
    </>
  )
}
