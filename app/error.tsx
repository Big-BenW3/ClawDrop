"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Error boundary: say what happened and how to recover, never a raw exception string. */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="min-h-screen flex items-center justify-center px-4 arcade-grid">
      <div role="alert" className="max-w-md text-center space-y-5">
        <h1 className="font-display font-bold text-3xl sm:text-4xl text-ink">Something went wrong.</h1>
        <p className="text-muted">The page hit an error and stopped. Your wallet and any prizes are untouched. Try again, or go back to the arcade.</p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={reset} className="spring-btn px-6 py-3 rounded-full bg-accent hover:bg-purple-500 text-white font-display font-semibold text-sm shadow-neon-violet cursor-pointer">Try again</button>
          <Link href="/play" className="spring-btn px-6 py-3 rounded-full bg-panel hover:bg-panelHover border border-white/15 text-ink font-display font-semibold text-sm">Go to the arcade</Link>
        </div>
      </div>
    </main>
  );
}
