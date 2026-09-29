'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowUp, ArrowDown, Plus, Pencil, Trash2, Eye, EyeOff, UserPlus, X, Check, CheckCircle2, Circle } from 'lucide-react'
import {
  savePolicyDocument, setPolicyPublished, deletePolicyDocument, saveTopic, deleteTopic, moveTopic,
  assignUsers, removeAssignment, type AdminPolicyDetail, type AdminTopic,
} from '@/lib/policies/actions'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/useConfirm'
import { cn } from '@/lib/utils'

type User = { id: string; name: string; role: string }
const fmtDateTime = (v: string) => new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function PolicyEditor({ detail, users }: { detail: AdminPolicyDetail; users: User[] }) {
  const router = useRouter()
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [pending, start] = useTransition()
  const d = detail.document
  const [meta, setMeta] = useState({ title: d.title, description: d.description ?? '' })
  const [topicForm, setTopicForm] = useState<{ topic: AdminTopic | null } | null>(null)

  function run(fn: () => Promise<{ error?: string }>, ok?: string) {
    start(async () => {
      const res = await fn()
      if (res.error) return toast.error('Não foi possível concluir', res.error)
      if (ok) toast.success(ok)
      router.refresh()
    })
  }

  async function confirmRun(msg: string, label: string, fn: () => Promise<{ error?: string }>, ok?: string) {
    if (await confirm(msg, label)) run(fn, ok)
  }

  return (
    <div className="space-y-8">
      {ConfirmDialog}
      <div>
        <Link href="/politicas/gestao" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-2"><ArrowLeft className="w-4 h-4" /> Gestão de políticas</Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-gray-900">{d.title}</h1>
          <div className="flex items-center gap-2">
            <span className={cn('badge', d.is_published ? 'bg-green-50 text-green-700' : 'bg-surface-secondary text-gray-500')}>{d.is_published ? 'Publicada' : 'Rascunho'}</span>
            <button className="btn-secondary" disabled={pending}
              onClick={() => run(() => setPolicyPublished(d.id, !d.is_published), d.is_published ? 'Despublicada' : 'Publicada')}>
              {d.is_published ? <><EyeOff className="w-4 h-4" /> Despublicar</> : <><Eye className="w-4 h-4" /> Publicar</>}
            </button>
          </div>
        </div>
        {!d.is_published && <p className="text-xs text-amber-700 mt-2">Rascunho: os colaboradores atribuídos só enxergam depois de publicada.</p>}
      </div>

      <section className="card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Dados do documento</h2>
        <div><label className="label">Título</label><input className="input" value={meta.title} onChange={e => setMeta({ ...meta, title: e.target.value })} /></div>
        <div><label className="label">Descrição</label><input className="input" value={meta.description} onChange={e => setMeta({ ...meta, description: e.target.value })} /></div>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={pending}
            onClick={() => run(() => savePolicyDocument({ id: d.id, title: meta.title, description: meta.description }), 'Salvo')}>Salvar</button>
          <button className="btn-ghost text-red-600" disabled={pending}
            onClick={() => confirmRun(`Excluir "${d.title}" com todos os tópicos e assinaturas registradas?`, 'Sim, excluir',
              async () => { const r = await deletePolicyDocument(d.id); if (!r.error) router.push('/politicas/gestao'); return r })}>
            <Trash2 className="w-4 h-4" /> Excluir documento
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Tópicos <span className="font-normal text-gray-400">· {detail.topics.length}</span></h2>
        {detail.topics.length === 0 && <p className="text-sm text-gray-400">Nenhum tópico ainda. Cada tópico é lido e assinado separadamente pelo colaborador.</p>}
        <div className="space-y-2">
          {detail.topics.map((t, i) => (
            <div key={t.id} className="card overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-xs font-bold text-gray-400 w-6">{i + 1}</span>
                <p className="flex-1 text-sm font-semibold text-gray-900 truncate">{t.title}</p>
                <IconBtn title="Subir" disabled={pending || i === 0} onClick={() => run(() => moveTopic(t.id, d.id, -1))}><ArrowUp className="w-4 h-4" /></IconBtn>
                <IconBtn title="Descer" disabled={pending || i === detail.topics.length - 1} onClick={() => run(() => moveTopic(t.id, d.id, 1))}><ArrowDown className="w-4 h-4" /></IconBtn>
                <IconBtn title="Editar" onClick={() => setTopicForm({ topic: t })}><Pencil className="w-4 h-4" /></IconBtn>
                <IconBtn title="Excluir" danger onClick={() => confirmRun(`Excluir o tópico "${t.title}"? As assinaturas já registradas dele também somem.`, 'Sim, excluir', () => deleteTopic(t.id))}><Trash2 className="w-4 h-4" /></IconBtn>
              </div>
            </div>
          ))}
        </div>

        {topicForm ? (
          <TopicForm documentId={d.id} topic={topicForm.topic} onDone={() => { setTopicForm(null); router.refresh() }} onCancel={() => setTopicForm(null)} />
        ) : (
          <button onClick={() => setTopicForm({ topic: null })} className="btn-secondary"><Plus className="w-4 h-4" /> Adicionar tópico</button>
        )}
      </section>

      <Assignments detail={detail} users={users} run={run} confirmRun={confirmRun} pending={pending} />
    </div>
  )
}

