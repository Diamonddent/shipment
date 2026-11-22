/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        navy: { 950: '#071629', 900: '#0B1F3A', 800: '#132B4D', 700: '#1C3A63' },
        primary: { DEFAULT: '#1E3A8A', 50: '#EEF2FF', 100: '#DBE4FF', 600: '#1E40AF', 700: '#1E3A8A' },
        accent: { DEFAULT: '#2563EB', 50: '#EFF6FF', 100: '#DBEAFE', 500: '#3B82F6', 600: '#2563EB' },
        surface: { DEFAULT: '#F5F7FA' },
        line: { DEFAULT: '#E5E9F0' },
      },
      borderRadius: { xl: '12px' },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)',
        pop: '0 10px 30px -10px rgba(11,31,58,0.25)',
      },
      keyframes: {
        fadein: { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: { fadein: 'fadein .18s ease-out' },
    },
  },
  plugins: [],
};
