import Link from "next/link";
import { ClawMark, Wordmark } from "../ui/Logo";

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 w-full px-4 sm:px-8 py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3 rounded-full glass-panel">
        <a href="#hero" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-2xl bg-accent/20 border border-accent/40 flex items-center justify-center shadow-neon-violet group-hover:scale-105 transition-transform">
            <ClawMark />
          </div>
          <Wordmark className="text-xl" />
        </a>
        <div className="flex items-center gap-4 sm:gap-7">
          <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-muted">
            <a href="#how-it-works" className="hover:text-ink transition-colors">How it works</a>
            <a href="#prizes" className="hover:text-ink transition-colors">Prizes</a>
            <Link href="/fairness" className="hover:text-ink transition-colors">Fairness</Link>
          </nav>
          <Link href="/play" className="spring-btn px-5 py-2 rounded-full bg-accent hover:bg-purple-500 text-white font-display font-semibold text-sm shadow-neon-violet cursor-pointer">
            Play
          </Link>
        </div>
      </div>
    </header>
  );
}
