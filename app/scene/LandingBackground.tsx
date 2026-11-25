"use client";

import { useEffect, useRef } from "react";

/**
 * The hero's light 3D-feel background: a 2D canvas with a perspective grid floor and depth
 * particles. About 1 ms a frame, 30 fps, paused offscreen. Ported from the mockup's bg-lite.js.
 * Absolute-positioned: place it inside a `relative` hero section.
 */
export function LandingBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    const host = cv?.parentElement;
    if (!cv || !host) return;
    const ctx = cv.getContext("2d", { alpha: false });
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0, H = 0, vis = true, mx = 0, my = 0, tmx = 0, tmy = 0, last = 0, raf = 0;
    const N = 70;
    const P = Array.from({ length: N }, () => ({
      x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 1.2, z: Math.random(),
      c: Math.random() < 0.22 ? "245,196,81" : "196,181,253",
    }));
    const size = () => {
      const r = host.getBoundingClientRect();
      W = cv.width = Math.max(2, r.width | 0);
      H = cv.height = Math.max(2, r.height | 0);
    };
    size();
    window.addEventListener("resize", size);
    const io = new IntersectionObserver((e) => { vis = e[0].isIntersecting; }, { threshold: 0 });
    io.observe(host);
    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      tmx = (e.clientX - r.left) / r.width - 0.5;
      tmy = (e.clientY - r.top) / r.height - 0.5;
    };
    host.addEventListener("pointermove", onMove);

    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (!vis || t - last < 33) return;
      last = t;
      mx += (tmx - mx) * 0.06; my += (tmy - my) * 0.06;
      ctx.fillStyle = "#08090D"; ctx.fillRect(0, 0, W, H);
      const hy = H * (0.56 + my * 0.05), cx = W / 2 + mx * 60;
      const g = ctx.createRadialGradient(cx, hy, 0, cx, hy, W * 0.55);
      g.addColorStop(0, "rgba(139,61,240,.30)"); g.addColorStop(0.5, "rgba(139,61,240,.08)"); g.addColorStop(1, "rgba(139,61,240,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.lineWidth = 1;
      const s = reduced ? 0 : t * 0.00035;
      for (let i = -14; i <= 14; i++) {
        const xb = cx + i * W * 0.16 + mx * 40;
        ctx.strokeStyle = `rgba(168,85,247,${0.42 * (1 - Math.abs(i) / 15)})`;
        ctx.beginPath(); ctx.moveTo(cx + i * 14, hy); ctx.lineTo(xb, H); ctx.stroke();
      }
      for (let k = 0; k < 10; k++) {
        const f = (k + ((s * 10) % 1)) / 10, y = hy + (H - hy) * f * f;
        ctx.strokeStyle = `rgba(168,85,247,${0.1 + 0.34 * f})`;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      for (const p of P) {
        if (!reduced) p.z -= 0.0016;
        if (p.z <= 0.02) { p.z = 1; p.x = (Math.random() - 0.5) * 2; p.y = (Math.random() - 0.5) * 1.2; }
        const k = 1 / (p.z * 1.4 + 0.15);
        const x = cx + (p.x * W * 0.5 + mx * 90 * (1 - p.z)) * k * 0.55;
        const y = hy - H * 0.08 + (p.y * H * 0.45 + my * 60 * (1 - p.z)) * k * 0.55;
        const r = Math.max(0.6, 3.4 * (1 - p.z)), a = Math.min(1, (1 - p.z) * 1.1);
        ctx.fillStyle = `rgba(${p.c},${a * 0.85})`; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
      }
      const f2 = ctx.createLinearGradient(0, H * 0.75, 0, H);
      f2.addColorStop(0, "rgba(8,9,13,0)"); f2.addColorStop(1, "rgba(8,9,13,1)");
      ctx.fillStyle = f2; ctx.fillRect(0, H * 0.75, W, H * 0.25);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
      host.removeEventListener("pointermove", onMove);
      io.disconnect();
    };
  }, []);

  return <canvas ref={ref} id="bg-space" aria-hidden="true" />;
}
