import { Construction } from 'lucide-react'

/** Placeholder das telas que chegam na Fase 2 (docs/PLANO.md) — a Fase 1 só monta navegação + auth. */
export function EmConstrucao({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <p className="text-sm text-gray-500 mt-1 max-w-xl">{description}</p>
      <div className="mt-6 border-2 border-dashed border-surface-border rounded-2xl p-10 flex flex-col items-center text-center gap-2">
        <Construction className="w-8 h-8 text-gray-300" />
        <p className="text-sm font-medium text-gray-500">Essa tela entra na Fase 2 (Construção)</p>
        <p className="text-xs text-gray-400 max-w-sm">
          A Fase 1 cuidou da fundação: banco, permissões e navegação. O conteúdo real desta página
          vem junto com os cadastros de apoio e os lançamentos.
        </p>
      </div>
    </div>
  )
}
