import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Cor de destaque do redesign "Viver de IA" (mesmos valores de
        // design_tokens.color.accent.gold/navy no Supabase — mantidos como
        // hex estático aqui porque os modificadores de opacidade do
        // Tailwind, ex. `brand-500/20`, exigem uma cor real e não um var()
        // apontando pra uma string hex).
        brand: {
          50:  '#f9f4ea',
          100: '#f0e4c9',
          200: '#e3cd9c',
          500: '#cba455',
          600: '#b8934a',
          700: '#96742f',
          900: '#0a1f3b',
        },
        navy: {
          DEFAULT: '#0a1f3b',
          muted: '#4f596b',
        },
        // Base clara real do Viver de IA (branco, não creme) — extraída por
        // inspeção do app.viverdeia.ai, não suposição.
        surface: {
          DEFAULT: '#ffffff',
          secondary: '#f7f8fa',
          border: 'rgba(10, 31, 59, 0.08)',
        },
        'via-bg': 'var(--color-background-base)',
        'via-surface': 'var(--color-background-surface)',
        'via-gold': 'var(--color-accent-gold)',
        'via-gold-hover': 'var(--color-accent-gold-hover)',
        'via-text': 'var(--color-text-primary)',
        'via-text-muted': 'var(--color-text-muted)',
        'via-border': 'var(--color-border-subtle)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        card: '20px',
        pill: '10px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        hero: 'var(--shadow-hero)',
        'via-card': 'var(--shadow-card)',
      },
    },
  },
  plugins: [],
}
export default config
