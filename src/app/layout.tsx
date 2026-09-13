import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-white text-[#0A1F3B] antialiased">
        <Suspense fallback={null}><NavigationProgress /></Suspense>
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  )
}
