'use client'

import { useEffect } from 'react'
import { RefreshCw } from 'lucide-react'

export default function BotError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('bot panel error:', error)
  }, [error])

  return (
    <div className="max-w-md mx-auto mt-16 text-center space-y-4">
      <h1 className="text-lg font-semibold text-gray-900">Algo deu errado ao carregar esta página</h1>
      <p className="text-sm text-gray-500">
        Pode ser uma instabilidade temporária. Tente novamente — se continuar, avise o suporte.
      </p>
      <button onClick={reset} className="btn-primary inline-flex items-center gap-2">
        <RefreshCw className="w-4 h-4" />
        Tentar novamente
      </button>
    </div>
  )
}
