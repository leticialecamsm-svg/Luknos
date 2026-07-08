'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MarketingOnboarding, ONBOARDING_KEY } from './MarketingOnboarding'
import { cn, formatDate } from '@/lib/utils'
import { updateMarketingPostDate, getMarketingPosts, getEditorialLines } from '@/lib/actions'
import { MARKETING_POST_TYPE_LABEL, MARKETING_POST_STATUS_LABEL, MarketingPostType } from '@/types'
import { Avatar } from '@/components/ui/Avatar'
import { PostModal, TYPE_ICON } from './PostModal'
import { PostViewModal } from './PostViewModal'
import { EditorialTag } from './EditorialTag'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Plus, Megaphone, Camera, BookOpen } from 'lucide-react'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const TYPE_COLOR: Record<MarketingPostType, string> = {
  story:    'bg-purple-50 text-purple-700 border-purple-200',
  reels:    'bg-pink-50 text-pink-700 border-pink-200',
  carousel: 'bg-blue-50 text-blue-700 border-blue-200',
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function MarketingWorkspace({ initialPosts, editorialLines: initialLines, users }: {
  initialPosts: any[]; editorialLines: any[]; users: any[]
}) {
  const router = useRouter()
  const [posts, setPosts] = useState(initialPosts)
  const [editorialLines, setEditorialLines] = useState(initialLines)
  const [view, setView] = useState<'month' | 'week'>('month')
  const [refDate, setRefDate] = useState(new Date())
  const [viewPost, setViewPost] = useState<any | null>(null)     // modal de visualização
  const [editPost, setEditPost] = useState<any | null>(null)      // modal de edição/criação
  const [modalDate, setModalDate] = useState<string | undefined>()
  const [showEdit, setShowEdit] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [showTour, setShowTour] = useState(false)
  const searchParams = useSearchParams()

  useEffect(() => { setPosts(initialPosts) }, [initialPosts])

  // Abre o tutorial na 1ª visita ou quando vier ?tour=1 (botão Tutorial na sidebar)
  useEffect(() => {
    const forced = searchParams.get('tour') === '1'
    const done = typeof window !== 'undefined' && localStorage.getItem(ONBOARDING_KEY) === '1'
    if (forced || !done) setShowTour(true)
  }, [searchParams])
  useEffect(() => { setEditorialLines(initialLines) }, [initialLines])

  // Dados frescos ao montar — evita listas velhas do cache do router ao voltar de outra página
  useEffect(() => {
    let alive = true
    Promise.all([getMarketingPosts(), getEditorialLines()]).then(([ps, ls]) => {
      if (!alive) return
      setPosts(ps as any[]); setEditorialLines(ls as any[])
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  const postsByDay = new Map<string, any[]>()
  for (const p of posts) {
    if (!p.post_date) continue
    const key = p.post_date.slice(0, 10)
    if (!postsByDay.has(key)) postsByDay.set(key, [])
    postsByDay.get(key)!.push(p)
  }

  function openCreate(date?: string) { setEditPost(null); setModalDate(date); setShowEdit(true) }
  function openView(post: any) { setViewPost(post) }

  // Arrastar post para outro dia → atualiza a data de postagem
  async function movePost(postId: string, newDate: string) {
    const post = posts.find(p => p.id === postId)
    if (!post || (post.post_date ?? '').slice(0, 10) === newDate) return
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, post_date: newDate } : p)) // otimista
    await updateMarketingPostDate(postId, newDate)
    router.refresh()
  }
  function openEditFromView() { setEditPost(viewPost); setModalDate(undefined); setViewPost(null); setShowEdit(true) }
  function afterSave() { setShowEdit(false); router.refresh() }
  function afterChange() { router.refresh() }

  function navigate(delta: number) {
    const d = new Date(refDate)
    if (view === 'month') d.setMonth(d.getMonth() + delta)
    else d.setDate(d.getDate() + delta * 7)
    setRefDate(d)
  }

  const periodLabel = view === 'month'
    ? refDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : (() => { const { days } = getWeek(refDate); const a = days[0], b = days[6]; return `${a.getDate()}/${a.getMonth() + 1} – ${b.getDate()}/${b.getMonth() + 1}` })()

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2"><Megaphone className="w-5 h-5 text-brand-500" /> Marketing</h1>
          <p className="text-sm text-gray-400 mt-0.5">Planejamento de postagens</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/marketing/editorial" data-tour="editorial-lines" className="btn-secondary flex items-center gap-2"><BookOpen className="w-4 h-4" /> Linhas editoriais</Link>
          <div data-tour="view-toggle" className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button onClick={() => setView('month')} className={cn('px-3 py-1.5 text-sm font-medium', view === 'month' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600')}>Mês</button>
            <button onClick={() => setView('week')} className={cn('px-3 py-1.5 text-sm font-medium', view === 'week' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600')}>Semana</button>
          </div>
          <button onClick={() => openCreate()} data-tour="new-post" className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Nova postagem</button>
        </div>
      </div>

      <div data-tour="period-nav" className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><ChevronLeft className="w-5 h-5" /></button>
        <span className="text-base font-semibold text-gray-800 capitalize min-w-[180px] text-center">{periodLabel}</span>
        <button onClick={() => navigate(1)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><ChevronRight className="w-5 h-5" /></button>
        <button onClick={() => setRefDate(new Date())} className="text-xs font-medium text-brand-600 hover:underline ml-1">Hoje</button>
      </div>

      <div data-tour="calendar">
      {view === 'month'
        ? <MonthGrid refDate={refDate} postsByDay={postsByDay} onDayClick={openCreate} onPostClick={openView} onMovePost={movePost} draggingId={draggingId} setDraggingId={setDraggingId} />
        : <WeekGrid refDate={refDate} postsByDay={postsByDay} onDayClick={openCreate} onPostClick={openView} onMovePost={movePost} draggingId={draggingId} setDraggingId={setDraggingId} />}
      </div>

      {viewPost && (
        <PostViewModal post={viewPost} onClose={() => setViewPost(null)} onEdit={openEditFromView} onChanged={afterChange} />
      )}

      {showTour && <MarketingOnboarding onClose={() => { setShowTour(false); if (searchParams.get('tour')) router.replace('/marketing') }} />}

      {showEdit && (
        <PostModal post={editPost} defaultDate={modalDate} editorialLines={editorialLines} users={users}
          onClose={() => setShowEdit(false)} onSaved={afterSave}
          onEditorialLineCreated={line => setEditorialLines(prev => [...prev, line].sort((a, b) => a.name.localeCompare(b.name)))} />
      )}
    </div>
  )
}

function getWeek(refDate: Date) {
  const start = new Date(refDate)
  start.setDate(start.getDate() - start.getDay())
  const days = Array.from({ length: 7 }).map((_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  return { days }
}

// Card de postagem — usado no mês e na semana. Mostra: tipo, data captação, linha editorial, participantes, status
function PostCard({ post, onClick, onDragStart, onDragEnd, dragging }: {
  post: any; onClick: () => void; onDragStart?: () => void; onDragEnd?: () => void; dragging?: boolean
}) {
  const Icon = TYPE_ICON[post.type as MarketingPostType]
  return (
    <div
      draggable
      onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('postId', post.id); e.dataTransfer.effectAllowed = 'move'; onDragStart?.() }}
      onDragEnd={() => onDragEnd?.()}
      onClick={e => { e.stopPropagation(); onClick() }}
      role="button"
      className={cn('w-full text-left rounded-lg border p-1.5 space-y-1 cursor-grab active:cursor-grabbing transition-opacity', TYPE_COLOR[post.type as MarketingPostType], dragging && 'opacity-40')}>
      <div className="flex items-center gap-1">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[11px] font-semibold truncate flex-1">{post.name}</span>
        <span className={cn('w-2 h-2 rounded-full shrink-0', post.status === 'posted' ? 'bg-emerald-500' : 'bg-amber-500')}
          title={MARKETING_POST_STATUS_LABEL[post.status as keyof typeof MARKETING_POST_STATUS_LABEL]} />
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
        <span className="font-medium">{MARKETING_POST_TYPE_LABEL[post.type as MarketingPostType]}</span>
        {post.capture_date && <span className="flex items-center gap-0.5"><Camera className="w-2.5 h-2.5" /> {formatDate(post.capture_date).slice(0, 5)}</span>}
      </div>
      {post.editorial_line_name && <EditorialTag name={post.editorial_line_name} color={post.editorial_line_color} size="sm" />}
      {(post.participants ?? []).length > 0 && (
        <div className="flex -space-x-1">
          {post.participants.slice(0, 4).map((u: any) => <Avatar key={u.id} user={u} size={16} className="ring-1 ring-white" />)}
        </div>
      )}
    </div>
  )
}

type GridProps = {
  refDate: Date; postsByDay: Map<string, any[]>; onDayClick: (date: string) => void; onPostClick: (post: any) => void
  onMovePost: (postId: string, date: string) => void; draggingId: string | null; setDraggingId: (id: string | null) => void
}

function MonthGrid({ refDate, postsByDay, onDayClick, onPostClick, onMovePost, draggingId, setDraggingId }: GridProps) {
  const year = refDate.getFullYear(); const month = refDate.getMonth()
  const first = new Date(year, month, 1)
  const gridStart = new Date(first); gridStart.setDate(first.getDate() - first.getDay())
  const todayStr = ymd(new Date())
  const cells = Array.from({ length: 42 }).map((_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d })

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
        {WEEKDAYS.map(w => <div key={w} className="px-2 py-2 text-xs font-bold text-gray-500 text-center">{w}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const key = ymd(d); const inMonth = d.getMonth() === month; const dayPosts = postsByDay.get(key) ?? []
          return (
            <div key={i} onClick={() => onDayClick(key)}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
              onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('postId'); if (id) onMovePost(id, key); setDraggingId(null) }}
              className={cn('min-h-[130px] border-b border-r border-gray-100 p-1.5 cursor-pointer transition-colors flex flex-col gap-1',
                draggingId ? 'hover:bg-brand-50/60' : 'hover:bg-gray-50/70',
                !inMonth && 'bg-gray-50/40', i % 7 === 6 && 'border-r-0')}>
              <span className={cn('text-xs font-medium self-start px-1',
                key === todayStr ? 'bg-brand-600 text-white rounded-full w-5 h-5 flex items-center justify-center' : inMonth ? 'text-gray-600' : 'text-gray-300')}>
                {d.getDate()}
              </span>
              {dayPosts.slice(0, 2).map(p => <PostCard key={p.id} post={p} onClick={() => onPostClick(p)} onDragStart={() => setDraggingId(p.id)} onDragEnd={() => setDraggingId(null)} dragging={draggingId === p.id} />)}
              {dayPosts.length > 2 && <span className="text-[10px] text-gray-400 px-1">+{dayPosts.length - 2} mais</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekGrid({ refDate, postsByDay, onDayClick, onPostClick, onMovePost, draggingId, setDraggingId }: GridProps) {
  const { days } = getWeek(refDate); const todayStr = ymd(new Date())
  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
      {days.map(d => {
        const key = ymd(d); const dayPosts = postsByDay.get(key) ?? []
        return (
          <div key={key} onClick={() => onDayClick(key)}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
            onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('postId'); if (id) onMovePost(id, key); setDraggingId(null) }}
            className={cn('rounded-xl border bg-white p-2.5 min-h-[240px] cursor-pointer transition-colors flex flex-col gap-2',
              draggingId ? 'border-brand-300 bg-brand-50/40' : 'border-gray-200 hover:border-gray-300')}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500">{WEEKDAYS[d.getDay()]}</span>
              <span className={cn('text-xs font-semibold', key === todayStr ? 'bg-brand-600 text-white rounded-full w-5 h-5 flex items-center justify-center' : 'text-gray-600')}>{d.getDate()}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {dayPosts.map(p => <PostCard key={p.id} post={p} onClick={() => onPostClick(p)} onDragStart={() => setDraggingId(p.id)} onDragEnd={() => setDraggingId(null)} dragging={draggingId === p.id} />)}
              {dayPosts.length === 0 && <span className="text-[11px] text-gray-300">—</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
