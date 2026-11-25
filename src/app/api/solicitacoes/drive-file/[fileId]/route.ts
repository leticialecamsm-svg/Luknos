// Proxy autenticado pra servir bytes de arquivo do Google Drive através do
// nosso próprio domínio — sem isso, o único link que tínhamos (webViewLink)
// manda o usuário pro drive.google.com exigindo login numa conta Google com
// acesso à pasta (Bug reportado pela Letícia: "precisei logar... não é o
// ideal esse monte de passos pra ver 1 imagem").
//
// Usa getAccessToken() (mesmo helper que uploadFile/findOrCreateFolder já
// usam) pra chamar a Drive API direto com o token OAuth da conta Workspace
// da Luknos — streama os bytes pro navegador usando ESSE grant, então
// funciona independente de qualquer sessão Google do usuário.
//
// ?thumb=1 pede a miniatura já gerada pelo Drive (thumbnailLink) — mais leve
// pra grid de arquivos. thumbnailLink é uma URL assinada pelo Google (não um
// endpoint da API), então é buscada sem Authorization header.

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAccessToken } from '@/lib/google-drive'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return new Response('Não autenticado', { status: 401 })

  const { fileId } = await params
  if (!fileId) return new Response('Arquivo não informado', { status: 400 })

  const wantsThumb = req.nextUrl.searchParams.get('thumb') === '1'

  try {
    const token = await getAccessToken()

    if (wantsThumb) {
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=thumbnailLink,mimeType,name`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (metaRes.status === 404) return new Response('Arquivo não encontrado', { status: 404 })
      if (!metaRes.ok) return new Response('Falha ao consultar o Drive', { status: 502 })
      const meta = await metaRes.json() as { thumbnailLink?: string; mimeType?: string }

      if (meta.thumbnailLink) {
        const thumbRes = await fetch(meta.thumbnailLink)
        if (thumbRes.ok && thumbRes.body) {
          return new Response(thumbRes.body, {
            headers: {
              'Content-Type': thumbRes.headers.get('content-type') ?? 'image/jpeg',
              'Cache-Control': 'private, max-age=300',
            },
          })
        }
      }
      // Sem thumbnail (mime não suportado pelo Drive) — cai pro arquivo
      // completo abaixo, mesmo fluxo de quando thumb não é pedido.
    }

    // áudio e vídeo são pedidos em partes (Range) pelo navegador: sem isso não dá para avançar
    // no áudio, e a resposta de uma função da Vercel tem limite de tamanho
    const asked = /bytes=(\d+)-(\d*)/.exec(req.headers.get('range') ?? '')
    let range: string | null = null
    if (asked) {
      const start = Number(asked[1])
      const last = start + 4 * 1024 * 1024 - 1
      range = `bytes=${start}-${asked[2] ? Math.min(Number(asked[2]), last) : last}`
    }
    const fileRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
      { headers: { Authorization: `Bearer ${token}`, ...(range ? { Range: range } : {}) } }
    )
    if (fileRes.status === 404) return new Response('Arquivo não encontrado', { status: 404 })
    if (!fileRes.ok || !fileRes.body) return new Response('Falha ao buscar o arquivo no Drive', { status: 502 })

    const headers = new Headers({
      'Content-Type': fileRes.headers.get('content-type') ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=300',
      'Accept-Ranges': 'bytes',
    })
    for (const h of ['content-length', 'content-range']) {
      const v = fileRes.headers.get(h)
      if (v) headers.set(h, v)
    }
    return new Response(fileRes.body, { status: fileRes.status === 206 ? 206 : 200, headers })
  } catch (e) {
    console.error('[api/solicitacoes/drive-file] falha ao servir arquivo do Drive:', e)
    return new Response('Erro ao acessar o Google Drive', { status: 500 })
  }
}
