'use client'

import { ErrorScreen } from '@/components/ui/ErrorScreen'

// Erro em qualquer tela (o (bot) tem o seu próprio).
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen error={error} reset={reset} />
}
