'use client'

import { useState, useTransition } from 'react'
import { updateShipment, completeShipment, uploadMaterialFile, deleteMaterialFile } from '@/lib/actions'
import type { Shipment } from '@/types'
import { SHIPMENT_STATUS_LABEL, SHIPMENT_PRIORITY_LABEL, SHIPMENT_DELIVERY_TYPE_LABEL } from '@/types'
import { X, Upload, Download, Trash2, Loader2 } from 'lucide-react'
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
  const [status, setStatus] = useState(shipment.separation_status)
  const [priority, setPriority] = useState(shipment.priority)
  const [files, setFiles] = useState(shipment.material_files || [])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
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
        })
        toast.success('TUDO CERTO!', 'Expedição atualizada com sucesso.')
        onSave({ ...shipment, delivery_type: deliveryType, delivery_date: deliveryDate, separation_status: status, priority })
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
        toast.success('TUDO CERTO!', 'Expedição marcada como concluída.')
        onComplete()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao finalizar'
        setError(msg)
        toast.error('OCORREU UM ERRO', msg)
      }
    })
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    startTransition(async () => {
      try {
        await uploadMaterialFile(shipment.id, file)
        setFiles([...files, { name: file.name, url: '' }])
        toast.success('TUDO CERTO!', 'Arquivo enviado com sucesso.')
        e.target.value = ''
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao fazer upload'
        setError(msg)
        toast.error('OCORREU UM ERRO', msg)
      }
    })
  }

  const handleDeleteFile = (fileUrl: string) => {
    startTransition(async () => {
      try {
        await deleteMaterialFile(shipment.id, fileUrl)
        setFiles((files as any[]).filter((f: any) => f.url !== fileUrl))
        toast.success('TUDO CERTO!', 'Arquivo removido.')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao deletar arquivo'
        setError(msg)
        toast.error('OCORREU UM ERRO', msg)
      }
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-surface-border p-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Editar Expedição</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Delivery Type */}
          <div>
            <label className="label mb-3">Tipo de Entrega *</label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 border border-surface-border rounded-lg cursor-pointer hover:bg-surface transition-colors">
                <input
                  type="radio"
                  value="delivery"
                  checked={deliveryType === 'delivery'}
                  onChange={(e) => setDeliveryType(e.target.value as 'delivery')}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium text-gray-900">Entrega</span>
              </label>
              <label className="flex items-center gap-3 p-3 border border-surface-border rounded-lg cursor-pointer hover:bg-surface transition-colors">
                <input
                  type="radio"
                  value="pickup"
                  checked={deliveryType === 'pickup'}
                  onChange={(e) => setDeliveryType(e.target.value as 'pickup')}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium text-gray-900">Retirada</span>
              </label>
            </div>
          </div>

          {/* Delivery Date */}
          <div>
            <label className="label">Data de Entrega *</label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="input mt-1"
              required
            />
          </div>

          {/* Status */}
          <div>
            <label className="label">Status de Separação</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="select mt-1">
              <option value="queued">Na fila</option>
              <option value="in_progress">Em andamento</option>
              <option value="awaiting_material">Aguardando material</option>
              <option value="completed">Concluída</option>
            </select>
          </div>

          {/* Priority */}
          <div>
            <label className="label">Prioridade</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as any)} className="select mt-1">
              <option value="low">Baixa</option>
              <option value="mid">Média</option>
              <option value="high">Alta</option>
            </select>
          </div>

          {/* Material Files */}
          <div>
            <label className="label mb-3">Arquivos de Separação</label>
            <div className="space-y-3">
              {/* Upload */}
              <div className="border-2 border-dashed border-surface-border rounded-lg p-4">
                <label className="flex flex-col items-center justify-center cursor-pointer">
                  <Upload className="w-6 h-6 text-gray-400 mb-2" />
                  <span className="text-sm font-medium text-gray-700">Clique para fazer upload</span>
                  <span className="text-xs text-gray-500 mt-1">PDF, imagens</span>
                  <input
                    type="file"
                    onChange={handleFileUpload}
                    disabled={pending}
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.gif"
                  />
                </label>
              </div>

              {/* File List */}
              {files && files.length > 0 && (
                <div className="space-y-2">
                  {(files as any[]).map((file: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-surface rounded-lg border border-surface-border">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Download className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="text-sm text-gray-700 truncate">{file.name}</span>
                      </div>
                      {file.url && (
                        <div className="flex gap-1 shrink-0">
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-brand-600 hover:text-brand-700 px-2 py-1"
                          >
                            Download
                          </a>
                          <button
                            onClick={() => handleDeleteFile(file.url)}
                            disabled={pending}
                            className="text-gray-400 hover:text-red-500 disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-surface-border p-6 flex gap-3 justify-between">
          <button
            onClick={handleComplete}
            disabled={pending || shipment.is_completed}
            className="btn-secondary"
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            {shipment.is_completed ? '✓ Finalizada' : 'Marcar como Entregue'}
          </button>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={pending}
              className="btn-primary flex items-center gap-2"
            >
              {pending && <Loader2 className="w-4 h-4 animate-spin" />}
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
