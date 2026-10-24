import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
      colors: {
        beige: {
          bg: "#F7F5F0",
          sidebar: "#ECE7DD",
          "sidebar-hover": "#E2DCCE",
          card: "#FFFFFF",
          text: "#1F241F",
          muted: "#666C64",
          border: "#E3DCD0",
          "border-dark": "#D2C9BB",
          // Deep Forest Green
          olive: "#1B4332",
          "olive-light": "#245842",
          "olive-subtle": "#E2F0E8",
          // Primary Action Emerald Green
          terracotta: "#2D6A4F",
          "terracotta-light": "#255841",
          "terracotta-subtle": "#E9F5EF",
          sand: "#EFE9DD",
          amber: "#3E6B48",
          "amber-subtle": "#EDF4EE",
        },
        brand: {
          50: "#eef7f2",
          100: "#d8f0e2",
          500: "#2D6A4F",
          600: "#245842",
          700: "#1B4332",
          900: "#0D251A",
        },
        // Re-map built-in amber & orange to pure greens and soft beiges
        amber: {
          50: "#F5F8F5",
          100: "#E6ECE5",
          200: "#D0DCD0",
          300: "#B0C4AF",
          400: "#7A9E78",
          500: "#2D6A4F",
          600: "#245842",
          700: "#1B4332",
          800: "#142E22",
          900: "#0E1E17",
          950: "#07120E",
        },
        orange: {
          50: "#F5F8F5",
          100: "#E6ECE5",
          200: "#D0DCD0",
          300: "#B0C4AF",
          400: "#7A9E78",
          500: "#2D6A4F",
          600: "#245842",
          700: "#1B4332",
          800: "#142E22",
          900: "#0E1E17",
          950: "#07120E",
        },
      },
    },
  },

  plugins: [],
};

export default config;
