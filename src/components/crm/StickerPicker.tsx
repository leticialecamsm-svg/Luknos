'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { addCrmSticker, createStickerUpload, deleteCrmSticker, getCrmStickers, sendCrmSticker, type CrmSticker } from '@/lib/crm-actions'
import { createClient } from '@/lib/supabase/client'
import { toStickerBlob } from '@/lib/crm-sticker'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { Loader2, Plus, X } from 'lucide-react'

// Biblioteca de figurinhas da equipe: clicar envia; "+" adiciona uma imagem nova.
export function StickerPicker({ conversationId, onClose, onSent }: { conversationId: string; onClose: () => void; onSent: () => void }) {
  const toast = useToast()
  const [items, setItems] = useState<CrmSticker[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null) // id enviando, ou 'add'
  const fileRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => { getCrmStickers().then(setItems) }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [onClose])

  async function send(s: CrmSticker) {
    if (busy) return
    setBusy(s.id)
    const r = await sendCrmSticker(conversationId, s.id)
    setBusy(null)
    if ('error' in r && r.error) { toast.error('NÃO FOI POSSÍVEL ENVIAR', r.error); return }
    onSent()
    onClose()
  }

  async function add(files: FileList | null) {
    const file = files?.[0]
    if (!file || busy) return
    if (!file.type.startsWith('image/')) { toast.error('ARQUIVO INVÁLIDO', 'Escolha uma imagem (PNG, JPG ou WebP)'); return }
    setBusy('add')
    try {
      const blob = await toStickerBlob(file)
      const prep = await createStickerUpload(blob.size)
      if (prep.error || !prep.path || !prep.token) throw new Error(prep.error ?? 'Não foi possível preparar o envio')
      const { error: upErr } = await createClient().storage.from('crm-attachments').uploadToSignedUrl(prep.path, prep.token, blob, { contentType: 'image/webp' })
      if (upErr) throw new Error(upErr.message)
      const r = await addCrmSticker(prep.path, file.name.replace(/\.[^.]+$/, ''))
      if ('error' in r && r.error) throw new Error(r.error)
      toast.success('FIGURINHA ADICIONADA')
      load()
    } catch (e: any) {
      toast.error('NÃO FOI POSSÍVEL ADICIONAR', e?.message ?? 'Falha ao preparar a figurinha')
    } finally {
      setBusy(null)
    }
  }

  async function remove(s: CrmSticker) {
    if (!window.confirm('Remover esta figurinha da biblioteca da equipe?')) return
    const r = await deleteCrmSticker(s.id)
    if ('error' in r && r.error) toast.error('ERRO', r.error)
    else load()
  }

  return (
    <div ref={boxRef} role="dialog" aria-label="Figurinhas" className="absolute bottom-full left-0 mb-2 z-40 w-[22rem] max-w-[92vw] bg-white border border-gray-200 rounded-xl shadow-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-gray-900">Figurinhas da equipe</p>
        <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { add(e.target.files); e.target.value = '' }} />
      <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={!!busy}
          title="Adicionar figurinha (PNG, JPG ou WebP)"
          className="aspect-square rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:bg-gray-50 flex flex-col items-center justify-center text-[11px] gap-1 disabled:opacity-50"
        >
          {busy === 'add' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
          Adicionar
        </button>
        {items === null && <div className="col-span-3 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>}
        {items?.map((s) => (
          <div key={s.id} className="relative group aspect-square">
            <button
              onClick={() => send(s)}
              disabled={!!busy}
              title={s.name ?? 'Enviar figurinha'}
              className={cn('w-full h-full rounded-lg bg-gray-50 hover:bg-gray-100 p-1 flex items-center justify-center disabled:opacity-60', busy === s.id && 'ring-2 ring-emerald-400')}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.url} alt={s.name ?? 'Figurinha'} className="max-w-full max-h-full object-contain" />
            </button>
            <button onClick={() => remove(s)} aria-label="Remover figurinha" className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white border border-gray-200 text-gray-500 hover:text-red-600 shadow opacity-0 group-hover:opacity-100 flex items-center justify-center"><X className="w-3 h-3" /></button>
          </div>
        ))}
      </div>
      {items && items.length === 0 && <p className="text-xs text-gray-500 mt-2">Nenhuma figurinha ainda. Adicione uma imagem, ou use "Salvar como figurinha" numa que o cliente enviou.</p>}
    </div>
  )
}
