'use client'

// Anexar o PDF plotado numa etapa de uma solicitação (vai pra pasta da etapa no
// Drive, do mesmo jeito que o envio de arquivos da própria solicitação).
import { useEffect, useState } from 'react'
import { Check, Loader2, Paperclip, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STAGES } from '@/lib/solicitations/stages'
import { searchSolicitationsForStage, createStageFileUploadSession, confirmStageFileUploaded, stageFileExists, checkDriveConnected, type StageFileStage } from '@/lib/solicitations/actions'
import { putDirectToDrive } from '@/components/solicitations/StageFiles'
import type { PlotInfo } from '@/lib/project-reading/cad-plot'

export type Anexo = NonNullable<PlotInfo['anexo']>
const ETAPAS = STAGES.filter(s => s.id !== 'negociacao') as { id: StageFileStage; label: string }[]
export const nomeDaEtapa = (id: string) => STAGES.find(s => s.id === id)?.label ?? id

/** Envia o PDF pra etapa escolhida. `onProgress` recebe de 0 a 100. */
export async function anexarPdf(anexo: Anexo, nome: string, bytes: Uint8Array, onProgress: (pct: number) => void) {
  const stage = anexo.etapa as StageFileStage
  const file = new File([bytes as BlobPart], nome, { type: 'application/pdf' })
  const sessao = await createStageFileUploadSession(anexo.id, stage, nome, file.type)
  if (!sessao.uploadUrl) throw new Error(sessao.error ?? 'Não foi possível iniciar o envio.')
  await putDirectToDrive(sessao.uploadUrl, file, s => onProgress(Math.round((s.loaded / s.total) * 100)), () => stageFileExists(anexo.id, stage, nome))
  const ok = await confirmStageFileUploaded(anexo.id, stage, nome)
  if (ok.error) throw new Error(ok.error)
}

export function CadAttach({ ativo, setAtivo, anexo, setAnexo }: { ativo: boolean; setAtivo: (v: boolean) => void; anexo?: Anexo; setAnexo: (a: Anexo | undefined) => void }) {
  const [busca, setBusca] = useState('')
  const [opcoes, setOpcoes] = useState<{ id: string; label: string; clientName: string | null }[] | null>(null)
  const [drive, setDrive] = useState<boolean | null>(null)
  const escolhendo = ativo && !anexo?.id

  useEffect(() => { if (ativo && drive === null) checkDriveConnected().then(setDrive).catch(() => setDrive(false)) }, [ativo, drive])
  useEffect(() => {
    if (!escolhendo) return
    let vale = true
    setOpcoes(null)
    const t = setTimeout(() => { searchSolicitationsForStage(busca.trim()).then(r => { if (vale) setOpcoes(r) }).catch(() => { if (vale) setOpcoes([]) }) }, busca ? 350 : 0)
    return () => { vale = false; clearTimeout(t) }
  }, [escolhendo, busca])

  return (
    <div className={cn('rounded-lg border p-2 space-y-1.5', ativo ? 'border-brand-400 bg-brand-50' : 'border-gray-200')}>
      <label className={cn('flex items-start gap-1.5 text-xs cursor-pointer', ativo ? 'text-navy' : 'text-gray-600')}>
        <input type="checkbox" className="mt-0.5" checked={ativo} onChange={e => setAtivo(e.target.checked)} />
        <span><b className="flex items-center gap-1"><Paperclip className="w-3 h-3" /> Anexar a uma solicitação</b>O PDF também vai pros arquivos da etapa</span>
      </label>
      {ativo && drive === false && <p className="text-[11px] text-red-600">O Google Drive não está conectado.</p>}
      {ativo && anexo?.id && (
        <>
          <div className="flex items-center gap-2 text-xs bg-white border border-gray-200 rounded px-2 py-1">
            <span className="flex-1 min-w-0"><b className="block truncate text-gray-800" title={anexo.label}>{anexo.label}</b>{anexo.cliente && <span className="block truncate text-[10px] text-gray-400">{anexo.cliente}</span>}</span>
            <button onClick={() => setAnexo(undefined)} className="text-[10px] text-brand-600 underline">trocar</button>
          </div>
          <label className="block text-[11px] text-gray-500">Etapa
            <select value={anexo.etapa} onChange={e => setAnexo({ ...anexo, etapa: e.target.value })} className="w-full text-sm border border-gray-200 rounded px-2 py-1 text-gray-800 bg-white">
              {ETAPAS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select></label>
        </>
      )}
      {escolhendo && (
        <div className="space-y-1">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => e.stopPropagation()} placeholder="Título ou número da solicitação" className="w-full text-sm border border-gray-200 rounded pl-7 pr-2 py-1 text-gray-800 bg-white" />
          </div>
          <div className="max-h-40 overflow-y-auto bg-white border border-gray-200 rounded divide-y divide-gray-100">
            {opcoes === null && <p className="text-[11px] text-gray-400 px-2 py-1.5 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Buscando...</p>}
            {opcoes?.length === 0 && <p className="text-[11px] text-gray-400 px-2 py-1.5">Nenhuma solicitação encontrada.</p>}
            {opcoes?.map(o => (
              <button key={o.id} onClick={() => setAnexo({ id: o.id, label: o.label, cliente: o.clientName ?? undefined, etapa: anexo?.etapa ?? 'projeto' })} className="w-full text-left px-2 py-1 hover:bg-brand-50">
                <span className="block text-xs text-gray-800 truncate">{o.label}</span>
                {o.clientName && <span className="block text-[10px] text-gray-400 truncate">{o.clientName}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function AvisoAnexo({ anexo }: { anexo: Anexo }) {
  return (
    <p className="text-xs text-green-700 bg-green-50 rounded px-2 py-1.5 flex items-start gap-1.5">
      <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span>Anexado em {anexo.label}, etapa {nomeDaEtapa(anexo.etapa)}. <a href={`/solicitacoes/${anexo.id}?tab=${anexo.etapa}`} target="_blank" rel="noreferrer" className="underline font-medium">Abrir solicitação</a></span>
    </p>
  )
}
