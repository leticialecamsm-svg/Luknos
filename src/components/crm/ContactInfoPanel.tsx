'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getContactPanel,
  getCrmAttachmentUrl,
  linkConversationContact,
  createContactFromConversation,
  setContactCategory,
  setContactNotes,
  changeConversationContact,
  searchContactsForCrm,
  getCrmLabels,
  getConversationLabelIds,
  type CrmLabel,
  type ContactPanelData,
  type PanelMedia,
} from '@/lib/crm-actions'
import { CONTACT_TYPES, CONTACT_TYPE_LABEL, isSpecifierType, QUOTE_STATUS_LABEL, TEMPERATURE_LABEL, formatPhoneBR } from '@/lib/crm-panel'
import { formatCents } from '@/lib/crm-money'
import { getAvatarColor } from '@/lib/crm-ui'
import { Avatar } from '@/components/ui/Avatar'
import { LabelPicker } from './LabelPicker'
import { LabelChip } from './ConvTags'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { Search, Tag, X, Loader2, FileText, Link2, Mic, Image as ImageIcon, ExternalLink, UserPlus, Film } from 'lucide-react'

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const brl = (n: number | null | undefined) => (n === null || n === undefined ? '—' : formatCents(Math.round(n * 100)))

type MediaTab = 'images' | 'documents' | 'audios' | 'videos' | 'links'

