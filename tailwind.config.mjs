/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          purple: '#7C3AED',
          purpleHover: '#6D28D9',
        },
      },
    },
  },
  plugins: [],
};
