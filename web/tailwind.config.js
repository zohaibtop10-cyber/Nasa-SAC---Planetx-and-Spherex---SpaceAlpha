/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#050506',
        surface: '#111113',
        hairline: '#26262A',
        accent: '#FF6B3D',
      },
    },
  },
  plugins: [],
}
