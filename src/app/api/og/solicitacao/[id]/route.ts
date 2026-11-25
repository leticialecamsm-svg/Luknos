import { NextRequest } from 'next/server'
import { getSharePreview } from '@/lib/solicitations/share-preview'

export const dynamic = 'force-dynamic'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Página mostrada a quem abre o link de uma solicitação SEM estar logado (o middleware reescreve
// para cá): traz só as informações do banner do WhatsApp e leva a pessoa para a tela de login.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
  const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '')
  const origin = `${proto}://${host}`
  const p = await getSharePreview(params.id).catch(() => null)
  const title = p ? `${p.title} · #${p.number}` : 'Luknos Iluminação'
  const description = p ? [p.client, p.stage ? `Etapa: ${p.stage}` : null].filter(Boolean).join(' · ') : 'Sistema de gestão Luknos'
  // o "v" muda com a etapa para o WhatsApp não reaproveitar um banner antigo
  const image = p ? `${origin}/api/og/solicitacao/${params.id}/imagem?v=${encodeURIComponent(p.stage ?? '0')}` : `${origin}/icons/icon-512.png`
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Luknos Iluminação">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(`${origin}/solicitacoes/${encodeURIComponent(params.id)}`)}">
<meta property="og:image" content="${esc(image)}">
${p ? '<meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' : ''}
<meta name="twitter:card" content="summary_large_image">
</head>
<body style="font-family:system-ui,sans-serif;padding:32px">
<p>Entre no sistema para abrir esta solicitação.</p>
<p><a href="/auth/login">Fazer login</a></p>
<script>location.replace('/auth/login')</script>
</body>
</html>`
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}
