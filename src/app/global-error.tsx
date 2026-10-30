'use client'

import { ErrorScreen } from '@/components/ui/ErrorScreen'

// Erro no layout raiz: substitui a página inteira, por isso tem html/body próprios.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0 }}>
        <ErrorScreen error={error} />
      </body>
    </html>
  )
}
