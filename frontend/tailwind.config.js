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

        // Token semantik — nilainya di :root pada style.css, jadi seluruh
        // tampilan bisa diubah dari satu tempat tanpa menyisir kelas Tailwind.
        accent:       'var(--w-accent)',
        'accent-hov': 'var(--w-accent-hover)',
        'accent-soft':'var(--w-accent-soft)',
        surface:      'var(--w-surface)',
        'surface-muted': 'var(--w-surface-muted)',
        line:         'var(--w-border)',
        'line-strong':'var(--w-border-strong)',
        ink:          'var(--w-text)',
        'ink-muted':  'var(--w-text-muted)',
        'ink-subtle': 'var(--w-text-subtle)',

        success: 'var(--w-success)',
        warning: 'var(--w-warning)',
        danger:  'var(--w-danger)',
      },
      fontFamily: {
        // `Inter` dulu ditulis di sini tapi fontnya tidak pernah dimuat.
        sans:    ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Source Serif 4 Variable', 'Source Serif 4', 'Georgia', 'serif'],
      },
      borderRadius: {
        // Sudut lebih tegas. Rounded-xl di mana-mana adalah salah satu penanda
        // template generik.
        DEFAULT: '6px',
        md: '6px',
        lg: '10px',
      },
      boxShadow: {
        'card': '0 2px 4px rgba(0,0,0,0.02), 0 1px 6px rgba(0,0,0,0.03)',
        'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.025)',
      }
    },
  },
  plugins: [],
}
