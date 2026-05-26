import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: "#ffb000",
          soft: "#ffd36b"
        },
        ride: "#16c784",
        fade: "#ff5c72",
        signal: "#7aa7ff",
        ember: "#ff914d",
        night: "#070706",
        bone: "#fff8e8",
        tar: "#11100e"
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.25rem"
      },
      boxShadow: {
        arena: "0 28px 70px rgba(0,0,0,.34)",
        paper: "0 24px 60px rgba(81,54,10,.12)",
        glow: "0 18px 42px rgba(255,176,0,.26)"
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"]
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(18px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        toast: {
          "0%": { opacity: "0", transform: "translate(-50%, 14px)" },
          "100%": { opacity: "1", transform: "translate(-50%, 0)" }
        },
        pulseGlow: {
          "0%, 100%": { opacity: ".5", transform: "scale(1)" },
          "50%": { opacity: ".85", transform: "scale(1.04)" }
        }
      },
      animation: {
        rise: "rise .55s cubic-bezier(.2,.8,.18,1) both",
        toast: "toast .25s cubic-bezier(.2,.8,.18,1) both",
        pulseGlow: "pulseGlow 5s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
