'use client'

import { useState, useTransition } from 'react'
import { Trash2, RotateCcw, X, Loader2 } from 'lucide-react'
import { getDeletedSolicitations, recoverSolicitation } from '@/lib/solicitations/actions'
import { useToast } from '@/components/ui/Toast'
import { useRouter } from 'next/navigation'

type DeletedRow = { id: string; number: number; title: string | null; clientName: string | null; deleted_at: string }

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'há menos de 1h'
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

function expiresIn(iso: string) {
  const ms = new Date(iso).getTime() + 2 * 86_400_000 - Date.now()
  const h = Math.ceil(ms / 3_600_000)
  if (h <= 0) return 'expirando'
  if (h < 24) return `expira em ${h}h`
  return `expira em ${Math.ceil(h / 24)}d`
}

export function TrashButton() {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<DeletedRow[]>([])
  const [loading, setLoading] = useState(false)
  const [recovering, setRecovering] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const toast = useToast()
  const router = useRouter()

  async function openDrawer() {
    setOpen(true)
    setLoading(true)
    const data = await getDeletedSolicitations()
    setRows(data)
    setLoading(false)
  }

  async function handleRecover(id: string) {
    setRecovering(id)
    const res = await recoverSolicitation(id)
    if (res.error) {
      toast.error('ERRO', res.error)
    } else {
      toast.success('RECUPERADA', 'Solicitação restaurada com sucesso.')
      setRows(r => r.filter(x => x.id !== id))
      startTransition(() => router.refresh())
    }
    setRecovering(null)
  }

  return (
    <>
      <button
        type="button"
        onClick={openDrawer}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors"
        title="Lixeira de solicitações"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Lixeira
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setOpen(false)}>
          <div
            className="relative w-full max-w-sm bg-white shadow-xl flex flex-col h-full"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-gray-500" />
                <span className="font-semibold text-sm text-gray-800">Lixeira</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-gray-100 text-gray-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="px-4 py-2 text-xs text-gray-400 border-b border-gray-100">
              Itens excluídos são mantidos por 2 dias.
            </p>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                </div>
              ) : rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Trash2 className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">Lixeira vazia</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {rows.map(r => (
                    <li key={r.id} className="px-4 py-3 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          #{r.number}{r.title ? ` · ${r.title}` : ''}
                        </p>
                        {r.clientName && (
                          <p className="text-xs text-gray-500 truncate">{r.clientName}</p>
                        )}
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Excluída {timeAgo(r.deleted_at)} · {expiresIn(r.deleted_at)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRecover(r.id)}
                        disabled={recovering === r.id || isPending}
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-brand-300 text-brand-600 text-xs font-medium hover:bg-brand-50 disabled:opacity-50 transition-colors"
                      >
                        {recovering === r.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3 h-3" />
                        )}
                        Recuperar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
