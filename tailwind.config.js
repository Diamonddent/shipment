/** @type {import('tailwindcss').Config} */
// Liquid Glass theme. The navy / line / surface tokens resolve to CSS variables
// (see src/index.css) so existing `dark:bg-navy-800`, `border-line` … classes
// automatically become translucent glass tints in both themes.
const tint = (v) => `rgb(var(${v}) / calc(var(${v}-a) * <alpha-value>))`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Geist', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'], mono: ['"Geist Mono"', 'ui-monospace', 'monospace'] },
      colors: {
        navy: { 950: tint('--navy-950'), 900: tint('--navy-900'), 800: tint('--navy-800'), 700: tint('--navy-700'), 600: tint('--navy-600') },
        ink: { DEFAULT: '#0b1b3a', 2: '#13284f' },
        primary: { DEFAULT: '#1E3A8A', 50: '#EEF2FF', 100: '#DBE4FF', 600: '#1E40AF', 700: '#1E3A8A' },
        accent: { DEFAULT: '#2563EB', 50: '#EFF6FF', 100: '#DBEAFE', 500: '#3B82F6', 600: '#2563EB' },
        surface: { DEFAULT: tint('--surface') },
        line: { DEFAULT: tint('--line') },
      },
      borderRadius: { xl: '14px', '2xl': '20px', '3xl': '24px' },
      boxShadow: {
        card: 'var(--glass-shadow)',
        pop: 'var(--glass-shadow-pop)',
      },
      keyframes: {
        fadein: { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        rise: { from: { opacity: '0', transform: 'translateY(18px)' }, to: { opacity: '1', transform: 'none' } },
        pop: { from: { opacity: '0', transform: 'scale(.96)' }, to: { opacity: '1', transform: 'none' } },
        sheet: { from: { opacity: '0', transform: 'translateY(40px)' }, to: { opacity: '1', transform: 'none' } },
        fade: { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        fadein: 'fadein .22s cubic-bezier(.2,.8,.2,1) both',
        rise: 'rise .7s cubic-bezier(.2,.8,.2,1) both',
        pop: 'pop .28s cubic-bezier(.2,.8,.2,1) both',
        sheet: 'sheet .32s cubic-bezier(.2,.8,.2,1) both',
        fade: 'fade .25s ease-out both',
      },
    },
  },
  plugins: [],
};
