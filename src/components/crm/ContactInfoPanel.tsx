'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getContactPanel,
  getCrmAttachmentUrl,
  linkConversationContact,
  type ContactPanelData,
  type PanelMedia,
} from '@/lib/crm-actions'
import { CONTACT_TYPE_LABEL, QUOTE_STATUS_LABEL, TEMPERATURE_LABEL, formatPhoneBR } from '@/lib/crm-panel'
import { formatCents } from '@/lib/crm-money'
import { getAvatarColor } from '@/lib/crm-ui'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { X, Loader2, FileText, Link2, Mic, Image as ImageIcon, ExternalLink, UserPlus, Film } from 'lucide-react'

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'
const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const brl = (n: number | null | undefined) => (n === null || n === undefined ? '—' : formatCents(Math.round(n * 100)))

type MediaTab = 'images' | 'documents' | 'audios' | 'videos' | 'links'

export function ContactInfoPanel({
  conversationId, onClose, onChanged,
}: {
  conversationId: string
  onClose: () => void
  onChanged: () => void
}) {
  const toast = useToast()
  const [data, setData] = useState<ContactPanelData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<MediaTab>('images')
  const [linking, setLinking] = useState(false)

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
              <p className="text-gray-500">{formatPhoneBR(data.phone_digits)}</p>
              <p className="mt-1 text-xs text-gray-400">WhatsApp: {data.instance_label}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
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

            {/* contato no sistema */}
            <section className="p-4 space-y-2">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Contato no sistema</h5>
              {data.contact ? (
                <div className="text-sm space-y-1">
                  <p className="font-medium text-gray-900">{data.contact.name}
                    <span className="ml-2 text-xs font-normal text-gray-500">{CONTACT_TYPE_LABEL[data.contact.type] ?? data.contact.type}</span>
                  </p>
                  {data.contact.company && <p className="text-gray-600">{data.contact.company}</p>}
                  {data.contact.email && <p className="text-gray-600 break-all">{data.contact.email}</p>}
                  {data.contact.phone && <p className="text-gray-500">{formatPhoneBR(data.contact.phone.replace(/\D/g, '').length <= 11 ? '55' + data.contact.phone.replace(/\D/g, '') : data.contact.phone)}</p>}
                  {data.contact.notes && <p className="text-gray-500 italic whitespace-pre-wrap">{data.contact.notes}</p>}
                  {!data.contact.linked && (
                    <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-amber-900 text-xs">
                      Encontrei este contato pelo telefone, mas a conversa ainda não está vinculada a ele.
                      <button disabled={linking} onClick={() => linkSuggested(data.contact!.id)} className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-900 text-white font-medium hover:bg-gray-700 disabled:opacity-60">
                        {linking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />} Vincular a esta conversa
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Nenhum contato cadastrado com este telefone. Use o botão de vincular no topo da conversa.</p>
              )}
            </section>

            {/* orçamentos */}
            <section className="p-4 space-y-2">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Orçamentos {data.quotes.length > 0 && <span className="text-gray-500">({data.quotes.length})</span>}</h5>
              {!data.contact && <p className="text-sm text-gray-500">Vincule um contato para ver os orçamentos.</p>}
              {data.contact && data.quotes.length === 0 && (
                <p className="text-sm text-gray-500">{data.quotes_restricted ? 'Nenhum orçamento seu para este contato.' : 'Este contato ainda não tem orçamentos.'}</p>
              )}
              <ul className="space-y-2">
                {data.quotes.map((q) => (
                  <li key={q.id}>
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
                        <span className="text-gray-500">{q.role === 'arquiteto' ? 'como arquiteto(a)' : ''}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs">
                        <span className="text-gray-500 truncate">{q.category ?? ''}</span>
                        <span className="font-semibold text-gray-800">{brl(q.negotiation?.final_value ?? q.value)}</span>
                      </div>
                      {q.negotiation?.loss_reason && <p className="mt-1 text-xs text-red-700">Motivo da perda: {q.negotiation.loss_reason}</p>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

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
