'use client'

// Tela de detalhe da Solicitação (Lote 1). Compõe o Tabs genérico com:
// - Orçamento: o QuoteDetail de sempre, reaproveitado 100% como está (não
//   forkado/duplicado) — inclusive o Histórico que já vive dentro dele —
//   mas com showNegotiation=false: a sub-seção de Negociação que o
//   QuoteDetail mostra quando o orçamento está concluído passa a viver só
//   na aba Negociação dedicada abaixo, pra não duplicar/confundir.
// - Negociação: reaproveita o mesmo NegotiationSection que o QuoteDetail usa
//   internamente (extraído dele), alimentado pelo primaryQuote — é o mesmo
//   registro de negociação, só exibido na aba certa.
// - As demais abas: resumos leves das tabelas já linkadas por
//   solicitation_id, mostrando o essencial de visita/projeto/expedição sem
//   duplicar as telas cheias de /negotiations, /shipping etc. (isso fica
//   pro Lote 2, junto da página-índice de /solicitacoes).

import { useEffect, useState, useTransition } from 'react'
import {
  ChevronLeft, Truck, MapPin, Calendar, ExternalLink, Check, CalendarDays, Ruler,
  ShoppingCart, Wrench, HeartHandshake, Pencil, Star, Trash2, Plus, Loader2, UploadCloud, CloudOff,
  FileText, Image as ImageIcon, Box, Paperclip,
} from 'lucide-react'
import Link from 'next/link'
import { Tabs, type TabItem } from '@/components/ui/Tabs'
import { QuoteDetail } from '@/components/quotes/QuoteDetail'
import { NegotiationSection } from '@/components/quotes/NegotiationSection'
import { formatDate, formatCurrency, cn } from '@/lib/utils'
import {
  SHIPMENT_STATUS_LABEL, SHIPMENT_PRIORITY_LABEL, SHIPMENT_DELIVERY_TYPE_LABEL,
  SHIPMENT_STATUS_COLOR, SHIPMENT_PRIORITY_COLOR,
} from '@/types'
import type { SolicitationView } from '@/lib/solicitations/actions'
import {
  savePurchaseChecklistItem, deletePurchaseChecklistItem, updatePurchaseChecklistItemStatus,
  saveInstallationTracking, deleteInstallationTracking,
  savePostSaleFollowup, deletePostSaleFollowup,
  createVisitForSolicitation, createDesignProjectForSolicitation,
  updateShipmentForSolicitation, updateVisitForSolicitation,
  updateDesignProjectKindForSolicitation, updateDesignProjectDescriptionForSolicitation,
  updateDesignProjectStatusForSolicitation, uploadStageFileForSolicitation, checkDriveConnected,
  listStageFilesForSolicitation, deleteVisitForSolicitation, deleteDesignProjectForSolicitation,
} from '@/lib/solicitations/actions'
import { RichTextEditor, RichTextView } from '@/components/solicitations/RichTextEditor'
import { useConfirm } from '@/components/ui/useConfirm'

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-gray-400 italic py-6 text-center">{children}</div>
}

