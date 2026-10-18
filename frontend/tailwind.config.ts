import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        beige: {
          bg: "#F5F1E8",
          sidebar: "#EAE1D2",
          "sidebar-hover": "#DFD5C4",
          card: "#FFFEFA",
          text: "#302D28",
          muted: "#777064",
          border: "#E4DCCF",
          "border-dark": "#D5CABE",
          olive: "#687653",
          "olive-light": "#7D8C65",
          "olive-subtle": "#E9EFE2",
          terracotta: "#B76E52",
          "terracotta-light": "#C87F63",
          "terracotta-subtle": "#F7EDE8",
          sand: "#EDE5D8",
          amber: "#C48A3F",
          "amber-subtle": "#FAF1E3",
        },
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          900: "#312e81",
        },
      },
    },
  },

  plugins: [],
};

export default config;
