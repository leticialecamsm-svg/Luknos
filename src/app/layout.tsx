import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ToastProvider } from '@/components/ui/Toast'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Luknos Iluminação',
  description: 'Sistema de gestão de orçamentos e vendas',
  icons: {
    icon: '/logo.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.className} bg-surface text-gray-900 antialiased`}>
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  )
}
