'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Pencil, Check, FileText, Loader2, CalendarDays, AlertCircle, ChevronDown, ChevronRight, FileUp, Sparkles, Download, Eye } from 'lucide-react'
import { cn, formatCurrency, formatDate, isOverdue } from '@/lib/utils'
import { QUOTE_STATUS_LABEL, QUOTE_STATUS_HINT, STATUS_COLOR } from '@/types'
import {
  getQuoteProposals, createQuoteProposal, updateQuoteProposal, deleteQuoteProposal,
  addProposalFile, updateProposalFileValue, removeProposalFile,
  getAllQuoteAttachments, deleteQuoteAttachment, getQuoteAttachmentUrl,
} from '@/lib/actions'
import {
  createQuoteForSolicitation, deleteQuoteFromSolicitation,
  updateQuoteStatusWithCompletion, updateQuoteDeadline,
} from '@/lib/solicitations/actions'
import type { SolicitationView } from '@/lib/solicitations/actions'
import { uploadQuoteFile } from '@/lib/quote-upload'
import { extractQuoteValueFromPdf } from '@/lib/extract-quote-pdf'
import { useConfirm } from '@/components/ui/useConfirm'
import { QuoteSchedules } from '@/components/quotes/QuoteSchedules'
import { StageFilesColumn } from '@/components/solicitations/StageFiles'

// Fluxo principal (linear) e estados especiais (laterais)
const MAIN_FLOW = ['queue', 'in_progress', 'review', 'done'] as const
const SIDE_STATES = ['paused', 'revision'] as const
type QuoteStatusKey = 'queue' | 'in_progress' | 'paused' | 'review' | 'done' | 'revision'

// ── Status stepper ────────────────────────────────────────────────────────────

function StatusStepper({ status, onChange, disabled }: {
  status: QuoteStatusKey; onChange: (s: QuoteStatusKey) => void; disabled?: boolean
}) {
  const isSide = (SIDE_STATES as readonly string[]).includes(status)
  const activeIdx = MAIN_FLOW.indexOf(status as any)

  return (
    <div className="space-y-3">
      {/* Fluxo principal */}
      <div className="flex items-center gap-0">
        {MAIN_FLOW.map((s, i) => {
          const sc = STATUS_COLOR[s]
          const isActive = status === s
          const isPast = !isSide && activeIdx > i
          const isNext = !isSide && activeIdx === i - 1
          return (
            <div key={s} className="flex items-center flex-1 min-w-0">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(s)}
                title={QUOTE_STATUS_HINT[s]}
                className={cn(
                  'flex-1 min-w-0 px-2 py-2 text-xs font-semibold rounded-lg transition-all text-center',
                  isActive
                    ? cn(sc.bg, sc.text, 'ring-2 ring-offset-1 ring-current shadow-sm')
                    : isPast
                      ? 'bg-green-50 text-green-600 opacity-60'
                      : isNext
                        ? 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                )}
              >
                {QUOTE_STATUS_LABEL[s]}
              </button>
              {i < MAIN_FLOW.length - 1 && (
                <ChevronRight className="w-3 h-3 text-gray-300 shrink-0 mx-0.5" />
              )}
            </div>
          )
        })}
      </div>
      {/* Estados laterais */}
      <div className="flex gap-2">
        {SIDE_STATES.map(s => {
          const sc = STATUS_COLOR[s]
          const isActive = status === s
          return (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => onChange(s)}
              title={QUOTE_STATUS_HINT[s]}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-full border transition-all',
                isActive
                  ? cn(sc.bg, sc.text, 'border-transparent shadow-sm')
                  : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600 bg-white'
              )}
            >
              {QUOTE_STATUS_LABEL[s]}
            </button>
          )
        })}
      </div>
      {/* Descrição do status atual */}
      <p className="text-xs text-gray-400 italic leading-relaxed">
        {QUOTE_STATUS_HINT[status]}
      </p>
    </div>
  )
}

// ── Prazo ─────────────────────────────────────────────────────────────────────

