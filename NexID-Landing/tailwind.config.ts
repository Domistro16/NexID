import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        nexid: {
          base: "#030303",
          surface: "#0a0a0a",
          border: "#1a1a1a",
          hover: "#111111",
          gold: "#ffb000",
          text: "#f5f5f5",
          muted: "#8a8a8a",
          success: "#22c55e",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        gilroy: ["Gilroy-Regular", "sans-serif"],
        bold: ["Gilroy-Bold", "sans-serif"],
        semibold: ["Gilroy-Medium", "sans-serif"],
        light: ["Gilroy-Light", "sans-serif"],
        extrabold: ["Gilroy-Heavy", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Satoshi", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        premium: "0 20px 40px -10px rgba(0,0,0,1), 0 0 0 1px rgba(255,255,255,0.05)",
        "gold-glow": "0 0 30px -5px rgba(255,176,0,0.3)",
        "gold-glow-lg": "0 0 60px -10px rgba(255,176,0,0.4)",
        "inner-glaze": "inset 0 1px 1px rgba(255,255,255,0.05)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px) rotate(-1deg)" },
          "50%": { transform: "translateY(-18px) rotate(1deg)" },
        },
        "pulse-glow": {
          from: {
            boxShadow: "0 0 18px hsla(var(--primary), 0.6)",
            transform: "scale(1)",
          },
          to: {
            boxShadow:
              "0 0 30px hsla(var(--primary), 1), 0 0 40px hsla(var(--primary), 0.6)",
            transform: "scale(1.02)",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        float: "float 7s ease-in-out infinite",
        "pulse-glow": "pulse-glow 3s ease-in-out infinite alternate",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
