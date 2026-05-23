import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f1115",
        sub: "#6a6a72",
      },
    },
  },
  plugins: [],
} satisfies Config;
