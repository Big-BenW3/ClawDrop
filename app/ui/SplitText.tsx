"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Word-by-word blur-in for headings (the mockup's "BlurText" effect). `parts` are rendered in
 * order and may carry a className (e.g. the accent colour); `<br/>` is a part with `br: true`.
 * Words animate when the heading scrolls into view, or after `delay` ms with `immediate`.
 */
export type SplitPart = { text: string; className?: string; br?: boolean };

export function SplitText({ parts, as: Tag = "h2", className = "", immediate = false, delay = 0 }: { parts: SplitPart[]; as?: "h1" | "h2"; className?: string; immediate?: boolean; delay?: number }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [go, setGo] = useState(immediate);
  useEffect(() => {
    if (immediate) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { setGo(true); io.disconnect(); } }), { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [immediate]);

  let i = 0;
  const nodes: ReactNode[] = [];
  parts.forEach((p, pi) => {
    if (p.br) { nodes.push(<br key={`br${pi}`} />); return; }
    const words = p.text.split(/\s+/).filter(Boolean);
    const inner = words.map((w, wi) => (
      <span key={wi}>
        <span className="split-word" style={{ ["--i" as string]: i++, ["--d" as string]: `${delay}ms`, animationPlayState: go ? "running" : "paused" }}>{w}</span>
        {wi < words.length - 1 ? " " : ""}
      </span>
    ));
    nodes.push(p.className ? <span key={pi} className={p.className}>{inner}</span> : <span key={pi}>{inner}</span>);
    nodes.push(" ");
  });
  return <Tag ref={ref} className={className} style={{ minHeight: "1em" }}>{nodes}</Tag>;
}
