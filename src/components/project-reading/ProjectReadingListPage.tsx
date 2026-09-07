'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { uploadPlan, deletePlan } from '@/lib/project-reading/actions'
import { FileText, Upload, Loader2, Trash2 } from 'lucide-react'

interface PlanRow {
  id: string; name: string; original_filename: string | null; num_pages: number
  status: string; created_at: string; users?: { name: string } | null
}

export function ProjectReadingListPage({ plans: initialPlans }: { plans: PlanRow[] }) {
  const router = useRouter()
  const [plans, setPlans] = useState(initialPlans)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (file.type !== 'application/pdf') { setError('Selecione um arquivo PDF.'); return }
    setError(null)
    setUploading(true)
    try {
      // Descobre a quantidade de páginas no navegador antes de subir, pra já
      // salvar certo (evita ter que corrigir depois).
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
      const buf = await file.arrayBuffer()
      const doc = await pdfjsLib.getDocument({ data: buf }).promise
      const numPages = doc.numPages

      const formData = new FormData()
      formData.set('file', file)
      formData.set('name', file.name.replace(/\.pdf$/i, ''))
      formData.set('numPages', String(numPages))
      const res = await uploadPlan(formData)
      if (res?.error) { setError(res.error); setUploading(false); return }
      if (res?.plan) router.push(`/dashboard/project-reading/${res.plan.id}`)
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível processar o PDF.')
    } finally {
      setUploading(false)
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
        <h1 className="text-2xl font-bold text-gray-900">Leitura de Projeto</h1>
        <p className="text-sm text-gray-400">Suba uma planta luminotécnica em PDF pra marcar ambientes, legenda, símbolos e medições — sem precisar de régua ou app externo.</p>
      </div>

      <label
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 hover:border-brand-400 rounded-2xl py-12 cursor-pointer transition-colors bg-white"
      >
        <input ref={inputRef} type="file" accept="application/pdf" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        {uploading ? <Loader2 className="w-8 h-8 text-brand-500 animate-spin" /> : <Upload className="w-8 h-8 text-gray-300" />}
        <p className="text-sm font-medium text-gray-600">{uploading ? 'Processando PDF...' : 'Clique ou arraste um PDF aqui'}</p>
      </label>
      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="space-y-2">
        {plans.map(p => (
          <div key={p.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-brand-300 transition-colors">
            <FileText className="w-5 h-5 text-gray-300 shrink-0" />
            <Link href={`/dashboard/project-reading/${p.id}`} className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
              <p className="text-xs text-gray-400">{p.num_pages} página(s) · {p.users?.name ?? '—'} · {new Date(p.created_at).toLocaleDateString('pt-BR')}</p>
            </Link>
            <button onClick={() => handleDelete(p.id)} className="text-gray-300 hover:text-red-500 shrink-0"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        {plans.length === 0 && <p className="text-sm text-gray-400 text-center py-6">Nenhuma planta enviada ainda.</p>}
      </div>
    </div>
  )
}
