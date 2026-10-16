// Visual compartilhado entre as abas do CRM (Quadro e Conversas) para manter
// as duas com a mesma cara.

// Cor do avatar sem foto, estável por conversa.
export function getAvatarColor(id: string): string {
  const colors = [
    'from-blue-400 to-blue-600',
    'from-green-400 to-green-600',
    'from-purple-400 to-purple-600',
    'from-pink-400 to-pink-600',
    'from-yellow-400 to-yellow-600',
    'from-red-400 to-red-600',
    'from-indigo-400 to-indigo-600',
    'from-cyan-400 to-cyan-600',
  ]
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return colors[hash % colors.length]
}

// Cada WhatsApp (número) tem uma cor fixa, para bater o olho e saber de qual
// número é cada conversa. Classes escritas por extenso para o Tailwind enxergar.
export const INSTANCE_COLORS = [
  { chip: 'bg-emerald-100 text-emerald-800 border-emerald-300', bar: 'border-l-emerald-500', dot: 'bg-emerald-500' },
  { chip: 'bg-sky-100 text-sky-800 border-sky-300',             bar: 'border-l-sky-500',     dot: 'bg-sky-500' },
  { chip: 'bg-violet-100 text-violet-800 border-violet-300',    bar: 'border-l-violet-500',  dot: 'bg-violet-500' },
  { chip: 'bg-amber-100 text-amber-800 border-amber-300',       bar: 'border-l-amber-500',   dot: 'bg-amber-500' },
  { chip: 'bg-rose-100 text-rose-800 border-rose-300',          bar: 'border-l-rose-500',    dot: 'bg-rose-500' },
  { chip: 'bg-teal-100 text-teal-800 border-teal-300',          bar: 'border-l-teal-500',    dot: 'bg-teal-500' },
  { chip: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300', bar: 'border-l-fuchsia-500', dot: 'bg-fuchsia-500' },
  { chip: 'bg-orange-100 text-orange-800 border-orange-300',    bar: 'border-l-orange-500',  dot: 'bg-orange-500' },
] as const

export function instanceColor(colorIndex: number | undefined) {
  return INSTANCE_COLORS[Math.abs(colorIndex ?? 0) % INSTANCE_COLORS.length]
}
