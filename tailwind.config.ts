import type { Config } from "tailwindcss";
import { colors, fontFamily, boxShadow } from "./app/theme/tokens";

// Ported from the mockup's inline `tailwind.config`. The values live in app/theme/tokens.ts.
// NOTE: the colour named `base` makes `text-base` ambiguous between font-size and colour, so every
// place that means font size is written `text-[1rem]`. Keep that convention.
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}"],
  theme: { extend: { colors: { ...colors }, fontFamily: { ...fontFamily }, boxShadow: { ...boxShadow } } },
  plugins: [],
};
export default config;
