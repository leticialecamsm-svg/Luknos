'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { getCrmGroups, setCrmGroupEnabled, type CrmGroupRow } from '@/lib/crm-actions'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { formatListTime } from '@/lib/crm-time'
import { Loader2, Search, Users, X } from 'lucide-react'

// Escolha dos grupos que viram conversa no CRM (só administradores). Desativado = não chega
// mais mensagem nem aparece na aba Grupos; o histórico fica guardado.
export function GroupPicker({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const toast = useToast()
  const [rows, setRows] = useState<CrmGroupRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [onlyActive, setOnlyActive] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    getCrmGroups().then((r) => { if ('error' in r) setError(r.error); else setRows(r.items) })
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggle = (g: CrmGroupRow) => {
    const next = !g.enabled
    setBusyId(g.id)
    startTransition(async () => {
      const r = await setCrmGroupEnabled(g.id, next)
      setBusyId(null)
      if ('error' in r && r.error) { toast.error('ERRO', r.error); return }
      setRows((prev) => prev?.map((x) => (x.id === g.id ? { ...x, enabled: next } : x)) ?? prev)
      toast.success(next ? 'GRUPO ATIVADO' : 'GRUPO DESATIVADO', g.name)
      onChanged()
    })
  }

  const q = query.trim().toLocaleLowerCase('pt-BR')
  const shown = useMemo(() => (rows ?? [])
    .filter((g) => (!onlyActive || g.enabled) && (!q || g.name.toLocaleLowerCase('pt-BR').includes(q) || g.instance_label.toLocaleLowerCase('pt-BR').includes(q)))
    .sort((a, b) => Number(b.enabled) - Number(a.enabled) || b.last_seen_at.localeCompare(a.last_seen_at)), [rows, q, onlyActive])
  const activeCount = (rows ?? []).filter((g) => g.enabled).length

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Escolher grupos" className="bg-white rounded-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div>
            <h3 className="font-bold text-gray-900">Escolher grupos</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Só os grupos <b>ativos</b> chegam ao CRM. Os outros ficam aqui, sem receber mensagens. {rows && <>({activeCount} ativo{activeCount === 1 ? '' : 's'})</>}
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 pb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar grupo ou WhatsApp"
              className="w-full pl-9 pr-3 py-2 text-sm bg-gray-100 rounded-full outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>
          <button
            onClick={() => setOnlyActive((v) => !v)}
            aria-pressed={onlyActive}
            className={cn('px-3 py-2 text-xs font-medium rounded-full whitespace-nowrap', onlyActive ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')}
          >
            Só ativos
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4 border-t border-gray-100">
          {!rows && !error && <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto my-8" />}
          {error && <p role="alert" className="text-sm text-red-600 p-4">{error}</p>}
          {rows && shown.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8 px-4">
              {rows.length === 0 ? 'Nenhum grupo visto ainda. Quando alguém falar num grupo, ele aparece aqui para você ativar.' : 'Nenhum grupo encontrado.'}
            </p>
          )}
          {shown.map((g) => (
            <div key={g.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50">
              <div className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 text-white flex items-center justify-center"><Users className="w-4 h-4" /></div>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm truncate', g.enabled ? 'font-semibold text-gray-900' : 'text-gray-600')}>{g.name}</p>
                <p className="text-xs text-gray-400 truncate">{g.instance_label} · última atividade {formatListTime(g.last_seen_at)}</p>
              </div>
              <button
                role="switch"
                aria-checked={g.enabled}
                aria-label={`${g.enabled ? 'Desativar' : 'Ativar'} ${g.name}`}
                disabled={busyId === g.id}
                onClick={() => toggle(g)}
                className={cn('relative w-10 h-6 shrink-0 rounded-full transition-colors disabled:opacity-50', g.enabled ? 'bg-emerald-500' : 'bg-gray-300')}
              >
                <span className={cn('absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all', g.enabled ? 'left-[18px]' : 'left-0.5')} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
