import { LoginForm } from '@/components/auth/LoginForm'
import Image from 'next/image'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Grid layout: 2 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 min-h-screen">

        {/* Coluna Esquerda: Formulário */}
        <div className="flex flex-col p-4 lg:p-8">
          {/* Logo pequena */}
          <div className="mb-12">
            <svg className="w-32 h-auto" viewBox="0 0 722 218" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0 119.909C19.7295 121.966 42.4118 126.746 55.9324 137.742C69.3309 147.791 79.2522 168.175 86.4781 183.022C91.3862 193.106 95.0507 200.635 97.7168 200.635C101.259 200.635 102.414 196.49 104.278 189.802C106.904 180.378 110.938 165.905 125.037 150.866C140.037 135.653 152.09 128.728 153.965 128.371C151.62 120.845 144.319 123.974 144.319 123.974C144.319 123.974 140.669 125.017 137.09 127.296C134.835 128.732 132.814 129.978 130.922 131.146C121.278 137.095 114.958 140.994 97.7168 157.563C97.0372 154.613 97.3339 151.368 97.6406 148.013C99.0937 132.12 100.772 113.759 0 112.657V119.909Z" fill="#001A3C"/>
              <path d="M200.115 111.771C183.762 109.145 165.563 103.53 152.626 91.8863C140.825 83.0352 129.202 65.4518 119.472 50.732C110.652 37.3887 103.388 26.3984 98.955 26.3984C93.7376 26.398 92.2749 31.6405 90.0089 39.762C87.2639 49.6004 83.34 63.6637 70.1346 77.7494C55.1351 92.9632 48.7062 95.9629 45.7599 97.3019C45.7599 97.3019 58.8671 98.6461 62.3497 97.3019C74.2881 92.6939 82.9049 82.6265 90.5988 73.6374C92.5618 71.3439 94.4648 69.1206 96.3475 67.0761L98.9537 74.6918C99.3425 76.3791 99.5955 78.0863 99.8497 79.8013C102.087 94.8942 104.413 110.588 200.115 118.665V111.771Z" fill="#CBA455"/>
            </svg>
          </div>

          {/* Conteúdo do formulário */}
          <div className="flex-1 flex flex-col justify-center max-w-md">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Bem vindo de volta!</h1>
              <p className="text-gray-500 text-sm">Entre com seu email e senha.</p>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <LoginForm />
            </div>
          </div>

          {/* Footer */}
          <p className="text-xs text-gray-400 text-center mt-8">Todos os direitos reservados para Luknos</p>
        </div>

        {/* Coluna Direita: Banner (oculto em mobile) */}
        <div className="hidden lg:flex items-center justify-center bg-gradient-to-br from-[#001A3C] to-[#0a2a5c] relative overflow-hidden">
          {/* Padrão decorativo de fundo */}
          <div className="absolute inset-0 opacity-10">
            <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 1000 1000">
              <defs>
                <pattern id="wave" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
                  <path d="M0,50 Q25,25 50,50 T100,50" stroke="white" fill="none" strokeWidth="2"/>
                </pattern>
              </defs>
              <rect width="1000" height="1000" fill="url(#wave)"/>
            </svg>
          </div>

          {/* Conteúdo do banner */}
          <div className="relative z-10 text-center px-8 max-w-sm">
            <h2 className="text-5xl font-bold text-white mb-4">
              Façam <span className="text-[#CBA455]">aos outros</span>
            </h2>
            <p className="text-xl text-blue-100 italic mb-8">
              aquilo que vocês querem que eles façam a vocês.
            </p>
            <p className="text-sm text-blue-300 font-light">
              Mateus 7:12
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
