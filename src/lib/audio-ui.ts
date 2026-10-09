// Regras puras do player de áudio do CRM (sem DOM), cobertas por testes.

export const SPEEDS = [1, 1.5, 2] as const

export function nextSpeed(cur: number): number {
  const i = SPEEDS.findIndex((s) => s === cur)
  return SPEEDS[(i + 1) % SPEEDS.length]
}

export function speedLabel(s: number): string {
  return `${String(s).replace('.', ',')}x`
}

// Reduz as amostras de áudio a N barras (0..1), pelo pico de cada janela, normalizado.
export function computePeaks(samples: ArrayLike<number>, bars: number): number[] {
  if (bars <= 0) return []
  const n = samples.length
  if (n === 0) return Array(bars).fill(0.08)
  const size = Math.max(1, Math.floor(n / bars))
  const raw: number[] = []
  for (let b = 0; b < bars; b++) {
    let peak = 0
    const start = b * size
    const end = b === bars - 1 ? n : Math.min(n, start + size)
    for (let i = start; i < end; i++) {
      const v = Math.abs(samples[i])
      if (v > peak) peak = v
    }
    raw.push(peak)
  }
  const max = Math.max(...raw)
  if (max === 0) return raw.map(() => 0.08)
  // piso mínimo para barra "silenciosa" continuar visível
  return raw.map((v) => Math.max(0.08, v / max))
}

// Onda "de enfeite" estável quando não dá para decodificar o áudio.
export function fallbackPeaks(seed: string, bars: number): number[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) }
  const out: number[] = []
  for (let i = 0; i < bars; i++) {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5
    out.push(0.2 + ((h >>> 0) % 1000) / 1000 * 0.8)
  }
  return out
}

export function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const s = Math.floor(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Posição (0..1) do clique/arraste dentro da onda.
export function ratioFromPointer(clientX: number, left: number, width: number): number {
  if (width <= 0) return 0
  return Math.min(1, Math.max(0, (clientX - left) / width))
}

export function fileExtension(name: string | null | undefined): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec((name ?? '').trim())
  return m ? m[1].toLowerCase() : ''
}

// Cor do ícone de documento por extensão.
export function extColor(ext: string): { bg: string; fg: string } {
  const map: Record<string, { bg: string; fg: string }> = {
    pdf: { bg: '#FEE2E2', fg: '#B91C1C' },
    dwg: { bg: '#DBEAFE', fg: '#1D4ED8' }, dxf: { bg: '#DBEAFE', fg: '#1D4ED8' },
    skp: { bg: '#CCFBF1', fg: '#0F766E' },
    xls: { bg: '#DCFCE7', fg: '#15803D' }, xlsx: { bg: '#DCFCE7', fg: '#15803D' }, csv: { bg: '#DCFCE7', fg: '#15803D' },
    doc: { bg: '#E0E7FF', fg: '#4338CA' }, docx: { bg: '#E0E7FF', fg: '#4338CA' },
    ppt: { bg: '#FFEDD5', fg: '#C2410C' }, pptx: { bg: '#FFEDD5', fg: '#C2410C' },
    zip: { bg: '#F3F4F6', fg: '#374151' }, rar: { bg: '#F3F4F6', fg: '#374151' },
    txt: { bg: '#F3F4F6', fg: '#374151' },
  }
  return map[ext] ?? { bg: '#F1F5F9', fg: '#475569' }
}
