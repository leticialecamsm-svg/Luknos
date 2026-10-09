import { CONTACT_TYPE_LABEL } from '@/lib/crm-panel'
import { cn } from '@/lib/utils'
import type { CrmLabel } from '@/lib/crm-actions'

// Cor legível (texto escuro/claro) sobre o fundo da etiqueta.
function readable(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1f2937' : '#ffffff'
}

export function LabelChip({ label, className }: { label: CrmLabel; className?: string }) {
  return (
    <span
      title={`Etiqueta: ${label.name}`}
      className={cn('inline-block max-w-full truncate text-[10px] font-semibold leading-none px-1.5 py-[3px] rounded', className)}
      style={{ background: label.color, color: readable(label.color) }}
    >
      {label.name}
    </span>
  )
}

// Categoria do contato (cliente, arquiteto…) + etiquetas da conversa.
export function ConvTags({ type, labels, className }: { type?: string | null; labels?: CrmLabel[]; className?: string }) {
  const hasType = !!type
  if (!hasType && !(labels && labels.length)) return null
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {hasType && (
        <span title="Categoria do contato" className="inline-block text-[10px] font-semibold leading-none px-1.5 py-[3px] rounded bg-violet-100 text-violet-800 border border-violet-200">
          {CONTACT_TYPE_LABEL[type!] ?? type}
        </span>
      )}
      {(labels ?? []).map((l) => <LabelChip key={l.id} label={l} />)}
    </div>
  )
}
