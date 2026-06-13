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
      {/* Portal de toasts — canto superior centro */}
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onClose={() => remove(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const isSuccess = toast.type === 'success'
  const isError = toast.type === 'error'

  return (
    <div
      className={`pointer-events-auto flex items-center gap-3 px-5 py-3 rounded-full border shadow-lg animate-in fade-in slide-in-from-top-2 duration-300 min-w-[320px] max-w-[560px] ${
        isSuccess
          ? 'bg-white border-emerald-200 text-emerald-800'
          : isError
          ? 'bg-white border-red-200 text-red-700'
          : 'bg-white border-blue-200 text-blue-700'
      }`}
    >
      {/* Ícone */}
      <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
        isSuccess ? 'text-emerald-600' : isError ? 'text-red-500' : 'text-blue-500'
      }`}>
        {isError ? <AlertCircle className="w-4 h-4" /> : <Check className="w-4 h-4" strokeWidth={3} />}
      </span>

      {/* Texto */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <span className="font-bold text-sm tracking-wide whitespace-nowrap">{toast.title}</span>
        {toast.message && (
          <>
            <span className="text-sm opacity-40 select-none">|</span>
            <span className="text-sm opacity-70 truncate">{toast.message}</span>
          </>
        )}
      </div>

      {/* Fechar */}
      <button
        onClick={onClose}
        className="flex-shrink-0 opacity-30 hover:opacity-70 transition-opacity"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider')
  return ctx
}
