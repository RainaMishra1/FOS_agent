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
        // SK-inspired palette: deep indigo brand, bright green actions, black accents.
        sk: {
          indigo: "#393185",
          "indigo-dark": "#2C2668",
          "indigo-light": "#4B42A3",
          "indigo-50": "#F1F0F8",
          "indigo-100": "#E3E1F2",
          green: "#00843E",
          "green-dark": "#006F34",
          "green-50": "#E6F4EC",
          ink: "#0B0A12",
        },
        // Legacy token names, now mapped to the new palette.
        beige: {
          bg: "#F5F5FA",
          sidebar: "#FFFFFF",
          "sidebar-hover": "#F1F0F8",
          card: "#FFFFFF",
          text: "#16151F",
          muted: "#62607A",
          border: "#E3E2EE",
          "border-dark": "#CFCDE2",
          olive: "#393185",
          "olive-light": "#4B42A3",
          "olive-subtle": "#F1F0F8",
          terracotta: "#00843E",
          "terracotta-light": "#006F34",
          "terracotta-subtle": "#E6F4EC",
          sand: "#F1F0F8",
          amber: "#B7791F",
          "amber-subtle": "#FDF3E1",
        },
        brand: {
          50: "#F1F0F8",
          100: "#E3E1F2",
          500: "#393185",
          600: "#2C2668",
          700: "#241F57",
          900: "#151236",
        },
      },
      keyframes: {
        rise: { "0%": { opacity: "0", transform: "translateY(10px)" }, "100%": { opacity: "1", transform: "none" } },
        floaty: { "0%,100%": { transform: "translate(0,0)" }, "50%": { transform: "translate(12px,-10px)" } },
      },
      animation: {
        // "backwards": no transform is left on the element afterwards, so pop-ups inside it can cover the whole screen.
        rise: "rise .45s cubic-bezier(.2,.7,.2,1) backwards",
        floaty: "floaty 9s ease-in-out infinite",
      },
    },
  },

  plugins: [],
};

export default config;
