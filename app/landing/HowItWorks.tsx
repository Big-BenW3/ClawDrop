"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { GlassCard } from "../ui/GlassCard";
import { Lottie } from "../scene/Lottie";
import { Icon } from "../ui/Icon";
import { Reveal } from "../ui/Reveal";
import { SplitText } from "../ui/SplitText";

interface Step {
  label: string;
  tag: string;
  title: string;
  body: string;
  /** Right-hand stage. */
  badge: string;
  stageTitle: string;
  stageDesc: string;
  visual: ReactNode;
}

const STEPS: Step[] = [
  {
    label: "STEP 01", tag: "PUBLIC ODDS", title: "1. Pick your prize",
    body: "Every creature has fixed, public odds read straight from the machine account. Spot a Legendary Gilded Wyrm or go for a high-grip Pebble Crab.",
    badge: "PUBLIC ODDS", stageTitle: "Inspect fixed creature odds",
    stageDesc: "Every creature in the glass cabinet carries public odds read from the machine account: the same table the program rolls against.",
    visual: (
      <div className="w-full max-w-xs space-y-3">
        <div className="w-48 h-48 mx-auto"><Lottie name="monstersFunny" /></div>
        <div className="font-display font-bold text-2xl text-ink">Gilded Wyrm</div>
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-legendary/15 border border-legendary/40 font-mono text-xs text-legendary font-bold">
          <span>Legendary · up to 4% grip</span>
        </div>
        <div className="p-3 rounded-2xl bg-base/80 border border-white/10 font-mono text-[11px] text-muted">Odds read from the machine account</div>
      </div>
    ),
  },
  {
    label: "STEP 02", tag: "100% SKILL", title: "2. Line up the claw",
    body: "Aiming is pure skill; you steer. Use the thumb joystick or WASD keys for 15 seconds while the laser dot and targeting ring show exactly which creature you are on and how strong your grip is.",
    badge: "100% PLAYER SKILL", stageTitle: "Laser-guided precision aiming",
    stageDesc: "Steer across X and Z for 15 seconds. The closer the laser sits to a creature's centre, the higher its grip: it falls from the centre value to a floor at the edge.",
    visual: (
      <div className="w-full max-w-xs space-y-4">
        <div className="relative w-36 h-36 mx-auto rounded-full flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-dashed border-accent/50 spin-slow" />
          <div className="w-24 h-24 rounded-full border-2 border-epic bg-epic/10 flex items-center justify-center animate-pulse">
            <div className="w-32 h-32 -m-4"><Lottie name="joystick" /></div>
          </div>
          <span className="absolute -bottom-3 px-3 py-1 rounded-full bg-base border border-epic text-epic font-mono text-xs font-bold shadow-neon-violet">Epic · 12% at the centre</span>
        </div>
        <div className="font-mono text-xs text-muted pt-2">Laser dot locked · live grip <span className="text-win font-bold">12%</span></div>
      </div>
    ),
  },
  {
    label: "STEP 03", tag: "VERIFIABLE VRF", title: "3. The grip rolls",
    body: "A verifiable random number decides it. Your aim sets the grip, and an onchain VRF output is rolled against it. Nobody can tune the claw, and anyone can recompute the roll.",
    badge: "VERIFIABLE VRF", stageTitle: "Cryptographic grip roll",
    stageDesc: "When the claw closes, an onchain VRF output is rolled against the grip your aim earned. If the roll is below the grip, the claw holds.",
    visual: (
      <div className="w-full max-w-xs space-y-3 text-left font-mono text-xs">
        <div className="p-4 rounded-2xl bg-base/90 border border-accent/40 space-y-2.5 shadow-neon-violet">
          <div className="text-muted text-[11px]">EXAMPLE ROLL</div>
          <div className="flex justify-between"><span className="text-muted">grip</span><span className="text-ink font-bold">12.00%</span></div>
          <div className="flex justify-between"><span className="text-muted">VRF roll</span><span className="text-win font-bold">4.10%</span></div>
          <div className="pt-2 border-t border-white/10 text-win font-bold">roll 4.10% &lt; grip 12.00% → GRIP LOCKED <Icon name="check" sw={3} /></div>
        </div>
      </div>
    ),
  },
  {
    label: "STEP 04", tag: "REAL OWNERSHIP", title: "4. Win & own",
    body: "Wins mint the NFT straight to your wallet. Display it on your shelf or sell it back to the machine for instant SOL.",
    badge: "TRUE OWNERSHIP", stageTitle: "Minted straight to your wallet",
    stageDesc: "Keep your creature on your shelf or sell it back to the machine for SOL.",
    visual: (
      <div className="w-full max-w-xs space-y-3">
        <div className="w-44 h-44 mx-auto"><Lottie name="gift1" /></div>
        <div className="px-4 py-2.5 rounded-2xl bg-win/15 border border-win/40 text-win font-mono text-xs font-bold"><Icon name="check" sw={3} /> NFT minted to your wallet</div>
        <div className="flex justify-center gap-2 text-xs font-semibold">
          <span className="px-3.5 py-1.5 rounded-full bg-accent text-white">Keep on shelf</span>
          <span className="px-3.5 py-1.5 rounded-full bg-panel border border-white/15 text-ink">Sell back 0.15 SOL</span>
        </div>
      </div>
    ),
  },
];

