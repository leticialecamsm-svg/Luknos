'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createPlanUpload, finalizePlan, deletePlan } from '@/lib/project-reading/actions'
import { createClient } from '@/lib/supabase/client'
import { FileText, Upload, Loader2, Trash2, FolderOpen } from 'lucide-react'

interface PlanRow {
  id: string; name: string; original_filename: string | null; num_pages: number
  status: string; created_at: string; users?: { name: string } | null
}

export function ProjectReadingListPage({ plans: initialPlans, cadLab }: { plans: PlanRow[]; cadLab?: boolean }) {
  const router = useRouter()
  const [plans, setPlans] = useState(initialPlans)
  const [uploading, setUploading] = useState(false)
  const [etapa, setEtapa] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    const isCad = /\.(dwg|dxf)$/i.test(file.name)
    if (isCad && !cadLab) { setError('Arquivos DWG/DXF ainda estão em teste e não estão liberados pra você.'); return }
    if (!isCad && file.type !== 'application/pdf') { setError(cadLab ? 'Selecione um PDF, DWG ou DXF.' : 'Selecione um arquivo PDF.'); return }
    setError(null)
    setUploading(true)
    try {
      let numPages = 1
      let cadMeta: unknown = undefined
      if (isCad) {
        // DWG/DXF é lido no navegador: cada região do desenho (planta, corte,
        // detalhe...) vira uma página, e a unidade do arquivo dá a escala.
        setEtapa('Lendo o desenho (arquivos grandes levam alguns segundos)...')
        const { loadCadFile, computeRegions } = await import('@/lib/project-reading/cad')
        const model = await loadCadFile(await file.arrayBuffer())
        const regions = computeRegions(model)
        if (regions.length === 0) { setError('Não encontrei desenho nesse arquivo.'); return }
        numPages = regions.length
        cadMeta = { unitToMeters: model.unitToMeters, unitName: model.unitName, regions }
      } else {
        // Descobre a quantidade de páginas no navegador antes de subir, pra já
        // salvar certo (evita ter que corrigir depois).
        setEtapa('Lendo o PDF...')
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
        numPages = doc.numPages
      }

      setEtapa('Enviando arquivo...')
      const prep = await createPlanUpload({ fileName: file.name, sizeBytes: file.size })
      if (prep.error) { setError(prep.error); return }
      if (!prep.path || !prep.token) { setError('Não foi possível preparar o envio'); return }
      const { error: upErr } = await createClient().storage.from('project-plans')
        .uploadToSignedUrl(prep.path, prep.token, file, { contentType: isCad ? 'application/octet-stream' : 'application/pdf' })
      if (upErr) { setError(`Falha no envio: ${upErr.message}`); return }

      setEtapa('Salvando planta...')
      const res = await finalizePlan({
        storagePath: prep.path, fileName: file.name, name: file.name.replace(/\.(pdf|dwg|dxf)$/i, ''), numPages,
        ...(isCad ? { sourceType: 'cad' as const, cadMeta } : {}),
      })
      if (res?.error) { setError(res.error); return }
      if (res?.plan) router.push(`/dashboard/project-reading/${res.plan.id}`)
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível processar o PDF.')
    } finally {
      setUploading(false)
      setEtapa('')
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Excluir esta planta e tudo que foi lido dela?')) return
    setPlans(prev => prev.filter(p => p.id !== id))
    await deletePlan(id)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Leitura de Projeto</h1>
        <p className="text-sm text-navy-muted">Suba uma planta luminotécnica em PDF pra marcar ambientes, legenda, símbolos e medições — sem precisar de régua ou app externo.</p>
        {cadLab && (
          <Link href="/dashboard/project-reading/cad-lab" className="inline-block mt-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg px-2.5 py-1">
            🧪 Laboratório CAD (protótipo — abre DWG/DXF)
          </Link>
        )}
      </div>

      <label
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-surface-border hover:border-brand-400 rounded-card py-12 cursor-pointer transition-colors bg-gradient-card shadow-card"
      >
        <input ref={inputRef} type="file" accept={cadLab ? 'application/pdf,.dwg,.dxf' : 'application/pdf'} className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        {uploading ? <Loader2 className="w-8 h-8 text-brand-500 animate-spin" /> : <Upload className="w-8 h-8 text-navy-muted/50" />}
        <p className="text-sm font-medium text-navy-muted">{uploading ? (etapa || 'Processando PDF...') : `Clique ou arraste um PDF aqui${cadLab ? ' (ou DWG/DXF)' : ''}`}</p>
      </label>
      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="space-y-2">
        {plans.map(p => (
          <div key={p.id} className="card flex items-center gap-3 px-4 py-3 hover:border-brand-300 transition-colors">
            <FileText className="w-5 h-5 text-navy-muted/40 shrink-0" />
            <Link href={`/dashboard/project-reading/${p.id}`} className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-navy truncate">{p.name}</p>
              <p className="text-xs text-navy-muted">{p.num_pages} página(s) · {p.users?.name ?? '—'} · {new Date(p.created_at).toLocaleDateString('pt-BR')}</p>
            </Link>
            <button onClick={() => handleDelete(p.id)} className="text-navy-muted/40 hover:text-red-500 shrink-0"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        {plans.length === 0 && (
          <div className="card flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-surface-secondary flex items-center justify-center">
              <FolderOpen className="w-6 h-6 text-navy-muted/50" />
            </div>
            <div>
              <p className="text-sm font-semibold text-navy">Nenhuma planta enviada ainda</p>
              <p className="text-xs text-navy-muted mt-0.5">Suba um PDF acima pra começar a marcar os pontos.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
