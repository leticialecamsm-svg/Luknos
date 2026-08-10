import Link from 'next/link'
import { Users, ArrowLeft, ChevronDown } from 'lucide-react'

interface Option {
  id: string
  name: string
}

// Menu (quando ninguém está sendo visualizado) ou barra de retorno (quando está).
// Só é renderizado quando o usuário real é admin — ver checagem em dashboard/page.tsx.
export function ViewAsBanner({ options, activeId }: { options: Option[]; activeId: string | null }) {
  if (activeId) {
    const active = options.find(o => o.id === activeId)
    return (
      <div className="mb-4 flex items-center gap-3 bg-brand-50 border border-brand-200 rounded-xl px-4 py-2.5">
        <Users className="w-4 h-4 text-brand-600 shrink-0" />
        <p className="text-sm text-brand-800 flex-1">
          Visualizando o dashboard como <strong>{active?.name ?? 'colaborador'}</strong>
        </p>
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-900 bg-white border border-brand-200 rounded-lg px-3 py-1.5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar para minha visão
        </Link>
      </div>
    )
  }

  if (options.length === 0) return null

  return (
    <div className="mb-4 flex justify-end">
      <div className="relative group inline-block">
        <button className="flex items-center gap-2 px-4 py-2 bg-pink-50 hover:bg-pink-100 border border-pink-200 rounded-lg text-sm font-medium text-pink-700 transition-colors">
          <Users className="w-4 h-4" />
          Visualização dos colaboradores
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 z-30 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
          {options.map(o => (
            <Link
              key={o.id}
              href={`/dashboard?viewAs=${o.id}`}
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-brand-700"
            >
              {o.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
