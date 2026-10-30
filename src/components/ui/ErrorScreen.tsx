'use client'

import { useEffect } from 'react'

// Tela de erro do sistema inteiro (no lugar do "Application error" em branco do Next).
// No app instalado no celular não há botão de recarregar do navegador, então os botões ficam aqui.
// Erro de "pedaço do sistema não encontrado" acontece quando o sistema foi atualizado com a tela aberta:
// recarrega sozinho uma vez. Todo erro é registrado (/api/client-error) para dar para achar a causa.

const STALE = /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Failed to fetch dynamically/i
const KEY = 'luknos-error-reload'

export function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset?: () => void }) {
  const stale = STALE.test(`${error?.name} ${error?.message}`)

  useEffect(() => {
    console.error(error)
    try {
      fetch('/api/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: String(error?.message ?? error).slice(0, 500),
          name: error?.name,
          digest: error?.digest,
          stack: String(error?.stack ?? '').slice(0, 2000),
          url: location.href,
          ua: navigator.userAgent,
        }),
        keepalive: true,
      }).catch(() => {})
    } catch { /* ignore */ }
    if (!stale) return
    // versão nova no ar: recarrega uma vez (se já recarregou há pouco, mostra os botões)
    try {
      const last = Number(sessionStorage.getItem(KEY) ?? 0)
      if (Date.now() - last > 30_000) { sessionStorage.setItem(KEY, String(Date.now())); location.reload() }
    } catch { location.reload() }
  }, [error, stale])

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#f9fafb', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 380, width: '100%', textAlign: 'center', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '28px 22px' }}>
        <p style={{ fontSize: 17, fontWeight: 600, color: '#111827', margin: 0 }}>
          {stale ? 'O sistema foi atualizado' : 'Algo deu errado nesta tela'}
        </p>
        <p style={{ fontSize: 14, color: '#6b7280', margin: '8px 0 20px' }}>
          {stale ? 'Recarregue para usar a versão nova.' : 'O erro já foi registrado. Recarregue a página; se continuar, volte ao início.'}
        </p>
        <button
          onClick={() => location.reload()}
          style={{ width: '100%', padding: '12px 16px', borderRadius: 999, border: 0, background: '#0A1F3B', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
        >
          Recarregar
        </button>
        <button
          onClick={() => { location.href = location.pathname.startsWith('/crm') ? '/crm/conversas' : '/' }}
          style={{ width: '100%', marginTop: 10, padding: '12px 16px', borderRadius: 999, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 15, cursor: 'pointer' }}
        >
          Voltar ao início
        </button>
        {reset && !stale && (
          <button onClick={reset} style={{ marginTop: 12, background: 'none', border: 0, color: '#6b7280', fontSize: 13, textDecoration: 'underline', cursor: 'pointer' }}>
            Tentar de novo sem recarregar
          </button>
        )}
      </div>
    </div>
  )
}
