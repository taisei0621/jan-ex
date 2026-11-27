import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        mahjong: {
          green: "#0a4324",
          mat: "#135c36",
          dark: "#0b1a13",
          gold: "#f59e0b",
          goldLight: "#fef3c7",
          crimson: "#e11d48",
          glass: "rgba(255, 255, 255, 0.25)"
        }
      },
      boxShadow: {
        'tile': '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
        'tile-selected': '0 0 15px 3px rgba(245, 158, 11, 0.8), 0 4px 6px -1px rgba(0, 0, 0, 0.3)',
        'glass-tile': '0 8px 32px 0 rgba(31, 38, 135, 0.37), inset 0 0 12px rgba(255, 255, 255, 0.4)',
      }
    },
  },
  plugins: [],
} satisfies Config;