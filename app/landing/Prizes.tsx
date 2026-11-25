"use client";

import { useState } from "react";
import { CREATURES, pct, slotOf } from "../game/creatures";
import { CreatureCanvas } from "../scene/CreatureCanvas";
import { GlassCard } from "../ui/GlassCard";
import { Reveal } from "../ui/Reveal";
import { SplitText } from "../ui/SplitText";
import { rarityColor, type Rarity } from "../theme/tokens";

const FILTERS: Array<"All" | Rarity> = ["All", "Legendary", "Epic", "Rare", "Uncommon", "Common"];

export function Prizes() {
  const [filter, setFilter] = useState<"All" | Rarity>("All");
  const shown = filter === "All" ? CREATURES : CREATURES.filter((c) => c.rarity === filter);

  return (
    <section id="prizes" className="sec-light relative py-24 px-4 sm:px-10 mx-2 sm:mx-5 rounded-[40px]">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <span className="kicker font-mono text-xs uppercase text-[#6B645B] inline-flex items-center gap-2"><span className="w-1.5 h-1.5 bg-[#16A34A]" />Machine roster</span>
            <SplitText className="font-display font-bold text-3xl sm:text-5xl text-ink mt-2" parts={[{ text: "Meet the creatures" }]} />
          </div>
          <div className="flex flex-wrap items-center gap-2" id="prize-filters" role="group" aria-label="Filter by rarity">
            {FILTERS.map((f) => {
              const on = f === filter;
              return (
                <button key={f} onClick={() => setFilter(f)} aria-pressed={on}
                  className={`prize-chip px-4 py-2 rounded-full text-xs sm:text-sm font-semibold cursor-pointer flex items-center gap-1.5 ${on ? "bg-accent text-white shadow-neon-violet" : "bg-panel text-muted hover:text-ink border border-white/10"}`}>
                  {f !== "All" && <span className="w-2 h-2 rounded-full" style={{ background: rarityColor[f] }} />}
                  {f}
                </button>
              );
            })}
          </div>
        </div>

        <div id="landing-prizes-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
          {shown.map((c, i) => (
            <Reveal key={c.id} delay={(i % 5) * 70}>
              <GlassCard className="group tilt rounded-[28px] p-5 flex flex-col justify-between relative overflow-hidden h-full">
                <div className="absolute -top-12 -right-12 w-28 h-28 rounded-full opacity-20 blur-2xl pointer-events-none" style={{ background: c.color }} />
                <div className="flex items-center justify-between font-mono text-[11px] text-muted">
                  <span>{c.tag}</span>
                  <span className="px-2.5 py-0.5 rounded-full font-semibold" title="Grip at the creature's centre" style={{ background: `${c.color}22`, color: c.color, border: `1px solid ${c.color}55` }}>
                    {c.rarity} · {pct(slotOf(c).baseGripBps)}
                  </span>
                </div>
                <div className="w-full h-44 mx-auto my-1"><CreatureCanvas id={c.id} /></div>
                <div>
                  <h3 className="font-display font-bold text-lg text-ink">{c.name}</h3>
                  <p className="text-xs text-muted mt-0.5">{c.vibe}</p>
                </div>
              </GlassCard>
            </Reveal>
          ))}
        </div>

        <p className="mt-8 text-center font-mono text-xs sm:text-sm text-muted">
          The same odds for every play, public onchain. No operator strength dial.
        </p>
      </div>
    </section>
  );
}
