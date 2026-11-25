import { ImageResponse } from 'next/og'
import { getSharePreview } from '@/lib/solicitations/share-preview'
import { FONT_BOLD, FONT_REGULAR, LOGO_PNG } from './assets'

export const dynamic = 'force-dynamic'

const bytes = (b64: string) => Uint8Array.from(Buffer.from(b64, 'base64')).buffer

const initials = (name: string) => {
  const w = name.split(/\s+/).filter((x) => /[a-zA-ZÀ-ÿ0-9]/.test(x))
  return ((w[0]?.[0] ?? '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase() || 'L'
}

// Banner (1200×630) no estilo do topo da página da solicitação.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const p = await getSharePreview(params.id).catch(() => null)
  if (!p) return new Response('Não encontrado', { status: 404 })
  const title = p.title.length > 70 ? p.title.slice(0, 68).trimEnd() + '…' : p.title
  const client = p.client && p.client.length > 44 ? p.client.slice(0, 42).trimEnd() + '…' : p.client
  const size = title.length > 44 ? 62 : title.length > 26 ? 74 : 88
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#ffffff', fontFamily: 'Geist', padding: '64px 72px', borderTop: '18px solid #0A1F3B' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            <img src={`data:image/png;base64,${LOGO_PNG}`} width={92} height={92} />
            <div style={{ display: 'flex', marginLeft: 14, fontSize: 34, fontWeight: 700, color: '#0A1F3B' }}>Luknos Iluminação</div>
          </div>
          <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, color: '#8a4b12', background: '#fffbeb', border: '3px solid #fde68a', borderRadius: 999, padding: '10px 30px' }}>{`#${p.number}`}</div>
        </div>
        <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 170, height: 170, borderRadius: 40, background: '#e0e7ff', color: '#3730a3', fontSize: 70, fontWeight: 700, flexShrink: 0 }}>{initials(p.client ?? p.title)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 44, width: 842 }}>
            <div style={{ display: 'flex', fontSize: size, fontWeight: 700, color: '#111827', lineHeight: 1.12 }}>{title}</div>
            {client ? <div style={{ display: 'flex', marginTop: 18, fontSize: 40, color: '#6b7280' }}>{client}</div> : null}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', height: 76 }}>
          {p.stage ? (
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 38, fontWeight: 700, color: '#ffffff', background: '#0A1F3B', borderRadius: 999, padding: '14px 36px' }}>{`Etapa: ${p.stage}`}</div>
          ) : null}
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
