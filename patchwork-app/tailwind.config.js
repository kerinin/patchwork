/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: '#FAFAF8',
          dark: '#F5F5F3',
        },
        ink: {
          DEFAULT: '#1A1A1A',
          light: '#4A4A4A',
        },
        accent: '#8B7355',
        highlight: '#FFF9C4',
      },
      fontFamily: {
        document: ['Libre Baskerville', 'serif'],
        ui: ['Inter', 'sans-serif'],
        typewriter: ['Courier Prime', 'Courier', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
        stack: '0 4px 6px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.04)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
