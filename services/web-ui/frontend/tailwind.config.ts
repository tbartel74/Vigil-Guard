import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Vigil Guard custom dark surface colors
        // These provide finer granularity between slate-950 and slate-900
        surface: {
          darkest: '#0B0F14', // TopBar, Footer - darkest UI chrome
          darker: '#0C1117',  // Sidebar - secondary navigation
          dark: '#0B121A',    // Cards - elevated content containers
          base: '#0F1419',    // Main content area - primary background
        },
        // Extend slate palette with custom intermediate shades
        slate: {
          850: '#1a202e', // Between 800 (#1e293b) and 900 (#0f172a)
        },
        // WCAG AAA compliant text colors (min 4.5:1 contrast on dark backgrounds)
        text: {
          primary: '#f8fafc',    // slate-50 (główny tekst, kontrast 19.3:1 ✅)
          secondary: '#cbd5e1',  // slate-300 (opisy, pomocnicze, kontrast 7.1:1 ✅)
          tertiary: '#94a3b8',   // slate-400 (nieaktywne, kontrast 4.1:1 - używać ostrożnie)
        },
      },
      spacing: {
        '4.5': '1.125rem', // 18px - for fine-tuned spacing
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.75rem' }], // 10px - for labels/badges
      },
    },
  },
  plugins: [],
} satisfies Config;
