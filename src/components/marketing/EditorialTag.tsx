import { cn } from '@/lib/utils'

const DEFAULT_COLOR = '#94A3B8'

// Tag colorida da linha editorial. Usa a cor persistida da linha (mesma em toda a app).
export function EditorialTag({ name, color, size = 'md', className }: {
  name: string
  color?: string | null
  size?: 'sm' | 'md'
  className?: string
}) {
  const c = color || DEFAULT_COLOR
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full font-medium max-w-full',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs', className)}
      style={{ backgroundColor: `${c}1A`, color: c }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c }} />
      <span className="truncate">{name}</span>
    </span>
  )
}
