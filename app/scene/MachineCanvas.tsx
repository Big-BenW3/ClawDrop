"use client";

import { useEffect, useRef } from "react";
import { getDriver } from "../game";
import { useGameStore } from "../game/gameStore";
import { loadEngine } from "./loadEngine";

/**
 * Mounts the three.js claw machine. This is the whole integration (handoff §0.1): create the
 * engine in an effect, run its frame loop, dispose it on unmount. The engine reads the game store
 * and nothing else; the only things pushed into it are the two scene commands the store carries
 * (play the drop animation, return to the attract loop).
 */
export function MachineCanvas({ variant, className = "" }: { variant: "arcade" | "hero"; className?: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    // Diagnostic: ?nogl=1 skips the 3D scene, so the game logic can be tested where WebGL is slow.
    if (new URLSearchParams(location.search).get("nogl") === "1") return;
    let cancelled = false;
    let raf = 0;
    let engine: InstanceType<Awaited<ReturnType<typeof loadEngine>>["ClawMachine3D"]> | null = null;
    let visible = true;
    const unsubs: Array<() => void> = [];

    const io = new IntersectionObserver((e) => { visible = e[0]?.isIntersecting ?? true; });
    io.observe(el);
    const ro = new ResizeObserver(() => engine?.resize());
    ro.observe(el);

    loadEngine().then(({ ClawMachine3D }) => {
      if (cancelled) return;
      engine = new ClawMachine3D(el, { isArcade: variant === "arcade" });

      if (variant === "arcade") {
        let lastDrop = useGameStore.getState().dropRequest?.id ?? 0;
        let lastReset = useGameStore.getState().resetRequest;
        unsubs.push(
          useGameStore.subscribe((s) => {
            if (s.dropRequest && s.dropRequest.id !== lastDrop) {
              lastDrop = s.dropRequest.id;
              engine?.triggerDropAnimation(s.dropRequest.won, () => getDriver().onDropAnimationEnd(), s.dropRequest.slot);
            }
            if (s.resetRequest !== lastReset) {
              lastReset = s.resetRequest;
              engine?.resetToAttract();
            }
          }),
        );
      }

      let last = performance.now(), clock = 0;
      const loop = (t: number) => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (t - last) / 1000);
        last = t;
        clock += dt;
        if (visible && !document.hidden) engine?.update(dt, clock);
      };
      raf = requestAnimationFrame(loop);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      unsubs.forEach((u) => u());
      io.disconnect();
      ro.disconnect();
      engine?.dispose();
    };
  }, [variant]);

  return <div ref={host} className={`cursor-grab active:cursor-grabbing ${className}`} />;
}
