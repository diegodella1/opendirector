import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
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
