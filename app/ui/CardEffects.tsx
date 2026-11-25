"use client";

import { useEffect } from "react";

/**
 * The mockup's pointer effects, as one document-level listener: a spotlight that follows the
 * cursor inside `.spot` cards, and a gentle 3D tilt on `.tilt` cards and the how-it-works stage.
 * It only sets CSS variables and `style.transform` on elements React does not give a style prop.
 */
export function CardEffects() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const move = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.(".spot") as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
      if (el.classList.contains("tilt") || el.id === "how-stage-card") {
        const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        const k = el.id === "how-stage-card" ? 6 : 10;
        el.style.transform = `perspective(900px) rotateY(${px * k}deg) rotateX(${-py * k}deg) translateY(-2px)`;
      }
    };
    const out = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.(".tilt, #how-stage-card") as HTMLElement | null;
      if (el && !el.contains(e.relatedTarget as Node | null)) el.style.transform = "";
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerout", out);
    return () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerout", out); };
  }, []);
  return null;
}