// Card padrão do app (ver globals.css: fundo com leve degradê, borda
// surface-border, sombra em camadas, raio generoso) — mesma recipe usada em
// QuoteDetail/NegotiationSection, em vez do bare `border + rounded-lg` que
// as abas novas tinham antes.
function Card({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={cn('card p-4', className)} style={style}>{children}</div>
}

// Cabeçalho padrão dos formulários "Nova etapa" das abas leves — ícone
// temático + eyebrow, pra ficar claro que é um mini-formulário de cadastro
// e não um bloco solto.
function FormHeading({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3 text-brand-700">
      <Icon className="w-4 h-4" />
      <h3 className="eyebrow !text-brand-700">{children}</h3>
    </div>
  )
}

// Badge de status genérico (mesmo padrão de cores de STATUS_COLOR/
// SHIPMENT_STATUS_COLOR em src/types) pras tabelas novas que não têm uma
// paleta própria ainda.
function StatusBadge({ color, children }: { color: { bg: string; text: string }; children: React.ReactNode }) {
  return <span className={cn('badge font-semibold', color.bg, color.text)}>{children}</span>
}

// Status de visits (visits.status: 'to_schedule' | 'scheduled' | 'done',
// ver createVisitForSolicitation acima) e design_projects (enum
// design_project_status: 'fila' | 'em_andamento' | 'concluido') — mesma
// paleta usada em STATUS_COLOR/SHIPMENT_STATUS_COLOR (src/types).
const VISIT_STATUS_LABEL: Record<string, string> = {
  to_schedule: 'A agendar', scheduled: 'Agendada', done: 'Realizada', not_needed: 'Não necessária',
}
// Cores pedidas pela Letícia pro card de Visita (rodada 2): agendada=azul,
// realizada(done)=verde, cancelada/não necessária=cinza — mesma paleta das
// outras pills do app.
// `accent` = cor (hex, aplicada via style inline pra não depender da ordem
// de geração das classes Tailwind) da tarja esquerda do card (pedido
// Letícia, rodada 3): tinta mais suave que o fundo cheio anterior, mesmo
// peso visual de um "accent strip" comum, pra distinguir várias visitas sem
// competir com o conteúdo.
const VISIT_STATUS_COLOR: Record<string, { bg: string; text: string; accent: string }> = {
  to_schedule: { bg: 'bg-gray-100', text: 'text-gray-600', accent: '#d1d5db' },
  scheduled: { bg: 'bg-blue-50', text: 'text-blue-700', accent: '#3b82f6' },
  done: { bg: 'bg-green-50', text: 'text-green-700', accent: '#22c55e' },
  not_needed: { bg: 'bg-gray-100', text: 'text-gray-500', accent: '#d1d5db' },
}
const PROJECT_STATUS_LABEL: Record<string, string> = { fila: 'Na fila', em_andamento: 'Em andamento', concluido: 'Concluído' }
// `accent` adicionado (rodada 4, "quero o detalhe da cor igual visita"): a
// tarja esquerda do card de Projeto passa a seguir o STATUS (workflow:
// fila/em_andamento/concluido), não o kind (elaboração/alocação de pontos).
// Decisão: o accent da Visita já é guiado pelo status daquele registro
// (VISIT_STATUS_COLOR), então a leitura mais consistente entre as duas abas
// é "a cor da tarja = onde o registro está no fluxo", não a categoria fixa
// dele — kind continua tendo seu próprio badge colorido (PROJECT_KIND_COLOR),
// só não dirige mais a tarja.
const PROJECT_STATUS_COLOR: Record<string, { bg: string; text: string; accent: string }> = {
  fila: { bg: 'bg-gray-100', text: 'text-gray-600', accent: '#d1d5db' },
  em_andamento: { bg: 'bg-amber-50', text: 'text-amber-700', accent: '#f59e0b' },
  concluido: { bg: 'bg-green-50', text: 'text-green-700', accent: '#22c55e' },
}
// design_projects.kind (enum já existente: 'elaboracao' | 'alocacao_pontos' —
// ver 20260929_solicitations_core.sql) agora vira select colorido + badge em
// vez de texto plano, reaproveitando os 2 valores reais do banco (decisão:
// não inventar categorias novas já que o enum real já cobre o caso de uso
// pedido — "Elaboração" vs "Alocação de pontos").
const PROJECT_KIND_LABEL: Record<string, string> = { elaboracao: 'Elaboração', alocacao_pontos: 'Alocação de pontos' }
const PROJECT_KIND_COLOR: Record<string, { bg: string; text: string; tint: string }> = {
  elaboracao: { bg: 'bg-violet-50', text: 'text-violet-700', tint: 'bg-violet-50/40' },
  alocacao_pontos: { bg: 'bg-sky-50', text: 'text-sky-700', tint: 'bg-sky-50/40' },
}

// ── Upload de arquivo pro Drive por etapa (Visita/Projeto/Expedição) ──────
// Mesma UX de src/components/quotes/QuoteAttachments.tsx: spinner (Loader2)
// enquanto sobe, estado de sucesso/erro, e mensagem amigável no lugar do
// botão quando o Drive não está conectado — só que aqui é um botão simples
// (sem lista de arquivos já enviados, que ficaria pro Lote 2).
function StageFileUpload({ solicitationId, stage, onUploaded }: { solicitationId: string; stage: 'visita' | 'projeto' | 'expedicao'; onUploaded?: () => void }) {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [uploading, setUploading] = useState(false)
  // Progresso agregado ("3 de 5 enviados") em vez de um único resultado —
  // suporta múltiplos arquivos selecionados/arrastados de uma vez (pedido
  // Letícia: só aceitava 1 arquivo por vez).
  const [progress, setProgress] = useState<{ total: number; done: number } | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [lastOkNames, setLastOkNames] = useState<string[]>([])

  useEffect(() => {
    checkDriveConnected().then(setConnected).catch(() => setConnected(false))
  }, [])

  async function handleFiles(fileList: FileList | File[] | undefined) {
    const files = Array.from(fileList ?? [])
    if (files.length === 0) return
    setUploading(true)
    setErrors([])
    setLastOkNames([])
    setProgress({ total: files.length, done: 0 })
    const okNames: string[] = []
    const errMsgs: string[] = []
    // Sequencial (não Promise.all) de propósito: evita sobrecarregar a API
    // do Drive com N uploads simultâneos e permite mostrar "X de N" real.
    for (const file of files) {
      try {
        const fd = new FormData()
        fd.set('file', file)
        const res = await uploadStageFileForSolicitation(solicitationId, stage, fd)
        if (res.error) errMsgs.push(`${file.name}: ${res.error}`)
        else okNames.push(file.name)
      } catch (e: any) {
        errMsgs.push(`${file.name}: ${e?.message ?? 'Falha ao enviar arquivo'}`)
      } finally {
        setProgress(p => (p ? { ...p, done: p.done + 1 } : p))
      }
    }
    setLastOkNames(okNames)
    setErrors(errMsgs)
    setUploading(false)
    if (okNames.length > 0) onUploaded?.()
  }

  if (connected === false) {
    return (
      <p className="text-xs text-gray-400 flex items-center gap-1.5">
        <CloudOff className="w-3.5 h-3.5" /> Google Drive não conectado — conecte em Configurações para enviar arquivos.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <label className={cn('btn-secondary text-sm cursor-pointer', (uploading || connected === null) && 'opacity-60 pointer-events-none')}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
          {uploading && progress ? `Enviando ${progress.done} de ${progress.total}…` : 'Enviar arquivo(s)'}
          <input
            type="file"
            multiple
            className="hidden"
            disabled={uploading || connected !== true}
            onChange={(e) => { handleFiles(e.target.files ?? undefined); e.target.value = '' }}
          />
        </label>
        {!uploading && progress && errors.length === 0 && lastOkNames.length > 0 && (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <Check className="w-3.5 h-3.5" />
            {progress.total} de {progress.total} enviados.
          </span>
        )}
        {!uploading && progress && errors.length > 0 && (
          <span className="text-xs text-amber-600 flex items-center gap-1">
            {lastOkNames.length} de {progress.total} enviados.
          </span>
        )}
      </div>
      {errors.length > 0 && (
        <div className="text-xs text-red-600 space-y-0.5">
          {errors.map((err, i) => <div key={i}>{err}</div>)}
        </div>
      )}
    </div>
  )
}

// ── Lista de arquivos já enviados por etapa (Bug #1) ──────────────────────
// "o arquivo até subiu... mas onde consigo visualizar nessa tela?" — chama
// listStageFilesForSolicitation (mesma resolução de pasta do upload) e
// mostra cada arquivo como uma linha compacta (ícone por mime, nome, link
// que abre o webViewLink numa aba nova). `refreshKey` muda a cada upload bem
// sucedido em StageFileUpload pra forçar o refetch sem precisar de
// router.refresh() (mantém a lista local da etapa, sem recarregar a página
// toda).
function stageFileIcon(name: string, mime: string) {
  const ext = (name.split('.').pop() ?? '').toLowerCase()
  if (ext === 'pdf' || mime === 'application/pdf') return FileText
  if (['dwg', 'skp', 'skb'].includes(ext) || mime.includes('sketchup') || mime.includes('acad')) return Box
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'tif', 'tiff'].includes(ext)) return ImageIcon
  return FileText
}

function isImageFile(name: string, mime: string) {
  const ext = (name.split('.').pop() ?? '').toLowerCase()
  return mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'tif', 'tiff'].includes(ext)
}

function isPdfFile(name: string, mime: string) {
  const ext = (name.split('.').pop() ?? '').toLowerCase()
  return mime === 'application/pdf' || ext === 'pdf'
}

