'use client'

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react'
import { Check, X, AlertCircle } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
}

interface ToastContextValue {
  success: (title: string, message?: string) => void
  error: (title: string, message?: string) => void
  info: (title: string, message?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const remove = useCallback((id: string) => {
    clearTimeout(timers.current[id])
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const add = useCallback((type: ToastType, title: string, message?: string) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, type, title, message }])
    timers.current[id] = setTimeout(() => remove(id), 4000)
  }, [remove])

  const ctx: ToastContextValue = {
    success: (title, message) => add('success', title, message),
    error: (title, message) => add('error', title, message),
    info: (title, message) => add('info', title, message),
  }

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {/* Portal de toasts — canto inferior direito, igual ao Viver de IA */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col-reverse gap-3 items-end pointer-events-none">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onClose={() => remove(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const ICON_TONE: Record<ToastType, string> = {
  success: 'bg-emerald-400/20 text-emerald-300',
  error: 'bg-red-400/20 text-red-300',
  info: 'bg-white/10 text-white',
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  return (
    <div
      className="pointer-events-auto relative w-[340px] max-w-[90vw] rounded-2xl bg-gradient-navy shadow-hero border border-white/10 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300"
    >
      <div className="flex items-start gap-3 p-4 pb-3.5">
        {/* Ícone */}
        <span className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${ICON_TONE[toast.type]}`}>
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <Check className="w-4 h-4" strokeWidth={3} />}
        </span>

        {/* Texto */}
        <div className="flex-1 min-w-0 pt-1">
          <p className="font-semibold text-[15px] text-white leading-snug">{toast.title}</p>
          {toast.message && (
            <p className="text-sm text-white/55 leading-snug mt-0.5">{toast.message}</p>
          )}
        </div>

        {/* Fechar */}
        <button
          onClick={onClose}
          className="flex-shrink-0 text-white/40 hover:text-white/80 transition-colors mt-0.5"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Barra de progresso (tempo até fechar sozinho) */}
      <div className="h-[3px] bg-white/10">
        <div className="h-full bg-brand-500 animate-[toast-progress_4s_linear_forwards]" />
      </div>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider')
  return ctx
}
