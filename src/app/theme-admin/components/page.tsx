import { getActiveTheme, listComponentSpecs } from '@/lib/theme-admin/actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Catálogo de Componentes — Luknos' }

export default async function ThemeAdminComponentsPage() {
  const theme = await getActiveTheme()
  const specs = theme ? await listComponentSpecs(theme.id) : []

  if (specs.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Catálogo de componentes</h1>
        <p className="text-gray-500 mb-6">Componentes repaginados do tema {theme?.display_name ?? 'ativo'}.</p>
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-10 text-center text-gray-500">
          Catálogo de componentes ainda não populado.
        </div>
      </div>
    )
  }

  const byGroup = specs.reduce<Record<string, typeof specs>>((acc, c) => {
    (acc[c.component_group] ??= []).push(c)
    return acc
  }, {})

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Catálogo de componentes</h1>
      <p className="text-gray-500 mb-6">Componentes repaginados do tema {theme?.display_name}.</p>
      <div className="space-y-6">
        {Object.entries(byGroup).map(([group, items]) => (
          <div key={group}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{group}</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map(c => (
                <div key={c.id} className="bg-white border border-surface-border rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-sm text-gray-900">{c.component_key}</p>
                    {c.is_external_embed && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">embed externo</span>
                    )}
                  </div>
                  <pre className="mt-2 text-xs text-gray-400 whitespace-pre-wrap break-words">{JSON.stringify(c.spec_json, null, 2)}</pre>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
