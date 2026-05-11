import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#2563eb",
          dark:    "#1d4ed8",
          light:   "#eff6ff",
        },
      },
    },
  },
  plugins: [],
};

export default config;
