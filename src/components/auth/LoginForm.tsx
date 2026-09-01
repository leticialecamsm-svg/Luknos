'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

type Mode = 'password' | 'magic'

export function LoginForm() {
  const router = useRouter()
  const [mode, setMode]         = useState<Mode>('password')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [magicSent, setMagicSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()

    if (mode === 'magic') {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) {
        const isRateLimit = error.status === 429 || /rate limit/i.test(error.message)
        setError(isRateLimit
          ? 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.'
          : 'Não foi possível enviar o link. Confira o email e tente novamente.')
        setLoading(false)
        return
      }
      setMagicSent(true)
      setLoading(false)
      return
    }

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

  if (magicSent) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
          Enviamos um link de acesso para <strong>{email}</strong>. Abra o email neste
          dispositivo para entrar.
        </p>
        <button
          type="button"
          onClick={() => { setMagicSent(false); setMode('password') }}
          className="text-xs text-[#ABABAB] hover:text-[#1A1A2E]"
        >
          Voltar
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Email</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="seu@email.com"
          required
          className="input"
        />
      </div>

      {mode === 'password' && (
        <div>
          <label className="label">Senha</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="input"
          />
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading
          ? (mode === 'magic' ? 'Enviando...' : 'Entrando...')
          : (mode === 'magic' ? 'Enviar link de acesso' : 'Entrar')}
      </button>

      <button
        type="button"
        onClick={() => { setMode(mode === 'password' ? 'magic' : 'password'); setError(null) }}
        className="w-full text-xs text-[#ABABAB] hover:text-[#1A1A2E]"
      >
        {mode === 'password' ? 'Entrar com link mágico' : 'Entrar com email e senha'}
      </button>
    </form>
  )
}
