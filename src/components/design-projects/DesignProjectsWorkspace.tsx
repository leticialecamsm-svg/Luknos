'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Plus, MapPin, ArrowRight, FileBox, CalendarClock, Loader2, X, ExternalLink } from 'lucide-react'
import { ContactSearch } from '@/components/quotes/EditQuoteForm'
import { useToast } from '@/components/ui/Toast'
import { CATEGORY_LABEL } from '@/types'
import {
  createVisit, updateVisitStatus, evolveVisitToProject, evolveVisitToQuote,
  createDesignProject, updateDesignProjectStatus, evolveProjectToQuote,
} from '@/lib/design-projects-actions'

type Contact = { id: string; name: string; phone?: string | null } | null

type Visit = {
  id: string
  title: string | null
  status: 'to_schedule' | 'scheduled' | 'done' | 'not_needed'
  scheduled_at: string | null
  scheduled_time: string | null
  address: string | null
  notes: string | null
  quote_id: string | null
  design_project_id: string | null
  client: Contact
  architect: Contact
}

type Project = {
  id: string
  number: number
  title: string
  description: string | null
  status: 'fila' | 'em_andamento' | 'concluido'
  quote_id: string | null
  visit_id: string | null
  client: Contact
  architect: Contact
}

const VISIT_STATUS_LABEL: Record<Visit['status'], string> = {
  to_schedule: 'A agendar', scheduled: 'Agendada', done: 'Realizada', not_needed: 'Não necessária',
}
const VISIT_STATUS_CLASS: Record<Visit['status'], string> = {
  to_schedule: 'bg-amber-50 text-amber-700', scheduled: 'bg-blue-50 text-blue-700',
  done: 'bg-emerald-50 text-emerald-700', not_needed: 'bg-gray-100 text-gray-500',
}
const PROJECT_STATUS_LABEL: Record<Project['status'], string> = {
  fila: 'Na fila', em_andamento: 'Em andamento', concluido: 'Concluído',
}
const PROJECT_STATUS_CLASS: Record<Project['status'], string> = {
  fila: 'bg-gray-100 text-gray-600', em_andamento: 'bg-amber-50 text-amber-700', concluido: 'bg-emerald-50 text-emerald-700',
}

