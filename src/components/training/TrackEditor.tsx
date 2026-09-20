'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowUp, ArrowDown, Plus, Pencil, Trash2, Eye, EyeOff, Upload, UserPlus, X, Check } from 'lucide-react'
import {
  saveTrack, setTrackPublished, deleteTrack, saveModule, deleteModule, moveModule, moveLesson, saveLesson, deleteLesson,
  assignUsers, updateAssignment, removeAssignment, type AdminTrackDetail, type AdminAssignment,
} from '@/lib/training/actions'
import { uploadTrainingFile } from '@/lib/training/upload'
import { LESSON_KIND_LABEL } from '@/lib/training/embed'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/useConfirm'
import { ProgressBar, KIND_ICON, fmtDate, fmtMin } from './ui'
import { cn } from '@/lib/utils'

type Lesson = AdminTrackDetail['modules'][number]['lessons'][number]
type User = { id: string; name: string; role: string }

export function TrackEditor({ detail, users }: { detail: AdminTrackDetail; users: User[] }) {
  const router = useRouter()
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [pending, start] = useTransition()
  const t = detail.track
  const [meta, setMeta] = useState({ emoji: t.emoji, title: t.title, description: t.description ?? '', days: t.target_days ? String(t.target_days) : '' })
  const [newModule, setNewModule] = useState('')
  const [editingModule, setEditingModule] = useState<string | null>(null)
  const [moduleTitle, setModuleTitle] = useState('')
  const [lessonForm, setLessonForm] = useState<{ moduleId: string; lesson: Lesson | null } | null>(null)

  // Executa uma action, mostra erro em toast e recarrega os dados do servidor.
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

  const totalLessons = detail.modules.reduce((s, m) => s + m.lessons.length, 0)

  return (
    <div className="space-y-8">
      {ConfirmDialog}
      <div>
        <Link href="/treinamento/gestao" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-2"><ArrowLeft className="w-4 h-4" /> Gestão de treinamentos</Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-gray-900">{t.emoji} {t.title}</h1>
          <div className="flex items-center gap-2">
            <span className={cn('badge', t.is_published ? 'bg-green-50 text-green-700' : 'bg-surface-secondary text-gray-500')}>{t.is_published ? 'Publicada' : 'Rascunho'}</span>
            <button className="btn-secondary" disabled={pending}
              onClick={() => run(() => setTrackPublished(t.id, !t.is_published), t.is_published ? 'Trilha despublicada' : 'Trilha publicada')}>
              {t.is_published ? <><EyeOff className="w-4 h-4" /> Despublicar</> : <><Eye className="w-4 h-4" /> Publicar</>}
            </button>
          </div>
        </div>
        {!t.is_published && <p className="text-xs text-amber-700 mt-2">Rascunho: os colaboradores só enxergam a trilha depois de publicada.</p>}
      </div>

      {/* Dados da trilha */}
      <section className="card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Dados da trilha</h2>
        <div className="flex flex-wrap gap-3">
          <div className="w-20"><label className="label">Ícone</label><input className="input text-center" maxLength={4} value={meta.emoji} onChange={e => setMeta({ ...meta, emoji: e.target.value })} /></div>
          <div className="flex-1 min-w-[220px]"><label className="label">Nome</label><input className="input" value={meta.title} onChange={e => setMeta({ ...meta, title: e.target.value })} /></div>
          <div className="w-40"><label className="label">Prazo padrão (dias)</label><input className="input" type="number" min={1} value={meta.days} onChange={e => setMeta({ ...meta, days: e.target.value })} /></div>
        </div>
        <div><label className="label">Descrição</label><input className="input" value={meta.description} onChange={e => setMeta({ ...meta, description: e.target.value })} /></div>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={pending}
            onClick={() => run(() => saveTrack({ id: t.id, title: meta.title, emoji: meta.emoji, description: meta.description, target_days: meta.days ? Number(meta.days) : null }), 'Trilha salva')}>Salvar</button>
          <button className="btn-ghost text-red-600" disabled={pending}
            onClick={() => confirmRun(`Excluir a trilha "${t.title}" com todos os módulos, aulas e o progresso dos colaboradores?`, 'Sim, excluir',
              async () => { const r = await deleteTrack(t.id); if (!r.error) router.push('/treinamento/gestao'); return r })}>
            <Trash2 className="w-4 h-4" /> Excluir trilha
          </button>
        </div>
      </section>

      {/* Conteúdo */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Conteúdo <span className="font-normal text-gray-400">· {detail.modules.length} módulos, {totalLessons} aulas</span></h2>

        {detail.modules.map((m, mi) => (
          <div key={m.id} className="card overflow-hidden">
            <div className="px-4 py-3 bg-surface-secondary border-b border-surface-border flex items-center gap-2">
              {editingModule === m.id ? (
                <>
                  <input className="input flex-1" autoFocus value={moduleTitle} onChange={e => setModuleTitle(e.target.value)} />
                  <button className="btn-primary" disabled={pending} onClick={() => { run(() => saveModule({ id: m.id, trackId: t.id, title: moduleTitle }), 'Módulo renomeado'); setEditingModule(null) }}><Check className="w-4 h-4" /></button>
                  <button className="btn-ghost" onClick={() => setEditingModule(null)}><X className="w-4 h-4" /></button>
                </>
              ) : (
                <>
                  <span className="text-xs font-bold text-gray-400 w-6">{mi + 1}</span>
                  <p className="flex-1 text-sm font-semibold text-gray-900">{m.title}</p>
                  <IconBtn title="Subir" disabled={pending || mi === 0} onClick={() => run(() => moveModule(m.id, t.id, -1))}><ArrowUp className="w-4 h-4" /></IconBtn>
                  <IconBtn title="Descer" disabled={pending || mi === detail.modules.length - 1} onClick={() => run(() => moveModule(m.id, t.id, 1))}><ArrowDown className="w-4 h-4" /></IconBtn>
                  <IconBtn title="Renomear" onClick={() => { setEditingModule(m.id); setModuleTitle(m.title) }}><Pencil className="w-4 h-4" /></IconBtn>
                  <IconBtn title="Excluir módulo" danger onClick={() => confirmRun(`Excluir o módulo "${m.title}" e suas ${m.lessons.length} aulas?`, 'Sim, excluir', () => deleteModule(m.id))}><Trash2 className="w-4 h-4" /></IconBtn>
                </>
              )}
            </div>

            <ul>
              {m.lessons.map((l, li) => {
                const Icon = KIND_ICON[l.kind] ?? KIND_ICON.text
                return (
                  <li key={l.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-surface-border last:border-0">
                    <Icon className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="flex-1 min-w-0 text-sm text-gray-800 truncate">{l.title}</span>
                    <span className="hidden sm:inline text-xs text-gray-400">{LESSON_KIND_LABEL[l.kind]} · {fmtMin(l.duration_min)} · {l.xp} XP</span>
                    <IconBtn title="Subir" disabled={pending || li === 0} onClick={() => run(() => moveLesson(l.id, m.id, -1))}><ArrowUp className="w-3.5 h-3.5" /></IconBtn>
                    <IconBtn title="Descer" disabled={pending || li === m.lessons.length - 1} onClick={() => run(() => moveLesson(l.id, m.id, 1))}><ArrowDown className="w-3.5 h-3.5" /></IconBtn>
                    <IconBtn title="Editar" onClick={() => setLessonForm({ moduleId: m.id, lesson: l })}><Pencil className="w-3.5 h-3.5" /></IconBtn>
                    <IconBtn title="Excluir" danger onClick={() => confirmRun(`Excluir a aula "${l.title}"?`, 'Sim, excluir', () => deleteLesson(l.id))}><Trash2 className="w-3.5 h-3.5" /></IconBtn>
                  </li>
                )
              })}
            </ul>

            {lessonForm?.moduleId === m.id ? (
              <LessonForm key={lessonForm.lesson?.id ?? 'new'} trackId={t.id} moduleId={m.id} lesson={lessonForm.lesson}
                onDone={() => { setLessonForm(null); router.refresh() }} onCancel={() => setLessonForm(null)} />
            ) : (
              <button onClick={() => setLessonForm({ moduleId: m.id, lesson: null })} className="w-full px-4 py-2.5 text-left text-sm text-brand-600 font-medium hover:bg-surface-secondary flex items-center gap-2">
                <Plus className="w-4 h-4" /> Adicionar aula
              </button>
            )}
          </div>
        ))}

        <div className="flex gap-2">
          <input className="input max-w-sm" placeholder="Novo módulo (ex: Conhecendo os produtos)" value={newModule} onChange={e => setNewModule(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newModule.trim()) { run(() => saveModule({ trackId: t.id, title: newModule }), 'Módulo criado'); setNewModule('') } }} />
          <button className="btn-secondary" disabled={pending || !newModule.trim()} onClick={() => { run(() => saveModule({ trackId: t.id, title: newModule }), 'Módulo criado'); setNewModule('') }}><Plus className="w-4 h-4" /> Módulo</button>
        </div>
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

// ─── Formulário de aula ──────────────────────────────────────────────────

function LessonForm({ trackId, moduleId, lesson, onDone, onCancel }: { trackId: string; moduleId: string; lesson: Lesson | null; onDone: () => void; onCancel: () => void }) {
  const toast = useToast()
  const [pending, start] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [f, setF] = useState({
    title: lesson?.title ?? '', kind: lesson?.kind ?? 'youtube', body: lesson?.body ?? '', url: lesson?.url ?? '',
    file_path: lesson?.file_path ?? null as string | null, file_name: lesson?.file_name ?? null as string | null,
    duration: String(lesson?.duration_min ?? 5), xp: String(lesson?.xp ?? 10),
  })
  const needsFile = f.kind === 'pdf' || f.kind === 'image'
  const needsUrl = f.kind === 'youtube' || f.kind === 'drive' || f.kind === 'link'

  async function onFile(file: File) {
    setUploading(true)
    const res = await uploadTrainingFile(trackId, file)
    setUploading(false)
    if (res.error) return toast.error('Falha no envio', res.error)
    setF(p => ({ ...p, file_path: res.path!, file_name: res.name!, title: p.title || file.name.replace(/\.[^.]+$/, '') }))
  }

  function submit() {
    start(async () => {
      const res = await saveLesson({
        id: lesson?.id, moduleId, title: f.title, kind: f.kind, body: f.body, url: f.url,
        file_path: needsFile ? f.file_path : null, file_name: needsFile ? f.file_name : null,
        duration_min: Number(f.duration) || 5, xp: Number(f.xp) || 0,
      })
      if (res.error) return toast.error('Não foi possível salvar a aula', res.error)
      toast.success(lesson ? 'Aula atualizada' : 'Aula criada')
      onDone()
    })
  }

  const help: Record<string, string> = {
    youtube: 'Cole o link do vídeo (youtube.com/watch?v=… ou youtu.be/…).',
    drive: 'No Drive: botão direito no arquivo → Compartilhar → "Qualquer pessoa com o link" (ou compartilhe com a equipe) → copie o link. Serve para vídeos, PDFs, documentos e apresentações.',
    link: 'Abre em uma nova aba (o site precisa permitir; por isso não é exibido dentro da página).',
  }

  return (
    <div className="p-4 bg-surface-secondary/60 border-t border-surface-border space-y-3">
      <div className="flex flex-wrap gap-3">
        <div className="w-48">
          <label className="label">Tipo de conteúdo</label>
          <select className="select" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>
            {Object.entries(LESSON_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[220px]"><label className="label">Título da aula</label><input className="input" autoFocus value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></div>
        <div className="w-24"><label className="label">Duração (min)</label><input className="input" type="number" min={1} value={f.duration} onChange={e => setF({ ...f, duration: e.target.value })} /></div>
        <div className="w-20"><label className="label">XP</label><input className="input" type="number" min={0} value={f.xp} onChange={e => setF({ ...f, xp: e.target.value })} /></div>
      </div>

      {needsUrl && (
        <div>
          <label className="label">Link</label>
          <input className="input" placeholder="https://…" value={f.url} onChange={e => setF({ ...f, url: e.target.value })} />
          <p className="text-xs text-gray-400 mt-1">{help[f.kind]}</p>
        </div>
      )}

      {needsFile && (
        <div>
          <label className="label">{f.kind === 'pdf' ? 'Arquivo PDF' : 'Imagem'} (até 50 MB)</label>
          <label className="btn-secondary cursor-pointer">
            <Upload className="w-4 h-4" /> {uploading ? 'Enviando…' : f.file_name ? 'Trocar arquivo' : 'Escolher arquivo'}
            <input type="file" className="hidden" disabled={uploading} accept={f.kind === 'pdf' ? 'application/pdf' : 'image/*'} onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          {f.file_name && <span className="ml-3 text-sm text-gray-600">{f.file_name}</span>}
          <div className="mt-2">
            <label className="label">…ou cole um link do Google Drive (opcional)</label>
            <input className="input" placeholder="https://drive.google.com/file/d/…" value={f.url} onChange={e => setF({ ...f, url: e.target.value })} />
          </div>
        </div>
      )}

      <div>
        <label className="label">{f.kind === 'text' ? 'Texto da aula' : 'Texto de apoio (opcional)'}</label>
        <textarea className="w-full px-3 py-2 bg-white border border-surface-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500" rows={f.kind === 'text' ? 8 : 3} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} />
      </div>

      <div className="flex gap-2">
        <button className="btn-primary" disabled={pending || uploading} onClick={submit}>{lesson ? 'Salvar aula' : 'Criar aula'}</button>
        <button className="btn-ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── Liberação por colaborador ───────────────────────────────────────────

function Assignments({ detail, users, run, confirmRun, pending }: {
  detail: AdminTrackDetail; users: User[]
  run: (fn: () => Promise<{ error?: string }>, ok?: string) => void
  confirmRun: (msg: string, label: string, fn: () => Promise<{ error?: string }>, ok?: string) => Promise<void>
  pending: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [due, setDue] = useState('')
  const [allMods, setAllMods] = useState(true)
  const [mods, setMods] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<AdminAssignment | null>(null)
  const toast = useToast()
  const assignedIds = new Set(detail.assignments.map(a => a.user_id))
  const available = users.filter(u => !assignedIds.has(u.id))
  const toggle = (set: Set<string>, id: string) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); return n }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-700">Quem tem acesso <span className="font-normal text-gray-400">· {detail.assignments.length} colaborador{detail.assignments.length === 1 ? '' : 'es'}</span></h2>
        {!adding && <button className="btn-primary" onClick={() => setAdding(true)}><UserPlus className="w-4 h-4" /> Liberar para colaboradores</button>}
      </div>

      {adding && (
        <div className="card p-4 space-y-4">
          <div>
            <label className="label">Colaboradores</label>
            {available.length === 0 ? <p className="text-sm text-gray-400">Todos os colaboradores ativos já têm acesso.</p> : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {available.map(u => (
                  <label key={u.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-surface-secondary cursor-pointer">
                    <input type="checkbox" className="accent-brand-500" checked={picked.has(u.id)} onChange={() => setPicked(toggle(picked, u.id))} /> {u.name}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-4">
            <div><label className="label">Prazo final</label><input type="date" className="input" value={due} onChange={e => setDue(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">Vazio = usa o prazo padrão da trilha{detail.track.target_days ? ` (${detail.track.target_days} dias)` : ''}.</p></div>
            <div className="flex-1 min-w-[240px]">
              <label className="label">Módulos liberados</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-500" checked={allMods} onChange={e => setAllMods(e.target.checked)} /> Todos os módulos</label>
              {!allMods && detail.modules.map(m => (
                <label key={m.id} className="flex items-center gap-2 text-sm mt-1"><input type="checkbox" className="accent-brand-500" checked={mods.has(m.id)} onChange={() => setMods(toggle(mods, m.id))} /> {m.title}</label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={pending || picked.size === 0 || (!allMods && mods.size === 0)}
              onClick={() => { run(() => assignUsers({ trackId: detail.track.id, userIds: Array.from(picked), dueDate: due || null, allowedModuleIds: allMods ? null : Array.from(mods) }), 'Acesso liberado'); setAdding(false); setPicked(new Set()); setDue(''); setAllMods(true); setMods(new Set()) }}>
              Liberar {picked.size > 0 && `(${picked.size})`}
            </button>
            <button className="btn-ghost" onClick={() => setAdding(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {detail.assignments.length === 0 && !adding && <p className="text-sm text-gray-400">Ninguém tem acesso ainda. {detail.track.is_published ? '' : 'Lembre de publicar a trilha.'}</p>}

      <div className="space-y-2">
        {detail.assignments.map(a => (
          <div key={a.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="font-medium text-gray-900 w-44 truncate">{a.name}</p>
              <ProgressBar pct={a.pct} className="flex-1 min-w-[120px]" />
              <span className="text-xs font-semibold text-gray-600 w-24">{a.pct}% · {a.doneLessons}/{a.totalLessons}</span>
              <span className="text-xs text-gray-400 w-36">{a.due_date ? `prazo ${fmtDate(a.due_date)}` : 'sem prazo'}</span>
              <span className="text-xs text-gray-400 w-32">{a.allowed_module_ids ? `${a.allowed_module_ids.length} módulo(s)` : 'todos os módulos'}</span>
              <IconBtn title="Editar prazo e módulos" onClick={() => setEditing(a)}><Pencil className="w-4 h-4" /></IconBtn>
              <IconBtn title="Remover acesso" danger onClick={() => confirmRun(`Remover o acesso de ${a.name} a esta trilha? O progresso já feito continua guardado caso você libere de novo.`, 'Sim, remover', () => removeAssignment(a.id), 'Acesso removido')}><Trash2 className="w-4 h-4" /></IconBtn>
            </div>
            {a.message && a.pct < 100 && <p className={cn('text-xs mt-2', a.status === 'atrasada' ? 'text-red-600' : a.status === 'apertado' ? 'text-amber-700' : 'text-gray-400')}>{a.message}{a.lastActivity ? ` Última atividade: ${new Date(a.lastActivity).toLocaleDateString('pt-BR')}.` : ' Ainda não começou.'}</p>}

            {editing?.id === a.id && (
              <div className="mt-3 pt-3 border-t border-surface-border flex flex-wrap gap-4 items-start">
                <div><label className="label">Prazo final</label><input type="date" className="input" defaultValue={a.due_date ?? ''} id={`due-${a.id}`} /></div>
                <div className="flex-1 min-w-[240px]">
                  <label className="label">Módulos liberados</label>
                  {detail.modules.map(m => (
                    <label key={m.id} className="flex items-center gap-2 text-sm mt-1">
                      <input type="checkbox" className="accent-brand-500 mod-check" data-mod={m.id} defaultChecked={!a.allowed_module_ids || a.allowed_module_ids.includes(m.id)} /> {m.title}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary" disabled={pending} onClick={() => {
                    const root = document.getElementById(`due-${a.id}`)!.closest('div.mt-3') as HTMLElement
                    const dueVal = (document.getElementById(`due-${a.id}`) as HTMLInputElement).value || null
                    const checked = Array.from(root.querySelectorAll<HTMLInputElement>('.mod-check')).filter(c => c.checked).map(c => c.dataset.mod!)
                    if (!checked.length) return toast.error('Marque pelo menos um módulo')
                    const all = checked.length === detail.modules.length
                    setEditing(null)
                    run(() => updateAssignment(a.id, { dueDate: dueVal, allowedModuleIds: all ? null : checked }), 'Acesso atualizado')
                  }}>Salvar</button>
                  <button className="btn-ghost" onClick={() => setEditing(null)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
