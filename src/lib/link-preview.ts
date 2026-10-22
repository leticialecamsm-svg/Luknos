import { lookup } from 'dns/promises'
import { isIP } from 'net'

export interface LinkPreview { url: string; title: string | null; description: string | null; image: string | null; site: string | null }

// Só endereços públicos: o servidor não pode ser usado para acessar a rede interna.
function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase()
    if (v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v)
    return m ? isPrivateIp(m[1]) : false
  }
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
}

async function assertPublic(u: URL) {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocolo')
  if (u.port && u.port !== '80' && u.port !== '443') throw new Error('porta')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('endereço interno')
}

function meta(html: string, keys: string[]): string | null {
  for (const k of keys) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*>`, 'i')
    const tag = re.exec(html)?.[0]
    const content = tag && /content=["']([^"']*)["']/i.exec(tag)?.[1]
    if (content) return decode(content.trim())
  }
  return null
}

function decode(s: string) {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

const cache = new Map<string, { at: number; v: LinkPreview | null }>()

export async function fetchLinkPreview(raw: string): Promise<LinkPreview | null> {
  const hit = cache.get(raw)
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.v
  let v: LinkPreview | null = null
  try {
    let url = new URL(raw)
    let res: Response | null = null
    // segue até 4 redirecionamentos, conferindo o destino de cada um
    for (let i = 0; i < 5; i++) {
      await assertPublic(url)
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(6000),
        // o mesmo agente do WhatsApp: os sites entregam a prévia (og:image) para ele
        headers: { 'User-Agent': 'WhatsApp/2.23.20.0 A', Accept: 'text/html', 'Accept-Language': 'pt-BR,pt;q=0.9' },
      })
      const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
      if (!loc) break
      url = new URL(loc, url)
      res = null
    }
    if (res?.ok && (res.headers.get('content-type') ?? '').includes('text/html') && res.body) {
      const reader = res.body.getReader()
      let html = ''
      const dec = new TextDecoder()
      while (html.length < 400_000) {
        const { done, value } = await reader.read()
        if (done) break
        html += dec.decode(value, { stream: true })
        if (/<\/head>/i.test(html)) break
      }
      reader.cancel().catch(() => {})
      const title = meta(html, ['og:title', 'twitter:title']) ?? decode(/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? '') ?? null
      const img = meta(html, ['og:image:secure_url', 'og:image', 'twitter:image'])
      let image: string | null = null
      if (img) { try { const iu = new URL(img, url); if (iu.protocol === 'https:' || iu.protocol === 'http:') image = iu.toString() } catch { /* sem imagem */ } }
      v = {
        url: url.toString(),
        title: title || null,
        description: meta(html, ['og:description', 'description', 'twitter:description']),
        image,
        site: meta(html, ['og:site_name']) ?? url.hostname.replace(/^www\./, ''),
      }
      if (!v.title && !v.image) v = null
    }
  } catch {
    v = null
  }
  if (cache.size > 500) cache.clear()
  cache.set(raw, { at: Date.now(), v })
  return v
}
