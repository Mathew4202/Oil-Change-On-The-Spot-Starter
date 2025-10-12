import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1e3a8a",
          light: "#3b82f6",
          accent: "#60a5fa",
          dark: "#0f172a"
        }
      }
    },
  },
  plugins: [],
}
export default config
