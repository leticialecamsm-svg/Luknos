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
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          500: '#185FA5',
          600: '#1a56db',
          700: '#1e429f',
          900: '#1A1A2E',
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
