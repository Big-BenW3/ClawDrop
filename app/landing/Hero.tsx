"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { MachineCanvas } from "../scene/MachineCanvas";
import { CreatureCanvas } from "../scene/CreatureCanvas";
import { LandingBackground } from "../scene/LandingBackground";
import { SplitText } from "../ui/SplitText";
import { GlassCard } from "../ui/GlassCard";
import { Icon } from "../ui/Icon";
import { brand } from "../theme/brand";
import { SLOT_TABLE } from "@clawdrop/sdk/model";

export function Hero() {
  const floatRight = useRef<HTMLDivElement>(null);

  // Side parallax: the floating card drifts as the page scrolls.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onScroll = () => { if (floatRight.current) floatRight.current.style.transform = `translateY(${window.scrollY * 0.12}px)`; };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const legendary = SLOT_TABLE[4];

  return (
    <section id="hero" className="relative min-h-[92vh] flex items-center px-4 sm:px-8 pt-6 pb-24 overflow-hidden">
      <LandingBackground />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 z-[1]" style={{ background: "linear-gradient(to bottom, transparent, #08090D)" }} />

      <div ref={floatRight} className="pointer-events-none hidden xl:block absolute right-4 top-[12%] z-10 opacity-85 transition-transform duration-150">
        <div className="w-11 h-11 rounded-2xl bg-win/20 border border-win/40 flex items-center justify-center -rotate-12 mb-6 ml-auto shadow-neon-win">
          <span className="text-win text-lg"><Icon name="gem" sw={2} /></span>
        </div>
        <GlassCard className="animate-float-2 w-24 h-24 rounded-3xl p-2 border-epic/40 shadow-neon-violet">
          <CreatureCanvas id="void-hopper" />
        </GlassCard>
      </div>

      <div className="hero-inner max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-6 space-y-6 z-10">
          <SplitText
            as="h1"
            immediate
            delay={150}
            className="font-display font-bold text-4xl sm:text-6xl lg:text-[62px] leading-[1.06] tracking-tight text-ink"
            parts={[
              { text: "Skill drops the claw." },
              { text: "", br: true },
              { text: "Luck you can verify.", className: "text-accent drop-shadow-[0_0_24px_rgba(168,85,247,0.45)]" },
            ]}
          />
          <p className="text-[1rem] sm:text-lg text-muted max-w-lg leading-relaxed">{brand.pitch}</p>

          <div className="flex flex-wrap items-center gap-3.5 pt-2">
            <Link href="/play?start=1" className="spring-btn px-7 py-4 rounded-full bg-accent hover:bg-purple-500 text-white font-display font-semibold text-[1rem] sm:text-lg shadow-neon-violet flex items-center gap-2.5 cursor-pointer">
              <span>Play now</span>
              <span className="text-white/60">·</span>
              <span className="font-mono text-sm sm:text-[1rem] font-semibold">0.05 SOL</span>
            </Link>
            <a href="#how-it-works" className="spring-btn px-7 py-4 rounded-full bg-panel/80 hover:bg-panelHover border border-white/15 text-ink font-display font-semibold text-[1rem] sm:text-lg">
              See how it works
            </a>
          </div>

          <div className="pt-4 flex flex-wrap items-center gap-6 text-xs font-mono text-muted">
            <div className="flex items-center gap-2"><span className="text-win"><Icon name="check" sw={3} /></span> 0.00 SOL rollup gas</div>
            <div className="flex items-center gap-2"><span className="text-accent"><Icon name="check" sw={3} /></span> 100% public VRF proof</div>
            <div className="flex items-center gap-2"><span className="text-legendary"><Icon name="check" sw={3} /></span> Instant sell-back liquidity</div>
          </div>
        </div>

        <div className="lg:col-span-6 relative">
          <div className="relative w-full h-[430px] sm:h-[510px] rounded-[32px] glass-card overflow-hidden border border-accent/30 shadow-neon-violet">
            <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
              <span />
              <span className="px-3 py-1 rounded-full bg-base/80 border border-white/10 font-mono text-[11px] text-muted">Drag to orbit</span>
            </div>
            <MachineCanvas variant="hero" className="w-full h-full" />
            <div className="absolute bottom-4 left-4 right-4 z-10 flex items-center justify-between px-4 py-2.5 rounded-2xl bg-base/85 backdrop-blur-md border border-white/10">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-legendary" />
                <span className="text-xs font-medium text-ink">5 creatures inside · Legendary grip up to {legendary.baseGripBps / 100}%</span>
              </div>
              <Link href="/play" className="text-xs font-mono font-semibold text-accent hover:underline cursor-pointer">
                Enter arcade <Icon name="arrow-right" sw={2.5} />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <a href="#how-it-works" className="absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-muted hover:text-ink transition-colors">
        <span className="font-mono text-[11px] uppercase tracking-widest">Scroll</span>
        <div className="w-5 h-8 rounded-full border border-white/20 flex justify-center p-1">
          <div className="w-1 h-2 rounded-full bg-accent animate-bounce" />
        </div>
      </a>
    </section>
  );
}
