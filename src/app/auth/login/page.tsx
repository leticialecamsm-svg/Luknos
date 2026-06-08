import { LoginForm } from '@/components/auth/LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-900 mb-4">
            <span className="text-white font-bold text-lg">L</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Luknos Iluminação</h1>
          <p className="text-sm text-gray-500 mt-1">Faça login para continuar</p>
        </div>

        <div className="card p-6">
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
