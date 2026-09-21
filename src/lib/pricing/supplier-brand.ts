// Logo e cor de cada fornecedor (logos em /public/fornecedores; cor = tom predominante da marca)
const BRANDS: Record<string, { logo?: string; color: string }> = {
  'ACCORD ILUMINACAO': { logo: 'accordiluminacao', color: '#5b4a3a' },
  AVANT: { logo: 'avantlux', color: '#db271b' },
  BLUMENAU: { logo: 'blumenauiluminacao', color: '#00a7fe' },
  CETILUX: { logo: 'cetilux', color: '#8e4fd1' },
  DELIS: { logo: 'delis', color: '#1f3f8f' },
  DITAL: { logo: 'dital', color: '#e31113' },
  EMBULED: { logo: 'embuled', color: '#0671b9' },
  ESPECIALLUZ: { logo: 'especialluz', color: '#e5bc0b' },
  GAYA: { logo: 'gaya', color: '#3ca2ad' },
  GMH: { logo: 'gmhtrade', color: '#1d3b69' },
  HEVVY: { logo: 'hevvy', color: '#111111' },
  ILUMI: { logo: 'ilumi', color: '#059a49' },
  LUMINATTI: { logo: 'luminatti', color: '#f2b632' },
  'MERCADO LIVRE': { logo: 'mercadolivre', color: '#ffe600' },
  NITROLUX: { logo: 'nitrolux', color: '#675f5c' },
  NORDECOR: { logo: 'nordecor', color: '#4f5158' },
  PIX: { logo: 'pixiluminacao', color: '#111111' },
  SKYLIGHT: { logo: 'skylightiluminacao', color: '#014488' },
  SORTELUZ: { logo: 'sorteluz', color: '#ee6714' },
  SPOTLINE: { logo: 'spotline', color: '#e2070e' },
  TEMLED: { logo: 'temled', color: '#1a3d87' },
  TKS: { logo: 'tksiluminacao', color: '#3c342a' },
  TRAMONTINA: { logo: 'tramontina', color: '#0000b6' },
  USINA: { logo: 'usinadesign', color: '#0c0c0d' },
}

const key = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()

export function supplierBrand(name: string) {
  const b = BRANDS[key(name)]
  if (b) return { logo: b.logo ? `/fornecedores/${b.logo}.png` : null, color: b.color }
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360
  return { logo: null, color: `hsl(${h} 55% 40%)` }
}

// texto legível sobre a cor da marca
export function onColor(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.62 ? '#1f2937' : '#ffffff'
}