function IconBtn({ children, title, onClick, disabled, danger }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled}
      className={cn('p-1.5 rounded-md text-gray-400 transition-colors disabled:opacity-30', danger ? 'hover:text-red-600 hover:bg-red-50' : 'hover:text-gray-700 hover:bg-white')}>
      {children}
    </button>
  )
}

function TopicForm({ documentId, topic, onDone, onCancel }: { documentId: string; topic: AdminTopic | null; onDone: () => void; onCancel: () => void }) {
  const toast = useToast()
  const [pending, start] = useTransition()
  const [f, setF] = useState({ title: topic?.title ?? '', body: topic?.body ?? '' })

  function submit() {
    start(async () => {
      const res = await saveTopic({ id: topic?.id, documentId, title: f.title, body: f.body })
      if (res.error) return toast.error('Não foi possível salvar', res.error)
      toast.success(topic ? 'Tópico atualizado' : 'Tópico criado')
      onDone()
    })
  }

  return (
    <div className="card p-4 space-y-3">
      <div><label className="label">Título do tópico</label><input className="input" autoFocus value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></div>
      <div>
        <label className="label">Texto (o que o colaborador lê e assina)</label>
        <textarea className="w-full px-3 py-2 bg-white border border-surface-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" rows={8} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={pending} onClick={submit}>{topic ? 'Salvar tópico' : 'Criar tópico'}</button>
        <button className="btn-ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

function Assignments({ detail, users, run, confirmRun, pending }: {
  detail: AdminPolicyDetail; users: User[]
  run: (fn: () => Promise<{ error?: string }>, ok?: string) => void
  confirmRun: (msg: string, label: string, fn: () => Promise<{ error?: string }>, ok?: string) => Promise<void>
  pending: boolean
}) {
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const assignedIds = new Set(detail.signers.map(s => s.userId))
  const available = users.filter(u => !assignedIds.has(u.id))

  function toggle(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  function submitAssign() {
    if (!selected.length) return toast.error('Selecione ao menos um colaborador')
    run(async () => {
      const res = await assignUsers({ documentId: detail.document.id, userIds: selected })
      if (!res.error) { setSelected([]); setAdding(false) }
      return res
    }, 'Colaboradores liberados')
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Liberado para <span className="font-normal text-gray-400">· {detail.signers.length} colaboradores</span></h2>
        {!adding && <button className="btn-secondary" onClick={() => setAdding(true)}><UserPlus className="w-4 h-4" /> Liberar para colaboradores</button>}
      </div>

      {adding && (
        <div className="card p-4 space-y-3">
          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
            {available.length === 0 && <p className="text-sm text-gray-400">Todos os colaboradores ativos já têm acesso.</p>}
            {available.map(u => (
              <button key={u.id} type="button" onClick={() => toggle(u.id)}
                className={cn('px-3 py-1.5 rounded-full text-sm border transition-colors', selected.includes(u.id) ? 'bg-brand-500 border-brand-500 text-white' : 'border-surface-border text-gray-600 hover:bg-surface-secondary')}>
                {u.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={pending || !selected.length} onClick={submitAssign}>Liberar {selected.length > 0 ? `(${selected.length})` : ''}</button>
            <button className="btn-ghost" onClick={() => { setAdding(false); setSelected([]) }}>Cancelar</button>
          </div>
        </div>
      )}

      {detail.signers.length > 0 && detail.topics.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-secondary text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2.5 sticky left-0 bg-surface-secondary">Colaborador</th>
                {detail.topics.map((t, i) => <th key={t.id} className="px-3 py-2.5 text-center whitespace-nowrap" title={t.title}>Tópico {i + 1}</th>)}
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {detail.signers.map(s => (
                <tr key={s.userId} className="border-b border-surface-border last:border-0">
                  <td className="px-4 py-2.5 sticky left-0 bg-white">
                    <p className="font-medium text-gray-800">{s.name}</p>
                    <p className={cn('text-xs mt-0.5', s.fullySigned ? 'text-green-600' : 'text-gray-400')}>{s.fullySigned ? 'Assinatura completa' : `${s.topicsSigned}/${s.topicsTotal} assinados`}</p>
                  </td>
                  {detail.topics.map(t => {
                    const at = s.signatures[t.id]
                    return (
                      <td key={t.id} className="px-3 py-2.5 text-center" title={at ? fmtDateTime(at) : 'Ainda não assinou'}>
                        {at ? <CheckCircle2 className="w-4 h-4 text-green-600 inline" /> : <Circle className="w-4 h-4 text-gray-200 inline" />}
                      </td>
                    )
                  })}
                  <td className="px-4 py-2.5 text-right">
                    <IconBtn title="Remover acesso" danger onClick={() => confirmRun(`Remover "${s.name}" desta política? As assinaturas registradas dele também somem.`, 'Sim, remover', () => removeAssignment(detail.document.id, s.userId))}><X className="w-4 h-4" /></IconBtn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
