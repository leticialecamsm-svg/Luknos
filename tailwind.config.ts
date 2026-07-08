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
        // Identidade premium da marca (usada na landing pública /site)
        ink: {
          DEFAULT: '#001A3C',   // navy profundo do logo
          800: '#04244f',
          700: '#0a2f63',
        },
        champagne: {
          DEFAULT: '#CBA455',   // dourado/champagne do logo
          light: '#E4C983',
          dark: '#A9863C',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'reveal-up': {
          '0%':   { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slow-zoom': {
          '0%':   { transform: 'scale(1)' },
          '100%': { transform: 'scale(1.08)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'reveal-up': 'reveal-up 0.7s cubic-bezier(0.16,1,0.3,1) both',
        'slow-zoom': 'slow-zoom 18s ease-out both',
        shimmer: 'shimmer 3.5s linear infinite',
      },
    },
  },
  plugins: [],
}
export default config
