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
