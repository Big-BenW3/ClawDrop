import Link from "next/link";
import { ClawMark } from "./ui/Logo";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 arcade-grid">
      <div className="max-w-md text-center space-y-5">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-accent/15 border border-accent/40 flex items-center justify-center"><ClawMark className="w-8 h-8" sw={2} /></div>
        <h1 className="font-display font-bold text-3xl sm:text-4xl text-ink">That page isn&apos;t here.</h1>
        <p className="text-muted">The link may be old or mistyped. The arcade is still open.</p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/play" className="spring-btn px-6 py-3 rounded-full bg-accent hover:bg-purple-500 text-white font-display font-semibold text-sm shadow-neon-violet">Go to the arcade</Link>
          <Link href="/" className="spring-btn px-6 py-3 rounded-full bg-panel hover:bg-panelHover border border-white/15 text-ink font-display font-semibold text-sm">Home</Link>
        </div>
      </div>
    </main>
  );
}
