import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Gem, Joystick, RotateCcw, Sparkles, X } from "lucide-react";

const icons = { sparkles: Sparkles, gem: Gem, check: Check, "arrow-right": ArrowRight, x: X, "arrow-up-right": ArrowUpRight, "arrow-left": ArrowLeft, joystick: Joystick, "rotate-ccw": RotateCcw };
export type IconName = keyof typeof icons;

/** Lucide icons, sized like the mockup's inlined SVGs (1.05em, baseline-aligned). No emoji anywhere. */
export function Icon({ name, sw = 2.25, className = "" }: { name: IconName; sw?: number; className?: string }) {
  const C = icons[name];
  return <C strokeWidth={sw} aria-hidden="true" className={`inline-block shrink-0 w-[1.05em] h-[1.05em] align-[-0.16em] ${className}`} />;
}
