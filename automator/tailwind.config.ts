import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'od-bg': '#1a1a2e',
        'od-bg-dark': '#0d0d0d',
        'od-surface': '#16213e',
        'od-surface-light': '#1f3460',
        'od-text': '#e0e0e0',
        'od-text-dim': '#8888aa',
        'od-accent': '#4a9eff',
        'od-tally-pgm': '#ff3333',
        'od-tally-pvw': '#33ff33',
        'od-warning': '#ffaa00',
      },
    },
  },
  plugins: [],
};
export default config;
