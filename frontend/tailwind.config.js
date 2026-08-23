/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#050509',
        panel: {
          bg: 'rgba(18, 18, 27, 0.6)',
          border: 'rgba(255, 255, 255, 0.08)',
          hover: 'rgba(255, 255, 255, 0.03)',
        },
        accent: {
          primary: '#8b5cf6',
          secondary: '#3b82f6',
        }
      },
      backgroundImage: {
        'main-gradient': 'radial-gradient(circle at top left, #1a1625, #050509 50%)',
        'accent-gradient': 'linear-gradient(135deg, #a78bfa, #60a5fa)'
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
