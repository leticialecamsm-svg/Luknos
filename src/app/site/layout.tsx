import type { Metadata } from 'next'
import { Cormorant_Garamond } from 'next/font/google'

// Fonte display serifada — dá o toque atemporal / alto padrão nos títulos.
const display = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Luknos Iluminação — Iluminação de alto padrão e projeto luminotécnico',
  description:
    'Loja de iluminação premium e projeto luminotécnico sob medida. Curadoria e técnica para revelar o melhor de cada ambiente.',
  openGraph: {
    title: 'Luknos Iluminação',
    description:
      'Iluminação de alto padrão e projeto luminotécnico sob medida.',
    type: 'website',
  },
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${display.variable} bg-ink`}>{children}</div>
}
