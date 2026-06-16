import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Amplifica Wealth — Brand Board (Resonance v1.0)
        // Theme-aware tokens (flip in dark mode via CSS variables in globals.css):
        ink: "rgb(var(--ink) / <alpha-value>)", // primary text
        sub: "rgb(var(--sub) / <alpha-value>)", // secondary text, captions
        cream: "rgb(var(--cream) / <alpha-value>)", // page background
        card: "rgb(var(--card) / <alpha-value>)", // card / surface background
        edge: "rgb(var(--edge) / <alpha-value>)", // borders, dividers, subtle fills
        // Fixed brand colors (identical in both themes):
        plum: "#221338", // Deep Plum — sidebar
        purple: "#6C4BD3", // Royal Purple — CTAs, links, emphasis
        amethyst: "#A88BE8", // Highlights, chart accents
        aqua: "#3EC9C0", // Aquamarine — live numbers, positive deltas
        mauve: "#8D8295", // Stone Mauve
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
