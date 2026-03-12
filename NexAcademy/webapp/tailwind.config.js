/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
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
          danger: "#ef4444",
          alert: "#f97316",
          rank1: "#FFD700",
          rank2: "#C0C0C0",
          rank3: "#CD7F32",
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
        sans: ["Inter", "sans-serif"],
        display: ["Satoshi", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
        gilroy: ["Gilroy-Regular", "sans-serif"],
        bold: ["Gilroy-Bold", "sans-serif"],
        semibold: ["Gilroy-Medium", "sans-serif"],
        light: ["Gilroy-Light", "sans-serif"],
        extrabold: ["Gilroy-Heavy", "sans-serif"],
      },
      boxShadow: {
        premium: "0 20px 40px -10px rgba(0,0,0,0.8), 0 1px 3px rgba(0,0,0,0.5)",
        "gold-glow": "0 0 30px -5px rgba(255,176,0,0.2)",
        "gold-glow-lg": "0 0 60px -10px rgba(255,176,0,0.35)",
        "success-glow": "0 0 40px -5px rgba(34,197,94,0.3)",
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
};
