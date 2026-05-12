import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{ts,tsx,html}',
    './index.html'
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#1a1a2e',
          card: '#16213e',
          input: '#0f3460',
          hover: '#1f4068'
        },
        accent: {
          DEFAULT: '#e94560',
          hover: '#c73652'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      }
    }
  },
  plugins: []
}

export default config
