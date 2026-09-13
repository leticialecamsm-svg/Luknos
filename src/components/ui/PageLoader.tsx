// Telas de carregamento. Aparecem no instante do clique (Next mostra o
// loading.tsx enquanto o servidor monta a página), então a navegação
// responde na hora mesmo quando os dados ainda estão chegando.

/** Símbolo da Luknos (a estrela) — só o ícone, sem o nome. */
function LuknosMark({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 201 201" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path className="luk-star-navy" d="M0 119.909C19.7295 121.966 42.4118 126.746 55.9324 137.742C69.3309 147.791 79.2522 168.175 86.4781 183.022C91.3862 193.106 95.0507 200.635 97.7168 200.635C101.259 200.635 102.414 196.49 104.278 189.802C106.904 180.378 110.938 165.905 125.037 150.866C140.037 135.653 152.09 128.728 153.965 128.371C151.62 120.845 144.319 123.974 144.319 123.974C144.319 123.974 140.669 125.017 137.09 127.296C134.835 128.732 132.814 129.978 130.922 131.146C121.278 137.095 114.958 140.994 97.7168 157.563C97.0372 154.613 97.3339 151.368 97.6406 148.013C99.0937 132.12 100.772 113.759 0 112.657V119.909Z" fill="#0A1F3B"/>
      <path className="luk-star-gold" d="M200.115 111.771C183.762 109.145 165.563 103.53 152.626 91.8863C140.825 83.0352 129.202 65.4518 119.472 50.732C110.652 37.3887 103.388 26.3984 98.955 26.3984C93.7376 26.398 92.2749 31.6405 90.0089 39.762C87.2639 49.6004 83.34 63.6637 70.1346 77.7494C55.1351 92.9632 48.7062 95.9629 45.7599 97.3019C45.7599 97.3019 58.8671 98.6461 62.3497 97.3019C74.2881 92.6939 82.9049 82.6265 90.5988 73.6374C92.5618 71.3439 94.4648 69.1206 96.3475 67.0761L98.9537 74.6918C99.3425 76.3791 99.5955 78.0863 99.8497 79.8013C102.087 94.8942 104.413 110.588 200.115 118.665V111.771Z" fill="#CBA455"/>
    </svg>
  )
}

function Block({ className = '' }: { className?: string }) {
  return <div className={`luk-shimmer rounded-lg ${className}`} />
}

/** Conteúdo da página carregando — usado dentro do layout (menu continua visível). */
export function ContentLoader() {
  return (
    <div className="relative" role="status" aria-live="polite">
      <span className="sr-only">Carregando…</span>

      {/* Símbolo pulsando, centralizado sobre o esqueleto */}
      <div className="pointer-events-none absolute inset-x-0 top-40 z-10 flex flex-col items-center gap-3">
        <div className="luk-mark rounded-2xl bg-white/90 p-3 shadow-sm ring-1 ring-black/[0.04] backdrop-blur-sm">
          <LuknosMark className="h-9 w-9" />
        </div>
        <span className="text-xs font-medium tracking-wide text-gray-400">Carregando…</span>
      </div>

      <div className="space-y-6 opacity-70">
        <div className="space-y-2">
          <Block className="h-7 w-56" />
          <Block className="h-4 w-80" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => <Block key={i} className="h-24 rounded-xl" />)}
        </div>
        <Block className="h-72 rounded-xl" />
        <div className="grid md:grid-cols-2 gap-4">
          <Block className="h-44 rounded-xl" />
          <Block className="h-44 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

/** Tela inteira carregando — usada ao trocar de seção, antes do menu montar. */
export function AppShellLoader() {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className="shrink-0 w-56 h-full flex flex-col border-r border-surface-border"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.84) 10%, rgba(247,248,250,0.58) 100%)',
          boxShadow: 'rgba(255,255,255,0.7) 0 1px 0 0 inset, rgba(10,31,59,0.12) 8px 0 24px -12px',
        }}
      >
        <div className="px-5 pt-6 pb-5"><div className="h-9 w-32 rounded-md bg-[rgba(10,31,59,0.06)]" /></div>
        <div className="px-3 space-y-2">
          {Array.from({ length: 9 }).map((_, i) => <div key={i} className="h-8 rounded-lg bg-[rgba(10,31,59,0.04)]" />)}
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-h-0">
        <div className="h-14 shrink-0 border-b border-surface-border bg-white/85" />
        <main className="flex-1 overflow-hidden bg-white">
          <div className="max-w-7xl mx-auto p-6"><ContentLoader /></div>
        </main>
      </div>
    </div>
  )
}
