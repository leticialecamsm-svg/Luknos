'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Mail, Lock, Eye, EyeOff, ArrowRight, CheckCircle2 } from 'lucide-react'

const FIELD =
  'w-full rounded-xl border border-[#E3E5EA] bg-white pl-11 py-3.5 pr-4 text-sm text-[#0B2447] ' +
  'placeholder-[#AEB4BF] outline-none transition-colors focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10'

export function LoginForm() {
  const [mode, setMode]         = useState<'login' | 'recover'>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [sent, setSent]         = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      const isRateLimit = error.status === 429 || /rate limit/i.test(error.message)
      setError(isRateLimit
        ? 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.'
        : 'Email ou senha incorretos')
      setLoading(false)
      return
    }

    window.location.href = '/dashboard'
  }

  async function handleRecover(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    setLoading(false)

    if (error) {
      setError('Não foi possível enviar o link. Confira o email e tente novamente.')
      return
    }
    setSent(true)
  }

  // ── Link de redefinição enviado ───────────────────────────────────────────
  if (sent) {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          <p className="text-sm text-emerald-800 leading-relaxed">
            Enviamos um link para <strong className="font-semibold">{email}</strong>. Abra o email e
            escolha uma nova senha.
          </p>
        </div>
        <button type="button" onClick={() => { setSent(false); setMode('login') }}
          className="text-xs font-medium text-[#6B7A99] hover:text-[#0B2447] transition-colors">
          ← Voltar para o login
        </button>
      </div>
    )
  }

  // ── Recuperar senha ───────────────────────────────────────────────────────
  if (mode === 'recover') {
    return (
      <form onSubmit={handleRecover} className="space-y-5">
        <p className="text-sm text-[#6B7A99] leading-relaxed">
          Digite seu email e enviaremos um link para você criar uma nova senha.
        </p>

        <div>
          <label className="block text-[13px] font-medium text-[#0B2447] mb-2">E-mail</label>
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#AEB4BF]" />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com" required autoFocus className={FIELD} />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>}

        <button type="submit" disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-full bg-[#0B2447] py-3.5 text-sm font-medium text-white transition-colors hover:bg-[#123259] disabled:opacity-60">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {loading ? 'Enviando...' : 'Enviar link'}
        </button>

        <button type="button" onClick={() => { setMode('login'); setError(null) }}
          className="w-full text-center text-xs font-medium text-[#6B7A99] hover:text-[#0B2447] transition-colors">
          ← Voltar para o login
        </button>
      </form>
    )
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleLogin} className="space-y-5">
      <div>
        <label className="block text-[13px] font-medium text-[#0B2447] mb-2">E-mail</label>
        <div className="relative">
          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#AEB4BF]" />
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="seu@email.com" required className={FIELD} />
        </div>
      </div>

      <div>
        <label className="block text-[13px] font-medium text-[#0B2447] mb-2">Senha</label>
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#AEB4BF]" />
          <input type={showPass ? 'text' : 'password'} value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••" required className={FIELD + ' pr-12'} />
          <button type="button" onClick={() => setShowPass(v => !v)}
            title={showPass ? 'Ocultar senha' : 'Mostrar senha'}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#AEB4BF] hover:text-[#6B7A99] transition-colors">
            {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={() => { setMode('recover'); setError(null) }}
          className="text-[13px] text-[#6B7A99] hover:text-[#0B2447] transition-colors">
          Esqueci minha senha
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>}

      <button type="submit" disabled={loading}
        className="group w-full flex items-center justify-center gap-2 rounded-full bg-[#0B2447] py-3.5 text-sm font-medium text-white transition-colors hover:bg-[#123259] disabled:opacity-60">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading ? 'Entrando...' : 'Entrar'}
        {!loading && <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />}
      </button>
    </form>
  )
}
