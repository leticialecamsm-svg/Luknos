import { LuknosLogo } from '@/components/ui/LuknosLogo'

// /loader — tela de carregamento no boot. Fundo claro (o app Viver de IA é
// todo claro) com o dourado da marca como acento no spinner. #111827 fica
// reservado a elementos pontuais (ex.: sidebar), não como fundo de página.
export const metadata = { title: 'Carregando — Luknos' }

export default function LoaderPage() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-white via-[#FBFBFA] to-[#F2F3F6]">
      <LuknosLogo className="h-9 w-auto" />
      <div className="flex items-center gap-3">
        <span
          className="w-6 h-6 rounded-full border-4 border-surface-border animate-spin"
          style={{ borderTopColor: 'var(--color-accent-gold)' }}
        />
        <span className="text-sm text-gray-500">Preparando o Luknos…</span>
      </div>
    </div>
  )
}
