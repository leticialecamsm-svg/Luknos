'use client'

import { useState, useTransition } from 'react'
import { updateShipment, completeShipment } from '@/lib/actions'
import { X, Loader2, ExternalLink, Folder } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

interface ShippingModalProps {
  shipment: any
  onClose: () => void
  onSave: (updated: any) => void
  onComplete: () => void
}

export function ShippingModal({ shipment, onClose, onSave, onComplete }: ShippingModalProps) {
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup' | null>(shipment.delivery_type)
  const [deliveryDate, setDeliveryDate] = useState(shipment.delivery_date || '')
  const [status, setStatus]             = useState(shipment.separation_status)
  const [priority, setPriority]         = useState(shipment.priority)
  const [driveLink, setDriveLink]       = useState(shipment.drive_link || '')
  const [error, setError]               = useState<string | null>(null)
  const [pending, startTransition]      = useTransition()
  const toast = useToast()

  const handleSave = () => {
    if (!deliveryType || !deliveryDate) {
      setError('Tipo de entrega e data são obrigatórios')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await updateShipment(shipment.id, {
          delivery_type: deliveryType,
          delivery_date: deliveryDate,
          separation_status: status,
          priority,
          drive_link: driveLink || null,
        } as any)
        toast.success('TUDO CERTO!', 'Expedição atualizada.')
        onSave({ ...shipment, delivery_type: deliveryType, delivery_date: deliveryDate, separation_status: status, priority, drive_link: driveLink || null })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao salvar'
        setError(msg)
        toast.error('OCORREU UM ERRO', msg)
      }
    })
  }

  const handleComplete = () => {
    startTransition(async () => {
      try {
        await completeShipment(shipment.id)
        toast.success('TUDO CERTO!', 'Marcada como entregue.')
        onComplete()
      } catch (err) {
        toast.error('OCORREU UM ERRO', err instanceof Error ? err.message : 'Erro')
      }
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-surface-border px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-base font-semibold text-gray-900">Editar Expedição</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">{error}</div>}

          {/* Tipo de entrega */}
          <div>
            <label className="label mb-2">Tipo de entrega *</label>
            <div className="flex gap-2">
              {(['delivery', 'pickup'] as const).map(t => (
                <button key={t} type="button"
                  onClick={() => setDeliveryType(t)}
                  className={cn('flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all',
                    deliveryType === t ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-surface-border hover:border-brand-300'
                  )}>
                  {t === 'delivery' ? 'Entrega' : 'Retirada'}
                </button>
              ))}
            </div>
          </div>

          {/* Data */}
          <div>
            <label className="label">Data de entrega *</label>
            <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="input mt-1" />
          </div>

          {/* Status */}
          <div>
            <label className="label">Status de separação</label>
            <select value={status} onChange={e => setStatus(e.target.value as any)} className="select mt-1">
              <option value="queued">Na fila</option>
              <option value="in_progress">Em andamento</option>
              <option value="awaiting_material">Aguardando material</option>
              <option value="completed">Concluída</option>
              <option value="delivered">Entregue/Retirada</option>
            </select>
          </div>

          {/* Prioridade */}
          <div>
            <label className="label">Prioridade</label>
            <div className="flex gap-2 mt-1">
              {([['low','Baixa'],['mid','Média'],['high','Alta']] as const).map(([v,l]) => (
                <button key={v} type="button"
                  onClick={() => setPriority(v)}
                  className={cn('flex-1 py-2 rounded-xl text-sm font-medium border transition-all',
                    priority === v
                      ? v === 'high' ? 'bg-red-100 text-red-700 border-red-300'
                        : v === 'mid' ? 'bg-amber-100 text-amber-700 border-amber-300'
                        : 'bg-gray-100 text-gray-700 border-gray-300'
                      : 'bg-white text-gray-500 border-surface-border hover:border-gray-300'
                  )}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Link de separação */}
          <div>
            <label className="label">Link de separação (Drive)</label>
            <div className="relative mt-1">
              <Folder className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="url"
                value={driveLink}
                onChange={e => setDriveLink(e.target.value)}
                placeholder="https://drive.google.com/..."
                className="input pl-9"
              />
            </div>
            {driveLink && (
              <a href={driveLink} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1.5 text-xs text-brand-600 hover:text-brand-700">
                <ExternalLink className="w-3 h-3" /> Abrir link
              </a>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-surface-border px-6 py-4 flex justify-between rounded-b-2xl">
          <button onClick={handleComplete} disabled={pending || shipment.is_completed} className="btn-secondary text-sm">
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {shipment.is_completed ? '✓ Já entregue' : 'Marcar como entregue'}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
            <button onClick={handleSave} disabled={pending} className="btn-primary text-sm flex items-center gap-2">
              {pending && <Loader2 className="w-4 h-4 animate-spin" />}
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