export function HowItWorks() {
  const [idx, setIdx] = useState(0);
  const items = useRef<(HTMLDivElement | null)[]>([]);

  // Scroll-sync: whichever step card is at the middle of the viewport is the active one.
  useEffect(() => {
    const onScroll = () => {
      const mid = window.innerHeight * 0.48;
      items.current.forEach((el, i) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.top <= mid && r.bottom >= mid * 0.5) setIdx(i);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const step = STEPS[idx];

  return (
    <section id="how-it-works" className="relative py-24 px-4 sm:px-8 border-t border-white/5">
      <div className="max-w-6xl mx-auto">
        <div className="mb-12">
          <span className="kicker font-mono text-xs uppercase text-muted inline-flex items-center gap-2"><span className="w-1.5 h-1.5 bg-win" />How it works</span>
          <SplitText className="font-display font-bold text-3xl sm:text-5xl text-ink mt-2" parts={[{ text: "Four beats. Zero black boxes." }]} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-6 space-y-4" id="how-steps-list" onAnimationEnd={(e) => { if (e.animationName === "howfill") setIdx((i) => (i + 1) % STEPS.length); }}>
            {STEPS.map((s, i) => {
              const active = i === idx;
              return (
                <Reveal key={s.label} delay={(i % 5) * 70}>
                  <GlassCard
                    ref={(el: HTMLDivElement | null) => { items.current[i] = el; }}
                    onClick={() => setIdx(i)}
                    data-step={i}
                    className={`how-step-item cursor-pointer p-6 rounded-3xl border-l-4 transition-all ${active ? "border-l-accent bg-panel/90 is-active" : "border-l-transparent opacity-70 hover:opacity-100"}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`font-mono text-xs font-semibold ${active ? "text-accent" : "text-muted"}`}>{s.label}</span>
                      <span className="font-mono text-xs text-muted">{s.tag}</span>
                    </div>
                    <h3 className="font-display font-bold text-xl sm:text-2xl text-ink">{s.title}</h3>
                    <p className="text-sm sm:text-[1rem] text-muted mt-1.5 leading-relaxed">{s.body}</p>
                    <div key={`${active}-${idx}`} className="how-bar" />
                  </GlassCard>
                </Reveal>
              );
            })}
          </div>

          <div className="lg:col-span-6 lg:sticky lg:top-28">
            <GlassCard id="how-stage-card" className="rounded-[32px] p-6 sm:p-8 border border-white/10 shadow-glass min-h-[420px] flex flex-col justify-between relative overflow-hidden">
              <div id="how-visual-glow" className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-accent/20 blur-3xl pointer-events-none transition-colors duration-500" />
              <div key={idx} id="how-visual-stage" className="how-enter flex-1 flex flex-col items-center justify-center text-center py-4">
                <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 font-mono text-[11px] text-muted mb-4">{step.badge}</span>
                {step.visual}
                <h4 className="font-display font-bold text-xl text-ink mt-5">{step.stageTitle}</h4>
                <p className="text-xs sm:text-sm text-muted max-w-sm mt-1.5">{step.stageDesc}</p>
              </div>
              <div className="pt-6 border-t border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2.5" id="how-dots">
                  {STEPS.map((s, i) => (
                    <button key={s.label} onClick={() => setIdx(i)} aria-label={`Show step ${i + 1}`}
                      className={i === idx ? "w-8 h-2.5 rounded-full bg-accent transition-all cursor-pointer" : "w-2.5 h-2.5 rounded-full bg-white/20 hover:bg-white/40 transition-all cursor-pointer"} />
                  ))}
                </div>
                <span id="how-step-counter" className="font-mono text-xs text-muted">{String(idx + 1).padStart(2, "0")} / 04</span>
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    </section>
  );
}
