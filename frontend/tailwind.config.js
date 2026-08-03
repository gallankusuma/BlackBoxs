import colors from 'tailwindcss/colors';

export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        blue: colors.slate,
        indigo: colors.amber,
        primary: colors.slate,
        slate: {
          850: '#1e293b', // Custom dark for sidebars
        },
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'Manrope', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 2px 4px rgba(0,0,0,0.02), 0 1px 6px rgba(0,0,0,0.03)',
        'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.025)',
      }
    },
  },
  plugins: [],
}