function DeadlineRow({ quote, solicitationId }: { quote: any; solicitationId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [deadline, setDeadline] = useState(quote.deadline ? String(quote.deadline).slice(0, 10) : '')

  const isDone = quote.status === 'done'
  const overdue = quote.deadline && !isDone && isOverdue(quote.deadline)

  function save() {
    startTransition(async () => {
      await updateQuoteDeadline(quote.id, solicitationId, deadline || null)
      setEditing(false)
      router.refresh()
    })
  }

  return (
    <div className={cn(
      'flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm transition-colors',
      overdue ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-100',
    )}>
      <CalendarDays className={cn('w-4 h-4 shrink-0', overdue ? 'text-red-500' : 'text-gray-400')} />
      <span className={cn('text-xs font-medium', overdue ? 'text-red-700' : 'text-gray-500')}>
        Prazo para o cliente
      </span>
      {editing ? (
        <>
          <input
            type="date" value={deadline}
            onChange={e => setDeadline(e.target.value)}
            className="input ml-auto text-xs !py-1 w-auto"
            autoFocus
          />
          <button type="button" onClick={save} disabled={pending} className="btn-primary px-2 py-1 text-xs">
            {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Salvar'}
          </button>
          <button type="button" onClick={() => { setDeadline(quote.deadline ? String(quote.deadline).slice(0, 10) : ''); setEditing(false) }}
            className="btn-secondary px-2 py-1 text-xs">Cancelar</button>
        </>
      ) : (
        <>
          {quote.deadline ? (
            <span className={cn('font-semibold text-sm ml-1', overdue ? 'text-red-700' : 'text-gray-700')}>
              {formatDate(quote.deadline)}
              {overdue && <AlertCircle className="w-3.5 h-3.5 inline ml-1.5 text-red-500" />}
              {overdue && <span className="text-xs font-normal text-red-500 ml-1">vencido</span>}
            </span>
          ) : (
            <span className="text-gray-400 italic text-xs ml-1">não definido</span>
          )}
          {isDone && quote.completed_at && (
            <span className="ml-auto flex items-center gap-1 text-xs text-green-600 font-medium">
              <Check className="w-3 h-3" /> Concluído em {formatDate(quote.completed_at)}
            </span>
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-auto p-1 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-brand-600 transition-colors"
            title="Editar prazo"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  )
}

// ── Arquivos do orçamento ─────────────────────────────────────────────────────

function QuoteFileRow({ file, onDelete }: { file: any; onDelete: () => void }) {
  const { confirm, ConfirmDialog } = useConfirm()
  const [opening, setOpening] = useState(false)
  const [delError, setDelError] = useState<string | null>(null)

  const src = file.source as 'manual' | 'drive'

  async function open(mode: 'view' | 'download') {
    setOpening(true)
    // Para arquivos no Drive, getQuoteAttachmentUrl com source='drive' usa o drive_file_id
    const lookupId = src === 'drive' ? file.drive_file_id : file.id
    const res = await getQuoteAttachmentUrl(lookupId, src, mode)
    setOpening(false)
    if (res.url) window.open(res.url, '_blank')
  }

  async function handleDelete() {
    const yes = await confirm(`Remover "${file.file_name}"?`, 'Remover')
    if (!yes) return
    setDelError(null)
    setOpening(true)
    const res: any = await deleteQuoteAttachment(file.id, file.quoteId, src)
    setOpening(false)
    if (res?.error) { setDelError(res.error); return }
    onDelete()
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2">
      <FileText className="w-3.5 h-3.5 text-brand-500 shrink-0" />
      <span className="text-xs text-gray-700 truncate flex-1">{file.file_name}</span>
      {opening && <Loader2 className="w-3 h-3 animate-spin text-gray-400 shrink-0" />}
      {!opening && (
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => open('view')}
            className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-brand-600 transition-colors" title="Visualizar">
            <Eye className="w-3 h-3" />
          </button>
          <button type="button" onClick={() => open('download')}
            className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-brand-600 transition-colors" title="Baixar">
            <Download className="w-3 h-3" />
          </button>
          <button type="button" onClick={handleDelete}
            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Remover">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
      {delError && <span className="text-[11px] text-red-600 ml-1">{delError}</span>}
      {ConfirmDialog}
    </div>
  )
}

// ── Propostas ────────────────────────────────────────────────────────────────
// Cada proposta (01, 02…) pode ter vários PDFs, cada um com o seu valor; o valor
// da proposta é a soma deles. A Proposta 01 é a primeira cadastrada.

const pad2 = (n: number) => String(n).padStart(2, '0')
const parseBR = (v: string) => {
  const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'))
  return Number.isNaN(n) ? 0 : n
}
const fmtBR = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type DraftFile = { attachmentId: string | null; fileName: string; value: string }

function ProposalList({ quoteId }: { quoteId: string }) {
  const [proposals, setProposals] = useState<any[]>([])
  const [files, setFiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [value, setValue] = useState('')
  const [date, setDate] = useState('')
  const [info, setInfo] = useState('')
  const [draftFiles, setDraftFiles] = useState<DraftFile[]>([])
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editInfo, setEditInfo] = useState('')
  const [busyTarget, setBusyTarget] = useState<string | null>(null) // 'new' | id da proposta
  const [notice, setNotice] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const pdfTargetRef = useRef<string>('new')
  const { confirm, ConfirmDialog } = useConfirm()

  async function loadFiles() {
    const result = await getAllQuoteAttachments(quoteId)
    setFiles(result.map((f: any) => ({ ...f, quoteId })))
  }
  async function loadProposals() { setProposals(await getQuoteProposals(quoteId)) }
  async function load() {
    setLoading(true)
    await Promise.all([loadProposals(), loadFiles()])
    setLoading(false)
  }
  useEffect(() => { load() }, [quoteId])

  function pickPdf(target: string) {
    pdfTargetRef.current = target
    setNotice(null)
    pdfInputRef.current?.click()
  }

  // Sobe o PDF, lê o total e coloca na proposta indicada ('new' = formulário da nova proposta).
  async function handlePdf(file: File) {
    const target = pdfTargetRef.current
    setBusyTarget(target)
    setNotice(null)
    try {
      const up = await uploadQuoteFile(quoteId, file)
      if (up.error) { setNotice({ kind: 'error', text: `Falha no upload de "${file.name}": ${up.error}` }); return }
      let extracted: number | null = null
      try { extracted = await extractQuoteValueFromPdf(file) } catch { extracted = null }
      if (target === 'new') {
        setDraftFiles(prev => [...prev, { attachmentId: up.attachmentId ?? null, fileName: file.name, value: extracted ? fmtBR(extracted) : '' }])
        if (!date) setDate(new Date().toISOString().slice(0, 10))
        setShowForm(true)
      } else {
        const r = await addProposalFile(target, quoteId, { attachmentId: up.attachmentId ?? null, fileName: file.name, value: extracted ?? 0 })
        if (r.error) { setNotice({ kind: 'error', text: r.error }); return }
        await loadProposals()
      }
      await loadFiles()
      if (!extracted) setNotice({ kind: 'info', text: `Não consegui ler o valor de "${file.name}". O arquivo foi salvo: digite o valor dele no campo ao lado do nome.` })
    } catch (e: any) {
      setNotice({ kind: 'error', text: e?.message ?? 'Erro ao processar o PDF' })
    } finally {
      setBusyTarget(null)
      if (pdfInputRef.current) pdfInputRef.current.value = ''
    }
  }

  const draftTotal = draftFiles.reduce((s, f) => s + parseBR(f.value), 0)
  const newTotal = draftFiles.length ? draftTotal : parseBR(value)

  async function handleCreate() {
    if (!newTotal || newTotal <= 0) { setNotice({ kind: 'error', text: 'Informe o valor da proposta (ou o valor de cada PDF).' }); return }
    setSaving(true)
    const r = await createQuoteProposal(quoteId, {
      value: draftFiles.length ? undefined : newTotal,
      date: date || undefined, info: info || undefined,
      files: draftFiles.map(f => ({ attachmentId: f.attachmentId, fileName: f.fileName, value: parseBR(f.value) })),
    })
    setSaving(false)
    if (r.error) { setNotice({ kind: 'error', text: r.error }); return }
    await loadProposals()
    setValue(''); setDate(''); setInfo(''); setDraftFiles([]); setShowForm(false); setNotice(null)
  }

  async function handleDelete(p: any, n: number) {
    const yes = await confirm(`Excluir a Proposta ${pad2(n)} (${formatCurrency(p.value)})? Os PDFs continuam guardados no orçamento.`, 'Excluir')
    if (!yes) return
    const r = await deleteQuoteProposal(p.id, quoteId)
    if (r.error) setNotice({ kind: 'error', text: r.error })
    await loadProposals()
  }

  function startEdit(p: any) {
    setEditingId(p.id)
    setEditValue(fmtBR(Number(p.value)))
    setEditDate(p.date ? String(p.date).slice(0, 10) : '')
    setEditInfo(p.info ?? '')
  }

  async function handleSaveEdit(p: any) {
    setSaving(true)
    const r = await updateQuoteProposal(p.id, quoteId, { value: parseBR(editValue) || undefined, date: editDate || undefined, info: editInfo || undefined })
    setSaving(false)
    if (r.error) { setNotice({ kind: 'error', text: r.error }); return }
    await loadProposals()
    setEditingId(null)
  }

  async function saveFileValue(f: any, raw: string) {
    const v = parseBR(raw)
    if (v === Number(f.value)) return
    const r = await updateProposalFileValue(f.id, quoteId, v)
    if (r.error) setNotice({ kind: 'error', text: r.error })
    await loadProposals()
  }

  async function dropFile(f: any) {
    const r = await removeProposalFile(f.id, quoteId)
    if (r.error) setNotice({ kind: 'error', text: r.error })
    await loadProposals()
  }

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-300" /></div>

  return (
    <div>
      {/* Propostas, na ordem de cadastro: 01, 02… */}
      <div className="space-y-2.5 mb-3">
        {proposals.map((p, i) => {
          const n = i + 1
          const pf: any[] = p.files ?? []
          const hasFiles = pf.length > 0
          return (
            <div key={p.id} className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/60 to-white px-4 py-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-wide text-brand-600/80 font-semibold">Proposta {pad2(n)}</p>
                  <p className="text-xl font-bold text-gray-900 leading-tight">{formatCurrency(p.value)}</p>
                  {(p.date || p.info) && editingId !== p.id && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {p.date && formatDate(p.date)}{p.date && p.info && ' · '}{p.info}
                    </p>
                  )}
                </div>
                {editingId !== p.id && (
                  <div className="flex gap-1 shrink-0">
                    <button type="button" onClick={() => startEdit(p)} title="Editar" className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-brand-600"><Pencil className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => handleDelete(p, n)} title="Excluir proposta" className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>

              {editingId === p.id && (
                <div className="mt-2 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {!hasFiles && <input value={editValue} onChange={e => setEditValue(e.target.value)} placeholder="Valor (R$)" className="input w-32" />}
                    <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="input w-auto" />
                    <input value={editInfo} onChange={e => setEditInfo(e.target.value)} placeholder="Informações (opcional)" className="input flex-1 min-w-[160px]" />
                  </div>
                  {hasFiles && <p className="text-[11px] text-gray-400">O valor é a soma dos PDFs abaixo — ajuste o valor de cada um.</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleSaveEdit(p)} disabled={saving} className="btn-primary px-3 py-1 text-xs">
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Salvar
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="btn-secondary px-3 py-1 text-xs">Cancelar</button>
                  </div>
                </div>
              )}

              {hasFiles && (
                <div className="mt-2.5 space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">PDFs desta proposta ({pf.length}) · total = soma</p>
                  {pf.map(f => (
                    <div key={f.id} className="flex items-center gap-2 rounded-lg bg-white/80 border border-gray-100 px-2.5 py-1.5">
                      <FileText className="w-3.5 h-3.5 text-brand-500 shrink-0" />
                      <span className="text-xs text-gray-700 truncate flex-1" title={f.file_name}>{f.file_name}</span>
                      <span className="text-xs text-gray-400">R$</span>
                      <input
                        key={`${f.id}-${f.value}`}
                        defaultValue={fmtBR(Number(f.value))}
                        onBlur={e => saveFileValue(f, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        className="input !py-0.5 !px-2 w-28 text-right text-xs"
                        inputMode="decimal"
                      />
                      <button type="button" onClick={() => dropFile(f)} title="Tirar da soma (o PDF continua guardado)" className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              )}

              <button type="button" onClick={() => pickPdf(p.id)} disabled={busyTarget !== null}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-600 font-medium disabled:opacity-50">
                {busyTarget === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
                {busyTarget === p.id ? 'Lendo PDF…' : 'Adicionar outro PDF a esta proposta'}
              </button>
            </div>
          )
        })}
      </div>

      {/* Arquivos de orçamento enviados */}
      {files.length > 0 && (
        <div className="space-y-1.5 mb-3">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Arquivos do orçamento</p>
          {files.map(f => (
            <QuoteFileRow key={f.id} file={f} onDelete={load} />
          ))}
        </div>
      )}

      {notice && (
        <div className={cn('flex items-start gap-1.5 text-[11px] rounded-lg px-2.5 py-1.5 mb-2',
          notice.kind === 'error' ? 'text-red-600 bg-red-50' : 'text-amber-800 bg-amber-50')}>
          <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" /> {notice.text}
        </div>
      )}

      {/* Input de PDF sempre montado */}
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handlePdf(f) }}
      />

      {/* Nova proposta */}
      {showForm ? (
        <div className="rounded-lg border border-dashed border-brand-300 bg-brand-50/40 p-3 space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-brand-700 font-semibold">Proposta {pad2(proposals.length + 1)}</p>
          {draftFiles.length > 0 && (
            <div className="space-y-1">
              {draftFiles.map((f, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-lg bg-white border border-gray-100 px-2.5 py-1.5">
                  <FileText className="w-3.5 h-3.5 text-brand-500 shrink-0" />
                  <span className="text-xs text-gray-700 truncate flex-1" title={f.fileName}>{f.fileName}</span>
                  <span className="text-xs text-gray-400">R$</span>
                  <input value={f.value} onChange={e => setDraftFiles(prev => prev.map((x, j) => j === idx ? { ...x, value: e.target.value } : x))}
                    placeholder="0,00" className="input !py-0.5 !px-2 w-28 text-right text-xs" inputMode="decimal" />
                  <button type="button" onClick={() => setDraftFiles(prev => prev.filter((_, j) => j !== idx))} className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2 items-center">
            {draftFiles.length > 0
              ? <div className="input w-40 bg-gray-50 text-sm font-semibold text-gray-800" title="Soma dos PDFs">Total: {formatCurrency(draftTotal)}</div>
              : <input value={value} onChange={e => setValue(e.target.value)} placeholder="Valor (R$)" className="input w-32" autoFocus />}
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input w-auto" />
            <input value={info} onChange={e => setInfo(e.target.value)} placeholder="Informações (opcional)" className="input flex-1 min-w-[160px]" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={handleCreate} disabled={saving || newTotal <= 0} className="btn-primary px-3 py-1 text-xs">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Adicionar proposta
            </button>
            <button type="button" onClick={() => { setShowForm(false); setDraftFiles([]); setValue('') }} className="btn-secondary px-3 py-1 text-xs">Cancelar</button>
            <button type="button" onClick={() => pickPdf('new')} disabled={busyTarget !== null}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-600 transition-colors disabled:opacity-50 ml-auto">
              {busyTarget === 'new' ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileUp className="w-3 h-3" />}
              {busyTarget === 'new' ? 'Lendo…' : draftFiles.length ? 'Adicionar outro PDF' : 'Importar do PDF'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors">
            <Plus className="w-3.5 h-3.5" />
            {proposals.length === 0 ? 'Registrar valor proposto' : 'Nova proposta'}
          </button>
          <span className="text-gray-200">·</span>
          <button type="button" onClick={() => { setShowForm(true); pickPdf('new') }}
            disabled={busyTarget !== null}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-brand-600 font-medium transition-colors disabled:opacity-50">
            {busyTarget === 'new' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
            {busyTarget === 'new' ? 'Lendo PDF…' : 'Importar do PDF'}
          </button>
        </div>
      )}
      {ConfirmDialog}
    </div>
  )
}

// ── Agendamentos collapsible ──────────────────────────────────────────────────

function AgendamentosSection({ quoteId, quoteLabel }: { quoteId: string; quoteLabel: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-100 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Agendamentos</span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 ml-auto transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <QuoteSchedules
            quoteId={quoteId}
            quoteLabel={quoteLabel}
            allowedTypes={['reuniao', 'follow_up', 'lembrete']}
          />
        </div>
      )}
    </div>
  )
}

// ── QuoteTab ──────────────────────────────────────────────────────────────────

export function QuoteTab({
  solicitation, quote,
}: { solicitation: SolicitationView; quote: any | null }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [localQuote, setLocalQuote] = useState<any | null>(quote)
  const { confirm, ConfirmDialog } = useConfirm()

  useEffect(() => { setLocalQuote(quote) }, [quote])

  function handleCreate() {
    if (creating) return
    setCreating(true); setCreateError(null)
    startTransition(async () => {
      const res = await createQuoteForSolicitation(solicitation.id, { clientId: solicitation.clientId })
      setCreating(false)
      if (!res.ok) { setCreateError(res.error ?? 'Erro ao criar orçamento'); return }
      router.refresh()
    })
  }

  function changeStatus(s: QuoteStatusKey) {
    if (!localQuote || localQuote.status === s) return
    startTransition(async () => {
      await updateQuoteStatusWithCompletion(localQuote.id, solicitation.id, s)
      router.refresh()
    })
  }

  async function handleDelete() {
    if (!localQuote) return
    const yes = await confirm('Excluir este orçamento? Essa ação também removerá a negociação vinculada.', 'Excluir')
    if (!yes) return
    startTransition(async () => {
      await deleteQuoteFromSolicitation(localQuote.id, solicitation.id)
      setLocalQuote(null)
    })
  }

  if (!localQuote) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center">
            <FileText className="w-6 h-6 text-brand-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700 mb-1">Sem orçamento vinculado</p>
            <p className="text-xs text-gray-400">Crie o orçamento para registrar o valor e acompanhar o status.</p>
          </div>
          <button type="button" onClick={handleCreate} disabled={pending || creating}
            className="btn-primary flex items-center gap-2 px-5 py-2 text-sm">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Criar orçamento
          </button>
          {createError && <p className="text-xs text-red-600">{createError}</p>}
        </div>
        <StageFilesColumn solicitationId={solicitation.id} stage="orcamento" />
      </div>
    )
  }

  const sc = STATUS_COLOR[localQuote.status as QuoteStatusKey]

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-4">

        {/* Identificação + status atual */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 font-mono">#{localQuote.number}</span>
          <span className={cn('badge text-xs font-semibold', sc.bg, sc.text)}>
            {QUOTE_STATUS_LABEL[localQuote.status as QuoteStatusKey]}
          </span>
        </div>

        {/* Prazo */}
        <DeadlineRow quote={localQuote} solicitationId={solicitation.id} />

        {/* Stepper de status */}
        <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3.5 space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-2">Atualizar status</p>
          <StatusStepper
            status={localQuote.status as QuoteStatusKey}
            onChange={changeStatus}
            disabled={pending}
          />
        </div>

        {/* Propostas */}
        <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3.5">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-3">Proposta de valor</p>
          <ProposalList quoteId={localQuote.id} />
        </div>

        {/* Zona de perigo */}
        <div className="pt-1">
          <button type="button" onClick={handleDelete} disabled={pending}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Excluir orçamento
          </button>
        </div>
      </div>

      <div className="min-w-0">
        <StageFilesColumn solicitationId={solicitation.id} stage="orcamento" />
      </div>

      {ConfirmDialog}
    </div>
  )
}
