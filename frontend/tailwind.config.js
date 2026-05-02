/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        urdu: ["Noto Nastaliq Urdu", "serif"],
      },
      colors: {
        brand: {
          50:  "#eefbf3",
          100: "#d6f5e3",
          200: "#b0eacc",
          300: "#7dd8b0",
          400: "#48bf8e",
          500: "#25a574",
          600: "#18865e",
          700: "#156b4d",
          800: "#14553f",
          900: "#124635",
          950: "#08271e",
        },
        danger: {
          400: "#f87171",
          500: "#ef4444",
          600: "#dc2626",
        },
        warning: {
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
        },
        surface: {
          900: "#0a0f14",
          800: "#111823",
          700: "#1a2535",
          600: "#243047",
        },
      },
      animation: {
        "fade-in":      "fadeIn 0.4s ease-out",
        "slide-up":     "slideUp 0.4s ease-out",
        "pulse-slow":   "pulse 3s ease-in-out infinite",
        "spin-slow":    "spin 3s linear infinite",
        "shimmer":      "shimmer 1.5s infinite",
      },
      keyframes: {
        fadeIn:  { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp: { from: { opacity: "0", transform: "translateY(16px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        shimmer: { from: { backgroundPosition: "-200% 0" }, to: { backgroundPosition: "200% 0" } },
      },
      backdropBlur: { xs: "2px" },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
    },
  },
  plugins: [],
};
