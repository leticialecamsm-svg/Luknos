import { LoginForm } from '@/components/auth/LoginForm'
import { LuknosLogo } from '@/components/ui/LuknosLogo'

export const metadata = { title: 'Entrar — Luknos' }

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex flex-col bg-gradient-to-b from-white via-[#FBFBFA] to-[#F2F3F6]">
      <div className="flex-1 w-full max-w-[1120px] mx-auto px-8 lg:px-10 py-12
                      grid lg:grid-cols-2 gap-14 lg:gap-12 items-center">

        {/* ─── Marca + versículo ─── */}
        <div className="max-w-xl">
          <LuknosLogo className="h-9 w-auto" />

          <blockquote className="mt-12 lg:mt-16 text-[32px] lg:text-[46px] font-bold leading-[1.12] tracking-[-0.02em] text-[#0B2447]">
            Façam aos outros{' '}
            <span className="italic text-[#CBA455]">aquilo que</span>{' '}
            <span className="italic text-[#6B7A99] border-b-[3px] border-[#CBA455] pb-1">vocês querem</span>{' '}
            que eles façam a vocês.
          </blockquote>

          <p className="mt-9 flex items-center gap-4 text-sm text-[#6B7A99]">
            <span className="w-10 h-px bg-[#CBA455]" /> Mateus 7:12
          </p>
        </div>

        {/* ─── Card de acesso ─── */}
        <div className="flex lg:justify-end">
          <div className="w-full max-w-[440px] rounded-[28px] border border-black/[0.06] bg-white
                          p-8 sm:p-10 shadow-[0_28px_70px_-24px_rgba(11,36,71,0.22)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9AA3B2]">
              Acessar sistema
            </p>
            <h1 className="mt-3 text-[26px] font-bold tracking-[-0.01em] text-[#0B2447]">
              Bem-vindo de volta.
            </h1>

            <div className="mt-8">
              <LoginForm />
            </div>
          </div>
        </div>
      </div>

      <footer className="w-full max-w-[1500px] mx-auto px-8 lg:px-16 py-7
                         flex items-center justify-between gap-4
                         text-[10.5px] font-medium uppercase tracking-[0.16em] text-[#B4BAC5]">
        <span>Luknos Iluminação</span>
        <span className="hidden sm:flex items-center gap-2">
          <i className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Sistema interno
        </span>
        <span>{new Date().getFullYear()}</span>
      </footer>
    </div>
  )
}
