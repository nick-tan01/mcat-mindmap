import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        app: {
          bg: '#0f0f13',
          panel: '#1a1a24',
          border: '#2a2a38',
          text: '#e8e8f0',
          secondary: '#8888a8',
          accent: '#6366f1',
          danger: '#ef4444',
          success: '#10b981',
        },
      },
    },
  },
  plugins: [],
};

export default config;