export function ContactInfoPanel({
  conversationId, onClose, onChanged, isAdmin = false,
}: {
  conversationId: string
  onClose: () => void
  onChanged: () => void
  isAdmin?: boolean
}) {
  const toast = useToast()
  const [data, setData] = useState<ContactPanelData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<MediaTab>('images')
  const [linking, setLinking] = useState(false)
  const [labelCatalog, setLabelCatalog] = useState<CrmLabel[]>([])
  const [labelIds, setLabelIds] = useState<string[]>([])
  const loadLabels = useCallback(() => {
    getCrmLabels().then(setLabelCatalog)
    getConversationLabelIds(conversationId).then(setLabelIds)
  }, [conversationId])
  useEffect(() => { loadLabels() }, [loadLabels])

  const load = useCallback((pickTab = false) => {
    getContactPanel(conversationId).then((r) => {
      if ('error' in r) { setError(r.error); setData(null); return }
      setError(null); setData(r)
      if (pickTab) {
        // abre direto na primeira aba que tem conteúdo
        const first = (['images', 'documents', 'audios', 'videos', 'links'] as const).find((k) =>
          (k === 'links' ? r.links.length : r.media[k].length) > 0)
        if (first) setTab(first)
      }
    })
  }, [conversationId])

  useEffect(() => { setData(null); setError(null); load(true) }, [load])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function open(path: string) {
    const r = await getCrmAttachmentUrl(path)
    if ('url' in r) window.open(r.url, '_blank')
    else toast.error('ERRO', r.error)
  }

  async function linkSuggested(contactId: string) {
    setLinking(true)
    const r = await linkConversationContact(conversationId, contactId)
    setLinking(false)
    if (r.error) toast.error('ERRO', r.error)
    else { toast.success('VINCULADO!', 'Contato vinculado à conversa'); load(); onChanged() }
  }

  const counts = data ? {
    images: data.media.images.length, documents: data.media.documents.length, audios: data.media.audios.length,
    videos: data.media.videos.length, links: data.links.length,
  } : null

  return (
    <aside aria-label="Dados do contato" className="w-[22rem] max-w-full shrink-0 border-l border-gray-200 bg-white flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
        <button onClick={onClose} aria-label="Fechar dados do contato" className="p-1 rounded hover:bg-gray-100 text-gray-500"><X className="w-5 h-5" /></button>
        <h3 className="font-semibold text-gray-900">Dados do contato</h3>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!data && !error && <div className="p-10 text-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" /></div>}
        {error && <p role="alert" className="p-4 text-sm text-red-600">{error}</p>}

        {data && (
          <div className="divide-y divide-gray-100">
            {/* identidade */}
            <section className="p-5 text-center">
              <div className={`w-24 h-24 rounded-full bg-gradient-to-br ${getAvatarColor(conversationId)} text-white text-3xl font-bold flex items-center justify-center mx-auto`}>
                {data.display_name.charAt(0).toUpperCase()}
              </div>
              <h4 className="mt-3 text-lg font-semibold text-gray-900 break-words">{data.display_name}</h4>
              <p className="text-gray-500">{data.is_group ? 'Grupo do WhatsApp' : formatPhoneBR(data.phone_digits)}</p>
              <p className="mt-1 text-xs text-gray-400">WhatsApp: {data.instance_label}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
                {data.contact && (
                  <span className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium', data.contact.type === 'other' ? 'bg-amber-100 text-amber-900' : 'bg-violet-100 text-violet-800')}>
                    <Tag className="w-3 h-3" />{data.contact.type === 'other' ? 'Sem categoria' : CONTACT_TYPE_LABEL[data.contact.type] ?? data.contact.type}
                  </span>
                )}
                {data.stage && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                    <span className="w-2 h-2 rounded-full" style={{ background: data.stage.color }} />{data.stage.name}
                  </span>
                )}
                {data.deal_cents !== null && <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-800 font-semibold">{formatCents(data.deal_cents)}</span>}
                {data.assigned && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                    <Avatar user={data.assigned} size="xs" />{data.assigned.name}
                  </span>
                )}
              </div>
            </section>

            {/* etiquetas */}
            <section className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Etiquetas</h5>
                <LabelPicker
                  conversationId={conversationId}
                  all={labelCatalog}
                  selectedIds={labelIds}
                  isAdmin={isAdmin}
                  compact
                  onChanged={(ids) => { setLabelIds(ids); onChanged() }}
                  onCatalogChanged={() => { getCrmLabels().then(setLabelCatalog); onChanged() }}
                />
              </div>
              <div className="flex flex-wrap gap-1.5 min-h-[1.25rem]">
                {labelCatalog.filter((l) => labelIds.includes(l.id)).map((l) => <LabelChip key={l.id} label={l} className="text-xs px-2 py-1" />)}
                {labelIds.length === 0 && <span className="text-sm text-gray-400">Nenhuma etiqueta</span>}
              </div>
            </section>

            {!data.is_group && <>
            {/* contato no sistema */}
            <section className="p-4 space-y-3">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Contato no sistema</h5>
              {data.contact ? (
                <ContactBlock
                  key={data.contact.id}
                  contact={data.contact}
                  linkSource={data.link_source}
                  conversationId={conversationId}
                  linking={linking}
                  onLink={() => linkSuggested(data.contact!.id)}
                  onSaved={() => { load(); onChanged() }}
                />
              ) : (
                <NewContactForm
                  conversationId={conversationId}
                  defaultName={data.display_name === data.phone_digits ? '' : data.display_name}
                  onCreated={() => { load(); onChanged() }}
                />
              )}
            </section>

            {/* orçamentos */}
            <QuotesSection data={data} />
            </>}

            {/* histórico */}
            <section className="p-4 space-y-2">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Histórico</h5>
              <dl className="text-sm grid grid-cols-2 gap-x-3 gap-y-1">
                <dt className="text-gray-500">Primeiro contato</dt><dd className="text-right text-gray-900">{fmtDate(data.created_at)}</dd>
                <dt className="text-gray-500">Recebidas</dt><dd className="text-right text-gray-900">{data.stats.inbound}</dd>
                <dt className="text-gray-500">Enviadas</dt><dd className="text-right text-gray-900">{data.stats.outbound}</dd>
                <dt className="text-gray-500">Última do cliente</dt><dd className="text-right text-gray-900">{fmtDateTime(data.stats.last_inbound_at)}</dd>
                <dt className="text-gray-500">Última nossa</dt><dd className="text-right text-gray-900">{fmtDateTime(data.stats.last_outbound_at)}</dd>
              </dl>
              {data.other_conversations.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs text-gray-500 mb-1">Também já conversou por outros WhatsApps:</p>
                  <ul className="space-y-1">
                    {data.other_conversations.map((o) => (
                      <li key={o.id}>
                        <Link href={`/crm/conversas?c=${o.id}`} className="flex items-center justify-between gap-2 text-sm rounded-lg px-2 py-1.5 hover:bg-gray-50">
                          <span className="truncate">{o.instance_label}</span>
                          <span className="text-xs text-gray-400 shrink-0">{o.stage_name ?? ''} · {fmtDate(o.last_message_at)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* mídia, links e docs */}
            <section className="p-4">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                Mídia, links e documentos <span className="text-gray-500">({data.media.total + data.links.length})</span>
              </h5>
              <div className="flex flex-wrap gap-1 mb-3 text-xs" role="tablist">
                {([['images', ImageIcon, 'Mídias'], ['documents', FileText, 'Docs'], ['audios', Mic, 'Áudios'], ['videos', Film, 'Vídeos'], ['links', Link2, 'Links']] as const).map(([k, Icon, label]) => (
                  <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                    className={cn('inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-full', tab === k ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')}>
                    <Icon className="w-3.5 h-3.5" />{label}{counts && counts[k] > 0 ? ` ${counts[k]}` : ''}
                  </button>
                ))}
              </div>

              {tab === 'images' && (
                counts!.images === 0 ? <Empty text="Nenhuma imagem" /> : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {data.media.images.map((m) => (
                      <button key={m.id} onClick={() => open(m.path)} className="aspect-square rounded-md overflow-hidden bg-gray-100 hover:opacity-90" title={`${fmtDate(m.created_at)} · ${m.direction === 'inbound' ? 'recebida' : 'enviada'}`}>
                        {m.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.url} alt={m.file_name ?? 'Imagem'} className="w-full h-full object-cover" loading="lazy" />
                        ) : <ImageIcon className="w-6 h-6 text-gray-400 mx-auto mt-6" />}
                      </button>
                    ))}
                  </div>
                )
              )}
              {tab === 'documents' && <FileList items={data.media.documents} icon={FileText} empty="Nenhum documento" onOpen={open} />}
              {tab === 'audios' && <FileList items={data.media.audios} icon={Mic} empty="Nenhum áudio" onOpen={open} />}
              {tab === 'videos' && <FileList items={data.media.videos} icon={Film} empty="Nenhum vídeo" onOpen={open} />}
              {tab === 'links' && (
                counts!.links === 0 ? <Empty text="Nenhum link" /> : (
                  <ul className="space-y-1.5">
                    {data.links.map((l) => (
                      <li key={l.url}>
                        <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 text-sm">
                          <ExternalLink className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
                          <span className="min-w-0"><span className="block truncate text-blue-700">{l.url}</span><span className="text-xs text-gray-400">{fmtDate(l.at)}</span></span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </section>
          </div>
        )}
      </div>
    </aside>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-gray-400 text-center py-4">{text}</p>
}

function FileList({ items, icon: Icon, empty, onOpen }: { items: PanelMedia[]; icon: any; empty: string; onOpen: (path: string) => void }) {
  if (items.length === 0) return <Empty text={empty} />
  return (
    <ul className="space-y-1">
      {items.map((m) => (
        <li key={m.id}>
          <button onClick={() => onOpen(m.path)} className="w-full flex items-center gap-2 text-left rounded-lg px-2 py-1.5 hover:bg-gray-50">
            <Icon className="w-4 h-4 shrink-0 text-gray-400" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-gray-800">{m.file_name ?? 'arquivo'}</span>
              <span className="text-xs text-gray-400">{fmtDate(m.created_at)} · {m.direction === 'inbound' ? 'recebido' : 'enviado'}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

const SOURCE_LABEL: Record<string, string> = {
  phone: 'Vinculado automaticamente pelo telefone',
  name: 'Vinculado automaticamente pelo nome',
  manual: 'Vinculado manualmente',
}

function ContactBlock({
  contact, linkSource, conversationId, linking, onLink, onSaved,
}: {
  contact: NonNullable<ContactPanelData['contact']>
  linkSource: 'phone' | 'name' | 'manual' | null
  conversationId: string
  linking: boolean
  onLink: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [type, setType] = useState(contact.type)
  const [savingType, setSavingType] = useState(false)
  const [notes, setNotes] = useState(contact.notes ?? '')
  const [savingNotes, setSavingNotes] = useState(false)

  async function changeType(next: string) {
    const prev = type
    setType(next); setSavingType(true)
    const r = await setContactCategory(conversationId, contact.id, next)
    setSavingType(false)
    if (r.error) { setType(prev); toast.error('ERRO', r.error) } else { toast.success('CATEGORIA ATUALIZADA'); onSaved() }
  }

  async function saveNotes() {
    if (notes.trim() === (contact.notes ?? '').trim()) return
    setSavingNotes(true)
    const r = await setContactNotes(conversationId, contact.id, notes)
    setSavingNotes(false)
    if (r.error) toast.error('ERRO', r.error); else { toast.success('OBSERVAÇÕES SALVAS'); onSaved() }
  }

  return (
    <div className="text-sm space-y-2">
      <p className="font-medium text-gray-900">{contact.name}</p>
      {contact.linked && linkSource && (
        <p className={cn('text-[11px]', linkSource === 'manual' ? 'text-gray-400' : 'text-emerald-700')}>{SOURCE_LABEL[linkSource]}</p>
      )}
      {contact.linked && <ChangeContact conversationId={conversationId} currentId={contact.id} onChanged={onSaved} />}
      {contact.company && <p className="text-gray-600">{contact.company}</p>}
      {contact.email && <p className="text-gray-600 break-all">{contact.email}</p>}

      <div>
        <label htmlFor="contact-type" className="block text-xs text-gray-500 mb-1">Categoria</label>
        <div className="flex items-center gap-2">
          <select id="contact-type" value={type} disabled={savingType} onChange={(e) => changeType(e.target.value)}
            className={cn('flex-1 border rounded-lg px-2 py-1.5 text-sm bg-white', type === 'other' ? 'border-amber-300' : 'border-gray-300')}>
            {CONTACT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.value === 'other' ? 'Outro / sem categoria' : t.label}</option>)}
          </select>
          {savingType && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </div>
        {type === 'other' && <p className="mt-1 text-xs text-amber-700">Este contato está sem categoria definida. Escolha uma acima.</p>}
      </div>

      <div>
        <label htmlFor="contact-notes" className="block text-xs text-gray-500 mb-1">Observações</label>
        <textarea id="contact-notes" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} rows={3} maxLength={2000}
          placeholder="Adicione notas sobre este cliente…"
          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y" />
        {savingNotes && <p className="text-xs text-gray-400">Salvando…</p>}
      </div>

      {!contact.linked && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-amber-900 text-xs">
          Encontrei este contato pelo telefone, mas a conversa ainda não está vinculada a ele.
          <button disabled={linking} onClick={onLink} className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-900 text-white font-medium hover:bg-gray-700 disabled:opacity-60">
            {linking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />} Vincular a esta conversa
          </button>
        </div>
      )}
    </div>
  )
}

function NewContactForm({ conversationId, defaultName, onCreated }: { conversationId: string; defaultName: string; onCreated: () => void }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [linking, setLinking] = useState(false)
  const [name, setName] = useState(defaultName)
  const [type, setType] = useState('')
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!type) { setError('Escolha a categoria do contato'); return }
    setSaving(true); setError(null)
    const r = await createContactFromConversation(conversationId, { name, type, company, email })
    setSaving(false)
    if (r.error) { setError(r.error); return }
    toast.success('CONTATO CADASTRADO', 'Já vinculado a esta conversa')
    onCreated()
  }

  if (linking) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-gray-600">Procure o contato que já existe no sistema:</p>
        <ContactLinker conversationId={conversationId} autoFocus onDone={onCreated} onCancel={() => setLinking(false)} />
      </div>
    )
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-gray-500">Nenhum contato com este telefone foi encontrado automaticamente.</p>
        <button onClick={() => setLinking(true)} className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-gray-900 text-white text-sm font-medium hover:bg-gray-700">
          <Link2 className="w-4 h-4" /> Vincular a contato existente
        </button>
        <button onClick={() => setOpen(true)} className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-white border border-gray-300 text-gray-800 text-sm font-medium hover:bg-gray-50">
          <UserPlus className="w-4 h-4" /> Cadastrar como novo contato
        </button>
      </div>
    )
  }

  const input = 'w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300'
  return (
    <form onSubmit={submit} className="space-y-2 text-sm">
      <div>
        <label htmlFor="nc-name" className="block text-xs text-gray-500 mb-1">Nome</label>
        <input id="nc-name" className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
      </div>
      <div>
        <label htmlFor="nc-type" className="block text-xs text-gray-500 mb-1">Categoria</label>
        <select id="nc-type" className={cn(input, 'bg-white')} value={type} onChange={(e) => { setType(e.target.value); setError(null) }}>
          <option value="">Escolha…</option>
          {CONTACT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="nc-company" className="block text-xs text-gray-500 mb-1">Empresa (opcional)</label>
        <input id="nc-company" className={input} value={company} onChange={(e) => setCompany(e.target.value)} />
      </div>
      <div>
        <label htmlFor="nc-email" className="block text-xs text-gray-500 mb-1">E-mail (opcional)</label>
        <input id="nc-email" type="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={() => setOpen(false)} disabled={saving} className="flex-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200">Cancelar</button>
        <button type="submit" disabled={saving} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-60">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Cadastrar
        </button>
      </div>
      <p className="text-[11px] text-gray-400">O telefone da conversa entra automaticamente e a conversa fica vinculada ao novo contato.</p>
    </form>
  )
}

type PanelQuote = ContactPanelData['quotes'][number]

function QuoteCard({ q }: { q: PanelQuote }) {
  const value = q.negotiation?.final_value ?? q.value
  return (
    <li>
      <Link href={`/quotes/${q.id}`} className="block rounded-lg border border-gray-200 hover:border-gray-400 p-2.5 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-gray-900">#{q.number ?? '—'}</span>
          <span className="text-xs text-gray-500">{fmtDate(q.date)}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{QUOTE_STATUS_LABEL[q.status] ?? q.status}</span>
          {q.negotiation && (
            <span className={cn('px-1.5 py-0.5 rounded', q.negotiation.temperature === 'closed' ? 'bg-emerald-100 text-emerald-800' : q.negotiation.temperature === 'lost' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800')}>
              {TEMPERATURE_LABEL[q.negotiation.temperature] ?? q.negotiation.temperature}
            </span>
          )}
          <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-800">{q.role === 'arquiteto' ? 'Como especificador' : 'Como cliente'}</span>
        </div>
        {q.party && <p className="mt-1 text-xs text-gray-500 truncate">{q.party.role === 'cliente' ? 'Cliente' : 'Especificador'}: {q.party.name}</p>}
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className="text-gray-500 truncate">{q.category ?? ''}</span>
          <span className="font-semibold text-gray-800">{brl(value)}</span>
        </div>
        {q.negotiation?.loss_reason && <p className="mt-1 text-xs text-red-700">Motivo da perda: {q.negotiation.loss_reason}</p>}
      </Link>
    </li>
  )
}

function QuotesSection({ data }: { data: ContactPanelData }) {
  const [showPast, setShowPast] = useState(false)
  const open = data.quotes.filter((q) => q.is_open)
  const past = data.quotes.filter((q) => !q.is_open)
  const specifier = isSpecifierType(data.contact?.type)
  const openTotal = open.reduce((n, q) => n + (q.negotiation?.final_value ?? q.value ?? 0), 0)

  return (
    <section className="p-4 space-y-3">
      <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {specifier ? 'Orçamentos em que aparece' : 'Orçamentos'}
      </h5>
      {!data.contact && <p className="text-sm text-gray-500">Vincule um contato para ver os orçamentos.</p>}
      {data.contact && data.quotes.length === 0 && (
        <p className="text-sm text-gray-500">{data.quotes_restricted ? 'Nenhum orçamento seu para este contato.' : 'Este contato ainda não tem orçamentos.'}</p>
      )}

      {data.quotes.length > 0 && (
        <>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-semibold text-gray-800">Em aberto <span className="text-gray-500 font-normal">({open.length})</span></p>
              {open.length > 0 && <span className="text-xs font-semibold text-emerald-700">{brl(openTotal)}</span>}
            </div>
            {open.length === 0
              ? <p className="text-sm text-gray-500">Nenhum orçamento em aberto.</p>
              : <ul className="space-y-2">{open.map((q) => <QuoteCard key={q.id} q={q} />)}</ul>}
          </div>

          {past.length > 0 && (
            <div>
              <button onClick={() => setShowPast((v) => !v)} className="text-sm text-gray-600 underline" aria-expanded={showPast}>
                {showPast ? 'Ocultar' : 'Ver'} anteriores ({past.length}) — fechados ou perdidos
              </button>
              {showPast && <ul className="space-y-2 mt-2">{past.map((q) => <QuoteCard key={q.id} q={q} />)}</ul>}
            </div>
          )}
        </>
      )}
    </section>
  )
}

interface FoundContact { id: string; name: string; phone: string | null; type: string; company?: string | null; email?: string | null }

// Buscar um contato já cadastrado (nome ou telefone), conferir e CONFIRMAR o vínculo.
function ContactLinker({
  conversationId, excludeId, autoFocus, onDone, onCancel,
}: {
  conversationId: string
  excludeId?: string
  autoFocus?: boolean
  onDone: () => void
  onCancel?: () => void
}) {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<FoundContact[]>([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState<FoundContact | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (picked) return
    const term = q.trim()
    if (term.length < 2) { setResults([]); setSearching(false); return }
    setSearching(true)
    let alive = true
    const t = setTimeout(() => {
      searchContactsForCrm(term).then((r) => { if (alive) { setResults(r as FoundContact[]); setSearching(false) } })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [q, picked])

  async function confirm() {
    if (!picked || busy) return
    setBusy(true)
    const r = await changeConversationContact(conversationId, picked.id)
    setBusy(false)
    if (r.error) toast.error('ERRO', r.error)
    else { toast.success('CONTATO VINCULADO', picked.name); onDone() }
  }

  if (picked) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2 text-sm" role="group" aria-label="Confirmar vínculo">
        <p className="text-emerald-900">Vincular esta conversa a este contato?</p>
        <div className="rounded-lg bg-white border border-emerald-100 p-2.5">
          <p className="font-semibold text-gray-900">{picked.name}</p>
          <p className="text-xs text-gray-600">{CONTACT_TYPE_LABEL[picked.type] ?? picked.type}{picked.company ? ` · ${picked.company}` : ''}</p>
          {picked.phone && <p className="text-xs text-gray-500">{picked.phone}</p>}
          {picked.email && <p className="text-xs text-gray-500 break-all">{picked.email}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPicked(null)} disabled={busy} className="flex-1 px-3 py-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50">Voltar</button>
          <button onClick={confirm} disabled={busy} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-60">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Confirmar vínculo
          </button>
        </div>
      </div>
    )
  }

  const shown = results.filter((r) => r.id !== excludeId)
  return (
    <div className="rounded-lg border border-gray-200 p-2 space-y-2">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
        <input autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite o nome ou o telefone" aria-label="Buscar contato cadastrado"
          className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300" />
        {searching && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 absolute right-2 top-1/2 -translate-y-1/2" />}
      </div>
      <ul className="max-h-48 overflow-y-auto">
        {shown.map((r) => (
          <li key={r.id}>
            <button onClick={() => setPicked(r)} className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-gray-50 text-sm">
              <span className="font-medium text-gray-900">{r.name}</span>
              <span className="block text-xs text-gray-500">{CONTACT_TYPE_LABEL[r.type] ?? r.type}{r.company ? ` · ${r.company}` : ''}{r.phone ? ` · ${r.phone}` : ''}</span>
            </button>
          </li>
        ))}
        {q.trim().length >= 2 && !searching && shown.length === 0 && <li className="px-2 py-1.5 text-xs text-gray-400">Nenhum contato encontrado para “{q.trim()}”</li>}
        {q.trim().length < 2 && <li className="px-2 py-1.5 text-xs text-gray-400">Digite pelo menos 2 letras (ou 3 números do telefone).</li>}
      </ul>
      {onCancel && <button onClick={onCancel} className="text-xs text-gray-500 underline">Cancelar</button>}
    </div>
  )
}

// Corrigir um vínculo automático errado: trocar por outro contato ou desvincular.
function ChangeContact({ conversationId, currentId, onChanged }: { conversationId: string; currentId: string; onChanged: () => void }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function unlink() {
    if (busy) return
    if (!window.confirm('Desvincular este contato? O sistema não vai vincular de novo sozinho.')) return
    setBusy(true)
    const r = await changeConversationContact(conversationId, null)
    setBusy(false)
    if (r.error) toast.error('ERRO', r.error)
    else { toast.success('CONTATO DESVINCULADO'); onChanged() }
  }

  if (!open) {
    return (
      <div className="flex gap-3 text-xs">
        <button onClick={() => setOpen(true)} className="underline text-gray-600 hover:text-gray-900">Não é este contato? Trocar</button>
        <button onClick={unlink} className="underline text-gray-400 hover:text-red-600">Desvincular</button>
      </div>
    )
  }
  return <ContactLinker conversationId={conversationId} excludeId={currentId} autoFocus onDone={() => { setOpen(false); onChanged() }} onCancel={() => setOpen(false)} />
}
