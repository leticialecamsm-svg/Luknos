import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import localFont from 'next/font/local'
import './globals.css'
import './theme.css'
import { Suspense } from 'react'
import { ToastProvider } from '@/components/ui/Toast'
import { NavigationProgress } from '@/components/ui/NavigationProgress'

export const metadata: Metadata = {
  title: 'Luknos Iluminação',
  description: 'Sistema de gestão de orçamentos e vendas',
  icons: {
    icon: '/logo.svg',
  },
}

// Poppins hospedada no próprio repositório (subconjunto latin). Antes vinha do
// Google Fonts na build, e uma build gerou nomes diferentes entre o HTML e o CSS
// (variável --font-poppins ficou indefinida e o app inteiro caiu em fonte serifada).
const poppins = localFont({
  src: [
    { path: './fonts/Poppins-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Poppins-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/Poppins-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/Poppins-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-poppins',
  display: 'swap',
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable} ${poppins.variable}`}>
      <body className="bg-white text-[#0A1F3B] antialiased">
        <Suspense fallback={null}><NavigationProgress /></Suspense>
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  )
}
