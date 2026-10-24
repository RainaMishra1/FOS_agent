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
          bg: "#F5F2EB",
          sidebar: "#F4EFE6",
          "sidebar-hover": "#EDE7DC",
          card: "#FFFFFF",
          text: "#1A201C",
          muted: "#756F66",
          border: "#E6DFD3",
          "border-dark": "#D6CDBC",
          // Deep Forest Green
          olive: "#1E3F35",
          "olive-light": "#275245",
          "olive-subtle": "#EAF2EC",
          // Primary Action Forest Green
          terracotta: "#1E3F35",
          "terracotta-light": "#275245",
          "terracotta-subtle": "#EAF2EC",
          sand: "#EFEBE2",
          amber: "#9E6924",
          "amber-subtle": "#F8EFE2",
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
