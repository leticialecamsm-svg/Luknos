import { ImageResponse } from 'next/og'
import { getSharePreview, type ShareMember } from '@/lib/solicitations/share-preview'
import { avatarColor } from '@/lib/avatar-color'
import { getInitials } from '@/lib/utils'
import { FONT_BOLD, FONT_REGULAR, LOGO_PNG } from './assets'

export const dynamic = 'force-dynamic'

const bytes = (b64: string) => Uint8Array.from(Buffer.from(b64, 'base64')).buffer
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

// A foto vai embutida na imagem; se não carregar (ou for um formato que o gerador não lê), iniciais.
async function photo(m: ShareMember): Promise<string | null> {
  if (!m.avatarUrl?.startsWith('https://')) return null
  try {
    const r = await fetch(m.avatarUrl, { signal: AbortSignal.timeout(4000) })
    if (!r.ok) return null
    const buf = Buffer.from(await r.arrayBuffer())
    // o tipo vem do conteúdo: há fotos JPEG salvas com nome/tipo de PNG, que sairiam em branco
    const type = buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg' : buf[0] === 0x89 && buf[1] === 0x50 ? 'image/png' : null
    return !type || buf.length > 3_000_000 ? null : `data:${type};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

// Banner igual ao topo da página da solicitação. A imagem é 1200×630 (proporção que o WhatsApp
// mostra inteira; mais "achatada" que isso ele corta as laterais). O cartão ocupa a faixa central de
// 315 px: é exatamente o recorte compacto que o CRM mostra (LinkPreviewCard).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const p = await getSharePreview(params.id).catch(() => null)
  if (!p) return new Response('Não encontrado', { status: 404 })
  const title = cut(p.title, 56)
  const size = title.length > 27 ? 44 : 54
  const name = p.client ?? 'Cliente'
  const color = avatarColor(p.clientId || name)
  const team = await Promise.all(p.team.slice(0, 5).map(async (m) => ({ ...m, src: await photo(m) })))
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', background: '#ffffff', fontFamily: 'Geist' }}>
      <div style={{ width: 1200, height: 315, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 0 0 56px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 132, height: 132, borderRadius: 34, background: color.bg, color: color.text, fontSize: 50, fontWeight: 700, flexShrink: 0 }}>{getInitials(name)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', maxWidth: 830, fontSize: size, fontWeight: 700, color: '#111827', lineHeight: 1.15 }}>{title}</div>
              <div style={{ display: 'flex', marginLeft: 22, fontSize: 30, color: '#92400e', background: '#ffffff', border: '2px solid #fde68a', borderRadius: 999, padding: '6px 20px', flexShrink: 0 }}>{`#${p.number}`}</div>
            </div>
            {p.client ? <div style={{ display: 'flex', marginTop: 8, fontSize: 32, color: '#6b7280' }}>{cut(p.client, 44)}</div> : null}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 34, height: 60 }}>
          {p.stage ? (
            <div style={{ display: 'flex', alignItems: 'center', height: 56, fontSize: 30, fontWeight: 700, color: '#92400e', background: '#fffbeb', border: '2px solid #fde68a', borderRadius: 999, padding: '0 28px', marginRight: 20 }}>{`Etapa: ${p.stage}`}</div>
          ) : null}
          {team.map((m, i) => {
            const c = avatarColor(m.id)
            const style = { width: 60, height: 60, borderRadius: 999, border: '4px solid #ffffff', marginLeft: i ? -14 : 0 }
            return m.src ? (
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
              <img key={m.id} src={m.src} width={60} height={60} style={{ ...style, objectFit: 'cover' }} />
            ) : (
              <div key={m.id} style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.bg, color: c.text, fontSize: 22, fontWeight: 700 }}>{getInitials(m.name)}</div>
            )
          })}
          {p.team.length > 5 ? <div style={{ display: 'flex', marginLeft: 12, fontSize: 28, color: '#6b7280' }}>{`+${p.team.length - 5}`}</div> : null}
        </div>
        {/* só o ícone da marca, no canto */}
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={`data:image/png;base64,${LOGO_PNG}`} width={96} height={96} style={{ position: 'absolute', right: 24, bottom: 20 }} />
      </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Geist', data: bytes(FONT_REGULAR), weight: 400, style: 'normal' },
        { name: 'Geist', data: bytes(FONT_BOLD), weight: 700, style: 'normal' },
      ],
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
    },
  )
}
