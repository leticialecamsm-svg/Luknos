'use client'

import { AlertCircle, CheckCircle, XCircle } from 'lucide-react'

interface ConfirmModalProps {
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
  cancelLabel?: string
}

export function ConfirmModal({
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Sim, deletar',
  cancelLabel = 'Não, cancelar',
}: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[9998] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100">
          <AlertCircle className="w-6 h-6 flex-shrink-0" style={{ color: '#CBA455' }} />
          <h3 className="text-lg font-bold tracking-wide" style={{ color: '#CBA455' }}>ATENÇÃO</h3>
        </div>

        {/* Mensagem */}
        <p className="text-gray-600 text-base mb-8">{message}</p>

        {/* Botões */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={onCancel}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-red-500 bg-red-50 hover:bg-red-100 transition-colors"
          >
            <XCircle className="w-4 h-4" />
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
          >
            <CheckCircle className="w-4 h-4" />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
