import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'

export default async function SemAcessoPage() {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) redirect('/auth/login')

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-6">
      <div className="max-w-sm text-center">
        <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto mb-4" />
        <h1 className="text-lg font-bold text-gray-900">Sem acesso ao Financeiro ainda</h1>
        <p className="text-sm text-gray-500 mt-2">
          Seu usuário do Luknos está ativo, mas ainda não foi liberado no Luknos Financeiro.
          Fale com a gestora pra ser adicionado.
        </p>
        <a href="/dashboard" className="btn-secondary inline-flex mt-5">Voltar pro Luknos</a>
      </div>
    </div>
  )
}