// ── Modal de pré-visualização (Bug "precisei logar no Drive") ─────────────
// Abre em cima da própria tela — imagem em tamanho real, PDF num iframe (o
// navegador já sabe renderizar PDF nativamente), qualquer outro tipo cai no
// fallback de "baixar" (ainda via proxy same-origin, então também não exige
// login no Google). Segue o mesmo padrão visual de backdrop do ConfirmModal.
function FilePreviewModal({ file, onClose }: { file: { id: string; name: string; mimeType: string }; onClose: () => void }) {
  const url = `/api/solicitacoes/drive-file/${file.id}`
  const isImage = isImageFile(file.name, file.mimeType)
  const isPdf = isPdfFile(file.name, file.mimeType)

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[9998] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-surface-border">
          <p className="text-sm font-medium truncate" title={file.name}>{file.name}</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1" aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[200px]">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={file.name} className="max-w-full max-h-[70vh] object-contain" />
          ) : isPdf ? (
            <iframe src={url} title={file.name} className="w-full h-[70vh] border-0" />
          ) : (
            <div className="text-center text-sm text-gray-500 space-y-3">
              <p>Não é possível pré-visualizar este tipo de arquivo.</p>
              <a href={url} target="_blank" rel="noreferrer" className="inline-block text-brand-700 hover:underline font-medium">
                Baixar arquivo
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StageFileList({ solicitationId, stage, refreshKey }: { solicitationId: string; stage: 'visita' | 'projeto' | 'expedicao'; refreshKey: number }) {
  const [files, setFiles] = useState<{ id: string; name: string; mimeType: string; webViewLink: string }[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<{ id: string; name: string; mimeType: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listStageFilesForSolicitation(solicitationId, stage)
      .then(r => { if (!cancelled) setFiles(r.files) })
      .catch(() => { if (!cancelled) setFiles([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [solicitationId, stage, refreshKey])

  if (loading) {
    return <p className="text-xs text-gray-400 flex items-center gap-1.5 mt-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando arquivos…</p>
  }
  if (!files || files.length === 0) return null

  return (
    <>
      {/* flex-wrap em vez de lista vertical — "podem ter muitos na mesma
          linha" (pedido da Letícia), tiles pequenos de ~72px. */}
      <div className="mt-2 flex flex-wrap gap-2">
        {files.map(f => {
          const Icon = stageFileIcon(f.name, f.mimeType)
          const image = isImageFile(f.name, f.mimeType)
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setPreview(f)}
              title={f.name}
              className="w-[72px] flex flex-col items-center gap-1 rounded-card border border-surface-border bg-white p-1.5 hover:border-brand-300 hover:shadow-sm transition-shadow text-left"
            >
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/solicitacoes/drive-file/${f.id}?thumb=1`}
                  alt={f.name}
                  loading="lazy"
                  className="w-full h-14 object-cover rounded"
                />
              ) : (
                <div className="w-full h-14 flex items-center justify-center rounded bg-gray-50">
                  <Icon className="w-6 h-6 text-gray-400" />
                </div>
              )}
              <span className="w-full truncate text-[10px] text-gray-500 text-center">{f.name}</span>
            </button>
          )
        })}
      </div>
      {preview && <FilePreviewModal file={preview} onClose={() => setPreview(null)} />}
    </>
  )
}

// ── Regra de "etapa concluída" por aba (Bug #9) ───────────────────────────
// Mesma semântica do protótipo aprovado: uma etapa é "concluída" quando já
// tem um desfecho registrado na tabela daquele setor — não apenas "tem
// registro". Usado pro prefixo ✓ na aba e pro contador do título.
function isStageDone(id: string, s: SolicitationView): boolean {
  switch (id) {
    case 'visita':
      return s.visits.some(v => v.status === 'done')
    case 'projeto':
      return s.designProjects.some(p => p.status === 'concluido')
    case 'orcamento':
      return s.quotes.some(q => q.status === 'done')
    case 'negociacao':
      return s.negotiations.some(n => n.temperature === 'closed' || n.temperature === 'lost')
    case 'compra':
      return s.purchaseChecklistItems.length > 0 && s.purchaseChecklistItems.every(i => i.status === 'recebido')
    case 'expedicao':
      return s.shipments.some(sh => sh.is_completed || sh.separation_status === 'delivered')
    case 'instalacao':
      return s.installationTrackings.some(i => i.status === 'concluida')
    case 'posVenda':
      return s.postSaleFollowups.some(f => !!f.resolution)
    default:
      return false
  }
}

export function SolicitationDetail({
  solicitation,
  primaryQuote,
  primaryQuoteActivities,
}: {
  solicitation: SolicitationView
  primaryQuote: any | null
  primaryQuoteActivities: any[]
}) {
  const STAGE_IDS = ['visita', 'projeto', 'orcamento', 'negociacao', 'compra', 'expedicao', 'instalacao', 'posVenda']
  const doneMap = Object.fromEntries(STAGE_IDS.map(id => [id, isStageDone(id, solicitation)]))
  const doneCount = Object.values(doneMap).filter(Boolean).length
  // Denominador do contador do título = só as etapas que já têm pelo menos
  // um registro vinculado a esta Solicitação (solicitation.tabs, já
  // calculado em getSolicitation), não o total fixo de etapas possíveis —
  // senão uma Solicitação sem Visita/Projeto aparece artificialmente
  // "atrasada" (pedido da Letícia: #558 tem só 6 das 8 etapas iniciadas e
  // deveria mostrar "2 de 6", não "2 de 8").
  const startedCount = STAGE_IDS.filter(id => solicitation.tabs[id as keyof typeof solicitation.tabs]).length

  function label(id: string, text: string) {
    return doneMap[id] ? `✓ ${text}` : text
  }

  const items: TabItem[] = [
    {
      id: 'visita',
      label: label('visita', 'Visita'),
      badge: solicitation.visits.length,
      content: (
        <div className="space-y-2">
          <AddVisitForm solicitation={solicitation} hasVisits={solicitation.visits.length > 0} />
          {solicitation.visits.map(v => (
            <VisitCard key={v.id} visit={v} solicitationId={solicitation.id} />
          ))}
        </div>
      ),
    },
    {
      id: 'projeto',
      label: label('projeto', 'Projeto'),
      badge: solicitation.designProjects.length,
      content: (
        <div className="space-y-3">
          <AddProjectForm solicitation={solicitation} hasProjects={solicitation.designProjects.length > 0} />
          {solicitation.designProjects.map(p => (
            <ProjectCard key={p.id} project={p} solicitationId={solicitation.id} />
          ))}
        </div>
      ),
    },
    {
      id: 'orcamento',
      label: label('orcamento', 'Orçamento'),
      badge: solicitation.quotes.length,
      content: primaryQuote ? (
        <QuoteDetail quote={primaryQuote} activities={primaryQuoteActivities} showNegotiation={false} />
      ) : (
        <Empty>Nenhum orçamento vinculado a esta solicitação.</Empty>
      ),
    },
    {
      id: 'negociacao',
      label: label('negociacao', 'Negociação'),
      badge: solicitation.negotiations.length,
      content: primaryQuote ? (
        <NegotiationSection quote={primaryQuote} />
      ) : (
        <Empty>Nenhuma negociação vinculada a esta solicitação.</Empty>
      ),
    },
    {
      id: 'compra',
      label: label('compra', 'Compra de material'),
      badge: solicitation.purchaseChecklistItems.length,
      content: (
        <PurchaseChecklistTab
          solicitationId={solicitation.id}
          items={solicitation.purchaseChecklistItems}
          suppliers={solicitation.suppliers}
        />
      ),
    },
    {
      id: 'expedicao',
      label: label('expedicao', 'Separação e entrega'),
      badge: solicitation.shipments.length,
      content: (
        <div className="space-y-3">
          {solicitation.shipments.length === 0 && <Empty>Nenhuma expedição vinculada a esta solicitação.</Empty>}
          {solicitation.shipments.map(s => <ShipmentCard key={s.id} shipment={s} />)}
        </div>
      ),
    },
    {
      id: 'instalacao',
      label: label('instalacao', 'Instalação'),
      badge: solicitation.installationTrackings.length,
      content: <InstallationTab solicitationId={solicitation.id} items={solicitation.installationTrackings} />,
    },
    {
      id: 'posVenda',
      label: label('posVenda', 'Pós-venda'),
      badge: solicitation.postSaleFollowups.length,
      content: <PostSaleTab solicitationId={solicitation.id} items={solicitation.postSaleFollowups} />,
    },
  ]

  return (
    <div>
      <Link href="/solicitacoes" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ChevronLeft className="w-4 h-4" /> Solicitações
      </Link>
      <div className="flex items-center gap-3 flex-wrap mb-1">
        <h1 className="text-xl font-semibold">Solicitação #{solicitation.number}</h1>
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-700"
          title='Etapa concluída = já tem um desfecho registrado (orçamento concluído, negociação fechada/perdida, compra toda recebida, etc.). O total considera só as etapas já iniciadas (com algum registro) nesta Solicitação.'
        >
          {doneCount} de {startedCount} etapas concluídas
        </span>
      </div>
      <div className="text-sm text-gray-500 mb-6">
        {solicitation.clientName ?? 'Cliente'} {solicitation.architectName ? `· Arquiteto(a): ${solicitation.architectName}` : ''} · Criada em {formatDate(solicitation.createdAt)}
      </div>
      <Tabs items={items} />
    </div>
  )
}

// ── Entrar em Visita/Projeto a partir da Solicitação (Bug #8) ───────────

function AddVisitForm({ solicitation, hasVisits }: { solicitation: SolicitationView; hasVisits: boolean }) {
  const [open, setOpen] = useState(!hasVisits)
  const [title, setTitle] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [address, setAddress] = useState('')
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="btn-secondary text-sm w-full justify-center border-dashed">
        <Plus className="w-4 h-4" /> Adicionar visita
      </button>
    )
  }

  return (
    <Card>
      <FormHeading icon={CalendarDays}>Nova visita</FormHeading>
      {!hasVisits && <Empty>Nenhuma visita registrada nesta solicitação ainda.</Empty>}
      <div className="space-y-2">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título da visita"
          className="input" />
        <div className="flex flex-wrap gap-2">
          <input type="date" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
            className="input w-auto" />
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Endereço (opcional)"
            className="input flex-1 min-w-[160px]" />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" disabled={pending || !title.trim()} className="btn-primary px-4 py-1.5 text-sm"
            onClick={() => startTransition(async () => {
              await createVisitForSolicitation({
                solicitationId: solicitation.id,
                clientId: solicitation.clientId,
                architectId: solicitation.architectId,
                title,
                scheduledAt: scheduledAt || null,
                address: address || null,
              })
              setOpen(false); setTitle(''); setScheduledAt(''); setAddress('')
            })}
          >Salvar</button>
          {hasVisits && <button type="button" onClick={() => setOpen(false)} className="btn-secondary px-4 py-1.5 text-sm">Cancelar</button>}
        </div>
      </div>
    </Card>
  )
}

// Card de Visita compacto (pedido Letícia, rodada 2): item de lista denso em
// vez do "hero card" full-width anterior, com cor de acento por status
// (VISIT_STATUS_COLOR) e botão Editar (mesmo ícone/convenção do Editar de
// Separação e entrega, ver ShipmentCard) abrindo um formulário inline pra
// título/data/endereço/status.
function VisitCard({ visit: v, solicitationId }: { visit: any; solicitationId: string }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(v.title ?? '')
  const [scheduledAt, setScheduledAt] = useState(v.scheduled_at ? String(v.scheduled_at).slice(0, 10) : '')
  const [address, setAddress] = useState(v.address ?? '')
  const [status, setStatus] = useState(v.status ?? 'to_schedule')
  const [pending, startTransition] = useTransition()
  const [fileRefreshKey, setFileRefreshKey] = useState(0)
  const { confirm, ConfirmDialog } = useConfirm()
  const color = VISIT_STATUS_COLOR[v.status] ?? VISIT_STATUS_COLOR.to_schedule

  async function handleDelete() {
    const yes = await confirm(`Excluir a visita "${v.title || 'Visita'}"? Essa ação não pode ser desfeita.`, 'Excluir')
    if (!yes) return
    startTransition(async () => { await deleteVisitForSolicitation(v.id, solicitationId) })
  }

  function save() {
    startTransition(async () => {
      await updateVisitForSolicitation(v.id, solicitationId, {
        title, scheduledAt: scheduledAt || null, address: address || null, status,
      })
      setEditing(false)
    })
  }

  // Select de status com o MESMO padrão já aprovado em Compra de
  // material/Instalação: classes de `badge` coloridas pela cor do status
  // atual direto no `<select>`, sem `appearance-none` (classe `.select`) —
  // é isso que deixa a setinha nativa do navegador visível por cima do
  // fundo colorido, em vez do select "pelado" que tinha antes aqui.
  const statusColor = VISIT_STATUS_COLOR[status] ?? VISIT_STATUS_COLOR.to_schedule

  return (
    <div
      className="rounded-card border border-surface-border bg-white px-3 py-2.5 transition-colors"
      style={{ borderLeftWidth: 4, borderLeftColor: color.accent }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Calendar className={cn('w-4 h-4 shrink-0', color.text)} />
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">{v.title || 'Visita'}</div>
            <div className="text-xs text-gray-500 truncate">
              {v.scheduled_at ? formatDate(v.scheduled_at) : 'Sem data agendada'} {v.scheduled_time ? `· ${v.scheduled_time}` : ''}
              {v.address ? ` · ${v.address}` : ''}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge color={color}>{VISIT_STATUS_LABEL[v.status] ?? v.status}</StatusBadge>
          {!editing && (
            <button type="button" onClick={() => setEditing(true)} className="btn-ghost text-xs">
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
          )}
          <button type="button" onClick={handleDelete} disabled={pending} className="text-gray-400 hover:text-red-500 p-1" title="Excluir visita">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {editing && (
        <div className="space-y-2 bg-surface-secondary/60 rounded-card p-3 mt-2">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título da visita" className="input" />
          <div className="flex flex-wrap gap-2">
            <input type="date" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="input w-auto" />
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Endereço" className="input flex-1 min-w-[160px]" />
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className={cn('badge font-semibold border-0 cursor-pointer', statusColor.bg, statusColor.text)}
            >
              {Object.entries(VISIT_STATUS_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={pending} className="btn-primary px-4 py-1.5 text-sm">Salvar</button>
            <button type="button" onClick={() => setEditing(false)} disabled={pending} className="btn-secondary px-4 py-1.5 text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {v.notes && <div className="text-sm mt-2 text-gray-700">{v.notes}</div>}

      {/* Upload pro Drive só depois que a visita foi realizada (status
          'done' no banco — pedido original dizia "realizada", que é a
          label em PT desse mesmo valor). */}
      {v.status === 'done' && (
        <div className="mt-2.5 pt-2.5 border-t border-black/5">
          <StageFileUpload solicitationId={solicitationId} stage="visita" onUploaded={() => setFileRefreshKey(k => k + 1)} />
          <StageFileList solicitationId={solicitationId} stage="visita" refreshKey={fileRefreshKey} />
        </div>
      )}
      {ConfirmDialog}
    </div>
  )
}

function AddProjectForm({ solicitation, hasProjects }: { solicitation: SolicitationView; hasProjects: boolean }) {
  const [open, setOpen] = useState(!hasProjects)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<'elaboracao' | 'alocacao_pontos'>('elaboracao')
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="btn-secondary text-sm w-full justify-center border-dashed">
        <Plus className="w-4 h-4" /> Adicionar projeto
      </button>
    )
  }

  return (
    <Card>
      <FormHeading icon={Ruler}>Novo projeto</FormHeading>
      {!hasProjects && <Empty>Nenhum projeto vinculado a esta solicitação ainda.</Empty>}
      <div className="space-y-2">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título do projeto"
          className="input" />
        <div className="flex flex-wrap gap-2">
          <select value={kind} onChange={e => setKind(e.target.value as any)}
            className="select w-auto">
            <option value="elaboracao">Elaboração</option>
            <option value="alocacao_pontos">Alocação de pontos</option>
          </select>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição (opcional)"
            className="input flex-1 min-w-[160px]" />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" disabled={pending || !title.trim()} className="btn-primary px-4 py-1.5 text-sm"
            onClick={() => startTransition(async () => {
              await createDesignProjectForSolicitation({
                solicitationId: solicitation.id,
                clientId: solicitation.clientId,
                architectId: solicitation.architectId,
                title, description: description || null, kind,
              })
              setOpen(false); setTitle(''); setDescription('')
            })}
          >Salvar</button>
          {hasProjects && <button type="button" onClick={() => setOpen(false)} className="btn-secondary px-4 py-1.5 text-sm">Cancelar</button>}
        </div>
      </div>
    </Card>
  )
}

// Card de Projeto mais rico (pedido Letícia, rodada 2): tinta de fundo pela
// categoria (kind), badge colorido + select de categoria editável inline,
// select de status real (design_project_status) chamando a mesma
// updateDesignProjectStatus de design-projects-actions.ts (via wrapper com
// revalidatePath desta tela), e o campo de descrição virando o editor de
// texto rico (RichTextEditor/RichTextView) em cima da coluna
// design_projects.description já existente.
function ProjectCard({ project: p, solicitationId }: { project: any; solicitationId: string }) {
  const [editingDescription, setEditingDescription] = useState(false)
  const [description, setDescription] = useState(p.description ?? '')
  const [pending, startTransition] = useTransition()
  const [fileRefreshKey, setFileRefreshKey] = useState(0)
  const { confirm, ConfirmDialog } = useConfirm()
  const kindColor = PROJECT_KIND_COLOR[p.kind] ?? PROJECT_KIND_COLOR.elaboracao
  // Tarja esquerda pelo status do projeto (ver nota em PROJECT_STATUS_COLOR
  // acima) — mesma convenção da Visita, em vez do kind.
  const statusAccent = (PROJECT_STATUS_COLOR[p.status] ?? PROJECT_STATUS_COLOR.fila).accent

  function changeKind(kind: string) {
    startTransition(async () => { await updateDesignProjectKindForSolicitation(p.id, solicitationId, kind as any) })
  }
  function changeStatus(status: string) {
    startTransition(async () => { await updateDesignProjectStatusForSolicitation(p.id, solicitationId, status as any) })
  }
  function saveDescription() {
    startTransition(async () => {
      await updateDesignProjectDescriptionForSolicitation(p.id, solicitationId, description)
      setEditingDescription(false)
    })
  }
  // Persiste o toggle de checkbox feito na view somente-leitura (Bug #3: "o
  // check volta a ficar deselecionado") — fire-and-forget, mesmo padrão das
  // outras edições inline desta tela.
  function persistCheckToggle(html: string) {
    startTransition(async () => { await updateDesignProjectDescriptionForSolicitation(p.id, solicitationId, html) })
  }
  async function handleDelete() {
    const yes = await confirm(`Excluir o projeto "${p.title}"? Essa ação não pode ser desfeita.`, 'Excluir')
    if (!yes) return
    startTransition(async () => { await deleteDesignProjectForSolicitation(p.id, solicitationId) })
  }

  return (
    <Card className={cn(kindColor.tint, 'border-0')} style={{ borderLeftWidth: 4, borderLeftColor: statusAccent, borderLeftStyle: 'solid' }}>
      <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
        <div className="flex items-center gap-2">
          <Ruler className="w-4 h-4 text-brand-500 shrink-0" />
          <div className="font-medium">{p.title}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={p.kind}
            disabled={pending}
            onChange={e => changeKind(e.target.value)}
            className={cn('badge font-semibold border-0 cursor-pointer', kindColor.bg, kindColor.text)}
          >
            {Object.entries(PROJECT_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select
            value={p.status}
            disabled={pending}
            onChange={e => changeStatus(e.target.value)}
            className={cn('badge font-semibold border-0 cursor-pointer', (PROJECT_STATUS_COLOR[p.status] ?? PROJECT_STATUS_COLOR.fila).bg, (PROJECT_STATUS_COLOR[p.status] ?? PROJECT_STATUS_COLOR.fila).text)}
          >
            {Object.entries(PROJECT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button type="button" onClick={handleDelete} disabled={pending} className="text-gray-400 hover:text-red-500 p-1" title="Excluir projeto">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="bg-white/60 rounded-card p-2.5">
        {editingDescription ? (
          <div className="space-y-2">
            <RichTextEditor value={description} onChange={setDescription} placeholder="Notas do projeto…" />
            <div className="flex gap-2">
              <button type="button" onClick={saveDescription} disabled={pending} className="btn-primary px-4 py-1.5 text-sm">Salvar</button>
              <button type="button" onClick={() => { setEditingDescription(false); setDescription(p.description ?? '') }} disabled={pending} className="btn-secondary px-4 py-1.5 text-sm">Cancelar</button>
            </div>
          </div>
        ) : (
          <div>
            {p.description ? <RichTextView html={p.description} onCheckToggle={persistCheckToggle} /> : <span className="text-sm text-gray-400 italic">Sem notas ainda.</span>}
            <button type="button" onClick={() => setEditingDescription(true)} className="btn-ghost text-xs mt-1.5">
              <Pencil className="w-3.5 h-3.5" /> Editar
            </button>
          </div>
        )}
      </div>

      <div className="mt-2.5 pt-2.5 border-t border-black/5">
        <StageFileUpload solicitationId={solicitationId} stage="projeto" onUploaded={() => setFileRefreshKey(k => k + 1)} />
        <StageFileList solicitationId={solicitationId} stage="projeto" refreshKey={fileRefreshKey} />
      </div>
      {ConfirmDialog}
    </Card>
  )
}

// ── Compra de material ─────────────────────────────────────────────────

const PURCHASE_STATUS_LABEL: Record<string, string> = { a_pedir: 'A pedir', pedido: 'Pedido', recebido: 'Recebido' }
// `accent` seguindo o mesmo padrão de tarja esquerda das demais etapas
// (consistência pedida na rodada 4 — "teste e analise todas as etapas").
const PURCHASE_STATUS_COLOR: Record<string, { bg: string; text: string; accent: string }> = {
  a_pedir: { bg: 'bg-gray-100', text: 'text-gray-600', accent: '#d1d5db' },
  pedido: { bg: 'bg-amber-50', text: 'text-amber-700', accent: '#f59e0b' },
  recebido: { bg: 'bg-green-50', text: 'text-green-700', accent: '#22c55e' },
}

function PurchaseChecklistTab({ solicitationId, items, suppliers }: { solicitationId: string; items: any[]; suppliers: { id: string; name: string }[] }) {
  const [description, setDescription] = useState('')
  const [supplier, setSupplier] = useState('')
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('')
  const [pending, startTransition] = useTransition()

  function add() {
    if (!description.trim()) return
    startTransition(async () => {
      await savePurchaseChecklistItem({ solicitationId, description, supplier, expectedDeliveryDate: expectedDeliveryDate || null })
      setDescription('')
      setSupplier('')
      setExpectedDeliveryDate('')
    })
  }

  return (
    <div className="space-y-3">
      <Card>
        <FormHeading icon={ShoppingCart}>Novo item de compra</FormHeading>
        <div className="flex flex-wrap gap-2">
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição do item"
            className="input flex-1 min-w-[180px]" />
          <select value={supplier} onChange={e => setSupplier(e.target.value)}
            className="select min-w-[140px] w-auto">
            <option value="">Fornecedor (opcional)</option>
            {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
          <input type="date" value={expectedDeliveryDate} onChange={e => setExpectedDeliveryDate(e.target.value)}
            title="Previsão de entrega informada ao cliente"
            className="input w-auto" />
          <button type="button" onClick={add} disabled={pending} className="btn-primary px-4 py-1.5 text-sm">
            <Plus className="w-4 h-4" /> Adicionar
          </button>
        </div>
      </Card>
      {items.length === 0 && <Empty>Nenhum item de compra ainda.</Empty>}
      {items.map(item => (
        <Card key={item.id} style={{ borderLeftWidth: 4, borderLeftColor: (PURCHASE_STATUS_COLOR[item.status] ?? PURCHASE_STATUS_COLOR.a_pedir).accent, borderLeftStyle: 'solid' }}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="font-medium">{item.description}</div>
              {item.supplier && <div className="text-sm text-gray-500">{item.supplier}</div>}
              {item.expected_delivery_date && (
                <div className="text-xs text-gray-400 mt-0.5">Previsão de entrega ao cliente: {formatDate(item.expected_delivery_date)}</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={item.status}
                disabled={pending}
                onChange={e => startTransition(async () => {
                  await updatePurchaseChecklistItemStatus(item.id, solicitationId, e.target.value as any)
                })}
                className={cn('badge font-semibold border-0 cursor-pointer', (PURCHASE_STATUS_COLOR[item.status] ?? PURCHASE_STATUS_COLOR.a_pedir).bg, (PURCHASE_STATUS_COLOR[item.status] ?? PURCHASE_STATUS_COLOR.a_pedir).text)}
              >
                {Object.entries(PURCHASE_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button type="button" onClick={() => startTransition(async () => { await deletePurchaseChecklistItem(item.id, solicitationId) })}
                disabled={pending} className="text-gray-400 hover:text-red-500 p-1" title="Remover">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

// ── Separação e entrega (shipments) ──────────────────────────────────────
// Mesmas labels/cores de src/types (SHIPMENT_*) e o mesmo conjunto de campos
// mostrado em src/components/shipping/ShippingViewModal.tsx (status,
// prioridade, tipo/data de entrega, recebimento, foto, link de separação),
// só que inline na aba em vez de modal — reaproveita o padrão visual sem
// tocar nos componentes de /shipping.

// Tarja esquerda da Separação pelo separation_status — mesma convenção de
// Visita/Projeto (accent hex por status), reaproveitando as cores já
// definidas em SHIPMENT_STATUS_COLOR (src/types) só que resolvendo o hex a
// partir das classes bg-*/text-* existentes não é direto, então mapeamos um
// hex equivalente aqui pra consistência visual sem tocar em src/types
// (guardrail: não mexer nas rotas/telas de /shipping que também usam esse
// arquivo de cores).
const SHIPMENT_STATUS_ACCENT: Record<string, string> = {
  queued: '#d1d5db',
  in_progress: '#f59e0b',
  awaiting_material: '#f59e0b',
  completed: '#22c55e',
  delivered: '#22c55e',
}

function ShipmentCard({ shipment: s }: { shipment: any }) {
  const [editing, setEditing] = useState(false)
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>(s.delivery_type ?? 'delivery')
  const [deliveryDate, setDeliveryDate] = useState(s.delivery_date ?? '')
  const [status, setStatus] = useState<string>(s.separation_status ?? 'queued')
  const [priority, setPriority] = useState<string>(s.priority ?? 'mid')
  const [pending, startTransition] = useTransition()
  const [fileRefreshKey, setFileRefreshKey] = useState(0)
  const statusColor = SHIPMENT_STATUS_COLOR[s.separation_status as keyof typeof SHIPMENT_STATUS_COLOR]
  const statusAccent = SHIPMENT_STATUS_ACCENT[s.separation_status as string] ?? SHIPMENT_STATUS_ACCENT.queued
  const priorityColor = SHIPMENT_PRIORITY_COLOR[s.priority as keyof typeof SHIPMENT_PRIORITY_COLOR]
  // Cores dos selects de edição seguem o valor sendo editado (não o salvo),
  // pra dar feedback imediato ao trocar — mesmo padrão colorido do select de
  // status/categoria do Projeto.
  const editStatusColor = SHIPMENT_STATUS_COLOR[status as keyof typeof SHIPMENT_STATUS_COLOR]
  const editPriorityColor = SHIPMENT_PRIORITY_COLOR[priority as keyof typeof SHIPMENT_PRIORITY_COLOR]

  function save() {
    startTransition(async () => {
      await updateShipmentForSolicitation(s.id, s.solicitation_id, {
        delivery_type: deliveryType,
        separation_status: status as any,
        priority: priority as any,
        ...(deliveryDate ? { delivery_date: deliveryDate } : {}),
      })
      setEditing(false)
    })
  }

  function cancel() {
    setDeliveryType(s.delivery_type ?? 'delivery')
    setDeliveryDate(s.delivery_date ?? '')
    setStatus(s.separation_status ?? 'queued')
    setPriority(s.priority ?? 'mid')
    setEditing(false)
  }

  return (
    <Card style={{ borderLeftWidth: 4, borderLeftColor: statusAccent, borderLeftStyle: 'solid' }}>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div className="flex items-center gap-2 text-brand-700">
          <Truck className="w-4 h-4" />
          <h3 className="eyebrow !text-brand-700">Separação e entrega</h3>
        </div>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="btn-ghost text-xs">
            <Pencil className="w-3.5 h-3.5" /> Editar
          </button>
        )}
      </div>

      {/* Edição OU visualização, nunca os dois ao mesmo tempo (bug relatado:
          clicar em Editar duplicava a view normal embaixo do formulário). */}
      {editing ? (
        <div className="space-y-2 bg-surface-secondary/60 rounded-card p-3">
          <div className="flex flex-wrap gap-2">
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className={cn('badge font-semibold border-0 cursor-pointer', editStatusColor?.bg, editStatusColor?.text)}
            >
              {Object.entries(SHIPMENT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select
              value={priority}
              onChange={e => setPriority(e.target.value)}
              className={cn('badge font-semibold border-0 cursor-pointer', editPriorityColor?.bg, editPriorityColor?.text)}
            >
              {Object.entries(SHIPMENT_PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={deliveryType} onChange={e => setDeliveryType(e.target.value as any)} className="select w-auto">
              <option value="delivery">Entrega</option>
              <option value="pickup">Retirada</option>
            </select>
            <input type="date" value={deliveryDate ? String(deliveryDate).slice(0, 10) : ''} onChange={e => setDeliveryDate(e.target.value)}
              className="input w-auto" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={pending} className="btn-primary px-4 py-1.5 text-sm">Salvar</button>
            <button type="button" onClick={cancel} disabled={pending} className="btn-secondary px-4 py-1.5 text-sm">Cancelar</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {statusColor && (
              <span className={cn('badge text-xs font-semibold', statusColor.bg, statusColor.text)}>
                {SHIPMENT_STATUS_LABEL[s.separation_status as keyof typeof SHIPMENT_STATUS_LABEL] ?? s.separation_status}
              </span>
            )}
            {priorityColor && (
              <span className={cn('badge text-xs font-semibold', priorityColor.bg, priorityColor.text)}>
                {SHIPMENT_PRIORITY_LABEL[s.priority as keyof typeof SHIPMENT_PRIORITY_LABEL] ?? s.priority}
              </span>
            )}
            {s.is_completed && (
              <span className="inline-flex items-center gap-1 badge text-xs font-semibold bg-emerald-50 text-emerald-700">
                <Check className="w-3 h-3" /> Entregue
              </span>
            )}
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-gray-700">
              {s.delivery_type === 'delivery' ? <Truck className="w-4 h-4 text-brand-500 shrink-0" /> : <MapPin className="w-4 h-4 text-brand-500 shrink-0" />}
              <span>{s.delivery_type ? SHIPMENT_DELIVERY_TYPE_LABEL[s.delivery_type as keyof typeof SHIPMENT_DELIVERY_TYPE_LABEL] : <span className="text-gray-400">Tipo não definido</span>}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <Calendar className="w-4 h-4 text-brand-500 shrink-0" />
              <span>{s.delivery_date ? formatDate(s.delivery_date) : <span className="text-gray-400">Data não definida</span>}</span>
            </div>
            {s.received_by && (
              <div className="text-gray-500">
                Recebido por {s.received_by}{s.received_at ? ` em ${formatDate(s.received_at)}` : ''}
              </div>
            )}
            {s.completed_at && (
              <div className="text-gray-400 text-xs">Entregue em {formatDate(s.completed_at)}</div>
            )}
            {s.delivery_photo_url && (
              <a href={s.delivery_photo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 underline">
                Foto da entrega
              </a>
            )}
            {s.drive_link && (
              <a href={s.drive_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-brand-600 hover:text-brand-700 font-medium">
                <ExternalLink className="w-3.5 h-3.5" /> Pasta de separação
              </a>
            )}
          </div>
        </>
      )}

      <div className="mt-2.5 pt-2.5 border-t border-surface-border">
        <StageFileUpload solicitationId={s.solicitation_id} stage="expedicao" onUploaded={() => setFileRefreshKey(k => k + 1)} />
        <StageFileList solicitationId={s.solicitation_id} stage="expedicao" refreshKey={fileRefreshKey} />
      </div>
    </Card>
  )
}

// ── Acompanhamento de instalação ─────────────────────────────────────────

const INSTALLATION_STATUS_LABEL: Record<string, string> = {
  agendada: 'Agendada', em_andamento: 'Em andamento', concluida: 'Concluída', com_pendencia: 'Com pendência',
}
// Mesma lógica de cor dos outros status pills do app (agendada=azul,
// em_andamento=âmbar, concluida=verde, com_pendencia=vermelho — pedido
// explícito da Letícia pra ficar consistente com o resto do sistema).
const INSTALLATION_STATUS_COLOR: Record<string, { bg: string; text: string; accent: string }> = {
  agendada: { bg: 'bg-blue-50', text: 'text-blue-700', accent: '#3b82f6' },
  em_andamento: { bg: 'bg-amber-50', text: 'text-amber-700', accent: '#f59e0b' },
  concluida: { bg: 'bg-green-50', text: 'text-green-700', accent: '#22c55e' },
  com_pendencia: { bg: 'bg-red-50', text: 'text-red-700', accent: '#ef4444' },
}

function InstallationTab({ solicitationId, items }: { solicitationId: string; items: any[] }) {
  const [team, setTeam] = useState('')
  const [date, setDate] = useState('')
  const [status, setStatus] = useState<'agendada' | 'em_andamento' | 'concluida' | 'com_pendencia'>('agendada')
  const [notes, setNotes] = useState('')
  const [pending, startTransition] = useTransition()

  function add() {
    startTransition(async () => {
      await saveInstallationTracking({ solicitationId, team, scheduledDate: date || null, status, notes: notes || null })
      setTeam('')
      setDate('')
      setStatus('agendada')
      setNotes('')
    })
  }

  function changeStatus(item: any, next: string) {
    startTransition(async () => {
      await saveInstallationTracking({ id: item.id, solicitationId, team: item.team, scheduledDate: item.scheduled_date, status: next as any, notes: item.notes })
    })
  }

  return (
    <div className="space-y-3">
      <Card>
        <FormHeading icon={Wrench}>Nova instalação</FormHeading>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <input value={team} onChange={e => setTeam(e.target.value)} placeholder="Equipe"
              className="input flex-1 min-w-[160px]" />
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="input w-auto" />
            <select value={status} onChange={e => setStatus(e.target.value as any)} className="select w-auto">
              {Object.entries(INSTALLATION_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas (opcional)" className="input" />
          <div className="pt-1">
            <button type="button" onClick={add} disabled={pending} className="btn-primary px-4 py-1.5 text-sm">
              <Plus className="w-4 h-4" /> Agendar
            </button>
          </div>
        </div>
      </Card>
      {items.length === 0 && <Empty>Nenhuma instalação agendada ainda.</Empty>}
      {items.map(item => {
        const color = INSTALLATION_STATUS_COLOR[item.status] ?? INSTALLATION_STATUS_COLOR.agendada
        return (
          <Card key={item.id} style={{ borderLeftWidth: 4, borderLeftColor: color.accent, borderLeftStyle: 'solid' }}>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <div className="font-medium flex items-center gap-1.5">
                  <Wrench className="w-4 h-4 text-brand-500 shrink-0" />
                  {item.team || 'Equipe a definir'}
                </div>
                <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
                  <Calendar className="w-3.5 h-3.5 text-brand-500 shrink-0" />
                  {item.scheduled_date ? formatDate(item.scheduled_date) : 'Sem data'}
                </div>
                {item.notes && <div className="text-sm mt-2 text-gray-700">{item.notes}</div>}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={item.status}
                  disabled={pending}
                  onChange={e => changeStatus(item, e.target.value)}
                  className={cn('badge font-semibold border-0 cursor-pointer', color.bg, color.text)}
                >
                  {Object.entries(INSTALLATION_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button type="button" onClick={() => startTransition(async () => { await deleteInstallationTracking(item.id, solicitationId) })}
                  disabled={pending} className="text-gray-400 hover:text-red-500 p-1" title="Remover">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ── Pós-venda ─────────────────────────────────────────────────────────────
// satisfaction continua sendo text no banco (post_sale_followups.satisfaction
// — sem migration necessária), só a UI vira um seletor de 1 a 5 estrelas que
// grava o número como string (ex. "5"); registros antigos que porventura
// tenham texto livre nesse campo caem no fallback de StarRating abaixo.

function StarRating({ value, onChange, readOnly }: { value: number; onChange?: (n: number) => void; readOnly?: boolean }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          className={cn(readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110 transition-transform')}
          aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
        >
          <Star className={cn('w-4 h-4', n <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300')} />
        </button>
      ))}
    </div>
  )
}

function PostSaleTab({ solicitationId, items }: { solicitationId: string; items: any[] }) {
  const [satisfaction, setSatisfaction] = useState(0)
  const [issue, setIssue] = useState('')
  const [resolution, setResolution] = useState('')
  const [pending, startTransition] = useTransition()

  function add() {
    startTransition(async () => {
      await savePostSaleFollowup({
        solicitationId,
        satisfaction: satisfaction > 0 ? String(satisfaction) : null,
        issueReported: issue || null,
        resolution: resolution || null,
        contactedAt: new Date().toISOString(),
      })
      setSatisfaction(0)
      setIssue('')
      setResolution('')
    })
  }

  return (
    <div className="space-y-3">
      <Card>
        <FormHeading icon={HeartHandshake}>Novo contato de pós-venda</FormHeading>
        <div className="space-y-3">
          <div>
            <label className="label">Satisfação do cliente</label>
            <StarRating value={satisfaction} onChange={setSatisfaction} />
          </div>
          <input value={issue} onChange={e => setIssue(e.target.value)} placeholder="Problema relatado (opcional)"
            className="input" />
          <input value={resolution} onChange={e => setResolution(e.target.value)} placeholder="Encaminhamento / resolução (opcional)"
            className="input" />
          <button type="button" onClick={add} disabled={pending} className="btn-primary px-4 py-1.5 text-sm">
            <Plus className="w-4 h-4" /> Registrar contato
          </button>
        </div>
      </Card>
      {items.length === 0 && <Empty>Nenhum contato de pós-venda registrado ainda.</Empty>}
      {items.map(item => {
        const stars = Number(item.satisfaction)
        // Pós-venda não tem um enum de status próprio (só satisfação/
        // problema/resolução) — pra manter a mesma convenção de tarja
        // colorida das outras etapas, usamos "tem resolução registrada" como
        // o sinal de desfecho (mesma regra de isStageDone pra esta aba).
        const accent = item.resolution ? '#22c55e' : item.issue_reported ? '#f59e0b' : '#d1d5db'
        return (
          <Card key={item.id} style={{ borderLeftWidth: 4, borderLeftColor: accent, borderLeftStyle: 'solid' }}>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="text-sm text-gray-500">{item.contacted_at ? formatDate(item.contacted_at) : ''}</div>
              {Number.isFinite(stars) && stars > 0 ? (
                <StarRating value={stars} readOnly />
              ) : item.satisfaction ? (
                <span className="text-sm font-medium">{item.satisfaction}</span>
              ) : null}
            </div>
            {item.issue_reported && <div className="text-sm mt-2"><span className="text-gray-500">Problema:</span> {item.issue_reported}</div>}
            {item.resolution && <div className="text-sm mt-1"><span className="text-gray-500">Encaminhamento:</span> {item.resolution}</div>}
            <button type="button" onClick={() => startTransition(async () => { await deletePostSaleFollowup(item.id, solicitationId) })}
              disabled={pending} className="text-gray-400 hover:text-red-500 mt-2 p-1" title="Remover">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </Card>
        )
      })}
    </div>
  )
}
