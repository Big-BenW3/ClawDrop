"use client";

import { useEffect, useRef } from "react";

const cache = new Map<string, Promise<ArrayBuffer>>();
const loadData = (name: string) => {
  if (!cache.has(name)) cache.set(name, fetch(`/lottie/${name}.lottie`).then((r) => { if (!r.ok) throw new Error(`lottie ${name}: ${r.status}`); return r.arrayBuffer(); }));
  return cache.get(name)!;
};

export type LottieName = "monstersCute" | "monstersFunny" | "joystick" | "gift1";

/** Plays one of the four .lottie files in /public/lottie. The player and its WASM are self-hosted. */
export function Lottie({ name, className = "w-full h-full block", style }: { name: LottieName; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let player: { destroy(): void } | null = null;
    let cancelled = false;
    // Fetch the animation ourselves and only build the player once it is in hand: destroying a
    // player mid-fetch makes the library log an AbortError.
    Promise.all([import("@lottiefiles/dotlottie-web"), loadData(name)]).then(([{ DotLottie }, data]) => {
      if (cancelled || !canvas.isConnected) return;
      DotLottie.setWasmUrl("/dotlottie-player.wasm");
      const r = canvas.getBoundingClientRect();
      const d = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(64, Math.round((r.width || 160) * d));
      canvas.height = Math.max(64, Math.round((r.height || 160) * d));
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      try {
        player = new DotLottie({ canvas, data: data.slice(0), autoplay: !reduced, loop: true });
      } catch (e) {
        console.warn("lottie", e);
      }
    }).catch((e) => console.warn("lottie", e));
    return () => { cancelled = true; player?.destroy(); };
  }, [name]);

  return <canvas ref={ref} className={className} style={style} aria-hidden="true" />;
}
