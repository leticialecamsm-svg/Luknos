'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LuknosLogo } from '@/components/ui/LuknosLogo'
import { Loader2, Lock, Eye, EyeOff, ArrowRight, CheckCircle2 } from 'lucide-react'

const FIELD =
  'w-full rounded-xl border border-[#E3E5EA] bg-white pl-11 py-3.5 pr-12 text-sm text-[#0B2447] ' +
  'placeholder-[#AEB4BF] outline-none transition-colors focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10'

export default function ResetPasswordPage() {
  const [ready, setReady]       = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [done, setDone]         = useState(false)

  // O link do email cria uma sessão de recuperação — sem ela não dá pra trocar a senha.
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setReady(!!session))
    return () => sub.subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) { setError('A senha precisa ter pelo menos 6 caracteres.'); return }
    if (password !== confirm) { setError('As duas senhas não são iguais.'); return }

    setLoading(true)
    setError(null)
    const { error } = await createClient().auth.updateUser({ password })
    setLoading(false)

    if (error) { setError('Não foi possível salvar a nova senha. Peça um novo link e tente de novo.'); return }
    setDone(true)
    setTimeout(() => { window.location.href = '/dashboard' }, 1800)
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center px-6
                    bg-gradient-to-b from-white via-[#FBFBFA] to-[#F2F3F6]">
      <LuknosLogo className="h-8 w-auto mb-10" />

      <div className="w-full max-w-[440px] rounded-[28px] border border-black/[0.06] bg-white
                      p-8 sm:p-10 shadow-[0_28px_70px_-24px_rgba(11,36,71,0.22)]">
        {done ? (
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <h1 className="text-lg font-bold text-[#0B2447]">Senha alterada.</h1>
              <p className="text-sm text-[#6B7A99] mt-1">Já vamos te levar para o sistema...</p>
            </div>
          </div>
        ) : !ready ? (
          <div className="flex items-center gap-3 text-sm text-[#6B7A99]">
            <Loader2 className="w-4 h-4 animate-spin" /> Validando o link do email...
          </div>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9AA3B2]">Nova senha</p>
            <h1 className="mt-3 text-[26px] font-bold tracking-[-0.01em] text-[#0B2447]">Escolha uma senha.</h1>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label className="block text-[13px] font-medium text-[#0B2447] mb-2">Nova senha</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#AEB4BF]" />
                  <input type={showPass ? 'text' : 'password'} value={password} autoFocus
                    onChange={e => setPassword(e.target.value)} placeholder="Mínimo de 6 caracteres"
                    required className={FIELD} />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#AEB4BF] hover:text-[#6B7A99]">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#0B2447] mb-2">Repita a senha</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#AEB4BF]" />
                  <input type={showPass ? 'text' : 'password'} value={confirm}
                    onChange={e => setConfirm(e.target.value)} placeholder="••••••••"
                    required className={FIELD} />
                </div>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>}

              <button type="submit" disabled={loading}
                className="group w-full flex items-center justify-center gap-2 rounded-full bg-[#0B2447]
                           py-3.5 text-sm font-medium text-white transition-colors hover:bg-[#123259] disabled:opacity-60">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loading ? 'Salvando...' : 'Salvar nova senha'}
                {!loading && <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />}
              </button>
            </form>
          </>
        )}
      </div>

      <a href="/auth/login" className="mt-8 text-xs font-medium text-[#B4BAC5] hover:text-[#6B7A99] transition-colors">
        ← Voltar para o login
      </a>
    </div>
  )
}
