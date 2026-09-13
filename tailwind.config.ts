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
        // design_tokens.color.accent.gold / color.background.base no
        // Supabase — mantidos como hex estático aqui porque os modificadores
        // de opacidade do Tailwind, ex. `brand-500/20`, exigem uma cor real
        // e não um var() apontando pra uma string hex).
        brand: {
          50:  '#f9f4ea',
          100: '#f0e4c9',
          200: '#e3cd9c',
          500: '#cba455',
          600: '#b8934a',
          700: '#96742f',
          900: '#111827',
        },
        surface: {
          DEFAULT: '#F8F7F4',
          secondary: '#F0EEE8',
          border: '#E5E3DC',
        },
        // Tokens do redesign "Viver de IA" (design_tokens no Supabase).
        // Namespace `via-*` isolado da paleta legada acima — usado só pelo
        // shell/loader na Fase 1; os módulos migram tela a tela na Fase 2.
        'via-bg': 'var(--color-background-base)',
        'via-surface': 'var(--color-background-surface)',
        'via-gold': 'var(--color-accent-gold)',
        'via-gold-hover': 'var(--color-accent-gold-hover)',
        'via-text': 'var(--color-text-primary)',
        'via-text-muted': 'var(--color-text-muted)',
        'via-border': 'var(--color-border-subtle)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'via-card': 'var(--shadow-card)',
      },
    },
  },
  plugins: [],
}
export default config
