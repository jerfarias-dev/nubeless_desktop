import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{ts,tsx,html}',
    './index.html'
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: 'var(--bg-primary)',
          card: 'var(--bg-card)',
          input: 'var(--bg-input)',
          hover: 'var(--bg-hover)',
          subtle: 'var(--bg-subtle)',
          sidebar: 'var(--bg-sidebar)',
        },
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        muted: 'var(--text-muted)',
        'on-accent': 'var(--text-on-accent)',
        border: {
          DEFAULT: 'var(--border)',
        },
        overlay: 'var(--overlay)',
        inactive: 'var(--inactive)',
        accent: {
          DEFAULT: '#e94560',
          hover: '#c73652',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      transitionProperty: {
        'theme': 'background-color, border-color, color, fill, stroke',
      },
    }
  },
  plugins: []
}

export default config
