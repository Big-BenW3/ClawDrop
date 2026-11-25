"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { initDriver, peekDriver, wantsPractice } from "../game";

/** Renders its children once the game driver exists (practice or chain), with a spinner until then. */
export function DriverGate({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const [ready, setReady] = useState(() => !!peekDriver());
  useEffect(() => {
    if (ready) return;
    let off = false;
    initDriver(wantsPractice(`?${params.toString()}`)).then(() => { if (!off) setReady(true); });
    return () => { off = true; };
  }, [params, ready]);
  if (ready) return <>{children}</>;
  return (
    <div role="status" className="fixed inset-0 bg-base flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-4 border-accent border-t-transparent animate-spin" aria-label="Loading" />
    </div>
  );
}
