// /loader — tela de carregamento no boot com a identidade Viver de IA
// (fundo #111827 + spinner dourado #cba455). Estados: a animação já é o
// próprio estado de "carregando"; sem chamada de rede, os tokens vêm
// embutidos via theme.css — o mesmo fallback que valeria se
// get-active-theme falhasse.
export const metadata = { title: 'Carregando — Luknos' }

export default function LoaderPage() {
  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center gap-6"
      style={{ background: 'var(--color-background-base)' }}
    >
      <div className="flex items-center gap-3">
        <span
          className="w-10 h-10 rounded-full border-4 animate-spin"
          style={{
            borderColor: 'var(--color-border-subtle)',
            borderTopColor: 'var(--color-accent-gold)',
          }}
        />
        <span
          className="text-2xl font-bold tracking-tight"
          style={{ color: 'var(--color-text-primary)' }}
        >
          Luknos
        </span>
      </div>
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Preparando o Luknos…
      </p>
    </div>
  )
}