export function DesignProjectsWorkspace({ initialVisits, initialProjects }: { initialVisits: Visit[]; initialProjects: Project[] }) {
  const [tab, setTab] = useState<'visitas' | 'projetos'>('visitas')
  const [visits, setVisits] = useState(initialVisits)
  const [projects, setProjects] = useState(initialProjects)
  const [showNewVisit, setShowNewVisit] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [evolveTarget, setEvolveTarget] = useState<{ kind: 'visit' | 'project'; id: string; label: string } | null>(null)
  const [projectFromVisit, setProjectFromVisit] = useState<Visit | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Projetos</h1>
          <p className="text-sm text-gray-400 mt-0.5">Visitas e solicitações de projeto luminotécnico — evolua pra orçamento quando estiver pronto</p>
        </div>
        <button onClick={() => tab === 'visitas' ? setShowNewVisit(true) : setShowNewProject(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> {tab === 'visitas' ? 'Nova visita' : 'Novo projeto'}
        </button>
      </div>

      <div className="flex gap-1 bg-surface-secondary rounded-lg p-1 w-fit">
        {([['visitas', `Visitas (${visits.length})`], ['projetos', `Projetos (${projects.length})`]] as const).map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'visitas' ? (
        <VisitsTable
          visits={visits}
          onEvolveToProject={v => setProjectFromVisit(v)}
          onEvolveToQuote={v => setEvolveTarget({ kind: 'visit', id: v.id, label: v.title ?? v.client?.name ?? 'visita' })}
          onStatusChange={(id, status) => {
            setVisits(prev => prev.map(v => v.id === id ? { ...v, status } : v))
            updateVisitStatus(id, status)
          }}
        />
      ) : (
        <ProjectsTable
          projects={projects}
          onEvolveToQuote={p => setEvolveTarget({ kind: 'project', id: p.id, label: p.title })}
          onStatusChange={(id, status) => {
            setProjects(prev => prev.map(p => p.id === id ? { ...p, status } : p))
            updateDesignProjectStatus(id, status)
          }}
        />
      )}

      {showNewVisit && (
        <CreateVisitModal
          onClose={() => setShowNewVisit(false)}
          onCreated={v => { setVisits(prev => [v, ...prev]); setShowNewVisit(false) }}
        />
      )}
      {showNewProject && (
        <CreateProjectModal
          onClose={() => setShowNewProject(false)}
          onCreated={p => { setProjects(prev => [p, ...prev]); setShowNewProject(false) }}
        />
      )}
      {projectFromVisit && (
        <EvolveVisitToProjectModal
          visit={projectFromVisit}
          onClose={() => setProjectFromVisit(null)}
          onCreated={(project, visitId) => {
            setProjects(prev => [project, ...prev])
            setVisits(prev => prev.map(v => v.id === visitId ? { ...v, design_project_id: project.id } : v))
            setProjectFromVisit(null)
          }}
        />
      )}
      {evolveTarget && (
        <EvolveToQuoteModal
          target={evolveTarget}
          onClose={() => setEvolveTarget(null)}
        />
      )}
    </div>
  )
}

// ── Tabela de visitas ───────────────────────────────────────────────────

function VisitsTable({ visits, onEvolveToProject, onEvolveToQuote, onStatusChange }: {
  visits: Visit[]
  onEvolveToProject: (v: Visit) => void
  onEvolveToQuote: (v: Visit) => void
  onStatusChange: (id: string, status: Visit['status']) => void
}) {
  if (visits.length === 0) {
    return (
      <div className="card p-12 text-center">
        <CalendarClock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-500">Nenhuma visita cadastrada</p>
        <p className="text-xs text-gray-400 mt-1">Cadastre a primeira visita pra começar a acompanhar</p>
      </div>
    )
  }
  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-surface-border bg-surface-secondary text-left">
            <th className="px-4 py-3 text-xs font-semibold text-gray-600">Título</th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-600">Cliente</th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-600">Data</th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-600">Status</th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-right">Evoluir</th>
          </tr>
        </thead>
        <tbody>
          {visits.map(v => (
            <tr key={v.id} className="border-b border-surface-border last:border-0 hover:bg-surface-secondary transition-colors">
              <td className="px-4 py-3">
                <span className="text-sm font-medium text-gray-900">{v.title || 'Visita'}</span>
                {v.address && <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{v.address}</p>}
              </td>
              <td className="px-4 py-3 text-sm text-gray-700">{v.client?.name ?? '—'}</td>
              <td className="px-4 py-3 text-sm text-gray-500">
                {v.scheduled_at ? new Date(v.scheduled_at + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                {v.scheduled_time && <span className="text-gray-400"> · {v.scheduled_time}</span>}
              </td>
              <td className="px-4 py-3">
                <select value={v.status} onChange={e => onStatusChange(v.id, e.target.value as Visit['status'])}
                  className={`text-xs font-medium px-2 py-1 rounded-full border-0 outline-none ${VISIT_STATUS_CLASS[v.status]}`}>
                  {Object.entries(VISIT_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                {v.quote_id ? (
                  <Link href={`/quotes/${v.quote_id}`} className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1">
                    Ver orçamento <ExternalLink className="w-3 h-3" />
                  </Link>
                ) : v.design_project_id ? (
                  <span className="text-xs text-gray-400">Virou projeto</span>
                ) : (
                  <div className="flex justify-end gap-2">
                    <button onClick={() => onEvolveToProject(v)} className="text-xs font-medium text-navy hover:text-brand-600 inline-flex items-center gap-1">
                      <FileBox className="w-3.5 h-3.5" /> Projeto
                    </button>
                    <button onClick={() => onEvolveToQuote(v)} className="text-xs font-medium text-navy hover:text-brand-600 inline-flex items-center gap-1">
                      Orçamento <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Tabela de projetos ──────────────────────────────────────────────────

function ProjectsTable({ projects, onEvolveToQuote, onStatusChange }: {
  projects: Project[]
  onEvolveToQuote: (p: Project) => void
  onStatusChange: (id: string, status: Project['status']) => void
}) {
  if (projects.length === 0) {
    return (
      <div className="card p-12 text-center">
        <FileBox className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-500">Nenhum projeto por aqui ainda</p>
        <p className="text-xs text-gray-400 mt-1">Crie um projeto novo ou evolua uma visita</p>
      </div>
    )
  }
  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-surface-border bg-surface-secondary text-left">
            <th className="px-4 py-3 text-xs font-semibold text-gray-600">Nº</th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-600">Título</th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-600">Cliente</th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-600">Status</th>
            <th className="px-4 py-3 text-xs font-semibold text-gray-600 text-right">Evoluir</th>
          </tr>
        </thead>
        <tbody>
          {projects.map(p => (
            <tr key={p.id} className="border-b border-surface-border last:border-0 hover:bg-surface-secondary transition-colors">
              <td className="px-4 py-3 text-sm text-gray-500">#{String(p.number).padStart(3, '0')}</td>
              <td className="px-4 py-3">
                <span className="text-sm font-medium text-gray-900">{p.title}</span>
                {p.description && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{p.description}</p>}
              </td>
              <td className="px-4 py-3 text-sm text-gray-700">{p.client?.name ?? '—'}</td>
              <td className="px-4 py-3">
                <select value={p.status} onChange={e => onStatusChange(p.id, e.target.value as Project['status'])}
                  className={`text-xs font-medium px-2 py-1 rounded-full border-0 outline-none ${PROJECT_STATUS_CLASS[p.status]}`}>
                  {Object.entries(PROJECT_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                {p.quote_id ? (
                  <Link href={`/quotes/${p.quote_id}`} className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1">
                    Ver orçamento <ExternalLink className="w-3 h-3" />
                  </Link>
                ) : (
                  <button onClick={() => onEvolveToQuote(p)} className="text-xs font-medium text-navy hover:text-brand-600 inline-flex items-center gap-1">
                    Orçamento <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Modal base ────────────────────────────────────────────────────────────

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[9998] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400 hover:text-gray-600" /></button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  )
}

// ── Nova visita ───────────────────────────────────────────────────────────

function CreateVisitModal({ onClose, onCreated }: { onClose: () => void; onCreated: (v: Visit) => void }) {
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [client, setClient] = useState<Contact>(null)
  const [architect, setArchitect] = useState<Contact>(null)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')

  const save = () => {
    if (!client) return toast.error('Selecione o cliente')
    if (!title.trim()) return toast.error('Informe um título pra visita')
    startTransition(async () => {
      const res = await createVisit({
        client_id: client.id, architect_id: architect?.id, title: title.trim(),
        scheduled_at: date || null, scheduled_time: time || null, address: address || null, notes: notes || null,
      })
      if ('error' in res) return toast.error('Erro ao criar visita', res.error)
      toast.success('Visita cadastrada')
      onCreated({
        id: res.data!.id, title, status: date ? 'scheduled' : 'to_schedule', scheduled_at: date || null,
        scheduled_time: time || null, address: address || null, notes: notes || null, quote_id: null,
        design_project_id: null, client, architect,
      })
    })
  }

  return (
    <ModalShell title="Nova visita" onClose={onClose}>
      <ContactSearch label="Cliente" required placeholder="Buscar ou criar cliente..." onSelect={setClient} />
      <ContactSearch label="Parceiro" placeholder="Buscar ou criar parceiro..." onSelect={setArchitect} />
      <div>
        <label className="label">Título</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Visita técnica — apto 302" className="input" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Data</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="input" /></div>
        <div><label className="label">Horário</label><input type="time" value={time} onChange={e => setTime(e.target.value)} className="input" /></div>
      </div>
      <div><label className="label">Endereço</label><input value={address} onChange={e => setAddress(e.target.value)} className="input" /></div>
      <div><label className="label">Observações</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="input" /></div>
      <button onClick={save} disabled={pending} className="btn-primary w-full justify-center">
        {pending && <Loader2 className="w-4 h-4 animate-spin" />} Criar visita
      </button>
    </ModalShell>
  )
}

// ── Novo projeto ──────────────────────────────────────────────────────────

function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Project) => void }) {
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [client, setClient] = useState<Contact>(null)
  const [architect, setArchitect] = useState<Contact>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const save = () => {
    if (!client) return toast.error('Selecione o cliente')
    if (!title.trim()) return toast.error('Informe um título')
    startTransition(async () => {
      const res = await createDesignProject({ client_id: client.id, architect_id: architect?.id, title: title.trim(), description: description || null })
      if ('error' in res) return toast.error('Erro ao criar projeto', res.error)
      toast.success('Projeto cadastrado')
      onCreated({
        id: res.data!.id, number: 0, title: title.trim(), description: description || null,
        status: 'fila', quote_id: null, visit_id: null, client, architect,
      })
    })
  }

  return (
    <ModalShell title="Novo projeto" onClose={onClose}>
      <ContactSearch label="Cliente" required placeholder="Buscar ou criar cliente..." onSelect={setClient} />
      <ContactSearch label="Parceiro" placeholder="Buscar ou criar parceiro..." onSelect={setArchitect} />
      <div>
        <label className="label">Título</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Projeto luminotécnico — Ed. Jardins" className="input" />
      </div>
      <div><label className="label">Descrição</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="input" /></div>
      <button onClick={save} disabled={pending} className="btn-primary w-full justify-center">
        {pending && <Loader2 className="w-4 h-4 animate-spin" />} Criar projeto
      </button>
    </ModalShell>
  )
}

// ── Visita -> Projeto ─────────────────────────────────────────────────────

function EvolveVisitToProjectModal({ visit, onClose, onCreated }: {
  visit: Visit
  onClose: () => void
  onCreated: (p: Project, visitId: string) => void
}) {
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [title, setTitle] = useState(visit.title ?? '')
  const [description, setDescription] = useState('')

  const save = () => {
    if (!title.trim()) return toast.error('Informe um título')
    startTransition(async () => {
      const res = await evolveVisitToProject(visit.id, { title: title.trim(), description: description || null })
      if ('error' in res) return toast.error('Erro ao evoluir visita', res.error)
      toast.success('Visita evoluiu para projeto')
      onCreated({
        id: res.data!.id, number: 0, title: title.trim(), description: description || null,
        status: 'fila', quote_id: null, visit_id: visit.id, client: visit.client, architect: visit.architect,
      }, visit.id)
    })
  }

  return (
    <ModalShell title="Evoluir visita para projeto" onClose={onClose}>
      <p className="text-xs text-gray-400">Cliente: <span className="text-gray-600 font-medium">{visit.client?.name}</span></p>
      <div>
        <label className="label">Título do projeto</label>
        <input value={title} onChange={e => setTitle(e.target.value)} className="input" />
      </div>
      <div><label className="label">Descrição</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="input" /></div>
      <button onClick={save} disabled={pending} className="btn-primary w-full justify-center">
        {pending && <Loader2 className="w-4 h-4 animate-spin" />} Criar projeto
      </button>
    </ModalShell>
  )
}

// ── Visita/Projeto -> Orçamento ───────────────────────────────────────────

function EvolveToQuoteModal({ target, onClose }: { target: { kind: 'visit' | 'project'; id: string; label: string }; onClose: () => void }) {
  const toast = useToast()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [category, setCategory] = useState('lighting')
  const [origin, setOrigin] = useState('other')
  const [priority, setPriority] = useState('normal')
  const [quotedValue, setQuotedValue] = useState('')

  const save = () => {
    startTransition(async () => {
      const fn = target.kind === 'visit' ? evolveVisitToQuote : evolveProjectToQuote
      const res = await fn(target.id, {
        category, origin, priority,
        quoted_value: quotedValue ? Number(quotedValue.replace(',', '.')) : undefined,
      })
      if ('error' in res) return toast.error('Erro ao evoluir', res.error)
      toast.success('Orçamento criado')
      router.push(`/quotes/${res.data!.id}`)
    })
  }

  return (
    <ModalShell title={`Evoluir "${target.label}" para orçamento`} onClose={onClose}>
      <div>
        <label className="label">Categoria</label>
        <select value={category} onChange={e => setCategory(e.target.value)} className="select">
          {Object.entries(CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Como o cliente chegou até nós</label>
        <select value={origin} onChange={e => setOrigin(e.target.value)} className="select">
          <option value="store">Frente de loja</option>
          <option value="whatsapp">Arquiteto ou parceiro</option>
          <option value="visit">Tráfego pago</option>
          <option value="referral">Indicação</option>
          <option value="other">Orgânico</option>
        </select>
      </div>
      <div>
        <label className="label">Prioridade</label>
        <select value={priority} onChange={e => setPriority(e.target.value)} className="select">
          <option value="normal">Normal</option>
          <option value="high">Alta</option>
          <option value="urgent">Urgente</option>
        </select>
      </div>
      <div>
        <label className="label">Valor estimado (opcional)</label>
        <input value={quotedValue} onChange={e => setQuotedValue(e.target.value)} placeholder="0,00" className="input" />
      </div>
      <button onClick={save} disabled={pending} className="btn-primary w-full justify-center">
        {pending && <Loader2 className="w-4 h-4 animate-spin" />} Criar orçamento
      </button>
    </ModalShell>
  )
}
