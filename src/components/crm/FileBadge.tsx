import { extColor, fileExtension } from '@/lib/audio-ui'

// Ícone de documento (folha com a dobra no canto) com a extensão escrita dentro.
export function FileBadge({ name, size = 40 }: { name: string | null | undefined; size?: number }) {
  const ext = fileExtension(name)
  const { bg, fg } = extColor(ext)
  const label = (ext || 'arq').slice(0, 4).toUpperCase()
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 40 48" role="img" aria-label={`Documento ${label}`} className="shrink-0">
      <path d="M4 3a3 3 0 0 1 3-3h19l10 10v35a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V3Z" fill={bg} stroke={fg} strokeOpacity="0.35" />
      <path d="M26 0v7a3 3 0 0 0 3 3h7" fill="#fff" fillOpacity="0.6" stroke={fg} strokeOpacity="0.35" />
      <text x="20" y="35" textAnchor="middle" fontSize={label.length > 3 ? 9 : 11} fontWeight="700" fontFamily="system-ui, sans-serif" fill={fg}>{label}</text>
    </svg>
  )
}
