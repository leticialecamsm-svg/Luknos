'use client'

import { useState, useEffect } from 'react'
import { getMarketingPostActivities, updateMarketingPostStatus, deleteMarketingPost } from '@/lib/actions'
import { MARKETING_POST_TYPE_LABEL, MARKETING_POST_STATUS_LABEL, MarketingPostType } from '@/types'
import { formatDate, cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import { Portal } from '@/components/ui/Portal'
import { TYPE_ICON } from './PostModal'
import { EditorialTag } from './EditorialTag'
import { X, Pencil, Trash2, Loader2, Clock, ExternalLink, Calendar, BookOpen, Users, Check, ChevronDown } from 'lucide-react'

interface Props {
  post: any
  onClose: () => void
  onEdit?: () => void
  onChanged: () => void
}

export function PostViewModal({ post, onClose, onEdit, onChanged }: Props) {
  const [activities, setActivities] = useState<any[]>([])
  const [loadingAct, setLoadingAct] = useState(true)
  const [expandedHistory, setExpandedHistory] = useState(false)
  const [status, setStatus] = useState(post.status)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getMarketingPostActivities(post.id).then(a => setActivities(a as any[])).finally(() => setLoadingAct(false))
  }, [post.id])

  async function toggleStatus() {
    const next = status === 'posted' ? 'scheduled' : 'posted'
    setBusy(true)
    const res = await updateMarketingPostStatus(post.id, next)
    setBusy(false)
    if (!res?.error) {
      setStatus(next)
      setActivities(prev => [{ id: Math.random(), description: `Status alterado para ${next === 'posted' ? 'Postado' : 'Agendado'}`, created_at: new Date().toISOString(), user: null }, ...prev])
      onChanged()
    }
  }

  async function remove() {
    if (!confirm('Excluir esta postagem? Esta ação não pode ser desfeita.')) return
    setBusy(true)
    await deleteMarketingPost(post.id)
    setBusy(false)
    onChanged()
    onClose()
  }

  const Icon = TYPE_ICON[post.type as MarketingPostType]

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-brand-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900 truncate">{post.name}</h2>
              <p className="text-xs text-gray-500">{MARKETING_POST_TYPE_LABEL[post.type as MarketingPostType]}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50 shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Status + ação rápida */}
          <div className="flex items-center justify-between rounded-xl border border-gray-200 p-3">
            <div className="flex items-center gap-2">
              <span className={cn('w-2.5 h-2.5 rounded-full', status === 'posted' ? 'bg-emerald-500' : 'bg-amber-500')} />
              <span className="text-sm font-semibold text-gray-700">{MARKETING_POST_STATUS_LABEL[status as keyof typeof MARKETING_POST_STATUS_LABEL]}</span>
            </div>
            <button onClick={toggleStatus} disabled={busy}
              className={cn('text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors',
                status === 'posted' ? 'text-amber-700 bg-amber-50 hover:bg-amber-100' : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100')}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {status === 'posted' ? 'Marcar como Agendado' : 'Marcar como Postado'}
            </button>
          </div>

          {/* Infos */}
          {/* Conteúdo (mesma ordem da edição: linha editorial → criativo → roteiro) */}
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase flex items-center gap-1 mb-1"><BookOpen className="w-3 h-3" /> Linha editorial</p>
              {post.editorial_line_name
                ? <EditorialTag name={post.editorial_line_name} color={post.editorial_line_color} />
                : <span className="text-sm text-gray-400">—</span>}
            </div>
            {(post.creative_url || post.roteiro_url) && (
              <div className="flex flex-wrap gap-2">
                {post.creative_url && (
                  <a href={post.creative_url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-brand-600 border border-brand-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5 hover:bg-brand-50">
                    <ExternalLink className="w-3.5 h-3.5" /> Criativo
                  </a>
                )}
                {post.roteiro_url && (
                  <a href={post.roteiro_url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-brand-600 border border-brand-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5 hover:bg-brand-50">
                    <ExternalLink className="w-3.5 h-3.5" /> Roteiro
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <Info icon={Calendar} label="Data de postagem" value={post.post_date ? formatDate(post.post_date) : '—'} />
            <Info icon={Calendar} label="Data de captação" value={post.capture_date ? formatDate(post.capture_date) : '—'} />
          </div>

          {/* Participantes */}
          {(post.participants ?? []).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 mb-2"><Users className="w-3.5 h-3.5" /> Participantes</p>
              <div className="flex flex-wrap gap-1.5">
                {post.participants.map((u: any) => (
                  <span key={u.id} className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border border-gray-200 text-sm text-gray-600">
                    <Avatar user={u} size={20} /> {u.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Histórico — mostra só a última; "Expandir" revela o restante */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Clock className="w-4 h-4" /> Histórico</p>
              {activities.length > 1 && (
                <button onClick={() => setExpandedHistory(v => !v)} className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1">
                  {expandedHistory ? 'Recolher' : `Expandir (${activities.length})`}
                  <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', expandedHistory && 'rotate-180')} />
                </button>
              )}
            </div>
            {loadingAct ? (
              <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-300" /></div>
            ) : activities.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-3">Nenhuma atividade ainda</p>
            ) : (
              <div className="space-y-2">
                {(expandedHistory ? activities : activities.slice(0, 1)).map((a: any) => (
                  <div key={a.id} className="flex gap-2.5 rounded-lg bg-gray-50 border border-gray-100 p-2.5">
                    <div className="shrink-0 mt-0.5">
                      {a.user ? <Avatar user={a.user} size={24} /> : <div className="w-6 h-6 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-xs">🤖</div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-700">{a.description}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {a.user?.name ?? 'Sistema'} · {new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
                {!expandedHistory && activities.length > 1 && (
                  <button onClick={() => setExpandedHistory(true)} className="w-full text-xs text-gray-400 hover:text-gray-600 py-1">
                    + {activities.length - 1} atualização(ões) anterior(es)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer ações */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-between">
          <button onClick={remove} disabled={busy} className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1.5">
            <Trash2 className="w-4 h-4" /> Excluir
          </button>
          {onEdit && (
            <button onClick={onEdit} className="btn-primary px-6 flex items-center gap-2">
              <Pencil className="w-4 h-4" /> Editar
            </button>
          )}
        </div>
      </div>
    </div>
    </Portal>
  )
}

function Info({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase flex items-center gap-1"><Icon className="w-3 h-3" /> {label}</p>
      <p className="text-sm text-gray-700 mt-0.5">{value}</p>
    </div>
  )
}
