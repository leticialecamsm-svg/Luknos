'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { deleteCrmQuickReply, listCrmQuickReplies, saveCrmQuickReply, type CrmQuickReply } from '@/lib/crm-actions'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/useConfirm'

// Respostas rápidas da equipe: clicar coloca o texto no campo (dá para ajustar antes de enviar).
export function QuickReplies({ onPick, onClose }: { onPick: (body: string) => void; onClose: () => void }) {
  const toast = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const boxRef = useRef<HTMLDivElement>(null)
  const [items, setItems] = useState<CrmQuickReply[] | null>(null)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<{ id?: string; title: string; body: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { listCrmQuickReplies().then(setItems).catch(() => setItems([])) }, [])
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [onClose])

  const term = q.trim().toLowerCase()
  const shown = (items ?? []).filter((r) => !term || r.title.toLowerCase().includes(term) || r.body.toLowerCase().includes(term))

  async function save() {
    if (!editing || busy) return
    setBusy(true)
    const r = await saveCrmQuickReply(editing)
    setBusy(false)
    if ('error' in r) { toast.error('ERRO', r.error); return }
    setItems((cur) => {
      const list = cur ?? []
      return list.some((x) => x.id === r.reply.id) ? list.map((x) => (x.id === r.reply.id ? r.reply : x)) : [...list, r.reply]
    })
    setEditing(null)
  }

  async function remove(item: CrmQuickReply) {
    if (!(await confirm(`Excluir a resposta "${item.title}"? Ela some para toda a equipe.`, 'Excluir'))) return
    const r = await deleteCrmQuickReply(item.id)
    if ('error' in r) { toast.error('ERRO', r.error); return }
    setItems((cur) => (cur ?? []).filter((x) => x.id !== item.id))
  }

  return (
    <div ref={boxRef} role="dialog" aria-label="Respostas rápidas" className="absolute bottom-full left-0 mb-2 z-40 w-[24rem] max-w-[calc(100vw-16px)] bg-white border border-gray-200 rounded-xl shadow-xl p-3 flex flex-col max-h-[70vh]">
      {ConfirmDialog}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <p className="text-sm font-semibold text-gray-900">Respostas rápidas</p>
        <div className="flex items-center gap-1">
          {!editing && (
            <button type="button" onClick={() => setEditing({ title: '', body: '' })} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg text-gray-700 hover:bg-gray-100">
              <Plus className="w-3.5 h-3.5" /> Nova
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Fechar" className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <input
            autoFocus
            value={editing.title}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            placeholder="Título (ex.: Chave Pix)"
            className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
          <textarea
            value={editing.body}
            onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            placeholder="Mensagem (aceita *negrito*, _itálico_ e links)"
            rows={8}
            className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)} className="px-3 py-1.5 text-sm rounded-lg text-gray-600 hover:bg-gray-100">Cancelar</button>
            <button type="button" onClick={save} disabled={busy || !editing.title.trim() || !editing.body.trim()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar
            </button>
          </div>
        </div>
      ) : (
        <>
          {(items?.length ?? 0) > 5 && (
            <div className="relative mb-2 shrink-0">
              <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300" />
            </div>
          )}
          <div className="overflow-y-auto -mx-1 px-1 space-y-1.5 min-h-0">
            {items === null && <div className="flex justify-center py-6 text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /></div>}
            {items !== null && shown.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">{items.length ? 'Nada encontrado.' : 'Nenhuma resposta salva ainda.'}</p>
            )}
            {shown.map((r) => (
              <div key={r.id} className="group flex items-start gap-1 rounded-lg border border-gray-200 hover:bg-gray-50">
                <button type="button" onClick={() => { onPick(r.body); onClose() }} className="flex-1 min-w-0 text-left px-3 py-2">
                  <span className="block text-sm font-medium text-gray-900 truncate">{r.title}</span>
                  <span className="block text-xs text-gray-500 line-clamp-2 whitespace-pre-line">{r.body}</span>
                </button>
                <div className="flex flex-col shrink-0 py-1 pr-1">
                  <button type="button" onClick={() => setEditing({ id: r.id, title: r.title, body: r.body })} aria-label={`Editar ${r.title}`} className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"><Pencil className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => remove(r)} aria-label={`Excluir ${r.title}`} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
