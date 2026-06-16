import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Amplifica Wealth — Brand Board (Resonance v1.0)
        ink: "#221338", // Deep Plum — primary text, headers, sidebar
        sub: "#8D8295", // Stone Mauve — secondary text, captions, dividers
        plum: "#221338", // Deep Plum
        purple: "#6C4BD3", // Royal Purple — CTAs, links, emphasis
        amethyst: "#A88BE8", // Highlights, chart accents
        aqua: "#3EC9C0", // Aquamarine — live numbers, positive deltas
        cream: "#F6F1EA", // Warm Cream — page backgrounds
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
